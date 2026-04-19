const API_URL = 'https://script.google.com/macros/s/AKfycbxu5ppXyYrwwhRQRwBJg_M3uDS5ZziPiRwapSGoLg1amhLCAmnM2ImUWhoyx-B-vPx63g/exec';

const DEFAULT_TAKSTER = {
  'For sent': 20,
  'Gult kort': 50,
  'Rødt kort': 100,
  'Afbud dagen før': 30,
  'Udvist': 75,
  'Mangler udstyr': 10
};

const AVATAR_COLORS = ['#b81c1c','#3b82f6','#22c55e','#a855f7','#f97316','#eab308','#06b6d4','#ec4899'];

let state = {
  data: null,
  adminPassword: null,
  isAdmin: false,
  currentView: 'kampe',
  currentKamp: null,
  currentSection: 'stats',
  saveTimer: null
};

// ── INIT ─────────────────────────────────────────────────────────

async function init() {
  const raw = await apiGet();
  if (!raw.kampe) {
    state.data = { kampe: [], spillere: [], boede_takster: DEFAULT_TAKSTER };
  } else {
    state.data = raw;
    if (!state.data.boede_takster) state.data.boede_takster = DEFAULT_TAKSTER;
  }
  document.getElementById('loading-screen').classList.add('hidden');
  renderAll();
}

// ── API (JSONP — omgår CORS med Google Apps Script) ───────────────

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = '__cb' + Date.now();
    window[cb] = (data) => {
      delete window[cb];
      script.remove();
      resolve(data);
    };
    const script = document.createElement('script');
    script.src = url + '&callback=' + cb;
    script.onerror = () => { delete window[cb]; reject(new Error('JSONP fejl')); };
    document.head.appendChild(script);
  });
}

async function apiGet() {
  try {
    return await jsonp(`${API_URL}?action=getData`);
  } catch (e) {
    return {};
  }
}

async function apiSave() {
  try {
    const url = `${API_URL}?action=saveData&password=${encodeURIComponent(state.adminPassword)}&data=${encodeURIComponent(JSON.stringify(state.data))}`;
    return await jsonp(url);
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    const result = await apiSave();
    if (result.success) {
      showToast('Gemt ✓');
    } else {
      showToast('Fejl ved gemning');
    }
  }, 1200);
}

// ── AUTH ──────────────────────────────────────────────────────────

