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
    currentUserProfile: null,
    isSuperAdmin: false,
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
    selectedRequests: new Set(),
    presidentId: null,
    presidentPhotoUrl: null,
    presidentVideoUrl: null,
    requestUserId: null,
    requestSearchTimer: null,
    videos: [],
    editingNewsId: null,
    editingNewsPhotoUrl: null,
    editingNewsVideoUrl: null
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
      students: 'Étudiants & Rôles',
      documents: 'Documents justificatifs',
      messages: 'Messagerie',
      notifications: 'Notifications',
      news: 'Actualités',
      videos: 'Vidéos & Médias',
      gallery: 'Galerie photos',
      president: 'Profil du Président',
      activity: 'Journal des activités'
    })[view] || 'Vue générale';
  }

  function syncSidebarState() {
    const isOpen = $('#admin-sidebar')?.classList.contains('is-open');
    document.body.classList.toggle('sidebar-open', Boolean(isOpen));
  }

  function openSidebar() {
    $('#admin-sidebar')?.classList.add('is-open');
    $('#sidebar-overlay')?.classList.add('is-open');
    const toggle = $('#sidebar-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true');
      toggle.classList.add('is-active');
    }
    syncSidebarState();
  }

  function closeSidebar() {
    $('#admin-sidebar')?.classList.remove('is-open');
    $('#sidebar-overlay')?.classList.remove('is-open');
    const toggle = $('#sidebar-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.classList.remove('is-active');
    }
    syncSidebarState();
  }

  function toggleSidebar() {
    if ($('#admin-sidebar')?.classList.contains('is-open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function setView(view, filter) {
    document.querySelectorAll('.admin-view').forEach(section => {
      section.hidden = section.id !== `view-${view}`;
    });
    document.querySelectorAll('.admin-nav-link').forEach(button => {
      button.classList.toggle('is-active', button.dataset.view === view);
    });
    $('#breadcrumb').textContent = viewName(view);
    closeSidebar();
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
    } else if (view === 'notifications') {
      loadBroadcastRecipients();
    } else if (view === 'news') {
      loadNews();
    } else if (view === 'videos') {
      loadVideos();
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

  function applyAdminTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('is-dark', isDark);
    document.body.classList.toggle('is-light', !isDark);
    const button = $('#theme-toggle-btn');
    if (button) {
      button.textContent = isDark ? '☀️' : '🌙';
      button.setAttribute('title', isDark ? 'Basculer vers le thème clair' : 'Basculer vers le thème sombre');
      button.setAttribute('aria-label', isDark ? 'Basculer vers le thème clair' : 'Basculer vers le thème sombre');
    }
    try {
      window.localStorage.setItem('aedt-admin-theme', isDark ? 'dark' : 'light');
    } catch {
      // Local storage may be unavailable in private browsing or restricted contexts.
    }
  }

  function toggleAdminTheme() {
    const nextTheme = document.body.classList.contains('is-dark') ? 'light' : 'dark';
    applyAdminTheme(nextTheme);
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

  async function fetchDashboardDirect() {
    try {
      const [
        studentsRes,
        requestsRes,
        docsRes,
        docsPendingRes,
        messagesRes,
        recentReqsRes,
        recentMsgsRes,
        activityRes
      ] = await Promise.allSettled([
        state.client.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        state.client.from('housing_requests').select('id,status,created_at'),
        state.client.from('request_documents').select('id', { count: 'exact', head: true }),
        state.client.from('request_documents').select('id', { count: 'exact', head: true }).eq('verification_status', 'À vérifier'),
        state.client.from('messages').select('id', { count: 'exact', head: true }).is('admin_reply', null),
        state.client.from('housing_requests').select('id,dossier_code,nom,prenom,etablissement,status,created_at').order('created_at', { ascending: false }).limit(5),
        state.client.from('messages').select('subject,body,admin_reply,created_at').order('created_at', { ascending: false }).limit(5),
        state.client.from('activity_log').select('action_type,entity_type,entity_id,summary,actor_id,created_at').order('created_at', { ascending: false }).limit(5)
      ]);

      const requestsData = (requestsRes.status === 'fulfilled' && requestsRes.value?.data) ? requestsRes.value.data : [];
      const totalRequests = requestsData.length;
      let pending = 0, review = 0, accepted = 0, refused = 0;
      requestsData.forEach(r => {
        if (r.status === 'En attente') pending++;
        else if (r.status === 'En étude') review++;
        else if (r.status === 'Acceptée') accepted++;
        else if (r.status === 'Refusée') refused++;
      });

      const monthlyMap = {};
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap[key] = { month: key, count: 0, processed: 0 };
      }
      requestsData.forEach(r => {
        if (!r.created_at) return;
        const key = r.created_at.slice(0, 7);
        if (monthlyMap[key]) {
          monthlyMap[key].count++;
          if (r.status !== 'En attente') {
            monthlyMap[key].processed++;
          }
        }
      });

      const recentMessages = (recentMsgsRes.status === 'fulfilled' && recentMsgsRes.value?.data)
        ? recentMsgsRes.value.data.map(m => ({
            subject: m.subject,
            body: (m.body || '').slice(0, 140),
            replied: Boolean(m.admin_reply && m.admin_reply.trim().length > 0),
            created_at: m.created_at
          }))
        : [];

      return {
        students: studentsRes.status === 'fulfilled' ? (studentsRes.value?.count ?? 0) : 0,
        requests: totalRequests,
        pending,
        review,
        accepted,
        refused,
        documents: docsRes.status === 'fulfilled' ? (docsRes.value?.count ?? 0) : 0,
        documents_pending: docsPendingRes.status === 'fulfilled' ? (docsPendingRes.value?.count ?? 0) : 0,
        messages_pending: messagesRes.status === 'fulfilled' ? (messagesRes.value?.count ?? 0) : 0,
        monthly: Object.values(monthlyMap),
        recent_requests: (recentReqsRes.status === 'fulfilled' && recentReqsRes.value?.data) || [],
        recent_messages: recentMessages,
        recent_activity: (activityRes.status === 'fulfilled' && activityRes.value?.data) || []
      };
    } catch (err) {
      console.warn('Fallback direct dashboard error:', err);
      return null;
    }
  }

  async function loadDashboard() {
    let summary = null;
    try {
      const { data, error } = await state.client.rpc('admin_dashboard_summary');
      if (!error && data) {
        summary = data;
      }
    } catch (e) {
      // Ignorer l'erreur RPC et basculer sur direct
    }

    if (!summary) {
      summary = await fetchDashboardDirect();
    }

    if (!summary) {
      notify('Impossible de charger les indicateurs. Vérifiez votre connexion.', 'error');
      return;
    }

    state.dashboard = summary;
    setMetric('students', summary.students);
    setMetric('requests', summary.requests);
    setMetric('pending', summary.pending);
    setMetric('review', summary.review);
    setMetric('documents', summary.documents);
    setMetric('documents-pending', summary.documents_pending);
    setMetric('accepted', summary.accepted);
    setMetric('refused', summary.refused);
    setMetric('messages', summary.messages_pending);
    $('#nav-request-count').textContent = summary.pending ?? 0;
    $('#nav-message-count').textContent = summary.messages_pending ?? 0;
    renderKPIs(summary);
    renderChart(summary);
    renderRecent(summary.recent_requests || [], summary.recent_messages || [], summary.recent_activity || []);
    await loadAnalytics();
  }

  function renderKPIs(data) {
    const totalRequests = Number(data.requests) || 0;
    const pending = Number(data.pending) || 0;
    const review = Number(data.review) || 0;
    const accepted = Number(data.accepted) || 0;
    const refused = Number(data.refused) || 0;
    const processed = totalRequests - pending;

    // 1. Taux de traitement global
    const processingRate = totalRequests > 0 ? Math.round((processed / totalRequests) * 100) : 0;
    const elProcRate = $('#kpi-processing-rate');
    const elProcDetail = $('#kpi-processing-detail');
    const elProcFill = $('#kpi-processing-fill');
    if (elProcRate) elProcRate.textContent = `${processingRate} %`;
    if (elProcDetail) elProcDetail.textContent = `${processed} / ${totalRequests} traités`;
    if (elProcFill) elProcFill.style.width = `${processingRate}%`;

    // 2. Taux d'acceptation (décisions rendues)
    const decided = accepted + refused;
    const approvalRate = decided > 0 ? Math.round((accepted / decided) * 100) : 0;
    const elAppRate = $('#kpi-approval-rate');
    const elAppDetail = $('#kpi-approval-detail');
    const elAppFill = $('#kpi-approval-fill');
    if (elAppRate) elAppRate.textContent = `${approvalRate} %`;
    if (elAppDetail) elAppDetail.textContent = decided > 0 ? `${accepted} sur ${decided} décision(s)` : `${accepted} acceptée(s)`;
    if (elAppFill) elAppFill.style.width = `${approvalRate}%`;

    // 3. Contrôle documentaire
    const totalDocs = Number(data.documents) || 0;
    const pendingDocs = Number(data.documents_pending) || 0;
    const verifiedDocs = Math.max(0, totalDocs - pendingDocs);
    const docRate = totalDocs > 0 ? Math.round((verifiedDocs / totalDocs) * 100) : 0;
    const elDocRate = $('#kpi-doc-rate');
    const elDocDetail = $('#kpi-doc-detail');
    const elDocFill = $('#kpi-doc-fill');
    if (elDocRate) elDocRate.textContent = `${docRate} %`;
    if (elDocDetail) elDocDetail.textContent = `${verifiedDocs} / ${totalDocs} vérifiées`;
    if (elDocFill) elDocFill.style.width = `${docRate}%`;

    // 4. Réactivité messagerie
    const pendingMsgs = Number(data.messages_pending) || 0;
    const msgRate = pendingMsgs === 0 ? 100 : Math.max(10, 100 - pendingMsgs * 15);
    const elMsgRate = $('#kpi-msg-rate');
    const elMsgDetail = $('#kpi-msg-detail');
    const elMsgFill = $('#kpi-msg-fill');
    if (elMsgRate) elMsgRate.textContent = `${msgRate} %`;
    if (elMsgDetail) elMsgDetail.textContent = `${pendingMsgs} en attente`;
    if (elMsgFill) elMsgFill.style.width = `${msgRate}%`;
  }

  async function loadAnalytics() {
    try {
      const { data, error } = await state.client.from('housing_requests')
        .select('etablissement,sexe,niveau');
      if (error || !data) return;

      renderSchoolBreakdown(data);
      renderDemographicBreakdown(data);
      populateSchoolFilter(data);
    } catch (e) {
      console.warn('Analytics loading error:', e);
    }
  }

  function renderSchoolBreakdown(requests) {
    const counts = {};
    requests.forEach(r => {
      const school = (r.etablissement || '').trim() || 'Non renseigné';
      counts[school] = (counts[school] || 0) + 1;
    });

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const total = requests.length;

    const chip = $('#school-count-chip');
    if (chip) chip.textContent = `${entries.length} établissement${entries.length > 1 ? 's' : ''}`;

    const container = $('#school-breakdown');
    if (!container) return;

    if (!entries.length) {
      container.innerHTML = '<p class="empty-state">Aucune donnée d’établissement enregistrée.</p>';
      return;
    }

    const topSchools = entries.slice(0, 5);
    const otherCount = entries.slice(5).reduce((sum, [, c]) => sum + c, 0);
    if (otherCount > 0) {
      topSchools.push(['Autres établissements', otherCount]);
    }

    container.innerHTML = topSchools.map(([school, count]) => {
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return `<div class="breakdown-item">
        <div class="breakdown-info">
          <strong title="${escapeHtml(school)}">${escapeHtml(school)}</strong>
          <span>${count} (${pct} %)</span>
        </div>
        <div class="breakdown-bar">
          <div class="breakdown-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
    }).join('');
  }

  function renderDemographicBreakdown(requests) {
    const container = $('#demographic-breakdown');
    if (!container) return;
    const total = requests.length;
    let male = 0;
    let female = 0;

    const levelCounts = {};

    requests.forEach(r => {
      const s = (r.sexe || '').trim().toLowerCase();
      if (s.startsWith('m') || s === 'homme' || s === 'garcon') male++;
      else if (s.startsWith('f') || s === 'femme' || s === 'fille') female++;

      const niv = (r.niveau || 'Autre / Non renseigné').trim();
      levelCounts[niv] = (levelCounts[niv] || 0) + 1;
    });

    const malePct = total > 0 ? Math.round((male / total) * 100) : 0;
    const femalePct = total > 0 ? Math.round((female / total) * 100) : 0;

    const sortedLevels = Object.entries(levelCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);

    container.innerHTML = `
      <div>
        <div class="demo-section-title">Répartition par sexe</div>
        <div class="demo-gender-grid">
          <div class="demo-gender-card">
            <div class="demo-gender-icon male">♂</div>
            <div class="demo-gender-data">
              <strong>${male} <small>(${malePct} %)</small></strong>
              <small>Masculin</small>
            </div>
          </div>
          <div class="demo-gender-card">
            <div class="demo-gender-icon female">♀</div>
            <div class="demo-gender-data">
              <strong>${female} <small>(${femalePct} %)</small></strong>
              <small>Féminin</small>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div class="demo-section-title">Niveaux académiques</div>
        <div class="demo-levels-list">
          ${sortedLevels.length ? sortedLevels.map(([level, count]) => {
            const lpct = total > 0 ? Math.round((count / total) * 100) : 0;
            return `<div class="breakdown-item">
              <div class="breakdown-info">
                <strong>${escapeHtml(level)}</strong>
                <span>${count} (${lpct} %)</span>
              </div>
              <div class="breakdown-bar">
                <div class="breakdown-fill" style="width:${lpct}%;background:linear-gradient(90deg,#9c8ae6,#6c58a8)"></div>
              </div>
            </div>`;
          }).join('') : '<p class="empty-state">Aucun niveau renseigné.</p>'}
        </div>
      </div>
    `;
  }

  function populateSchoolFilter(requests) {
    const select = $('#request-school');
    if (!select) return;
    const currentVal = select.value;
    const schools = Array.from(new Set(requests.map(r => (r.etablissement || '').trim()).filter(Boolean))).sort();
    select.innerHTML = '<option value="">Tous les établissements</option>' +
      schools.map(s => `<option value="${escapeHtml(s)}"${s === currentVal ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');
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
    const school = $('#request-school')?.value || '';
    const gender = $('#request-gender')?.value || '';
    const from = $('#request-from').value;
    const to = $('#request-to').value;
    const sort = $('#request-sort').value;
    let query = state.client.from('housing_requests').select(
      'id,dossier_code,nom,prenom,telephone,email,email_tuteur,telephone_tuteur,etablissement,filiere,niveau,sexe,adresse,message,status,admin_note,user_id,created_at,updated_at',
      { count: 'exact' }
    );
    if (status) query = query.eq('status', status);
    if (school) query = query.eq('etablissement', school);
    if (gender) query = query.eq('sexe', gender);
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
    $('#request-rows').innerHTML = '<tr><td colspan="8">Chargement des dossiers…</td></tr>';
    $('#request-cards').innerHTML = '<p class="empty-state">Chargement des dossiers…</p>';
    const { data, error, count } = await query;
    if (error) {
      $('#request-results').textContent = 'Erreur de chargement';
      $('#request-rows').innerHTML = `<tr><td colspan="8">${escapeHtml(error.message)}</td></tr>`;
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

  function updateBulkBar() {
    const bar = $('#bulk-actions-bar');
    const countEl = $('#bulk-selected-count');
    if (!bar) return;
    const count = state.selectedRequests.size;
    if (count > 0) {
      bar.hidden = false;
      if (countEl) countEl.textContent = count;
    } else {
      bar.hidden = true;
    }
  }

  function renderRequests(items) {
    const selectAll = $('#select-all-requests');
    if (selectAll) {
      selectAll.checked = items.length > 0 && items.every(item => state.selectedRequests.has(item.id));
    }
    updateBulkBar();

    $('#request-rows').innerHTML = items.length ? items.map(item => `<tr>
      <td class="col-check"><input type="checkbox" class="request-select-item" data-id="${escapeHtml(item.id)}" ${state.selectedRequests.has(item.id) ? 'checked' : ''} aria-label="Sélectionner ${escapeHtml(item.dossier_code)}"></td>
      <td><button class="record-link request-open" data-id="${escapeHtml(item.id)}">${escapeHtml(item.dossier_code)}</button></td>
      <td class="student-name"><strong>${escapeHtml(item.prenom)} ${escapeHtml(item.nom)}</strong><small>${escapeHtml(item.telephone)}</small></td>
      <td>${escapeHtml(item.etablissement)}</td><td>${escapeHtml(item.niveau)}</td><td>${dateFormat(item.created_at)}</td>
      <td><select class="row-select request-status-edit" data-id="${escapeHtml(item.id)}" aria-label="Modifier le statut ${escapeHtml(item.dossier_code)}">
        ${['En attente', 'En étude', 'Acceptée', 'Refusée'].map(status => `<option ${status === item.status ? 'selected' : ''}>${status}</option>`).join('')}</select></td>
      <td><button class="row-action request-open" data-id="${escapeHtml(item.id)}">Ouvrir le dossier</button></td></tr>`).join('')
      : '<tr><td colspan="8">Aucun dossier ne correspond à ces critères.</td></tr>';
    $('#request-cards').innerHTML = items.length ? items.map(item => `<article class="mobile-record">
      <div class="mobile-record-head">
        <label style="display:flex;align-items:center;gap:6px;font-size:.82rem"><input type="checkbox" class="request-select-item" data-id="${escapeHtml(item.id)}" ${state.selectedRequests.has(item.id) ? 'checked' : ''}> <button class="record-link request-open" data-id="${escapeHtml(item.id)}">${escapeHtml(item.dossier_code)}</button></label>
        ${badge(item.status)}
      </div>
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
      <div class="detail-section"><h3>Note communiquée par l’étudiant</h3><p>${escapeHtml(item.message || 'Aucun message particulier joint au formulaire.')}</p></div>
      <div class="detail-section">
        <h3>Remarques & Note interne de l’administration</h3>
        <div class="admin-note-box">
          <label for="request-admin-note" style="display:block;margin-bottom:6px;font-size:0.75rem;font-weight:700;color:#204060">Note administrative du dossier</label>
          <textarea id="request-admin-note" rows="3" placeholder="Ajouter une consigne interne ou une remarque sur ce dossier…">${escapeHtml(item.admin_note || '')}</textarea>
          <div style="margin-top:8px">
            <button id="save-request-note" class="admin-primary" data-id="${escapeHtml(item.id)}" type="button">Enregistrer la note</button>
          </div>
        </div>

        <div class="complement-box">
          <h4>Demande de complément de dossier</h4>
          ${item.user_id
            ? '<p class="data-note" style="margin:0 0 10px;color:#185a90">✓ Ce dossier est rattaché à un compte étudiant. Une notification sera directement transmise dans son espace.</p>'
            : '<p class="data-note" style="margin:0 0 10px;color:#8f6217">⚠️ Ce dossier a été déposé sans compte connecté. La demande sera inscrite dans les remarques du dossier.</p>'}
          <label for="complement-template-select" style="display:block;margin-bottom:6px;font-size:0.74rem;font-weight:700;color:#52677e">Motif fréquent</label>
          <select id="complement-template-select" class="row-select" style="width:100%;margin-bottom:10px">
            <option value="">-- Choisir un modèle ou rédiger un texte libre ci-dessous --</option>
            <option value="Pièce d’identité illisible ou expirée : Merci de fournir une nouvelle copie recto-verso lisible de votre pièce d’identité en cours de validité.">Pièce d’identité illisible ou expirée</option>
            <option value="Certificat d’inscription manquant : Merci de fournir votre attestation d’inscription ou certificat de scolarité pour l’année universitaire en cours.">Certificat d’inscription / scolarité manquant</option>
            <option value="Justificatif de garant / tuteur incomplet : Merci de préciser l’adresse exacte et de communiquer les justificatifs du garant ou tuteur.">Justificatif de garant / tuteur incomplet</option>
            <option value="Relevé de notes manquant : Merci de transmettre la copie de votre dernier relevé de notes universitaire.">Relevé de notes manquant</option>
          </select>
          <label for="complement-message" style="display:block;margin-bottom:6px;font-size:0.74rem;font-weight:700;color:#52677e">Message adressé à l’étudiant</label>
          <textarea id="complement-message" rows="3" placeholder="Précisez les pièces ou explications attendues…"></textarea>
          <div style="margin-top:8px">
            <button id="send-complement-btn" class="admin-primary" data-id="${escapeHtml(item.id)}" data-user-id="${escapeHtml(item.user_id || '')}" data-code="${escapeHtml(item.dossier_code)}" type="button">Envoyer la demande de complément</button>
          </div>
        </div>
      </div>
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

  async function saveRequestNote(id) {
    const note = $('#request-admin-note')?.value.trim() || null;
    const button = $('#save-request-note');
    if (button) button.disabled = true;
    const { error } = await state.client.from('housing_requests').update({
      admin_note: note,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (button) button.disabled = false;
    if (error) {
      notify(`Impossible d’enregistrer la note : ${error.message}`, 'error');
      return;
    }
    notify('Note administrative enregistrée.');
    await openRequest(id);
  }

  async function sendComplementRequest(id, userId, dossierCode) {
    const text = $('#complement-message')?.value.trim();
    if (!text) {
      notify('Précisez le motif du complément avant de l’envoyer.', 'error');
      return;
    }
    const button = $('#send-complement-btn');
    if (button) button.disabled = true;

    try {
      const now = new Date();
      const dateStr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(now);
      const existingNote = $('#request-admin-note')?.value.trim();
      const complementEntry = `[Complément demandé le ${dateStr}] ${text}`;
      const updatedNote = existingNote ? `${existingNote}\n\n${complementEntry}` : complementEntry;

      const { data: currentReq } = await state.client.from('housing_requests').select('status').eq('id', id).single();
      const nextStatus = currentReq?.status === 'En attente' ? 'En étude' : (currentReq?.status || 'En étude');

      const { error: updateError } = await state.client.from('housing_requests').update({
        admin_note: updatedNote,
        status: nextStatus,
        updated_at: now.toISOString()
      }).eq('id', id);

      if (updateError) throw updateError;

      if (userId) {
        const { error: notifError } = await state.client.from('notifications').insert({
          user_id: userId,
          title: `Complément requis pour votre dossier ${dossierCode}`,
          message: text,
          read: false
        });
        if (notifError) console.warn('Erreur notification :', notifError);
      }

      notify(userId
        ? 'Demande de complément envoyée (notification transmise à l’étudiant).'
        : 'Demande de complément enregistrée sur le dossier.');

      await Promise.all([loadRequests(), loadDashboard(), openRequest(id)]);
    } catch (err) {
      notify(`Échec de l’envoi de la demande de complément : ${err.message}`, 'error');
    } finally {
      if (button) button.disabled = false;
    }
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
    const roleFilter = $('#student-role-filter')?.value || '';
    let query = state.client.from('profiles').select(
      'id,first_name,prenom,nom,telephone,matricule,etablissement,filiere,niveau,role,created_at',
      { count: 'exact' }
    );
    if (roleFilter) query = query.eq('role', roleFilter);
    if (search) {
      const term = `%${search}%`;
      query = query.or(`first_name.ilike.${term},prenom.ilike.${term},nom.ilike.${term},matricule.ilike.${term},etablissement.ilike.${term},filiere.ilike.${term}`);
    }
    query = query.order($('#student-sort').value === 'name' ? 'first_name' : 'created_at',
      { ascending: $('#student-sort').value === 'name' })
      .range(state.studentPage * PAGE_SIZE, (state.studentPage + 1) * PAGE_SIZE - 1);
    $('#student-rows').innerHTML = '<tr><td colspan="7">Chargement des utilisateurs…</td></tr>';
    const { data, error, count } = await query;
    if (error) {
      $('#student-rows').innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`;
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
        $('#student-rows').innerHTML = `<tr><td colspan="7">${escapeHtml(linkedError.message)}</td></tr>`;
        $('#student-cards').innerHTML = `<p class="error">${escapeHtml(linkedError.message)}</p>`;
        return;
      }
      (linked || []).forEach(item => { requestCounts[item.user_id] = (requestCounts[item.user_id] || 0) + 1; });
    }
    $('#student-meta').textContent = `${state.totalStudents} compte${state.totalStudents === 1 ? '' : 's'} enregistré${state.totalStudents === 1 ? '' : 's'}`;
    $('#student-page').textContent = `Page ${state.studentPage + 1} / ${Math.max(1, Math.ceil(state.totalStudents / PAGE_SIZE))}`;
    $('#student-prev').disabled = state.studentPage === 0;
    $('#student-next').disabled = (state.studentPage + 1) * PAGE_SIZE >= state.totalStudents;
    const nameOf = profile => profile.first_name || profile.prenom || profile.nom || 'Compte AEDT';
    const roleBadge = r => {
      if (r === 'super_admin') {
        return '<span class="role-badge super-admin">Super Admin 👑</span>';
      }
      if (r === 'admin') {
        return '<span class="role-badge admin">Administrateur</span>';
      }
      return '<span class="role-badge student">Étudiant</span>';
    };
    $('#student-rows').innerHTML = state.pageStudents.length ? state.pageStudents.map(profile => `<tr>
      <td class="student-name"><strong>${escapeHtml(`${profile.prenom || profile.first_name || ''} ${profile.nom || ''}`.trim() || nameOf(profile))}</strong><small>${escapeHtml(profile.matricule || profile.id)}</small></td>
      <td>${roleBadge(profile.role)}</td>
      <td>${escapeHtml(profile.etablissement || '—')}</td><td>${escapeHtml(profile.filiere || '—')}</td><td>${escapeHtml(profile.niveau || '—')}</td>
      <td>${dateFormat(profile.created_at)}</td><td><button class="row-action student-edit" data-id="${escapeHtml(profile.id)}">Modifier</button> <button class="row-action student-requests" data-id="${escapeHtml(profile.id)}">${requestCounts[profile.id] || 0} dossier(s)</button></td></tr>`).join('')
      : '<tr><td colspan="7">Aucun compte trouvé.</td></tr>';
    $('#student-cards').innerHTML = state.pageStudents.map(profile => `<article class="mobile-record">
      <div class="mobile-record-head"><h3>${escapeHtml(`${profile.prenom || profile.first_name || ''} ${profile.nom || ''}`.trim() || nameOf(profile))}</h3>${roleBadge(profile.role)}</div>
      <p>${escapeHtml(profile.etablissement || 'Établissement non renseigné')} · ${escapeHtml(profile.filiere || 'Filière non renseignée')}<br>${escapeHtml(profile.niveau || 'Niveau non renseigné')} · Inscrit le ${dateFormat(profile.created_at)}</p>
      <button class="row-action student-edit" data-id="${escapeHtml(profile.id)}">Modifier le profil & rôle</button>
      <button class="row-action student-requests" data-id="${escapeHtml(profile.id)}">${requestCounts[profile.id] || 0} demande(s)</button></article>`).join('');
  }

  async function openStudent(id) {
    const dialog = $('#student-dialog');
    const form = $('#student-edit-form');
    form.reset();
    $('#student-edit-id').value = id;
    const { data, error } = await state.client.from('profiles')
      .select('id,first_name,prenom,nom,telephone,matricule,etablissement,filiere,niveau,role')
      .eq('id', id).single();
    if (error) {
      notify(`Impossible de charger le profil : ${error.message}`, 'error');
      return;
    }
    $('#student-edit-first-name').value = data.prenom || data.first_name || '';
    $('#student-edit-last-name').value = data.nom || '';
    $('#student-edit-phone').value = data.telephone || '';
    $('#student-edit-matricule').value = data.matricule || '';
    $('#student-edit-school').value = data.etablissement || '';
    $('#student-edit-program').value = data.filiere || '';
    $('#student-edit-level').value = data.niveau || '';

    const roleSelect = $('#student-edit-role');
    const roleWarning = $('#student-edit-role-warning');
    const roleNote = $('#student-edit-role-note');
    const optSuperAdmin = $('#opt-role-super-admin');

    if (optSuperAdmin) {
      optSuperAdmin.hidden = !state.isSuperAdmin;
      optSuperAdmin.disabled = !state.isSuperAdmin;
    }

    if (roleSelect) {
      roleSelect.value = data.role || 'student';
      const isSelf = state.user && state.user.id === data.id;
      const isTargetSuper = data.role === 'super_admin';

      if (isSelf) {
        roleSelect.disabled = true;
        if (roleNote) roleNote.textContent = 'Votre propre compte (protection contre l’auto-rétrogradation).';
      } else if (isTargetSuper && !state.isSuperAdmin) {
        roleSelect.disabled = true;
        if (roleNote) roleNote.textContent = 'Ce compte est Super Administrateur. Seul un Super Administrateur peut modifier ses droits.';
      } else {
        roleSelect.disabled = false;
        if (roleNote) roleNote.textContent = '';
      }

      const updateRoleWarning = () => {
        if (!roleWarning) return;
        if (roleSelect.value === 'super_admin') {
          roleWarning.hidden = false;
          roleWarning.innerHTML = '👑 <strong>Privilège Super Administrateur :</strong> ce compte disposera d’un contrôle total sur le portail et pourra créer et gérer les autres comptes administrateurs.';
        } else if (roleSelect.value === 'admin') {
          roleWarning.hidden = false;
          roleWarning.innerHTML = '⚠️ <strong>Attention :</strong> le rôle <em>Administrateur</em> accorde un accès complet à la gestion des dossiers de logement, justificatifs, messageries et contenus.';
        } else {
          roleWarning.hidden = true;
        }
      };
      updateRoleWarning();
      roleSelect.onchange = updateRoleWarning;
    }

    dialog.scrollTop = 0;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    setTimeout(() => {
      dialog.scrollTop = 0;
      $('#student-edit-first-name')?.focus({ preventScroll: true });
    }, 25);
  }

  async function saveStudent(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const targetId = $('#student-edit-id').value;
    const isSelf = state.user && state.user.id === targetId;
    const roleSelect = $('#student-edit-role');
    const newRole = !isSelf && roleSelect && !roleSelect.disabled ? roleSelect.value : undefined;

    if (newRole === 'super_admin') {
      if (!state.isSuperAdmin) {
        notify('Seul un Super Administrateur peut attribuer le rôle Super Administrateur.', 'error');
        button.disabled = false;
        return;
      }
      const confirmSuper = window.confirm('Confirmez-vous l’attribution des droits SUPER ADMINISTRATEUR 👑 à ce compte ? Cet utilisateur aura tous les privilèges, y compris la création d’autres administrateurs.');
      if (!confirmSuper) {
        button.disabled = false;
        return;
      }
    } else if (newRole === 'admin') {
      const confirmPromo = window.confirm('Confirmez-vous l’attribution des droits ADMINISTRATEUR à ce compte ? Cet utilisateur aura accès complet à la gestion du portail.');
      if (!confirmPromo) {
        button.disabled = false;
        return;
      }
    }

    const firstName = $('#student-edit-first-name').value.trim() || null;
    const payload = {
      first_name: firstName,
      prenom: firstName,
      nom: $('#student-edit-last-name').value.trim() || null,
      telephone: $('#student-edit-phone').value.trim() || null,
      matricule: $('#student-edit-matricule').value.trim() || null,
      etablissement: $('#student-edit-school').value.trim() || null,
      filiere: $('#student-edit-program').value.trim() || null,
      niveau: $('#student-edit-level').value.trim() || null,
      updated_at: new Date().toISOString()
    };
    if (newRole) payload.role = newRole;

    const { data, error } = await state.client.from('profiles').update(payload)
      .eq('id', targetId).select('id,role').maybeSingle();
    button.disabled = false;
    if (error) {
      notify(`Impossible d’enregistrer le profil : ${error.message}`, 'error');
      return;
    }
    if (!data) {
      notify('Le profil a changé ou n’est plus accessible. Actualisez la liste.', 'error');
      return;
    }
    $('#student-dialog').close();
    notify('Compte et autorisations enregistrés avec succès.');
    await Promise.all([loadStudents(), loadDashboard(), loadActivity()]);
  }

  async function loadDocuments() {
    let query = state.client.from('request_documents').select(
      'id,request_id,request_code,file_type,file_path,original_name,created_at,verification_status,verified_at', { count: 'exact' }
    ).order('created_at', { ascending: false }).range(state.documentPage * PAGE_SIZE, (state.documentPage + 1) * PAGE_SIZE - 1);
    const type = $('#document-type').value;
    const search = safeFilterText($('#document-search').value);
    const statusFilter = $('#document-status-filter')?.value || '';
    if (type) query = query.eq('file_type', type);
    if (statusFilter) {
      const dbStatus = statusFilter === 'En attente' ? 'À vérifier' : statusFilter === 'À remplacer' ? 'À revoir' : statusFilter;
      query = query.eq('verification_status', dbStatus);
    }
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
    const typeName = type => type === 'carte_identite' ? 'Carte d’identité' : type === 'docs_demande_logement' ? 'Docs de demande de logement' : type;
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
      .select('id,title,category,published,published_at,created_at,image_url,video_url,excerpt,content,video_caption').order('created_at', { ascending: false }).limit(50);
    if (error) {
      $('#news-list').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      return;
    }
    $('#news-list').innerHTML = data?.length ? data.map(item => `<div class="content-entry">`
      + (item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="" class="content-thumb">` : '')
      + (item.video_url ? `<span class="content-badge">Vidéo</span>` : '')
      + `<strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category || 'Actualité')} · ${item.published ? 'Publiée' : 'Brouillon'} · ${dateFormat(item.published_at || item.created_at)}</small>`
      + `<div style="display:flex;gap:6px;margin-top:8px">`
      + `<button class="row-action edit-news" data-id="${escapeHtml(item.id)}" type="button">Modifier</button>`
      + `<button class="row-action toggle-news" data-id="${escapeHtml(item.id)}" data-published="${item.published ? 'true' : 'false'}" type="button">${item.published ? 'Passer en brouillon' : 'Publier'}</button>`
      + `<button class="row-action delete-news" data-id="${escapeHtml(item.id)}" type="button" style="color:#a83232">Supprimer</button>`
      + `</div>`
      + `</div>`).join('') : '<p class="empty-state">Aucune actualité enregistrée.</p>';
  }

  async function editNews(id) {
    const { data: item, error } = await state.client.from('news').select('*').eq('id', id).single();
    if (error || !item) {
      notify(`Impossible de charger l’actualité : ${error?.message || 'introuvable'}`, 'error');
      return;
    }
    state.editingNewsId = item.id;
    state.editingNewsPhotoUrl = item.image_url || null;
    state.editingNewsVideoUrl = item.video_url || null;
    $('#news-edit-id').value = item.id;
    $('#news-title').value = item.title || '';
    $('#news-category').value = item.category || 'Actualité';
    $('#news-excerpt').value = item.excerpt || '';
    $('#news-content').value = item.content || '';
    $('#news-video-caption').value = item.video_caption || '';
    $('#news-form-title').textContent = 'Modifier l’actualité';
    $('#news-form-sub').textContent = 'Modification en cours — enregistrez pour appliquer les changements.';
    $('#news-submit-btn').textContent = 'Enregistrer les modifications';
    $('#news-cancel-btn').hidden = false;

    const preview = $('#news-media-preview');
    if (preview) {
      const parts = [];
      if (item.image_url) parts.push(`<img src="${escapeHtml(item.image_url)}" alt="" style="max-height:100px;border-radius:8px">`);
      if (item.video_url) parts.push(`<video src="${escapeHtml(item.video_url)}" controls style="max-height:100px;border-radius:8px"></video>`);
      preview.innerHTML = parts.length ? `<small class="media-note">Médias actuels conservés (choisir un fichier les remplacera) :</small>${parts.join('')}` : '';
    }
    $('#news-form').scrollIntoView({ behavior: 'smooth' });
  }

  function cancelEditNews() {
    state.editingNewsId = null;
    state.editingNewsPhotoUrl = null;
    state.editingNewsVideoUrl = null;
    $('#news-form').reset();
    $('#news-edit-id').value = '';
    $('#news-category').value = 'Actualité';
    $('#news-form-title').textContent = 'Publier une actualité';
    $('#news-form-sub').textContent = 'Le contenu publié apparaît dans la section Actualités.';
    $('#news-submit-btn').textContent = 'Publier l’actualité';
    $('#news-cancel-btn').hidden = true;
    $('#news-media-preview').innerHTML = '';
  }

  async function deleteNews(id) {
    if (!window.confirm('Supprimer définitivement cette actualité du portail ?')) return;
    const { error } = await state.client.from('news').delete().eq('id', id);
    if (error) {
      notify(`Impossible de supprimer l’actualité : ${error.message}`, 'error');
      return;
    }
    if (state.editingNewsId === id) cancelEditNews();
    notify('Actualité supprimée.');
    await Promise.all([loadNews(), loadDashboard()]);
  }

  async function toggleNewsPublish(id, currentPublished) {
    const nextState = !currentPublished;
    const { error } = await state.client.from('news').update({
      published: nextState,
      published_at: nextState ? new Date().toISOString() : null
    }).eq('id', id);
    if (error) {
      notify(`Impossible de modifier la publication : ${error.message}`, 'error');
      return;
    }
    notify(nextState ? 'Actualité publiée sur le portail.' : 'Actualité passée en brouillon (masquée du public).');
    await loadNews();
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
    state.presidentPhotoUrl = profile.photo_url || null;
    state.presidentVideoUrl = profile.video_url || null;
    const apercu = $('#president-media-preview');
    if (apercu) {
      const morceaux = [];
      if (state.presidentPhotoUrl) {
        morceaux.push(`<img src="${escapeHtml(state.presidentPhotoUrl)}" alt="Photo actuelle" style="max-height:140px;border-radius:12px">`);
      }
      if (state.presidentVideoUrl) {
        morceaux.push(`<video src="${escapeHtml(state.presidentVideoUrl)}" controls style="max-height:140px;border-radius:12px"></video>`);
      }
      apercu.innerHTML = morceaux.length
        ? `<small class="media-note">Média actuel — choisir un fichier le remplacera.</small>${morceaux.join('')}`
        : '';
    }
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

  const MAX_OCTETS_MEDIA = 50 * 1024 * 1024;
  const IMAGES_OK = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
  const VIDEOS_OK = ['mp4', 'webm', 'mov', 'ogg', 'ogv', 'm4v'];
  const MAX_OCTETS_VIDEO = 50 * 1024 * 1024;

  function extensionDe(nom) {
    return (String(nom || '').split('.').pop() || '').toLowerCase();
  }

  function estImage(file) {
    if (!file) return false;
    if (file.type && file.type.indexOf('image/') === 0) return true;
    return IMAGES_OK.includes(extensionDe(file.name));
  }

  function estVideo(file) {
    if (!file) return false;
    if (file.type && file.type.indexOf('video/') === 0) return true;
    return VIDEOS_OK.includes(extensionDe(file.name));
  }

  // Téléverse un média dans le bucket public « media » et renvoie son URL.
  // kind : 'image' ou 'video' — détermine le contrôle de format et la taille.
  async function televerserMedia(file, kind) {
    if (!file || !file.size) return null;
    const ext = extensionDe(file.name);
    if (kind === 'image') {
      if (!estImage(file)) throw new Error(`« ${file.name} » n’est pas une image reconnue.`);
      if (file.size > MAX_OCTETS_MEDIA) throw new Error(`« ${file.name} » dépasse 50 Mo.`);
    } else {
      if (!estVideo(file)) throw new Error(`« ${file.name} » n’est pas une vidéo reconnue.`);
      if (file.size > MAX_OCTETS_VIDEO) throw new Error(`« ${file.name} » dépasse 50 Mo.`);
    }
    const chemin = `${kind}/${crypto.randomUUID()}.${ext}`;
    const resultat = await state.client.storage.from('media').upload(chemin, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });
    if (resultat.error) throw resultat.error;
    return state.client.storage.from('media').getPublicUrl(chemin).data.publicUrl;
  }

  // Affiche un aperçu local (URL temporaire) du fichier choisi.
  function apercuLocal(input, conteneur) {
    if (!input || !conteneur) return;
    const file = input.files && input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (estImage(file)) {
      conteneur.innerHTML = `<img src="${url}" alt="Aperçu" style="max-height:150px;border-radius:12px">`;
    } else if (estVideo(file)) {
      conteneur.innerHTML = `<video src="${url}" controls style="max-height:150px;border-radius:12px"></video>`;
    }
  }

  async function submitNews(event) {
    event.preventDefault();
    const button = event.submitter || $('#news-submit-btn') || $('#news-form button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const photo = $('#news-photo').files[0];
      const video = $('#news-video').files[0];
      const imageUrl = photo ? await televerserMedia(photo, 'image') : state.editingNewsPhotoUrl;
      const videoUrl = video ? await televerserMedia(video, 'video') : state.editingNewsVideoUrl;
      const payload = {
        title: $('#news-title').value.trim(),
        category: $('#news-category').value.trim() || 'Actualité',
        excerpt: $('#news-excerpt').value.trim() || null,
        content: $('#news-content').value.trim() || null,
        image_url: imageUrl,
        video_url: videoUrl,
        video_caption: $('#news-video-caption').value.trim() || null
      };

      if (!payload.title) {
        notify('Le titre de l’actualité est obligatoire.', 'error');
        return;
      }

      if (state.editingNewsId) {
        const { error } = await state.client.from('news').update(payload).eq('id', state.editingNewsId);
        if (error) throw error;
        notify('Actualité mise à jour avec succès.');
        cancelEditNews();
      } else {
        payload.published = true;
        payload.published_at = new Date().toISOString();
        const { error } = await state.client.from('news').insert(payload);
        if (error) throw error;
        event.currentTarget.reset();
        $('#news-media-preview').innerHTML = '';
        $('#news-category').value = 'Actualité';
        notify('Actualité publiée sur le portail.');
      }
      await Promise.all([loadNews(), loadDashboard()]);
    } catch (error) {
      notify(`Échec de l’enregistrement de l’actualité : ${error.message}`, 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function loadVideos() {
    const box = $('#videos-list');
    const countEl = $('#videos-count');
    if (!box) return;
    box.innerHTML = '<p class="empty-state">Chargement de la médiathèque…</p>';
    try {
      const [{ data: storageFiles, error: storageError }, { data: newsVideos }, { data: presVideo }] = await Promise.all([
        state.client.storage.from('media').list('video'),
        state.client.from('news').select('id,title,video_url,created_at').not('video_url', 'is', null),
        state.client.from('president_profile').select('id,name,video_url,updated_at').not('video_url', 'is', null)
      ]);

      const items = [];
      const seenUrls = new Set();

      if (!storageError && storageFiles?.length) {
        for (const file of storageFiles) {
          if (!file.name || file.name === '.emptyFolderPlaceholder') continue;
          const path = `video/${file.name}`;
          const url = state.client.storage.from('media').getPublicUrl(path).data.publicUrl;
          seenUrls.add(url);
          items.push({
            name: file.name,
            url,
            storagePath: path,
            size: file.metadata?.size || file.size || null,
            createdAt: file.created_at || null,
            source: 'Stockage Supabase (media/video)'
          });
        }
      }

      (newsVideos || []).forEach(n => {
        if (n.video_url && !seenUrls.has(n.video_url)) {
          seenUrls.add(n.video_url);
          items.push({
            name: n.title ? `Actualité : ${n.title}` : 'Vidéo d’actualité',
            url: n.video_url,
            storagePath: null,
            size: null,
            createdAt: n.created_at,
            source: 'Actualités'
          });
        }
      });

      (presVideo || []).forEach(p => {
        if (p.video_url && !seenUrls.has(p.video_url)) {
          seenUrls.add(p.video_url);
          items.push({
            name: `Profil Présidence (${p.name || 'Président'})`,
            url: p.video_url,
            storagePath: null,
            size: null,
            createdAt: p.updated_at,
            source: 'Profil du Président'
          });
        }
      });

      if (countEl) countEl.textContent = `${items.length} vidéo${items.length === 1 ? '' : 's'} répertoriée${items.length === 1 ? '' : 's'}`;

      if (!items.length) {
        box.innerHTML = '<p class="empty-state">Aucune vidéo enregistrée dans la médiathèque.</p>';
        return;
      }

      const formatSize = octets => octets ? `${(octets / (1024 * 1024)).toFixed(1)} Mo` : '';

      box.innerHTML = items.map(v => `
        <article class="video-card">
          <video src="${escapeHtml(v.url)}" controls preload="metadata"></video>
          <div class="video-card-body">
            <strong class="video-card-title" title="${escapeHtml(v.name)}">${escapeHtml(v.name)}</strong>
            <span class="video-card-meta">${escapeHtml(v.source)}${v.size ? ` · ${formatSize(v.size)}` : ''}${v.createdAt ? ` · ${dateFormat(v.createdAt)}` : ''}</span>
            <div class="video-card-actions">
              <button class="row-action copy-video-link" data-url="${escapeHtml(v.url)}" type="button">Copier l’URL</button>
              ${v.storagePath ? `<button class="row-action delete-video" data-path="${escapeHtml(v.storagePath)}" type="button" style="color:#a83232">Supprimer</button>` : ''}
            </div>
          </div>
        </article>
      `).join('');
    } catch (err) {
      box.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  }

  async function uploadVideoFromMediaForm(event) {
    event.preventDefault();
    const input = $('#video-upload-file');
    const file = input?.files?.[0];
    if (!file) {
      notify('Sélectionnez un fichier vidéo avant de téléverser.', 'error');
      return;
    }
    const button = event.submitter || $('#video-upload-form button[type="submit"]');
    if (button) button.disabled = true;
    try {
      await televerserMedia(file, 'video');
      $('#video-upload-form').reset();
      $('#video-upload-preview').innerHTML = '';
      notify('Vidéo ajoutée à la médiathèque Supabase.');
      await loadVideos();
    } catch (err) {
      notify(`Échec du téléversement : ${err.message}`, 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function deleteVideo(path) {
    if (!window.confirm('Supprimer définitivement cette vidéo du stockage Supabase ?')) return;
    const { error } = await state.client.storage.from('media').remove([path]);
    if (error) {
      notify(`Impossible de supprimer la vidéo : ${error.message}`, 'error');
      return;
    }
    notify('Vidéo supprimée du stockage.');
    await loadVideos();
  }

  async function loadBroadcastRecipients() {
    const select = $('#broadcast-recipient');
    if (!select) return;
    const { data: students, error } = await state.client.from('profiles')
      .select('id,prenom,first_name,nom,matricule')
      .eq('role', 'student')
      .order('nom');
    if (error) return;
    select.innerHTML = '<option value="all">Tous les étudiants inscrits (diffusion générale)</option>'
      + (students || []).map(s => {
        const nom = `${s.prenom || s.first_name || ''} ${s.nom || ''}`.trim() || 'Étudiant';
        const mat = s.matricule ? ` (${s.matricule})` : '';
        return `<option value="${escapeHtml(s.id)}">${escapeHtml(nom + mat)}</option>`;
      }).join('');
  }

  async function sendBroadcastNotification(event) {
    event.preventDefault();
    const recipient = $('#broadcast-recipient')?.value;
    const title = $('#broadcast-title')?.value.trim();
    const message = $('#broadcast-message')?.value.trim();
    if (!title || !message) {
      notify('Veuillez renseigner un titre et un message.', 'error');
      return;
    }
    const button = event.submitter || $('#broadcast-notification-form button[type="submit"]');
    if (button) button.disabled = true;

    try {
      if (recipient === 'all') {
        const { data: students, error: listError } = await state.client.from('profiles')
          .select('id').eq('role', 'student');
        if (listError) throw listError;
        if (!students?.length) {
          notify('Aucun compte étudiant trouvé pour la diffusion.', 'error');
          return;
        }
        const confirmSend = window.confirm(`Diffuser cette notification à l’ensemble des ${students.length} étudiant(s) inscrits ?`);
        if (!confirmSend) {
          if (button) button.disabled = false;
          return;
        }

        const notifs = students.map(s => ({
          user_id: s.id,
          title,
          message,
          read: false
        }));

        for (let i = 0; i < notifs.length; i += 100) {
          const slice = notifs.slice(i, i + 100);
          const { error: insError } = await state.client.from('notifications').insert(slice);
          if (insError) throw insError;
        }

        notify(`Notification diffusée à ${students.length} étudiant(s).`);
      } else {
        const { error: insError } = await state.client.from('notifications').insert({
          user_id: recipient,
          title,
          message,
          read: false
        });
        if (insError) throw insError;
        notify('Notification envoyée à l’étudiant.');
      }

      $('#broadcast-notification-form').reset();
    } catch (err) {
      notify(`Erreur lors de l’envoi de la notification : ${err.message}`, 'error');
    } finally {
      if (button) button.disabled = false;
    }
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
    const button = event.submitter || $('#president-form button[type="submit"]');
    if (button) button.disabled = true;
    try {
      // Les médias ne sont téléversés que si un nouveau fichier est choisi :
      // sinon les URL déjà enregistrées sont conservées.
      const photo = $('#president-photo').files[0];
      const video = $('#president-video').files[0];
      const photoUrl = photo ? await televerserMedia(photo, 'image') : state.presidentPhotoUrl;
      const videoUrl = video ? await televerserMedia(video, 'video') : state.presidentVideoUrl;

      const payload = {
        name: $('#president-name').value.trim(),
        role: $('#president-role').value.trim(),
        quote: $('#president-quote').value.trim(),
        photo_url: photoUrl || null,
        video_url: videoUrl || null,
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
      // On mémorise les URL pour ne pas re-téléverser au prochain enregistrement.
      state.presidentPhotoUrl = payload.photo_url;
      state.presidentVideoUrl = payload.video_url;
      $('#president-media-preview').innerHTML = '';
      notify('Profil du Président enregistré.');
    } finally {
      if (button) button.disabled = false;
    }
  }


  function downloadCsv(rows, filename) {
    if (!rows.length) {
      notify('Aucune donnée à exporter.', 'error');
      return;
    }
    const columns = Object.keys(rows[0]);
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
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function applyBulkStatus() {
    const newStatus = $('#bulk-status-select')?.value;
    if (!newStatus) {
      notify('Veuillez sélectionner un statut à appliquer au lot.', 'error');
      return;
    }
    const ids = Array.from(state.selectedRequests);
    if (!ids.length) {
      notify('Aucun dossier sélectionné.', 'error');
      return;
    }
    const button = $('#bulk-apply-status');
    if (button) button.disabled = true;
    try {
      const { error } = await state.client.from('housing_requests')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) {
        notify(`Erreur lors de la modification groupée : ${error.message}`, 'error');
        return;
      }
      notify(`Statut « ${newStatus} » appliqué avec succès à ${ids.length} dossier(s).`);
      state.selectedRequests.clear();
      await Promise.all([loadRequests(), loadDashboard()]);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function exportBulkSelected() {
    const ids = Array.from(state.selectedRequests);
    if (!ids.length) {
      notify('Aucun dossier sélectionné pour l’export.', 'error');
      return;
    }
    const { data, error } = await state.client.from('housing_requests')
      .select('dossier_code,nom,prenom,telephone,email,email_tuteur,telephone_tuteur,etablissement,filiere,niveau,sexe,adresse,status,created_at,updated_at')
      .in('id', ids);
    if (error || !data) {
      notify(`Erreur d’export : ${error?.message || 'Données introuvables'}`, 'error');
      return;
    }
    downloadCsv(data, 'demandes-selectionnees-aedt.csv');
  }

  function clearBulkSelection() {
    state.selectedRequests.clear();
    document.querySelectorAll('.request-select-item').forEach(cb => { cb.checked = false; });
    const selectAll = $('#select-all-requests');
    if (selectAll) selectAll.checked = false;
    updateBulkBar();
  }

  function resetRequestFilters() {
    $('#request-search').value = '';
    $('#request-status').value = '';
    const sch = $('#request-school');
    if (sch) sch.value = '';
    const gen = $('#request-gender');
    if (gen) gen.value = '';
    $('#request-from').value = '';
    $('#request-to').value = '';
    state.requestPage = 0;
    state.requestUserId = null;
    loadRequests();
  }

  async function exportStudents() {
    const { data, error } = await state.client.from('profiles')
      .select('matricule,nom,prenom,first_name,telephone,etablissement,filiere,niveau,role,created_at')
      .order('created_at', { ascending: false });
    if (error || !data) {
      notify(`Impossible d’exporter les comptes : ${error?.message || 'Erreur'}`, 'error');
      return;
    }
    const formatted = data.map(p => ({
      matricule: p.matricule || '',
      nom: p.nom || '',
      prenom: p.prenom || p.first_name || '',
      telephone: p.telephone || '',
      etablissement: p.etablissement || '',
      filiere: p.filiere || '',
      niveau: p.niveau || '',
      role: p.role || 'student',
      created_at: p.created_at || ''
    }));
    downloadCsv(formatted, 'etudiants-aedt.csv');
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


  async function openProfileDialog() {
    const dialog = $('#admin-profile-dialog');
    if (!dialog) return;
    dialog.scrollTop = 0;
    const form = $('#admin-profile-form');
    if (form) form.reset();

    const user = state.user;
    const profile = state.currentUserProfile;

    if ($('#my-admin-email')) $('#my-admin-email').value = user?.email || '';
    if ($('#my-admin-first-name')) $('#my-admin-first-name').value = profile?.prenom || profile?.first_name || '';
    if ($('#my-admin-last-name')) $('#my-admin-last-name').value = profile?.nom || '';
    if ($('#my-admin-phone')) $('#my-admin-phone').value = profile?.telephone || '';
    if ($('#my-admin-new-password')) $('#my-admin-new-password').value = '';

    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    setTimeout(() => {
      dialog.scrollTop = 0;
      $('#my-admin-first-name')?.focus({ preventScroll: true });
    }, 25);
  }

  async function saveAdminProfile(event) {
    event.preventDefault();
    const button = $('#admin-profile-save');
    if (button) button.disabled = true;

    try {
      const firstName = $('#my-admin-first-name').value.trim();
      const lastName = $('#my-admin-last-name').value.trim();
      const phone = $('#my-admin-phone').value.trim();
      const newPassword = $('#my-admin-new-password').value.trim();

      const { error: profileError } = await state.client.from('profiles').update({
        prenom: firstName,
        first_name: firstName,
        nom: lastName,
        telephone: phone || null,
        updated_at: new Date().toISOString()
      }).eq('id', state.user.id);

      if (profileError) {
        notify(`Erreur lors de la mise à jour du profil : ${profileError.message}`, 'error');
        return;
      }

      if (newPassword) {
        if (newPassword.length < 8) {
          notify('Le nouveau mot de passe doit comporter au moins 8 caractères.', 'error');
          return;
        }
        const { error: pwdError } = await state.client.auth.updateUser({ password: newPassword });
        if (pwdError) {
          notify(`Profil mis à jour, mais le mot de passe n'a pas pu être changé : ${pwdError.message}`, 'error');
          return;
        }
      }

      notify('Profil administrateur mis à jour avec succès.');
      $('#admin-profile-dialog').close();
      await authorize();
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function boot() {
    if (!state.client) {
      $('#login-view').hidden = false;
      $('#admin-app').hidden = true;
      $('#login-message').innerHTML = '<p class="error">Configuration Supabase introuvable. Vérifiez config.js.</p>';
      return;
    }

    const { data, error } = await state.client.auth.getSession();
    if (error) {
      $('#login-view').hidden = false;
      $('#admin-app').hidden = true;
      $('#login-message').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      return;
    }

    if (data.session) {
      await authorize();
      return;
    }

    $('#login-view').hidden = false;
    $('#admin-app').hidden = true;
    closeSidebar();
  }

  async function authorize() {
    const { data: userData, error: userError } = await state.client.auth.getUser();
    if (userError || !userData?.user) {
      $('#login-view').hidden = false;
      $('#login-message').innerHTML = `<p class="error">${escapeHtml(userError?.message || 'Session utilisateur introuvable.')}</p>`;
      return;
    }
    state.user = userData.user;

    let isAdmin = false;
    try {
      const { data, error } = await state.client.rpc('is_admin');
      if (!error && data) {
        isAdmin = true;
      }
    } catch {
      isAdmin = false;
    }

    // Retrieve profile to display full name and exact role
    const { data: prof } = await state.client.from('profiles')
      .select('first_name,prenom,nom,role')
      .eq('id', state.user.id)
      .maybeSingle();

    state.currentUserProfile = prof || null;

    if (!isAdmin && prof && (prof.role === 'admin' || prof.role === 'super_admin')) {
      isAdmin = true;
    }

    if (!isAdmin) {
      $('#login-view').hidden = false;
      $('#login-message').innerHTML = '<p class="error">Ce compte ne dispose pas des droits administrateur.</p>';
      const result = await state.client.auth.signOut();
      if (result.error) notify(`La session non autorisée n’a pas pu être fermée : ${result.error.message}`, 'error');
      return;
    }

    // Check if super admin
    if (prof?.role === 'super_admin') {
      state.isSuperAdmin = true;
    } else {
      try {
        const { data: isSuper } = await state.client.rpc('is_super_admin');
        state.isSuperAdmin = Boolean(isSuper);
      } catch {
        state.isSuperAdmin = false;
      }
    }

    const displayName = (prof ? `${prof.prenom || prof.first_name || ''} ${prof.nom || ''}`.trim() : '') || state.user.email || 'Administrateur AEDT';
    $('#admin-name').textContent = displayName;
    $('#admin-avatar').textContent = (displayName[0] || 'A').toUpperCase();

    const roleBadgeEl = $('#admin-role-badge');
    const roleLabelEl = $('#admin-role-label');
    if (state.isSuperAdmin) {
      if (roleBadgeEl) {
        roleBadgeEl.className = 'role-badge super-admin';
        roleBadgeEl.textContent = 'Super Admin 👑';
      }
      if (roleLabelEl) roleLabelEl.textContent = 'Super Administrateur AEDT';
    } else {
      if (roleBadgeEl) {
        roleBadgeEl.className = 'role-badge admin';
        roleBadgeEl.textContent = 'Admin';
      }
      if (roleLabelEl) roleLabelEl.textContent = 'Administration AEDT';
    }

    const btnCreateAdmin = $('#btn-open-create-admin');
    if (btnCreateAdmin) {
      btnCreateAdmin.hidden = false;
    }

    $('#login-view').hidden = true;
    $('#admin-app').hidden = false;
    closeSidebar();
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
    closeSidebar();
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
    const saveNoteBtn = event.target.closest('#save-request-note');
    if (saveNoteBtn) {
      saveRequestNote(saveNoteBtn.dataset.id);
      return;
    }
    const sendCompBtn = event.target.closest('#send-complement-btn');
    if (sendCompBtn) {
      sendComplementRequest(sendCompBtn.dataset.id, sendCompBtn.dataset.userId, sendCompBtn.dataset.code);
      return;
    }
    const editN = event.target.closest('.edit-news');
    if (editN) {
      editNews(editN.dataset.id);
      return;
    }
    const delN = event.target.closest('.delete-news');
    if (delN) {
      deleteNews(delN.dataset.id);
      return;
    }
    const togN = event.target.closest('.toggle-news');
    if (togN) {
      toggleNewsPublish(togN.dataset.id, togN.dataset.published === 'true');
      return;
    }
    const copyVid = event.target.closest('.copy-video-link');
    if (copyVid) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(copyVid.dataset.url).then(() => {
          notify('Lien de la vidéo copié dans le presse-papier.');
        }).catch(() => {
          notify(`Lien vidéo : ${copyVid.dataset.url}`);
        });
      } else {
        notify(`Lien vidéo : ${copyVid.dataset.url}`);
      }
      return;
    }
    const delVid = event.target.closest('.delete-video');
    if (delVid) {
      deleteVideo(delVid.dataset.path);
      return;
    }
  });

  document.addEventListener('change', event => {
    if (event.target.matches('.request-status-edit')) {
      updateRequestStatus(event.target.dataset.id, event.target.value);
    } else if (event.target.matches('.document-verification')) {
      updateDocumentVerification(event.target.dataset.id, event.target.value, event.target);
    } else if (event.target.id === 'complement-template-select' && event.target.value) {
      const msgInput = $('#complement-message');
      if (msgInput) msgInput.value = event.target.value;
    } else if (event.target.id === 'student-role-filter') {
      state.studentPage = 0;
      loadStudents();
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
  ['request-status', 'request-school', 'request-gender', 'request-from', 'request-to', 'request-sort'].forEach(id =>
    $(`#${id}`)?.addEventListener('change', () => { state.requestPage = 0; loadRequests(); }));
  $('#request-reset')?.addEventListener('click', resetRequestFilters);

  // Sélection et actions groupées
  $('#select-all-requests')?.addEventListener('change', event => {
    const isChecked = event.target.checked;
    (state.pageRequests || []).forEach(r => {
      if (isChecked) state.selectedRequests.add(r.id);
      else state.selectedRequests.delete(r.id);
    });
    document.querySelectorAll('.request-select-item').forEach(cb => { cb.checked = isChecked; });
    updateBulkBar();
  });
  document.addEventListener('change', event => {
    if (event.target.matches('.request-select-item')) {
      const id = event.target.dataset.id;
      if (event.target.checked) state.selectedRequests.add(id);
      else state.selectedRequests.delete(id);
      const selectAll = $('#select-all-requests');
      if (selectAll && state.pageRequests) {
        selectAll.checked = state.pageRequests.length > 0 && state.pageRequests.every(r => state.selectedRequests.has(r.id));
      }
      updateBulkBar();
    }
  });
  $('#bulk-apply-status')?.addEventListener('click', applyBulkStatus);
  $('#bulk-export-selected')?.addEventListener('click', exportBulkSelected);
  $('#bulk-clear-selection')?.addEventListener('click', clearBulkSelection);
  $('#students-export')?.addEventListener('click', exportStudents);

  // Filtres rapides documents
  $('#doc-quick-chips')?.addEventListener('click', event => {
    const chip = event.target.closest('.doc-chip');
    if (!chip) return;
    document.querySelectorAll('.doc-chip').forEach(c => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    const val = chip.dataset.docStatus || '';
    const filterSelect = $('#document-status-filter');
    if (filterSelect) filterSelect.value = val;
    state.documentPage = 0;
    loadDocuments();
  });
  $('#document-status-filter')?.addEventListener('change', event => {
    const val = event.target.value;
    document.querySelectorAll('.doc-chip').forEach(c => {
      c.classList.toggle('is-active', (c.dataset.docStatus || '') === val);
    });
    state.documentPage = 0;
    loadDocuments();
  });
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
  $('#news-cancel-btn')?.addEventListener('click', cancelEditNews);
  $('#news-photo').addEventListener('change', e => apercuLocal(e.target, $('#news-media-preview')));
  $('#news-video').addEventListener('change', e => apercuLocal(e.target, $('#news-media-preview')));
  $('#video-upload-form')?.addEventListener('submit', uploadVideoFromMediaForm);
  $('#video-upload-file')?.addEventListener('change', e => apercuLocal(e.target, $('#video-upload-preview')));
  $('#videos-refresh')?.addEventListener('click', loadVideos);
  $('#broadcast-notification-form')?.addEventListener('submit', sendBroadcastNotification);
  $('#president-photo').addEventListener('change', e => apercuLocal(e.target, $('#president-media-preview')));
  $('#president-video').addEventListener('change', e => apercuLocal(e.target, $('#president-media-preview')));
  $('#gallery-form').addEventListener('submit', uploadGallery);
  $('#president-form').addEventListener('submit', savePresident);
  $('#student-edit-form').addEventListener('submit', saveStudent);
  $('#student-dialog-close').addEventListener('click', () => $('#student-dialog').close());
  $('#student-dialog-cancel').addEventListener('click', () => $('#student-dialog').close());
  $('#student-dialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  let lastCreatedCredentials = null;

  function openCreateAdminDialog() {
    const dialog = $('#create-admin-dialog');
    if (!dialog) return;
    const form = $('#create-admin-form');
    if (form) form.reset();
    const errorBox = $('#create-admin-error');
    if (errorBox) {
      errorBox.textContent = '';
      errorBox.hidden = true;
    }
    const successBox = $('#create-admin-success-box');
    if (successBox) successBox.hidden = true;
    if (form) form.hidden = false;

    // Masquer l'option Super Admin si l'utilisateur actuel n'est pas Super Admin
    const roleSelect = $('#new-admin-role');
    const optSuper = roleSelect?.querySelector('option[value="super_admin"]');
    if (optSuper) {
      optSuper.hidden = !state.isSuperAdmin;
      optSuper.disabled = !state.isSuperAdmin;
    }
    if (roleSelect && !state.isSuperAdmin) {
      roleSelect.value = 'admin';
    }

    lastCreatedCredentials = null;
    dialog.scrollTop = 0;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    setTimeout(() => {
      dialog.scrollTop = 0;
      $('#new-admin-first-name')?.focus({ preventScroll: true });
    }, 25);
  }

  function closeCreateAdminDialog() {
    const dialog = $('#create-admin-dialog');
    if (dialog?.open) dialog.close();
  }

  async function createAdminAccount(event) {
    event.preventDefault();
    const role = $('#new-admin-role').value;
    if (role === 'super_admin' && !state.isSuperAdmin) {
      notify('Seul un Super Administrateur peut créer des comptes Super Administrateurs.', 'error');
      return;
    }
    const submitBtn = $('#create-admin-submit-btn');
    const errorBox = $('#create-admin-error');
    if (errorBox) {
      errorBox.textContent = '';
      errorBox.hidden = true;
    }

    const firstName = $('#new-admin-first-name').value.trim();
    const lastName = $('#new-admin-last-name').value.trim();
    const email = $('#new-admin-email').value.trim().toLowerCase();
    const phone = $('#new-admin-phone').value.trim();
    const password = $('#new-admin-password').value;

    if (!firstName || !lastName || !email || !password) {
      if (errorBox) {
        errorBox.textContent = 'Veuillez renseigner tous les champs obligatoires (*).';
        errorBox.hidden = false;
      }
      return;
    }

    if (password.length < 8) {
      if (errorBox) {
        errorBox.textContent = 'Le mot de passe doit comporter au moins 8 caractères.';
        errorBox.hidden = false;
      }
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Création en cours…';

    try {
      const fullName = `${firstName} ${lastName}`.trim();

      // ── Méthode principale : RPC admin_create_user (SECURITY DEFINER) ──
      // Cette fonction crée le compte directement dans auth.users avec
      // email_confirmed_at = now() et insère/met à jour public.profiles.
      // Elle ne nécessite pas de signUp() ni de confirmation d'email.
      const { data: rpcData, error: rpcError } = await state.client.rpc('admin_create_user', {
        p_email:      email,
        p_password:   password,
        p_first_name: firstName,
        p_last_name:  lastName,
        p_phone:      phone || null,
        p_role:       role
      });

      if (rpcError) {
        // Si la RPC n'existe pas encore (42883 = undefined_function), on bascule en fallback
        if (rpcError.code === '42883' || rpcError.message?.includes('Could not find the function')) {
          console.warn('admin_create_user RPC indisponible, bascule sur signUp() :', rpcError.message);
          await createAdminAccountFallback({ firstName, lastName, email, phone, password, role, fullName });
        } else {
          // Traduire les codes d'erreur PostgreSQL courants
          let msg = rpcError.message || 'Impossible de créer le compte.';
          if (rpcError.code === '23505' || msg.includes('existe déjà')) {
            msg = 'Un compte existe déjà avec cette adresse e-mail.';
          } else if (rpcError.code === '42501') {
            msg = msg; // message déjà en français (levé dans la fonction)
          }
          throw new Error(msg);
        }
      } else {
        if (!rpcData) {
          throw new Error('Supabase n’a pas retourné l’identifiant du compte créé.');
        }
        await verifyAdminProfile(rpcData, role);
      }

      // ── Succès via RPC ──
      lastCreatedCredentials = {
        roleLabel: role === 'super_admin' ? 'Super Administrateur 👑' : 'Administrateur',
        fullName,
        email,
        password,
        loginUrl: window.location.href.split('?')[0].split('#')[0]
      };

      $('#created-admin-role').textContent = lastCreatedCredentials.roleLabel;
      $('#created-admin-name').textContent = fullName;
      $('#created-admin-email').textContent = email;
      $('#created-admin-pass').textContent = password;

      const form = $('#create-admin-form');
      if (form) form.hidden = true;
      const successBox = $('#create-admin-success-box');
      if (successBox) successBox.hidden = false;

      notify(`Compte ${role === 'super_admin' ? 'Super Administrateur' : 'Administrateur'} créé avec succès !`);
      $('#student-search').value = '';
      $('#student-role-filter').value = '';
      state.studentPage = 0;
      Promise.allSettled([loadStudents(), loadDashboard(), loadActivity()]).then(results => {
        const failedRefreshes = results.filter(result => result.status === 'rejected');
        if (failedRefreshes.length) {
          console.error('Erreur lors du rafraîchissement après création du compte :', failedRefreshes);
          notify('Le compte est créé, mais certaines données de la page n’ont pas pu être actualisées. Utilisez « Actualiser » pour réessayer.', 'error');
        }
      });

    } catch (err) {
      if (errorBox) {
        const code = err.code ? ` [${err.code}]` : '';
        errorBox.textContent = (err.message || 'Une erreur est survenue lors de la création du compte.') + code;
        errorBox.hidden = false;
      }
      console.error('createAdminAccount error:', err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Créer le compte';
    }
  }

  async function saveAdminProfile(userId, { firstName, lastName, phone, role }) {
    const { data: profile, error } = await state.client.from('profiles')
      .upsert({
        id: userId,
        first_name: firstName,
        prenom: firstName,
        nom: lastName,
        telephone: phone || null,
        role,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select('id,role')
      .single();

    if (error) {
      throw new Error(`Le compte existe dans Supabase Auth, mais son profil administrateur n’a pas pu être enregistré : ${error.message}`);
    }
    if (!profile || profile.role !== role) {
      throw new Error('Le compte existe dans Supabase Auth, mais le rôle administrateur n’a pas été confirmé dans son profil.');
    }
  }

  async function verifyAdminProfile(userId, role) {
    const { data: profile, error } = await state.client.from('profiles')
      .select('id,role')
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error(`Le compte a été créé, mais son profil administrateur n’a pas pu être vérifié : ${error.message}`);
    }
    if (!profile || profile.role !== role) {
      throw new Error('Le compte a été créé, mais le rôle administrateur attendu est absent de son profil.');
    }
  }

  // Fallback : utilisé uniquement si la RPC admin_create_user n'est pas encore disponible
  async function createAdminAccountFallback({ firstName, lastName, email, phone, password, role, fullName }) {
    const config = window.AEDT_CONFIG || {};
    const url = config.SUPABASE_URL;
    const key = config.SUPABASE_ANON_KEY;
    if (!url || !key || !window.supabase) {
      throw new Error('Configuration Supabase indisponible.');
    }

    // Client isolé pour ne pas écraser la session administrateur active
    const tempClient = window.supabase.createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          prenom: firstName,
          nom: lastName,
          full_name: fullName,
          telephone: phone || null,
          role: role
        }
      }
    });

    if (signUpError) {
      const message = signUpError.message || 'Impossible de créer le compte utilisateur.';
      if (/already registered|already exists|user_already_exists/i.test(message)) {
        throw new Error(
          'Cette adresse e-mail est déjà utilisée. Pour donner un rôle administrateur à ce compte, fermez cette fenêtre et utilisez « Modifier » dans sa ligne.'
        );
      }
      throw new Error(message);
    }

    const newUserId = signUpData?.user?.id;
    if (!newUserId) {
      throw new Error('Identifiant utilisateur manquant après la création du compte.');
    }

    if (signUpData.user.identities && signUpData.user.identities.length === 0) {
      throw new Error('Un compte utilisateur existe déjà avec cette adresse e-mail.');
    }

    await saveAdminProfile(newUserId, { firstName, lastName, phone, role });

    // Confirmer l'e-mail pour que le compte soit immédiatement utilisable.
    const { data: confirmed, error: confirmError } = await state.client.rpc(
      'admin_confirm_user_email',
      { p_user_id: newUserId }
    );
    if (confirmError || !confirmed) {
      throw new Error(
        `Le compte et son profil sont créés, mais la confirmation de l’e-mail a échoué : ${confirmError?.message || 'confirmation non retournée'}`
      );
    }
  }


  function copyCreatedAdminCredentials() {
    if (!lastCreatedCredentials) return;
    const text = [
      `AEDT — Accès d'administration`,
      `Rôle : ${lastCreatedCredentials.roleLabel}`,
      `Nom : ${lastCreatedCredentials.fullName}`,
      `Adresse e-mail : ${lastCreatedCredentials.email}`,
      `Mot de passe temporaire : ${lastCreatedCredentials.password}`,
      `Lien de connexion : ${lastCreatedCredentials.loginUrl}`
    ].join('\n');

    const copyBtn = $('#btn-copy-new-admin');
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (copyBtn) {
          const original = copyBtn.textContent;
          copyBtn.textContent = '✓ Identifiants copiés !';
          setTimeout(() => { copyBtn.textContent = original; }, 2500);
        }
      }).catch(() => fallbackCopy(text, copyBtn));
    } else {
      fallbackCopy(text, copyBtn);
    }
  }

  function fallbackCopy(text, btn) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      if (btn) {
        const original = btn.textContent;
        btn.textContent = '✓ Identifiants copiés !';
        setTimeout(() => { btn.textContent = original; }, 2500);
      }
    } catch {
      notify('Veuillez copier manuellement les identifiants affichés.', 'error');
    }
    document.body.removeChild(ta);
  }

  $('#requests-export').addEventListener('click', exportRequests);
  $('#print-overview-report')?.addEventListener('click', () => {
    const overview = $('#view-overview');
    if (overview && overview.hidden) setView('overview');
    window.print();
  });
  $('#theme-toggle-btn')?.addEventListener('click', toggleAdminTheme);
  const preferredTheme = (() => {
    try {
      return window.localStorage.getItem('aedt-admin-theme');
    } catch {
      return null;
    }
  })();
  applyAdminTheme(preferredTheme === 'dark' ? 'dark' : 'light');
  $('#refresh-button').addEventListener('click', loadDashboard);
  $('#activity-refresh').addEventListener('click', loadActivity);
  $('#activity-shortcut').addEventListener('click', () => setView('activity'));
  $('#sidebar-toggle')?.addEventListener('click', toggleSidebar);
  $('#sidebar-close')?.addEventListener('click', closeSidebar);
  $('#sidebar-overlay')?.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeSidebar();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      $('#global-search')?.focus();
    }
  });
    $('#open-profile-dialog')?.addEventListener('click', openProfileDialog);
  $('#admin-profile-dialog-close')?.addEventListener('click', () => $('#admin-profile-dialog').close());
  $('#admin-profile-cancel')?.addEventListener('click', () => $('#admin-profile-dialog').close());
  $('#admin-profile-form')?.addEventListener('submit', saveAdminProfile);
  $('#admin-profile-dialog')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  $('#btn-open-create-admin')?.addEventListener('click', openCreateAdminDialog);
  $('#create-admin-dialog-close')?.addEventListener('click', closeCreateAdminDialog);
  $('#create-admin-dialog-cancel')?.addEventListener('click', closeCreateAdminDialog);
  $('#create-admin-form')?.addEventListener('submit', createAdminAccount);
  $('#btn-copy-new-admin')?.addEventListener('click', copyCreatedAdminCredentials);
  $('#btn-close-created-admin')?.addEventListener('click', closeCreateAdminDialog);
  $('#create-admin-dialog')?.addEventListener('click', event => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  const globalSearchInput = $('#global-search');
  const globalSearchWrap = $('.global-search');
  if (globalSearchInput && globalSearchWrap) {
    globalSearchWrap.addEventListener('click', () => {
      if (document.activeElement !== globalSearchInput) {
        globalSearchWrap.classList.add('is-active');
        globalSearchInput.focus();
      }
    });
    globalSearchInput.addEventListener('blur', () => {
      globalSearchWrap.classList.remove('is-active');
    });
    globalSearchInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        $('#request-search').value = event.currentTarget.value;
        globalSearchInput.blur();
        globalSearchWrap.classList.remove('is-active');
        setView('requests');
      }
    });
  }

  boot();
})();
