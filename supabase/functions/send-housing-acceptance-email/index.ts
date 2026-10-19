import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character] || character));

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Méthode non autorisée.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey || !emailFrom) {
    console.error('Configuration e-mail incomplète : vérifier les secrets de la fonction.');
    return jsonResponse({ error: 'Le service d’envoi des e-mails n’est pas configuré.' }, 503);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Authentification requise.' }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Session invalide ou expirée.' }, 401);
  }

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Impossible de vérifier le rôle administrateur :', profileError.message);
    return jsonResponse({ error: 'Impossible de vérifier les droits administrateur.' }, 500);
  }
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return jsonResponse({ error: 'Droits administrateur requis.' }, 403);
  }

  let payload: { requestId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Corps JSON invalide.' }, 400);
  }
  if (typeof payload.requestId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.requestId)) {
    return jsonResponse({ error: 'Identifiant de dossier invalide.' }, 400);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: housingRequest, error: requestError } = await serviceClient
    .from('housing_requests')
    .select('id,user_id,prenom,nom,email,dossier_code,status,acceptance_email_sent_at')
    .eq('id', payload.requestId)
    .maybeSingle();
  if (requestError) {
    console.error('Impossible de charger le dossier accepté :', requestError.message);
    return jsonResponse({ error: 'Impossible de charger le dossier.' }, 500);
  }
  if (!housingRequest) {
    return jsonResponse({ error: 'Dossier introuvable.' }, 404);
  }
  if (housingRequest.status !== 'Acceptée') {
    return jsonResponse({ error: 'Le dossier doit être accepté avant l’envoi du courriel.' }, 409);
  }
  if (housingRequest.acceptance_email_sent_at) {
    return jsonResponse({ sent: true, alreadySent: true });
  }

  const staleClaimBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const claimedAt = new Date().toISOString();
  const releaseClaim = async () => {
    const { error } = await serviceClient.from('housing_requests')
      .update({ acceptance_email_claimed_at: null })
      .eq('id', housingRequest.id)
      .eq('acceptance_email_claimed_at', claimedAt);
    if (error) console.error('Impossible de libérer la réservation du courriel :', error.message);
    return error;
  };
  const { data: claim, error: claimError } = await serviceClient
    .from('housing_requests')
    .update({ acceptance_email_claimed_at: claimedAt })
    .eq('id', housingRequest.id)
    .eq('status', 'Acceptée')
    .is('acceptance_email_sent_at', null)
    .or(`acceptance_email_claimed_at.is.null,acceptance_email_claimed_at.lt.${staleClaimBefore}`)
    .select('id')
    .maybeSingle();
  if (claimError) {
    console.error('Impossible de réserver l’envoi du courriel :', claimError.message);
    return jsonResponse({ error: 'Impossible de préparer l’envoi du courriel.' }, 500);
  }
  if (!claim) {
    const { data: latestRequest, error: latestError } = await serviceClient
      .from('housing_requests')
      .select('acceptance_email_sent_at')
      .eq('id', housingRequest.id)
      .single();
    if (latestError) {
      console.error('Impossible de confirmer l’état du courriel :', latestError.message);
      return jsonResponse({ error: 'Impossible de confirmer l’état du courriel.' }, 500);
    }
    if (latestRequest.acceptance_email_sent_at) {
      return jsonResponse({ sent: true, alreadySent: true });
    }
    return jsonResponse({ error: 'L’envoi du courriel est déjà en cours. Réessayez dans quelques minutes.' }, 409);
  }

  let recipient = typeof housingRequest.email === 'string' ? housingRequest.email.trim() : '';
  if (!recipient && housingRequest.user_id) {
    const { data: account, error: accountError } = await serviceClient.auth.admin.getUserById(housingRequest.user_id);
    if (accountError) {
      console.error('Impossible de récupérer l’adresse du compte étudiant :', accountError.message);
      const releaseError = await releaseClaim();
      if (releaseError) {
        return jsonResponse({ error: 'Impossible de récupérer l’adresse e-mail ou de libérer la réservation. Contactez l’administrateur Supabase.' }, 500);
      }
      return jsonResponse({ error: 'Impossible de récupérer l’adresse e-mail de l’étudiant.' }, 500);
    }
    recipient = account.user?.email?.trim() || '';
  }
  if (!recipient) {
    const releaseError = await releaseClaim();
    if (releaseError) {
      return jsonResponse({ error: 'Aucune adresse e-mail n’est renseignée et la réservation n’a pas pu être libérée.' }, 500);
    }
    return jsonResponse({ error: 'Aucune adresse e-mail n’est renseignée pour cet étudiant.' }, 422);
  }

  const fullName = [housingRequest.prenom, housingRequest.nom].filter(Boolean).join(' ').trim();
  const safeName = escapeHtml(fullName || 'Étudiant');
  const subject = 'Acceptation de votre demande de logement AEDT';
  const text = `Bonjour ${fullName || 'Étudiant'},

Nous avons le plaisir de vous informer que votre demande de logement auprès de l’Amicale des Étudiants de Diass à Thiès a été acceptée.

Afin de faciliter votre installation, nous vous invitons à prendre connaissance des modalités suivantes.

1. Modalités financières

- Caution : 10 000 FCFA, à verser une seule fois ;
- Loyer mensuel : 5 000 FCFA, à payer à la fin de chaque mois.

2. Conditions d’installation

Vous devrez apporter votre propre matelas ainsi que vos effets personnels nécessaires à votre installation.

Nous vous invitons à vous rapprocher du bureau de l’Amicale afin de convenir des modalités pratiques de votre installation.

Nous vous remercions de votre confiance et vous souhaitons une excellente intégration au sein de notre Amicale.

Cordialement,

Le Président
Amicale des Étudiants de Diass à Thiès`;
  const html = `<div style="max-width:640px;margin:0 auto;padding:32px 24px;color:#172b42;font-family:Arial,sans-serif;line-height:1.65">
    <div style="padding:24px;border-radius:16px;background:#082c52;color:#fff">
      <div style="font-size:12px;font-weight:700;letter-spacing:2px;color:#f2c65f">AEDT · LOGEMENT</div>
      <h1 style="margin:8px 0 0;font-size:23px">Votre demande a été acceptée</h1>
    </div>
    <p>Bonjour <strong>${safeName}</strong>,</p>
    <p>Nous avons le plaisir de vous informer que votre demande de logement auprès de l’<strong>Amicale des Étudiants de Diass à Thiès</strong> a été acceptée.</p>
    <p>Afin de faciliter votre installation, nous vous invitons à prendre connaissance des modalités suivantes.</p>
    <h2 style="margin:24px 0 8px;color:#082c52;font-size:17px">1. Modalités financières</h2>
    <ul style="padding-left:22px">
      <li><strong>Caution :</strong> 10 000 FCFA, à verser une seule fois ;</li>
      <li><strong>Loyer mensuel :</strong> 5 000 FCFA, à payer à la fin de chaque mois.</li>
    </ul>
    <h2 style="margin:24px 0 8px;color:#082c52;font-size:17px">2. Conditions d’installation</h2>
    <p>Vous devrez apporter votre propre matelas ainsi que vos effets personnels nécessaires à votre installation.</p>
    <p>Nous vous invitons à vous rapprocher du bureau de l’Amicale afin de convenir des modalités pratiques de votre installation.</p>
    <p>Nous vous remercions de votre confiance et vous souhaitons une excellente intégration au sein de notre Amicale.</p>
    <p style="margin-top:28px">Cordialement,<br><strong>Le Président</strong><br>Amicale des Étudiants de Diass à Thiès</p>
    <hr style="margin-top:28px;border:0;border-top:1px solid #e2e9f1">
    <small style="color:#718196">Référence du dossier : ${escapeHtml(housingRequest.dossier_code || '')}</small>
  </div>`;

  let resendResponse: Response;
  try {
    resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `housing-acceptance-${housingRequest.id}`,
      },
      body: JSON.stringify({ from: emailFrom, to: [recipient], subject, text, html }),
    });
  } catch (error) {
    const releaseError = await releaseClaim();
    console.error('Erreur réseau lors de l’envoi via Resend :', error);
    return jsonResponse({
      error: releaseError
        ? 'Erreur réseau pendant l’envoi, et la réservation ne peut pas être libérée.'
        : 'Erreur réseau pendant l’envoi du courriel. Réessayez depuis l’administration.',
    }, 502);
  }
  const resendResult = await resendResponse.json().catch(() => ({}));
  if (!resendResponse.ok) {
    const releaseError = await releaseClaim();
    const providerMessage = typeof resendResult.message === 'string'
      ? resendResult.message
      : `Resend a retourné le code ${resendResponse.status}.`;
    console.error('Échec de l’envoi Resend :', providerMessage);
    return jsonResponse({
      error: releaseError
        ? `L’e-mail n’a pas été envoyé : ${providerMessage}. La réservation n’a pas pu être libérée.`
        : `L’e-mail n’a pas été envoyé : ${providerMessage}`,
    }, 502);
  }

  const { data: sentUpdate, error: sentUpdateError } = await serviceClient
    .from('housing_requests')
    .update({
      acceptance_email_sent_at: new Date().toISOString(),
      acceptance_email_claimed_at: null,
    })
    .eq('id', housingRequest.id)
    .eq('acceptance_email_claimed_at', claimedAt)
    .select('id')
    .maybeSingle();
  if (sentUpdateError || !sentUpdate) {
    console.error('Le courriel a été accepté par Resend, mais son état n’a pas été enregistré :', sentUpdateError?.message || 'La réservation ne correspond plus.');
    return jsonResponse({ error: 'Courriel transmis, mais impossible d’enregistrer son état. Vérifiez le suivi du dossier avant de relancer.' }, 500);
  }

  return jsonResponse({ sent: true });
});