function toggleAdmin() {
  if (state.isAdmin) {
    state.isAdmin = false;
    state.adminPassword = null;
    updateAdminBtn();
    renderAll();
    showToast('Logget ud');
  } else {
    document.getElementById('login-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('login-input').focus(), 100);
  }
}

function closeLogin() {
  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('login-input').value = '';
  document.getElementById('login-error').classList.add('hidden');
}

async function doLogin() {
  const pw = document.getElementById('login-input').value.trim();
  if (!pw) return;
  const url = `${API_URL}?action=saveData&password=${encodeURIComponent(pw)}&data=${encodeURIComponent(JSON.stringify(state.data))}`;
  try {
    const result = await jsonp(url);
    if (result.success) {
      state.isAdmin = true;
      state.adminPassword = pw;
      closeLogin();
      updateAdminBtn();
      renderAll();
      showToast('Logget ind som admin ✓');
    } else {
      document.getElementById('login-error').classList.remove('hidden');
    }
  } catch (e) {
    document.getElementById('login-error').classList.remove('hidden');
  }
}

function updateAdminBtn() {
  const btn = document.getElementById('admin-btn');
  document.getElementById('admin-icon').textContent = state.isAdmin ? '✓' : '🔒';
  document.getElementById('admin-label').textContent = 'Admin';
  btn.classList.toggle('logged-in', state.isAdmin);
}

// ── NAVIGATION ────────────────────────────────────────────────────

function setView(view) {
  state.currentView = view;
  document.querySelectorAll('#main-nav .nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
  renderContent();
}

function setSection(section) {
  state.currentSection = section;
  document.querySelectorAll('#detail-nav .nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.section === section);
  });
  renderKampDetail();
}

function openKamp(id) {
  state.currentKamp = id;
  state.currentSection = 'stats';
  document.getElementById('main-header').classList.add('hidden');
  document.getElementById('detail-header').classList.remove('hidden');
  document.getElementById('main-nav').classList.add('hidden');
  document.getElementById('detail-nav').classList.remove('hidden');
  renderDetailHeader();
  renderKampDetail();
}

function closeKamp() {
  state.currentKamp = null;
  document.getElementById('main-header').classList.remove('hidden');
  document.getElementById('detail-header').classList.add('hidden');
  document.getElementById('main-nav').classList.remove('hidden');
  document.getElementById('detail-nav').classList.add('hidden');
  renderAll();
}

// ── RENDER ────────────────────────────────────────────────────────

function renderAll() {
  renderHeaderStats();
  renderContent();
}

function renderContent() {
  if (state.currentKamp !== null) { renderKampDetail(); return; }
  const content = document.getElementById('content');
  if (state.currentView === 'kampe') renderKampe(content);
  else if (state.currentView === 'sæson') renderSæson(content);
  else if (state.currentView === 'bøder') renderBøder(content);
}

function renderHeaderStats() {
  const kampe = state.data.kampe || [];
  const played = kampe.filter(k => k.resultat !== 'kommende');
  const vandt = played.filter(k => k.resultat === 'vandt').length;
  const maal = played.reduce((s, k) => s + (k.maal_for || 0), 0);
  const kommende = kampe.filter(k => k.resultat === 'kommende').length;
  document.getElementById('header-stats').innerHTML = `
    <div class="stat-pill"><div class="stat-pill-val">${played.length}</div><div class="stat-pill-lbl">KAMPE</div></div>
    <div class="stat-pill"><div class="stat-pill-val">${vandt}</div><div class="stat-pill-lbl">SEJRE</div></div>
    <div class="stat-pill"><div class="stat-pill-val">${maal}</div><div class="stat-pill-lbl">MÅL</div></div>
    <div class="stat-pill"><div class="stat-pill-val">${kommende}</div><div class="stat-pill-lbl">KOMMENDE</div></div>
  `;
}

// ── KAMPE VIEW ────────────────────────────────────────────────────

function renderKampe(content) {
  const kampe = state.data.kampe || [];
  let html = '';

  if (state.isAdmin) {
    html += `<button class="btn-primary" style="width:100%;margin-bottom:14px" onclick="addKamp()">+ Tilføj kamp</button>`;
    html += `<button class="btn-ghost" style="width:100%;margin-bottom:14px;border:1px dashed #ddd;border-radius:12px" onclick="adminSpillere()">👥 Administrer spillere</button>`;
  }

  const kommende = kampe.filter(k => k.resultat === 'kommende');
  const spillede = kampe.filter(k => k.resultat !== 'kommende').slice().reverse();

  if (kampe.length === 0) {
    html += `<div style="text-align:center;color:#aaa;padding:40px 0;font-size:14px">Ingen kampe endnu${state.isAdmin ? '<br>Tilføj en kamp ovenfor' : ''}</div>`;
  }

  if (kommende.length > 0) {
    html += `<div class="section-label">KOMMENDE</div>`;
    kommende.forEach(k => { html += kampCard(k); });
  }
  if (spillede.length > 0) {
    html += `<div class="section-label">RESULTATER</div>`;
    spillede.forEach(k => { html += kampCard(k); });
  }

  content.innerHTML = html;
}

function kampCard(k) {
  const ishoj = '<span class="ishoj">ISHØJ IF</span>';
  const left  = k.hjemmeude === 'H' ? ishoj : k.modstander;
  const right = k.hjemmeude === 'H' ? k.modstander : ishoj;
  const score = k.resultat !== 'kommende' ? `<div class="kamp-score">${k.maal_for ?? '?'}–${k.maal_imod ?? '?'}</div>` : '';
  const dato  = k.dato ? new Date(k.dato).toLocaleDateString('da-DK', { weekday:'short', day:'numeric', month:'short' }) : '';

  const spillere = state.data.spillere || [];
  const topChips = spillere.flatMap(navn => {
    const s = k.spillere?.[navn]; if (!s) return [];
    const chips = [];
    if (s.maal > 0) chips.push(`<div class="preview-chip">⚽ <strong>${s.maal}</strong> ${navn.split(' ')[0]}</div>`);
    if (s.assists > 0) chips.push(`<div class="preview-chip">🅰️ <strong>${s.assists}</strong> ${navn.split(' ')[0]}</div>`);
    return chips;
  }).slice(0, 4).join('');

  const totalBøder = Object.values(k.boeder || {}).reduce((s, arr) => {
    return s + arr.reduce((a, b) => a + (state.data.boede_takster[b] || 0), 0);
  }, 0);

  const footer = (k.motm || totalBøder > 0) ? `
    <div class="kamp-footer">
      ${k.motm ? `<div class="kamp-motm">⭐ MOTM: ${k.motm}</div>` : ''}
      ${totalBøder > 0 ? `<div class="kamp-bøde">💰 ${totalBøder} kr.</div>` : ''}
    </div>` : '';

  return `
    <div class="kamp-card" onclick="openKamp(${k.id})">
      <div class="kamp-card-inner">
        <div class="kamp-top">
          <div>
            <div class="kamp-date">${dato} · ${k.hjemmeude === 'H' ? 'Hjemme' : 'Ude'}</div>
            <div class="kamp-title">${left} vs ${right}</div>
          </div>
          <div style="text-align:right">
            <div class="result-badge ${k.resultat}">${resultLabel(k.resultat)}</div>
            ${score}
          </div>
        </div>
        ${topChips ? `<div class="kamp-preview">${topChips}</div>` : ''}
        ${footer}
      </div>
    </div>`;
}

function resultLabel(r) {
  return { vandt:'Vandt', uafgjort:'Uafgjort', tabte:'Tabte', kommende:'Kommende' }[r] || r;
}

// ── KAMP DETAIL ───────────────────────────────────────────────────

function renderDetailHeader() {
  const kamp = state.data.kampe.find(k => k.id === state.currentKamp);
  if (!kamp) return;

  document.getElementById('detail-title').textContent = `vs ${kamp.modstander}`;
  document.getElementById('detail-meta').textContent =
    `${kamp.hjemmeude === 'H' ? 'Hjemme' : 'Ude'} · ${kamp.dato ? new Date(kamp.dato).toLocaleDateString('da-DK',{day:'numeric',month:'long',year:'numeric'}) : ''}`;

  document.getElementById('result-row').innerHTML = ['vandt','uafgjort','tabte','kommende'].map(r => `
    <button class="result-btn ${r} ${kamp.resultat === r ? 'active' : ''}"
      onclick="${state.isAdmin ? `setResultat('${r}')` : ''}">${resultLabel(r)}</button>
  `).join('');

  if (kamp.resultat !== 'kommende') {
    document.getElementById('score-row').classList.remove('hidden');
    document.getElementById('score-row').innerHTML = `
      <span class="score-label">Score:</span>
      <input class="score-input" type="number" min="0" value="${kamp.maal_for ?? 0}"
        ${state.isAdmin ? `oninput="setScore('for',this.value)"` : 'readonly'}>
      <span class="score-sep">–</span>
      <input class="score-input" type="number" min="0" value="${kamp.maal_imod ?? 0}"
        ${state.isAdmin ? `oninput="setScore('imod',this.value)"` : 'readonly'}>
    `;
  } else {
    document.getElementById('score-row').classList.add('hidden');
  }
}

function renderKampDetail() {
  const content = document.getElementById('content');
  if (state.currentSection === 'stats') renderStats(content);
  else if (state.currentSection === 'bøder') renderKampBøder(content);
  else if (state.currentSection === 'motm') renderMOTM(content);
}

function renderStats(content) {
  const kamp = state.data.kampe.find(k => k.id === state.currentKamp);
  if (!kamp) return;
  const spillere = state.data.spillere || [];

  const statDef = [
    { key:'maal',      icon:'⚽', label:'MÅL', color:'#22c55e' },
    { key:'assists',   icon:'🅰️', label:'ASS', color:'#3b82f6' },
    { key:'gule_kort', icon:'🟨', label:'GUL', color:'#eab308' },
    { key:'rode_kort', icon:'🟥', label:'RØD', color:'#ef4444' },
    { key:'saves',     icon:'🧤', label:'RED', color:'#a855f7' }
  ];

  const html = spillere.map((navn, i) => {
    const s = kamp.spillere?.[navn] || { maal:0, assists:0, gule_kort:0, rode_kort:0, saves:0 };
    const hasStats = Object.values(s).some(v => v > 0);
    const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
    const initials = navn.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

    const cells = statDef.map(st => `
      <div class="stat-cell">
        <div class="stat-icon">${st.icon}</div>
        <div class="stat-value" style="color:${(s[st.key]||0)>0 ? st.color : '#ddd'}">${s[st.key]||0}</div>
        <div class="stat-sublabel">${st.label}</div>
        ${state.isAdmin ? `<div class="stat-btns">
          <button class="stat-btn stat-btn-minus" onclick="changeStat('${navn}','${st.key}',-1)">−</button>
          <button class="stat-btn stat-btn-plus" style="background:${st.color}" onclick="changeStat('${navn}','${st.key}',1)">+</button>
        </div>` : ''}
      </div>`).join('');

    return `
      <div class="spiller-card ${hasStats ? 'has-stats' : ''}">
        <div class="spiller-header">
          <div class="avatar" style="background:${color};width:40px;height:40px;font-size:14px">${initials}</div>
          <div><div class="spiller-name">${navn}</div></div>
        </div>
        <div class="stats-section">
          <div class="stats-grid stats-grid-5">${cells}</div>
        </div>
      </div>`;
  }).join('');

  content.innerHTML = html || `<div style="text-align:center;color:#aaa;padding:40px;font-size:14px">Ingen spillere tilføjet</div>`;
}

function renderKampBøder(content) {
  const kamp = state.data.kampe.find(k => k.id === state.currentKamp);
  if (!kamp) return;
  const takster = state.data.boede_takster || DEFAULT_TAKSTER;
  const spillere = state.data.spillere || [];

  let html = `
    <div class="takster-card">
      <div class="takster-title">BØDETAKSTER</div>
      ${Object.entries(takster).map(([type, kr]) => `
        <div class="takst-row"><span>${type}</span><span class="takst-amount">${kr} kr.</span></div>
      `).join('')}
    </div>
    <div class="section-label">SPILLERE</div>`;

  spillere.forEach((navn, i) => {
    const boeder = kamp.boeder?.[navn] || [];
    const total = boeder.reduce((s, b) => s + (takster[b] || 0), 0);
    const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
    const initials = navn.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

    const body = state.isAdmin
      ? Object.keys(takster).map(type => {
          const count = boeder.filter(b => b === type).length;
          return `<div class="takst-row" style="align-items:center">
            <span style="font-size:13px">${type}</span>
            <div style="display:flex;align-items:center;gap:8px">
              <button class="stat-btn stat-btn-minus" onclick="changeBøde('${navn}','${type}',-1)">−</button>
              <strong style="min-width:20px;text-align:center">${count}</strong>
              <button class="stat-btn stat-btn-plus" style="background:var(--red);color:#fff" onclick="changeBøde('${navn}','${type}',1)">+</button>
            </div>
          </div>`;
        }).join('')
      : boeder.length === 0
        ? '<div class="leaderboard-empty">Ingen bøder</div>'
        : boeder.map(b => `<div class="takst-row"><span>${b}</span><span class="takst-amount">${takster[b]||0} kr.</span></div>`).join('');

    html += `
      <div class="spiller-card">
        <div class="spiller-header">
          <div class="avatar" style="background:${color};width:40px;height:40px;font-size:14px">${initials}</div>
          <div>
            <div class="spiller-name">${navn}</div>
            ${total > 0 ? `<div class="spiller-rolle">${total} kr.</div>` : ''}
          </div>
          ${total > 0 ? `<div class="spiller-bøde-badge">💰 ${total} kr.</div>` : ''}
        </div>
        ${state.isAdmin || boeder.length > 0 ? `<div class="stats-section">${body}</div>` : ''}
      </div>`;
  });

  content.innerHTML = html;
}

function renderMOTM(content) {
  const kamp = state.data.kampe.find(k => k.id === state.currentKamp);
  if (!kamp) return;
  const spillere = state.data.spillere || [];

  const html = `
    <div class="motm-intro">Vælg kampens spiller</div>
    ${spillere.map((navn, i) => {
      const isSelected = kamp.motm === navn;
      const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
      const initials = navn.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      return `
        <div class="motm-card ${isSelected ? 'selected' : ''}" onclick="${state.isAdmin ? `setMOTM('${navn}')` : ''}">
          <div class="avatar" style="background:${color};width:40px;height:40px;font-size:14px">${initials}</div>
          <div style="font-weight:700;font-size:14px">${navn}</div>
          ${isSelected ? '<div class="motm-star">⭐</div>' : '<div class="motm-arrow">›</div>'}
        </div>`;
    }).join('')}`;

  content.innerHTML = html;
}

// ── SÆSON VIEW ────────────────────────────────────────────────────

function renderSæson(content) {
  const kampe = (state.data.kampe || []).filter(k => k.resultat !== 'kommende');
  const spillere = state.data.spillere || [];
  const stats = {};
  spillere.forEach(n => { stats[n] = { maal:0, assists:0, gule_kort:0, rode_kort:0, saves:0 }; });

  kampe.forEach(k => spillere.forEach(n => {
    const s = k.spillere?.[n]; if (!s) return;
    stats[n].maal      += s.maal      || 0;
    stats[n].assists   += s.assists   || 0;
    stats[n].gule_kort += s.gule_kort || 0;
    stats[n].rode_kort += s.rode_kort || 0;
    stats[n].saves     += s.saves     || 0;
  }));

  const board = (title, key, suffix, color) => {
    const rows = Object.entries(stats).sort((a,b) => b[1][key]-a[1][key]).filter(([,s]) => s[key] > 0).slice(0,5);
    return `
      <div class="leaderboard-card">
        <div class="leaderboard-title">${title}</div>
        ${rows.length === 0
          ? '<div class="leaderboard-empty">Ingen data endnu</div>'
          : rows.map(([navn, s], i) => `
            <div class="leaderboard-row">
              <div class="leaderboard-rank">${i+1}.</div>
              <div class="leaderboard-name">${navn}</div>
              <div class="leaderboard-val" style="background:${color}22;color:${color}">${s[key]}${suffix}</div>
            </div>`).join('')}
      </div>`;
  };

  content.innerHTML =
    board('⚽ Topscorere',     'maal',      ' mål', '#22c55e') +
    board('🅰️ Flest assists',  'assists',   ' ass', '#3b82f6') +
    board('🧤 Flest redninger','saves',     ' red', '#a855f7') +
    board('🟨 Gule kort',      'gule_kort', ' stk', '#eab308');
}

// ── BØDER VIEW ────────────────────────────────────────────────────

function renderBøder(content) {
  const kampe = (state.data.kampe || []).filter(k => k.resultat !== 'kommende');
  const spillere = state.data.spillere || [];
  const takster = state.data.boede_takster || DEFAULT_TAKSTER;
  const totals = {};
  spillere.forEach(n => { totals[n] = 0; });
  kampe.forEach(k => spillere.forEach(n => {
    (k.boeder?.[n] || []).forEach(b => { totals[n] += takster[b] || 0; });
  }));

  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  content.innerHTML = `
    <div class="bøde-hero">
      <div class="bøde-hero-label">SÆSON TOTAL</div>
      <div class="bøde-hero-amount">${grandTotal} kr.</div>
      <div class="bøde-hero-sub">${kampe.length} kampe registreret</div>
    </div>
    <div class="takster-card">
      <div class="takster-title">BØDETAKSTER</div>
      ${Object.entries(takster).map(([type, kr]) => `
        <div class="takst-row"><span>${type}</span><span class="takst-amount">${kr} kr.</span></div>
      `).join('')}
    </div>
    <div class="section-label">SPILLERE</div>
    ${sorted.map(([navn, total], i) => `
      <div class="bøde-spiller-card ${total === 0 ? 'ingen' : ''}">
        <div class="bøde-rank">${i+1}.</div>
        <div>
          <div class="bøde-name">${navn}</div>
          <div class="bøde-detail">${total === 0 ? 'Ingen bøder' : 'Skylder'}</div>
        </div>
        <div class="bøde-amount" style="color:${total > 0 ? '#ef4444' : '#aaa'}">${total} kr.</div>
      </div>`).join('')}`;
}

// ── ADMIN ACTIONS ─────────────────────────────────────────────────

function addKamp() {
  const id = Date.now();
  state.data.kampe.push({
    id,
    dato: new Date().toISOString().split('T')[0],
    modstander: 'Ny modstander',
    hjemmeude: 'H',
    resultat: 'kommende',
    maal_for: 0,
    maal_imod: 0,
    spillere: {},
    boeder: {},
    motm: null
  });
  scheduleSave();
  renderAll();
  openKamp(id);
}

function adminSpillere() {
  const navne = prompt('Spillere (kommasepareret):\n\nNuværende: ' + (state.data.spillere || []).join(', '));
  if (navne === null) return;
  state.data.spillere = navne.split(',').map(n => n.trim()).filter(Boolean);
  scheduleSave();
  renderAll();
}

function setResultat(r) {
  const kamp = state.data.kampe.find(k => k.id === state.currentKamp);
  if (!kamp) return;
  kamp.resultat = r;
  scheduleSave();
  renderDetailHeader();
  renderHeaderStats();
}

function setScore(type, val) {
  const kamp = state.data.kampe.find(k => k.id === state.currentKamp);
  if (!kamp) return;
  kamp[type === 'for' ? 'maal_for' : 'maal_imod'] = parseInt(val) || 0;
  scheduleSave();
  renderHeaderStats();
}

function changeStat(navn, key, delta) {
  const kamp = state.data.kampe.find(k => k.id === state.currentKamp);
  if (!kamp) return;
  if (!kamp.spillere[navn]) kamp.spillere[navn] = { maal:0, assists:0, gule_kort:0, rode_kort:0, saves:0 };
  kamp.spillere[navn][key] = Math.max(0, (kamp.spillere[navn][key] || 0) + delta);
  scheduleSave();
  renderStats(document.getElementById('content'));
  renderHeaderStats();
}

function changeBøde(navn, type, delta) {
  const kamp = state.data.kampe.find(k => k.id === state.currentKamp);
  if (!kamp) return;
  if (!kamp.boeder[navn]) kamp.boeder[navn] = [];
  if (delta > 0) {
    kamp.boeder[navn].push(type);
  } else {
    const idx = kamp.boeder[navn].lastIndexOf(type);
    if (idx !== -1) kamp.boeder[navn].splice(idx, 1);
  }
  scheduleSave();
  renderKampBøder(document.getElementById('content'));
}

function setMOTM(navn) {
  const kamp = state.data.kampe.find(k => k.id === state.currentKamp);
  if (!kamp) return;
  kamp.motm = kamp.motm === navn ? null : navn;
  scheduleSave();
  renderMOTM(document.getElementById('content'));
}

// ── TOAST & EVENTS ────────────────────────────────────────────────

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

document.getElementById('login-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

init();
