(() => {
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const dateFormat = value => value
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value))
    : '—';
  const dateTimeFormat = value => value
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '—';
  const PAGE_SIZE = 25;
  const state = {
    client: window.AEDT?.getSupabaseClient?.() || null,
    user: null,
    dashboard: null,
    requestPage: 0,
    studentPage: 0,
    documentPage: 0,
    messagePage: 0,
    requests: [],
    students: [],
    documents: [],
    messages: [],
    totalRequests: 0,
    totalStudents: 0,
    totalDocuments: 0,
    totalMessages: 0,
    pageRequests: [],
    pageStudents: [],
    pageDocuments: [],
    pageMessages: [],
    presidentId: null,
    requestUserId: null,
    requestSearchTimer: null
  };

  function notify(message, kind = 'success') {
    const box = $('#app-message');
    box.textContent = message;
    box.className = `app-message is-visible ${kind}`;
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => box.classList.remove('is-visible'), 4800);
  }

  function viewName(view) {
    return ({
      overview: 'Vue générale',
      requests: 'Demandes de logement',
      students: 'Étudiants',
      documents: 'Documents justificatifs',
      messages: 'Messagerie',
      notifications: 'Notifications',
      news: 'Actualités',
      gallery: 'Galerie photos',
      president: 'Profil du Président',
      activity: 'Journal des activités'
    })[view] || 'Vue générale';
  }

  function setView(view, filter) {
    document.querySelectorAll('.admin-view').forEach(section => {
      section.hidden = section.id !== `view-${view}`;
    });
    document.querySelectorAll('.admin-nav-link').forEach(button => {
      button.classList.toggle('is-active', button.dataset.view === view);
    });
    $('#breadcrumb').textContent = viewName(view);
    $('#admin-sidebar').classList.remove('is-open');
    if (view === 'requests') {
      if (filter) $('#request-status').value = filter;
      state.requestPage = 0;
      loadRequests();
    } else if (view === 'students') {
      loadStudents();
    } else if (view === 'documents') {
      loadDocuments();
    } else if (view === 'messages') {
      if (filter) $('#message-status').value = filter;
      state.messagePage = 0;
      loadMessages();
    } else if (view === 'news') {
      loadNews();
    } else if (view === 'gallery') {
      loadGallery();
    } else if (view === 'president') {
      loadPresident();
    } else if (view === 'activity') {
      loadActivity();
    }
  }

  function statusClass(status) {
    return ({
      'En attente': 'pending',
      'En étude': 'review',
      'Acceptée': 'accepted',
      'Refusée': 'refused'
    })[status] || '';
  }

  function badge(status) {
    return `<span class="status-badge ${statusClass(status)}">${escapeHtml(status || 'Inconnu')}</span>`;
  }

  function renderChart(data) {
    const monthly = $('#monthly-chart');
    const months = data.monthly || [];
    const max = Math.max(1, ...months.flatMap(item => [Number(item.count) || 0, Number(item.processed) || 0]));
    monthly.innerHTML = months.length
      ? months.map(item => {
        const count = Number(item.count) || 0;
        const processed = Number(item.processed) || 0;
        const height = value => value ? Math.max(6, Math.round(value / max * 130)) : 2;
        const label = new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(new Date(`${item.month}-01T00:00:00`));
        return `<div class="chart-column" title="${escapeHtml(label)} : ${count} reçues, ${processed} mises à jour de statut">
          <div class="chart-bar-wrap"><div class="chart-bar" style="height:${height(count)}px"><span>${count}</span></div>
          <div class="chart-bar processed" style="height:${height(processed)}px"><span>${processed}</span></div></div>
          <small>${escapeHtml(label)}</small></div>`;
      }).join('')
      : '<p class="empty-state">Aucune demande enregistrée sur la période.</p>';

    const statuses = [
      ['En attente', Number(data.pending) || 0, 'pending'],
      ['En étude', Number(data.review) || 0, 'review'],
      ['Acceptée', Number(data.accepted) || 0, 'accepted'],
      ['Refusée', Number(data.refused) || 0, 'refused']
    ];
    const total = Number(data.requests) || 0;
    $('#status-chart').innerHTML = total
      ? statuses.map(([label, count, key]) => `<div class="status-row ${key}">
          <span>${label}</span><div class="status-track"><div class="status-fill" style="width:${Math.round(count / total * 100)}%"></div></div>
          <strong>${count}</strong></div>`).join('')
      : '<p class="empty-state">Aucune demande à répartir.</p>';
  }

  function setMetric(id, value) {
    $(`#metric-${id}`).textContent = Number.isFinite(Number(value)) ? String(value) : '—';
  }

  async function loadDashboard() {
    const { data, error } = await state.client.rpc('admin_dashboard_summary');
    if (error) {
      notify(`Impossible de charger les indicateurs. Exécutez la mise à jour Supabase indiquée dans SETUP.md. ${error.message}`, 'error');
      return;
    }
    state.dashboard = data;
    setMetric('students', data.students);
    setMetric('requests', data.requests);
    setMetric('pending', data.pending);
    setMetric('review', data.review);
    setMetric('documents', data.documents);
    setMetric('documents-pending', data.documents_pending);
    setMetric('accepted', data.accepted);
    setMetric('refused', data.refused);
    setMetric('messages', data.messages_pending);
    $('#nav-request-count').textContent = data.pending;
    $('#nav-message-count').textContent = data.messages_pending;
    renderChart(data);
    renderRecent(data.recent_requests || [], data.recent_messages || [], data.recent_activity || []);
  }

  function renderRecent(requests, messages, activity) {
    $('#recent-requests').innerHTML = requests.length ? requests.map(item => `
      <button class="recent-item recent-open" data-id="${escapeHtml(item.id)}" type="button">
        <span class="recent-primary"><strong>${escapeHtml(item.dossier_code)} · ${escapeHtml(item.prenom)} ${escapeHtml(item.nom)}</strong>
        <small>${escapeHtml(item.etablissement)} · ${dateFormat(item.created_at)}</small></span>${badge(item.status)}
      </button>`).join('') : '<p class="empty-state">Aucun dossier reçu pour le moment.</p>';
    $('#recent-messages').innerHTML = messages.length ? messages.map(item => `
      <button class="recent-item recent-message-open" data-go="messages" type="button">
        <span class="recent-primary"><strong>${escapeHtml(item.subject)}</strong>
        <small>${escapeHtml(item.body)} · ${dateFormat(item.created_at)}</small></span>
        <span class="status-badge ${item.replied ? 'accepted' : 'pending'}">${item.replied ? 'Répondu' : 'À traiter'}</span>
      </button>`).join('') : '<p class="empty-state">Aucun message reçu.</p>';
    $('#recent-activity').innerHTML = activity.length ? activity.map(item => `
      <div class="recent-item"><span class="recent-primary"><strong>${escapeHtml(item.summary)}</strong>
      <small>${dateTimeFormat(item.created_at)} · ${escapeHtml(item.actor_id || 'Système')}</small></span></div>`).join('')
      : '<p class="empty-state">Aucune activité enregistrée.</p>';
  }

  function safeFilterText(value) {
    return value.trim().replace(/[,%()_*\\"]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
  }

  async function loadRequests() {
    if (!state.client) return;
    const search = safeFilterText($('#request-search').value);
    const status = $('#request-status').value;
    const from = $('#request-from').value;
    const to = $('#request-to').value;
    const sort = $('#request-sort').value;
    let query = state.client.from('housing_requests').select(
      'id,dossier_code,nom,prenom,telephone,email,email_tuteur,telephone_tuteur,etablissement,filiere,niveau,sexe,adresse,message,status,admin_note,user_id,created_at,updated_at',
      { count: 'exact' }
    );
    if (status) query = query.eq('status', status);
    if (state.requestUserId) query = query.eq('user_id', state.requestUserId);
    if (from) query = query.gte('created_at', `${from}T00:00:00`);
    if (to) query = query.lt('created_at', `${to}T23:59:59.999`);
    if (search) {
      const term = `%${search}%`;
      query = query.or(`dossier_code.ilike.${term},nom.ilike.${term},prenom.ilike.${term},telephone.ilike.${term}`);
    }
    const ascending = sort === 'oldest';
    query = query.order(sort === 'updated' ? 'updated_at' : 'created_at', { ascending })
      .range(state.requestPage * PAGE_SIZE, (state.requestPage + 1) * PAGE_SIZE - 1);
    $('#request-rows').innerHTML = '<tr><td colspan="7">Chargement des dossiers…</td></tr>';
    $('#request-cards').innerHTML = '<p class="empty-state">Chargement des dossiers…</p>';
    const { data, error, count } = await query;
    if (error) {
      $('#request-results').textContent = 'Erreur de chargement';
      $('#request-rows').innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`;
      $('#request-cards').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      return;
    }
    state.pageRequests = data || [];
    state.totalRequests = count || 0;
    $('#request-results').textContent = `${state.totalRequests} dossier${state.totalRequests === 1 ? '' : 's'}`;
    $('#request-page').textContent = `Page ${state.requestPage + 1} / ${Math.max(1, Math.ceil(state.totalRequests / PAGE_SIZE))}`;
    $('#request-prev').disabled = state.requestPage === 0;
    $('#request-next').disabled = (state.requestPage + 1) * PAGE_SIZE >= state.totalRequests;
    renderRequests(state.pageRequests);
  }

  function renderRequests(items) {
    $('#request-rows').innerHTML = items.length ? items.map(item => `<tr>
      <td><button class="record-link request-open" data-id="${escapeHtml(item.id)}">${escapeHtml(item.dossier_code)}</button></td>
      <td class="student-name"><strong>${escapeHtml(item.prenom)} ${escapeHtml(item.nom)}</strong><small>${escapeHtml(item.telephone)}</small></td>
      <td>${escapeHtml(item.etablissement)}</td><td>${escapeHtml(item.niveau)}</td><td>${dateFormat(item.created_at)}</td>
      <td><select class="row-select request-status-edit" data-id="${escapeHtml(item.id)}" aria-label="Modifier le statut ${escapeHtml(item.dossier_code)}">
        ${['En attente', 'En étude', 'Acceptée', 'Refusée'].map(status => `<option ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}</select></td>
      <td><button class="row-action request-open" data-id="${escapeHtml(item.id)}">Ouvrir le dossier</button></td></tr>`).join('')
      : '<tr><td colspan="7">Aucun dossier ne correspond à ces critères.</td></tr>';
    $('#request-cards').innerHTML = items.length ? items.map(item => `<article class="mobile-record">
      <div class="mobile-record-head"><h3><button class="record-link request-open" data-id="${escapeHtml(item.id)}">${escapeHtml(item.dossier_code)}</button></h3>${badge(item.status)}</div>
      <p>${escapeHtml(item.prenom)} ${escapeHtml(item.nom)} · ${escapeHtml(item.etablissement)}<br>${escapeHtml(item.niveau)} · ${dateFormat(item.created_at)}</p>
      <select class="row-select request-status-edit" data-id="${escapeHtml(item.id)}" aria-label="Modifier le statut ${escapeHtml(item.dossier_code)}">
        ${['En attente', 'En étude', 'Acceptée', 'Refusée'].map(status => `<option ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}</select></article>`).join('')
      : '<p class="empty-state">Aucun dossier ne correspond à ces critères.</p>';
  }

  async function updateRequestStatus(id, status) {
    const { error } = await state.client.from('housing_requests')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      notify(`Impossible de modifier le statut : ${error.message}`, 'error');
      await loadRequests();
      return;
    }
    notify('Statut du dossier mis à jour. Une notification est envoyée si le dossier est lié à un compte étudiant.');
    await Promise.all([loadRequests(), loadDashboard()]);
    if ($('#request-dialog').open) await openRequest(id);
  }

  function field(label, value) {
    return `<div class="detail-field"><small>${label}</small><strong>${escapeHtml(value || 'Non renseigné')}</strong></div>`;
  }

  async function openRequest(id) {
    const dialog = $('#request-dialog');
    const detail = $('#request-detail');
    detail.innerHTML = '<p>Chargement du dossier…</p>';
    if (!dialog.open) dialog.showModal();
    const { data: item, error } = await state.client.from('housing_requests').select('*').eq('id', id).single();
    if (error) {
      detail.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
      return;
    }
    const [{ data: docs, error: docsError }, { data: history, error: historyError }] = await Promise.all([
      state.client.from('request_documents')
        .select('id,file_type,file_path,original_name,created_at,verification_status,verified_at').eq('request_id', id).order('created_at'),
      state.client.from('activity_log')
        .select('action_type,summary,actor_id,created_at')
        .eq('entity_type', 'housing_requests').eq('entity_id', id)
        .order('created_at', { ascending: false }).limit(20)
    ]);
    detail.innerHTML = `<div class="detail-heading"><span class="admin-kicker">DOSSIER DE LOGEMENT</span>
      <h2>${escapeHtml(item.dossier_code)} ${badge(item.status)}</h2><p>Soumis le ${dateTimeFormat(item.created_at)} · Mis à jour le ${dateTimeFormat(item.updated_at)}</p></div>
      <div class="detail-grid">${field('Nom complet', `${item.prenom} ${item.nom}`)}
      ${field('Téléphone', item.telephone)}${field('E-mail déclaré', item.email)}${field('Établissement', item.etablissement)}
      ${field('Filière', item.filiere)}${field('Niveau', item.niveau)}
      ${field('E-mail du tuteur', item.email_tuteur)}${field('Téléphone du tuteur', item.telephone_tuteur)}
      ${field('Adresse / quartier', item.adresse)}${field('Sexe', item.sexe)}</div>
      <div class="detail-section"><h3>Note communiquée</h3><p>${escapeHtml(item.message || 'Aucun complément communiqué.')}</p>
      ${item.admin_note ? `<p><strong>Note administrative :</strong> ${escapeHtml(item.admin_note)}</p>` : ''}</div>
      <div class="detail-section"><h3>Pièces justificatives</h3><div id="detail-documents">${docsError
        ? `<p class="error">${escapeHtml(docsError.message)}</p>`
        : docs?.length ? docs.map(doc => `<div class="recent-item"><span class="recent-primary"><strong>${escapeHtml(doc.original_name)}</strong><small>${escapeHtml(doc.file_type)} · Transmis le ${dateTimeFormat(doc.created_at)} · ${escapeHtml(doc.verification_status || 'À vérifier')}${doc.verified_at ? ` · Vérifié le ${dateTimeFormat(doc.verified_at)}` : ''}</small></span><button class="row-action signed-document" data-path="${escapeHtml(doc.file_path)}">Consulter</button></div>`).join('')
          : '<p>Aucune pièce n’a été transmise.</p>'}</div></div>
      <div class="detail-section"><h3>Historique du dossier</h3><div>${historyError
        ? '<p class="data-note">Historique non disponible. Vérifiez que la mise à jour AEDT V11 a été appliquée.</p>'
        : history?.length ? history.map(entry => `<div class="activity-entry"><span class="activity-dot"></span><span><strong>${escapeHtml(entry.summary)}</strong><small>Responsable : ${escapeHtml(entry.actor_id || 'Système')}</small></span><time>${dateTimeFormat(entry.created_at)}</time></div>`).join('')
          : '<p class="data-note">Aucune modification enregistrée pour ce dossier.</p>'}</div></div>
      <div class="detail-section"><h3>Décision</h3><div class="detail-actions"><label for="detail-status">Statut</label>
      <select id="detail-status" class="row-select">${['En attente', 'En étude', 'Acceptée', 'Refusée'].map(status => `<option ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}</select>
      <button id="save-detail-status" class="admin-primary" data-id="${escapeHtml(item.id)}">Enregistrer le statut</button>
      <button id="open-messages-for-request" class="admin-secondary" data-go="messages">Ouvrir la messagerie</button></div></div>`;
  }

  async function openDocument(path) {
    const preview = window.open('about:blank', '_blank');
    if (!preview) {
      notify('Le navigateur a bloqué l’ouverture du document. Autorisez les fenêtres contextuelles puis réessayez.', 'error');
      return;
    }
    preview.opener = null;
    const { data, error } = await state.client.storage.from('dossiers').createSignedUrl(path, 300);
    if (error) {
      preview.close();
      notify(`Impossible de créer un lien sécurisé vers le document : ${error.message}`, 'error');
      return;
    }
    preview.location.href = data.signedUrl;
  }

  async function loadStudents() {
    const search = safeFilterText($('#student-search').value);
    let query = state.client.from('profiles').select(
      'id,first_name,prenom,nom,telephone,matricule,etablissement,filiere,niveau,role,created_at',
      { count: 'exact' }
    ).eq('role', 'student');
    if (search) {
      const term = `%${search}%`;
      query = query.or(`first_name.ilike.${term},prenom.ilike.${term},nom.ilike.${term},matricule.ilike.${term},etablissement.ilike.${term},filiere.ilike.${term}`);
    }
    query = query.order($('#student-sort').value === 'name' ? 'first_name' : 'created_at',
      { ascending: $('#student-sort').value === 'name' })
      .range(state.studentPage * PAGE_SIZE, (state.studentPage + 1) * PAGE_SIZE - 1);
    $('#student-rows').innerHTML = '<tr><td colspan="6">Chargement des profils…</td></tr>';
    const { data, error, count } = await query;
    if (error) {
      $('#student-rows').innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
      $('#student-cards').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      return;
    }
    state.pageStudents = data || [];
    state.totalStudents = count || 0;
    const ids = state.pageStudents.map(profile => profile.id);
    let requestCounts = {};
    if (ids.length) {
      const { data: linked, error: linkedError } = await state.client.from('housing_requests')
        .select('user_id').in('user_id', ids);
      if (linkedError) {
        $('#student-meta').textContent = 'Erreur de chargement des demandes associées';
        $('#student-rows').innerHTML = `<tr><td colspan="6">${escapeHtml(linkedError.message)}</td></tr>`;
        $('#student-cards').innerHTML = `<p class="error">${escapeHtml(linkedError.message)}</p>`;
        return;
      }
      (linked || []).forEach(item => { requestCounts[item.user_id] = (requestCounts[item.user_id] || 0) + 1; });
    }
    $('#student-meta').textContent = `${state.totalStudents} étudiant${state.totalStudents === 1 ? '' : 's'} · page par page`;
    $('#student-page').textContent = `Page ${state.studentPage + 1} / ${Math.max(1, Math.ceil(state.totalStudents / PAGE_SIZE))}`;
    $('#student-prev').disabled = state.studentPage === 0;
    $('#student-next').disabled = (state.studentPage + 1) * PAGE_SIZE >= state.totalStudents;
    const nameOf = profile => profile.first_name || profile.prenom || profile.nom || 'Profil étudiant';
    $('#student-rows').innerHTML = state.pageStudents.length ? state.pageStudents.map(profile => `<tr>
      <td class="student-name"><strong>${escapeHtml(`${profile.prenom || profile.first_name || ''} ${profile.nom || ''}`.trim() || nameOf(profile))}</strong><small>${escapeHtml(profile.matricule || profile.id)}</small></td>
      <td>${escapeHtml(profile.etablissement || '—')}</td><td>${escapeHtml(profile.filiere || '—')}</td><td>${escapeHtml(profile.niveau || '—')}</td>
      <td>${dateFormat(profile.created_at)}</td><td><button class="row-action student-edit" data-id="${escapeHtml(profile.id)}">Modifier</button> <button class="row-action student-requests" data-id="${escapeHtml(profile.id)}">${requestCounts[profile.id] || 0} dossier(s)</button></td></tr>`).join('')
      : '<tr><td colspan="6">Aucun profil étudiant trouvé.</td></tr>';
    $('#student-cards').innerHTML = state.pageStudents.map(profile => `<article class="mobile-record">
      <div class="mobile-record-head"><h3>${escapeHtml(`${profile.prenom || profile.first_name || ''} ${profile.nom || ''}`.trim() || nameOf(profile))}</h3></div>
      <p>${escapeHtml(profile.etablissement || 'Établissement non renseigné')} · ${escapeHtml(profile.filiere || 'Filière non renseignée')}<br>${escapeHtml(profile.niveau || 'Niveau non renseigné')} · Inscrit le ${dateFormat(profile.created_at)}</p>
      <button class="row-action student-edit" data-id="${escapeHtml(profile.id)}">Modifier le profil</button>
      <button class="row-action student-requests" data-id="${escapeHtml(profile.id)}">${requestCounts[profile.id] || 0} demande(s)</button></article>`).join('');
  }

  async function openStudent(id) {
    const dialog = $('#student-dialog');
    const form = $('#student-edit-form');
    form.reset();
    $('#student-edit-id').value = id;
    const { data, error } = await state.client.from('profiles')
      .select('id,first_name,prenom,nom,telephone,matricule,etablissement,filiere,niveau')
      .eq('id', id).eq('role', 'student').single();
    if (error) {
      notify(`Impossible de charger le profil étudiant : ${error.message}`, 'error');
      return;
    }
    $('#student-edit-first-name').value = data.prenom || data.first_name || '';
    $('#student-edit-last-name').value = data.nom || '';
    $('#student-edit-phone').value = data.telephone || '';
    $('#student-edit-matricule').value = data.matricule || '';
    $('#student-edit-school').value = data.etablissement || '';
    $('#student-edit-program').value = data.filiere || '';
    $('#student-edit-level').value = data.niveau || '';
    if (!dialog.open) dialog.showModal();
  }

  async function saveStudent(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const firstName = $('#student-edit-first-name').value.trim() || null;
    const { data, error } = await state.client.from('profiles').update({
      first_name: firstName,
      prenom: firstName,
      nom: $('#student-edit-last-name').value.trim() || null,
      telephone: $('#student-edit-phone').value.trim() || null,
      matricule: $('#student-edit-matricule').value.trim() || null,
      etablissement: $('#student-edit-school').value.trim() || null,
      filiere: $('#student-edit-program').value.trim() || null,
      niveau: $('#student-edit-level').value.trim() || null,
      updated_at: new Date().toISOString()
    }).eq('id', $('#student-edit-id').value).eq('role', 'student').select('id').maybeSingle();
    button.disabled = false;
    if (error) {
      notify(`Impossible d’enregistrer le profil : ${error.message}`, 'error');
      return;
    }
    if (!data) {
      notify('Le profil étudiant a changé ou n’est plus accessible. Actualisez la liste.', 'error');
      return;
    }
    $('#student-dialog').close();
    notify('Profil étudiant mis à jour. La modification a été ajoutée au journal.');
    await Promise.all([loadStudents(), loadDashboard()]);
  }

  async function loadDocuments() {
    let query = state.client.from('request_documents').select(
      'id,request_id,request_code,file_type,file_path,original_name,created_at,verification_status,verified_at', { count: 'exact' }
    ).order('created_at', { ascending: false }).range(state.documentPage * PAGE_SIZE, (state.documentPage + 1) * PAGE_SIZE - 1);
    const type = $('#document-type').value;
    const search = safeFilterText($('#document-search').value);
    if (type) query = query.eq('file_type', type);
    if (search) query = query.or(`request_code.ilike.%${search}%,original_name.ilike.%${search}%`);
    $('#document-rows').innerHTML = '<tr><td colspan="6">Chargement des documents…</td></tr>';
    const { data, error, count } = await query;
    if (error) {
      $('#document-meta').textContent = 'Erreur de chargement';
      $('#document-rows').innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
      $('#document-cards').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      return;
    }
    state.pageDocuments = data || [];
    state.totalDocuments = count || 0;
    $('#document-meta').textContent = `${state.totalDocuments} document${state.totalDocuments === 1 ? '' : 's'}`;
    $('#document-page').textContent = `Page ${state.documentPage + 1} / ${Math.max(1, Math.ceil(state.totalDocuments / PAGE_SIZE))}`;
    $('#document-prev').disabled = state.documentPage === 0;
    $('#document-next').disabled = (state.documentPage + 1) * PAGE_SIZE >= state.totalDocuments;
    const typeName = type => type === 'docs_demande_logement' ? 'Docs de demande de logement' : type;
    $('#document-rows').innerHTML = state.pageDocuments.length ? state.pageDocuments.map(doc => `<tr>
      <td>${escapeHtml(doc.original_name)}</td><td>${escapeHtml(typeName(doc.file_type))}</td>
      <td><button class="record-link document-request-open" data-id="${escapeHtml(doc.request_id)}">${escapeHtml(doc.request_code)}</button></td>
      <td>${dateTimeFormat(doc.created_at)}</td>
      <td><select class="row-select document-verification" data-id="${escapeHtml(doc.id)}" aria-label="État de vérification de ${escapeHtml(doc.original_name)}">
        ${['À vérifier', 'Vérifié', 'À revoir'].map(status => `<option ${status === (doc.verification_status || 'À vérifier') ? 'selected' : ''}>${status}</option>`).join('')}</select>
        ${doc.verified_at ? `<small class="document-review-date">Vérifié le ${dateTimeFormat(doc.verified_at)}</small>` : ''}</td>
      <td><button class="row-action signed-document" data-path="${escapeHtml(doc.file_path)}">Consulter</button></td></tr>`).join('')
      : '<tr><td colspan="6">Aucun document correspondant.</td></tr>';
    $('#document-cards').innerHTML = state.pageDocuments.map(doc => `<article class="mobile-record">
      <div class="mobile-record-head"><h3>${escapeHtml(doc.original_name)}</h3>${documentStatusBadge(doc.verification_status)}</div>
      <p>${escapeHtml(typeName(doc.file_type))} · Dossier ${escapeHtml(doc.request_code)}<br>Transmis le ${dateTimeFormat(doc.created_at)}</p>
      <select class="row-select document-verification" data-id="${escapeHtml(doc.id)}" aria-label="État de vérification de ${escapeHtml(doc.original_name)}">
        ${['À vérifier', 'Vérifié', 'À revoir'].map(status => `<option ${status === (doc.verification_status || 'À vérifier') ? 'selected' : ''}>${status}</option>`).join('')}</select>
      ${doc.verified_at ? `<small class="document-review-date">Vérifié le ${dateTimeFormat(doc.verified_at)}</small>` : ''}
      <button class="row-action signed-document" data-path="${escapeHtml(doc.file_path)}">Consulter le document</button></article>`).join('');
  }

  function documentStatusBadge(status) {
    const value = status || 'À vérifier';
    const style = value === 'Vérifié' ? 'accepted' : value === 'À revoir' ? 'refused' : 'pending';
    return `<span class="status-badge ${style}">${escapeHtml(value)}</span>`;
  }

  async function updateDocumentVerification(id, status, control) {
    control.disabled = true;
    const { error } = await state.client.from('request_documents').update({
      verification_status: status
    }).eq('id', id);
    control.disabled = false;
    if (error) {
      notify(`Impossible de mettre à jour la vérification : ${error.message}`, 'error');
      await loadDocuments();
      return;
    }
    notify('État de vérification du document enregistré.');
    await Promise.all([loadDocuments(), loadActivity()]);
  }

  async function loadMessages() {
    const status = $('#message-status').value;
    const search = safeFilterText($('#message-search').value);
    let query = state.client.from('messages').select(
      'id,user_id,subject,body,admin_reply,replied_at,created_at', { count: 'exact' }
    );
    if (status === 'pending') query = query.is('admin_reply', null);
    if (status === 'replied') query = query.not('admin_reply', 'is', null);
    if (search) query = query.or(`subject.ilike.%${search}%,body.ilike.%${search}%`);
    query = query.order('created_at', { ascending: false })
      .range(state.messagePage * PAGE_SIZE, (state.messagePage + 1) * PAGE_SIZE - 1);
    $('#message-list').innerHTML = '<p class="empty-state">Chargement des messages…</p>';
    const { data, error, count } = await query;
    if (error) {
      $('#message-meta').textContent = 'Erreur de chargement';
      $('#message-list').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      return;
    }
    state.pageMessages = data || [];
    state.totalMessages = count || 0;
    $('#message-meta').textContent = `${state.totalMessages} message${state.totalMessages === 1 ? '' : 's'}`;
    $('#message-page').textContent = `Page ${state.messagePage + 1} / ${Math.max(1, Math.ceil(state.totalMessages / PAGE_SIZE))}`;
    $('#message-prev').disabled = state.messagePage === 0;
    $('#message-next').disabled = (state.messagePage + 1) * PAGE_SIZE >= state.totalMessages;
    $('#message-list').innerHTML = state.pageMessages.length ? state.pageMessages.map(message => `<article class="message-card">
      <div class="message-card-head"><h3>${escapeHtml(message.subject)}</h3><time>${dateTimeFormat(message.created_at)}</time></div>
      <p>${escapeHtml(message.body)}</p><label>Réponse de l’AEDT<textarea class="message-reply" data-id="${escapeHtml(message.id)}" rows="3">${escapeHtml(message.admin_reply || '')}</textarea></label>
      <div class="message-card-footer"><small>${message.admin_reply ? `Répondu le ${dateTimeFormat(message.replied_at)}` : 'En attente de réponse'}</small>
      <button class="admin-primary save-reply" data-id="${escapeHtml(message.id)}">Enregistrer la réponse</button></div></article>`).join('')
      : '<p class="empty-state">Aucun message dans cette liste.</p>';
  }

  async function saveReply(id) {
    const input = document.querySelector(`.message-reply[data-id="${CSS.escape(id)}"]`);
    const text = input?.value.trim();
    if (!text) {
      notify('Saisissez une réponse avant de l’enregistrer.', 'error');
      return;
    }
    const button = document.querySelector(`.save-reply[data-id="${CSS.escape(id)}"]`);
    button.disabled = true;
    const { error } = await state.client.from('messages')
      .update({ admin_reply: text, replied_at: new Date().toISOString() }).eq('id', id);
    button.disabled = false;
    if (error) {
      notify(`Impossible d’enregistrer la réponse : ${error.message}`, 'error');
      return;
    }
    notify('Réponse enregistrée et notification envoyée à l’étudiant.');
    await Promise.all([loadMessages(), loadDashboard()]);
  }

  async function loadNews() {
    const { data, error } = await state.client.from('news')
      .select('id,title,category,published,published_at,created_at').order('created_at', { ascending: false }).limit(50);
    if (error) {
      $('#news-list').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      return;
    }
    $('#news-list').innerHTML = data?.length ? data.map(item => `<div class="content-entry">
      <strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category || 'Actualité')} · ${item.published ? 'Publiée' : 'Brouillon'} · ${dateFormat(item.published_at || item.created_at)}</small>
      </div>`).join('') : '<p class="empty-state">Aucune actualité publiée.</p>';
  }

  async function loadGallery() {
    const { data, error } = await state.client.from('gallery')
      .select('id,image_url,caption,published,created_at').order('created_at', { ascending: false }).limit(100);
    if (error) {
      $('#gallery-list').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      return;
    }
    $('#gallery-list').innerHTML = data?.length ? data.map(item => `<article class="gallery-entry">
      <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.caption || 'Photo AEDT')}" loading="lazy">
      <div><small>${escapeHtml(item.caption || 'Sans légende')}</small><button class="row-action delete-gallery" data-id="${escapeHtml(item.id)}">Supprimer</button></div>
      </article>`).join('') : '<p class="empty-state">Aucune photo publiée.</p>';
  }

  async function loadPresident() {
    const { data, error } = await state.client.from('president_profile').select('*')
      .eq('active', true).maybeSingle();
    if (error) {
      notify(`Impossible de charger le profil : ${error.message}`, 'error');
      return;
    }
    const profile = data || {};
    state.presidentId = profile.id || null;
    $('#president-name').value = profile.name || '';
    $('#president-role').value = profile.role || '';
    $('#president-quote').value = profile.quote || '';
    $('#president-education').value = profile.education || '';
    $('#president-professional').value = profile.professional || '';
    $('#president-association').value = profile.association || '';
  }

  async function loadActivity() {
    const box = $('#activity-list');
    box.innerHTML = '<p class="empty-state">Chargement du journal…</p>';
    $('#activity-unavailable').hidden = true;
    const { data, error } = await state.client.from('activity_log')
      .select('id,action_type,entity_type,entity_id,summary,actor_id,created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        box.innerHTML = '';
        $('#activity-unavailable').hidden = false;
        return;
      }
      box.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      return;
    }
    box.innerHTML = data?.length ? data.map(item => `<article class="activity-entry"><span class="activity-dot"></span>
      <span><strong>${escapeHtml(item.summary)}</strong><small>${escapeHtml(item.entity_type)} · ${escapeHtml(item.action_type)} · Élément ${escapeHtml(item.entity_id)}</small></span>
      <time>${dateTimeFormat(item.created_at)}</time></article>`).join('') : '<p class="empty-state">Aucune activité enregistrée.</p>';
  }

  async function submitNews(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    const { error } = await state.client.from('news').insert({
      title: $('#news-title').value.trim(),
      category: $('#news-category').value.trim() || 'Actualité',
      excerpt: $('#news-excerpt').value.trim() || null,
      content: $('#news-content').value.trim() || null,
      image_url: $('#news-image').value.trim() || null,
      published: true,
      published_at: new Date().toISOString()
    });
    button.disabled = false;
    if (error) {
      notify(`Impossible de publier cette actualité : ${error.message}`, 'error');
      return;
    }
    event.currentTarget.reset();
    $('#news-category').value = 'Actualité';
    notify('Actualité publiée sur le portail.');
    await Promise.all([loadNews(), loadDashboard()]);
  }

  async function uploadGallery(event) {
    event.preventDefault();
    const files = [...$('#gallery-files').files];
    const caption = $('#gallery-caption').value.trim();
    const button = event.submitter;
    if (files.length > 12) {
      notify('Maximum 12 photos par envoi.', 'error');
      return;
    }
    button.disabled = true;
    try {
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} dépasse 5 Mo.`);
        const extension = file.name.split('.').pop().toLowerCase();
        if (!['jpg', 'jpeg', 'png', 'webp'].includes(extension)) throw new Error(`${file.name} : format non autorisé.`);
        const path = `gallery/${crypto.randomUUID()}.${extension}`;
        const uploaded = await state.client.storage.from('gallery').upload(path, file, { contentType: file.type });
        if (uploaded.error) throw uploaded.error;
        const url = state.client.storage.from('gallery').getPublicUrl(path).data.publicUrl;
        const saved = await state.client.from('gallery').insert({
          image_url: url, caption: caption || file.name, published: true
        });
        if (saved.error) {
          const cleanup = await state.client.storage.from('gallery').remove([path]);
          if (cleanup.error) {
            throw new Error(`${saved.error.message} Le fichier téléversé n’a pas pu être supprimé : ${cleanup.error.message}`);
          }
          throw saved.error;
        }
      }
      event.currentTarget.reset();
      notify(`${files.length} photo(s) publiée(s).`);
      await loadGallery();
    } catch (error) {
      notify(`Échec du téléversement : ${error.message}`, 'error');
      await loadGallery();
    } finally {
      button.disabled = false;
    }
  }

  async function deleteGallery(id) {
    if (!window.confirm('Supprimer cette photo de la galerie ?')) return;
    const { data: photo, error: lookupError } = await state.client.from('gallery')
      .select('image_url').eq('id', id).single();
    if (lookupError) {
      notify(`Impossible de retrouver cette photo : ${lookupError.message}`, 'error');
      return;
    }
    const { error } = await state.client.from('gallery').delete().eq('id', id);
    if (error) {
      notify(`Impossible de supprimer cette photo : ${error.message}`, 'error');
      return;
    }
    let imageUrl;
    let expectedUrl;
    try {
      imageUrl = new URL(photo.image_url);
      expectedUrl = new URL(state.client.storage.from('gallery')
        .getPublicUrl('__aedt_gallery_object__').data.publicUrl);
    } catch (error) {
      notify(`Photo retirée, mais son fichier n’a pas pu être identifié : ${error.message}`, 'error');
      await loadGallery();
      return;
    }
    const objectPrefix = expectedUrl.pathname.replace('__aedt_gallery_object__', '');
    if (imageUrl.origin === expectedUrl.origin && imageUrl.pathname.startsWith(objectPrefix)) {
      let path;
      try {
        path = decodeURIComponent(imageUrl.pathname.slice(objectPrefix.length));
      } catch (error) {
        notify(`Photo retirée, mais le chemin du fichier est invalide : ${error.message}`, 'error');
        await loadGallery();
        return;
      }
      const { error: storageError } = await state.client.storage.from('gallery').remove([path]);
      if (storageError) {
        notify(`Photo retirée de la galerie, mais le fichier reste dans le stockage : ${storageError.message}`, 'error');
        await loadGallery();
        return;
      }
    } else {
      notify('Photo retirée de la galerie; le fichier source externe n’a pas été supprimé.');
      await loadGallery();
      return;
    }
    notify('Photo retirée de la galerie.');
    await loadGallery();
  }

  async function savePresident(event) {
    event.preventDefault();
    const payload = {
      name: $('#president-name').value.trim(),
      role: $('#president-role').value.trim(),
      quote: $('#president-quote').value.trim(),
      education: $('#president-education').value.trim(),
      professional: $('#president-professional').value.trim(),
      association: $('#president-association').value.trim(),
      active: true
    };
    if (!payload.name) {
      notify('Le nom du Président est requis pour enregistrer son profil.', 'error');
      return;
    }
    const result = state.presidentId
      ? await state.client.from('president_profile').update(payload).eq('id', state.presidentId)
      : await state.client.from('president_profile').insert(payload).select('id').single();
    if (result.error) {
      notify(`Impossible d’enregistrer le profil : ${result.error.message}`, 'error');
      return;
    }
    if (result.data?.id) state.presidentId = result.data.id;
    notify('Profil du Président enregistré.');
  }

  async function exportRequests() {
    let query = state.client.from('housing_requests').select(
      'dossier_code,nom,prenom,matricule,telephone,email,etablissement,filiere,niveau,logement,status,created_at,updated_at',
      { count: 'exact' }
    ).order('created_at', { ascending: false });
    const status = $('#request-status').value;
    if (status) query = query.eq('status', status);
    if (state.requestUserId) query = query.eq('user_id', state.requestUserId);
    const search = safeFilterText($('#request-search').value);
    if (search) {
      const term = `%${search}%`;
      query = query.or(`dossier_code.ilike.${term},nom.ilike.${term},prenom.ilike.${term},matricule.ilike.${term}`);
    }
    const from = $('#request-from').value;
    const to = $('#request-to').value;
    if (from) query = query.gte('created_at', `${from}T00:00:00`);
    if (to) query = query.lt('created_at', `${to}T23:59:59.999`);
    const rows = [];
    let total = 0;
    for (let offset = 0; offset < 5000; offset += 1000) {
      const { data, error, count } = await query.range(offset, offset + 999);
      if (error) {
        notify(`Impossible d’exporter les dossiers : ${error.message}`, 'error');
        return;
      }
      total = count || 0;
      if (total > 5000) {
        notify('L’export direct est limité à 5 000 dossiers. Réduisez les filtres avant de réessayer.', 'error');
        return;
      }
      rows.push(...(data || []));
      if (!data?.length || rows.length >= total) break;
    }
    const columns = ['dossier_code', 'nom', 'prenom', 'telephone', 'email', 'email_tuteur', 'telephone_tuteur', 'etablissement', 'filiere', 'niveau', 'sexe', 'adresse', 'status', 'created_at', 'updated_at'];
    // Neutralise l'injection de formules (=, +, -, @, tab, CR) a l'ouverture dans un tableur.
    const csvCell = value => {
      let text = String(value ?? '');
      if (/^[\t\r\n]/.test(text)) text = `'${text}`;
      else if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const csv = [columns.join(';'), ...rows.map(row => columns.map(key =>
      csvCell(row[key])
    ).join(';'))].join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'demandes-logement-aedt.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function bindPagination(prefix, key, loader) {
    $(`#${prefix}-prev`).addEventListener('click', () => {
      state[key] = Math.max(0, state[key] - 1);
      loader();
    });
    $(`#${prefix}-next`).addEventListener('click', () => {
      state[key] += 1;
      loader();
    });
  }

  async function boot() {
    if (!state.client) {
      $('#login-message').innerHTML = '<p class="error">Configuration Supabase introuvable. Vérifiez config.js.</p>';
      return;
    }
    const { data, error } = await state.client.auth.getSession();
    if (error) {
      $('#login-message').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      return;
    }
    if (data.session) await authorize();
  }

  async function authorize() {
    const { data, error } = await state.client.rpc('is_admin');
    if (error || !data) {
      $('#login-view').hidden = false;
      $('#login-message').innerHTML = `<p class="error">${escapeHtml(error?.message || 'Ce compte ne dispose pas des droits administrateur.')}</p>`;
      const result = await state.client.auth.signOut();
      if (result.error) notify(`La session non autorisée n’a pas pu être fermée : ${result.error.message}`, 'error');
      return;
    }
    const { data: userData, error: userError } = await state.client.auth.getUser();
    if (userError || !userData.user) {
      $('#login-message').innerHTML = `<p class="error">${escapeHtml(userError?.message || 'Session utilisateur introuvable.')}</p>`;
      return;
    }
    state.user = userData.user;
    const email = state.user.email || 'Administrateur AEDT';
    $('#admin-name').textContent = email;
    $('#admin-avatar').textContent = (email[0] || 'A').toUpperCase();
    $('#login-view').hidden = true;
    $('#admin-app').hidden = false;
    await loadDashboard();
  }

  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    $('#login-message').textContent = '';
    const { error } = await state.client.auth.signInWithPassword({
      email: $('#login-email').value.trim(),
      password: $('#login-password').value
    });
    button.disabled = false;
    if (error) {
      const message = error.message || '';
      if ((error.code || '').toLowerCase() === 'email_not_confirmed' ||
          message.toLowerCase().indexOf('not confirmed') > -1) {
        $('#login-message').innerHTML = `<p class="error">${escapeHtml('Votre adresse e-mail n’a pas encore été confirmée. Ouvrez le lien reçu par e-mail pour activer le compte avant de vous connecter à l’administration.')}</p>`;
        return;
      }
      $('#login-message').innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
      return;
    }
    await authorize();
  });

  $('#logout-button').addEventListener('click', async () => {
    const { error } = await state.client.auth.signOut();
    if (error) {
      notify(`Impossible de fermer la session : ${error.message}`, 'error');
      return;
    }
    $('#admin-app').hidden = true;
    $('#login-view').hidden = false;
    $('#login-password').value = '';
  });

  document.querySelectorAll('.admin-nav-link').forEach(button =>
    button.addEventListener('click', () => setView(button.dataset.view)));
  document.addEventListener('click', event => {
    const go = event.target.closest('[data-go]');
    if (go) {
      setView(go.dataset.go, go.dataset.filter);
      return;
    }
    const requestLink = event.target.closest('.request-open,.recent-open');
    if (requestLink) {
      openRequest(requestLink.dataset.id);
      return;
    }
    const studentEdit = event.target.closest('.student-edit');
    if (studentEdit) {
      openStudent(studentEdit.dataset.id);
      return;
    }
    const docLink = event.target.closest('.signed-document');
    if (docLink) {
      openDocument(docLink.dataset.path);
      return;
    }
    const statusEditor = event.target.closest('.request-status-edit');
    if (statusEditor) return;
    const studentRequests = event.target.closest('.student-requests');
    if (studentRequests) {
      $('#request-search').value = '';
      $('#request-status').value = '';
      $('#request-from').value = '';
      $('#request-to').value = '';
      state.requestUserId = studentRequests.dataset.id;
      notify('Affichage des demandes rattachées à ce compte étudiant.');
      setView('requests');
      return;
    }
    const documentRequest = event.target.closest('.document-request-open');
    if (documentRequest) {
      openRequest(documentRequest.dataset.id);
      return;
    }
    const save = event.target.closest('.save-reply');
    if (save) saveReply(save.dataset.id);
    const deleteButton = event.target.closest('.delete-gallery');
    if (deleteButton) deleteGallery(deleteButton.dataset.id);
  });

  document.addEventListener('change', event => {
    if (event.target.matches('.request-status-edit')) {
      updateRequestStatus(event.target.dataset.id, event.target.value);
    } else if (event.target.matches('.document-verification')) {
      updateDocumentVerification(event.target.dataset.id, event.target.value, event.target);
    }
  });

  $('#request-dialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  $('#request-dialog').addEventListener('click', event => {
    if (event.target.id === 'save-detail-status') {
      updateRequestStatus(event.target.dataset.id, $('#detail-status').value);
    }
  });
  $('#request-search').addEventListener('input', () => {
    state.requestUserId = null;
    window.clearTimeout(state.requestSearchTimer);
    state.requestSearchTimer = window.setTimeout(() => { state.requestPage = 0; loadRequests(); }, 250);
  });
  ['request-status', 'request-from', 'request-to', 'request-sort'].forEach(id =>
    $(`#${id}`).addEventListener('change', () => { state.requestPage = 0; loadRequests(); }));
  $('#student-search').addEventListener('input', () => { state.studentPage = 0; loadStudents(); });
  $('#student-sort').addEventListener('change', () => { state.studentPage = 0; loadStudents(); });
  $('#document-search').addEventListener('input', () => { state.documentPage = 0; loadDocuments(); });
  $('#document-type').addEventListener('change', () => { state.documentPage = 0; loadDocuments(); });
  $('#message-search').addEventListener('input', () => { state.messagePage = 0; loadMessages(); });
  $('#message-status').addEventListener('change', () => { state.messagePage = 0; loadMessages(); });
  bindPagination('request', 'requestPage', loadRequests);
  bindPagination('student', 'studentPage', loadStudents);
  bindPagination('document', 'documentPage', loadDocuments);
  bindPagination('message', 'messagePage', loadMessages);
  $('#news-form').addEventListener('submit', submitNews);
  $('#gallery-form').addEventListener('submit', uploadGallery);
  $('#president-form').addEventListener('submit', savePresident);
  $('#student-edit-form').addEventListener('submit', saveStudent);
  $('#student-dialog-close').addEventListener('click', () => $('#student-dialog').close());
  $('#student-dialog-cancel').addEventListener('click', () => $('#student-dialog').close());
  $('#student-dialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  $('#requests-export').addEventListener('click', exportRequests);
  $('#refresh-button').addEventListener('click', loadDashboard);
  $('#activity-refresh').addEventListener('click', loadActivity);
  $('#activity-shortcut').addEventListener('click', () => setView('activity'));
  $('#sidebar-toggle').addEventListener('click', () => $('#admin-sidebar').classList.toggle('is-open'));
  $('#global-search').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      $('#request-search').value = event.currentTarget.value;
      setView('requests');
    }
  });

  boot();
})();
