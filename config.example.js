// Copiez ce fichier vers config.js puis remplacez les valeurs par celles de votre projet Supabase.
// Seule la clé publique (anon / publishable) doit figurer ici. N'y mettez JAMAIS la clé service_role.
window.AEDT_CONFIG={
  SUPABASE_URL:"https://VOTRE-PROJET.supabase.co",
  SUPABASE_ANON_KEY:"VOTRE_CLE_PUBLIQUE_ANON"
};

window.AEDT = window.AEDT || {};
window.AEDT.getSupabaseClient = function(){
  const config = window.AEDT_CONFIG || {};
  const url = config.SUPABASE_URL || window.SUPABASE_URL || window.supabaseUrl || window.AEDT_SUPABASE_URL;
  const key = config.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY || window.supabaseAnonKey || window.AEDT_SUPABASE_ANON_KEY;
  if(!url || !key || !window.supabase){
    return null;
  }
  if(!window.aedtSupabase){
    window.aedtSupabase = window.supabase.createClient(url, key);
  }
  return window.aedtSupabase;
};