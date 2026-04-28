const API_URL = 'https://script.google.com/macros/s/AKfycbxu5ppXyYrwwhRQRwBJg_M3uDS5ZziPiRwapSGoLg1amhLCAmnM2ImUWhoyx-B-vPx63g/exec';

const DEFAULT_SPILLERE = [
  "Adnan Malik", "Ali Malik", "Ali Mirza", "Asam Khokhar",
  "Azeem Ahmad", "Barbar Iqbal", "Faisal Hussain", "Jamil Jiwani",
  "Kasim Hussain", "Khurram Ashraf", "Kim", "M. Irfan Asghar",
  "Malik Shahzad", "Mohamed Garrouj", "Saqqeb",
  "Shahid Mahmoood Hussain", "Suleman Malik"
];

const KAMPE_TEMPLATE = [
  { id: 1, dato: "2026-04-15", modstander: "BFC Lundegården", hjemmeude: "U" },
  { id: 2, dato: "2026-04-22", modstander: "Solrød FC",        hjemmeude: "H" },
  { id: 3, dato: "2026-04-27", modstander: "Taastrup FC",      hjemmeude: "U" },
  { id: 4, dato: "2026-05-06", modstander: "Albertslund IF",   hjemmeude: "H" },
  { id: 5, dato: "2026-05-13", modstander: "Grønne Stjerne",   hjemmeude: "U" },
  { id: 6, dato: "2026-05-20", modstander: "Rebæk IF",         hjemmeude: "H" },
  { id: 7, dato: "2026-05-27", modstander: "Lundtofte Boldklub", hjemmeude: "H" },
  { id: 8, dato: "2026-06-01", modstander: "IF Bytoften",      hjemmeude: "U" },
  { id: 9, dato: "2026-06-10", modstander: "Roskilde Boldklub", hjemmeude: "H" },
];

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
  saveTimer: null,
  darkMode: false,
  boardExpanded: null,
  boardPlayerExpanded: null
};

// ── INIT ─────────────────────────────────────────────────────────

function mergeStateFromApi(raw) {
  const savedKampe = raw.kampe || [];
  state.data.kampe = KAMPE_TEMPLATE.map(template => {
    const saved = savedKampe.find(k => k.id === template.id);
    return saved ? { ...template, ...saved, referat: saved.referat || '' } : {
      ...template, resultat: 'kommende',
      maal_for: 0, maal_imod: 0, spillere: {}, boeder: {}, motm: null, referat: ''
    };
  });
  if (raw.spillere && raw.spillere.length > 0) state.data.spillere = raw.spillere;
  if (raw.boede_takster) state.data.boede_takster = raw.boede_takster;
  state.data.betalte_boeder = raw.betalte_boeder || state.data.betalte_boeder || {};
}

async function init() {
  initDarkMode();
  state.data = {
    kampe: KAMPE_TEMPLATE.map(t => ({ ...t, resultat:'kommende', maal_for:0, maal_imod:0, spillere:{}, boeder:{}, motm:null, referat:'' })),
    spillere: DEFAULT_SPILLERE,
    boede_takster: DEFAULT_TAKSTER,
    betalte_boeder: {}
  };
  try {
    const raw = await apiGet();
    mergeStateFromApi(raw);
  } catch (e) { /* beholder defaults */ }
  loadReferaterFromStorage();
  document.getElementById('loading-screen').classList.add('hidden');
  renderAll();
}

// Nødstop: skjul spinner efter 5 sekunder uanset hvad
setTimeout(() => {
  const ls = document.getElementById('loading-screen');
  if (!ls.classList.contains('hidden')) {
    ls.classList.add('hidden');
    if (!state.data) {
      state.data = {
        kampe: KAMPE_TEMPLATE.map(t => ({ ...t, resultat:'kommende', maal_for:0, maal_imod:0, spillere:{}, boeder:{}, motm:null, referat:'' })),
        spillere: DEFAULT_SPILLERE,
        boede_takster: DEFAULT_TAKSTER,
        betalte_boeder: {}
      };
    }
    loadReferaterFromStorage();
    renderAll();
  }
}, 5000);

// ── API (JSONP — omgår CORS med Google Apps Script) ───────────────

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = '__cb' + Date.now();
    const timer = setTimeout(() => {
      delete window[cb];
      reject(new Error('Timeout'));
    }, 8000);
    window[cb] = (data) => {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
      resolve(data);
    };
    const script = document.createElement('script');
    script.src = url + '&callback=' + cb;
    script.onerror = () => { clearTimeout(timer); delete window[cb]; reject(new Error('JSONP fejl')); };
    document.head.appendChild(script);
  });
}

async function apiGet() {
  try {
    return await jsonp(`${API_URL}?action=getData`);
  } catch (e) {
    showToast('Ingen forbindelse — viser lokale data', 5000);
    return {};
  }
}

async function apiSave() {
  try {
    // Strip referat from kampe — saved in localStorage instead to avoid URL length limits
    const dataToSave = {
      ...state.data,
      kampe: state.data.kampe.map(({ referat, ...k }) => k)
    };
    const url = `${API_URL}?action=saveData&password=${encodeURIComponent(state.adminPassword)}&data=${encodeURIComponent(JSON.stringify(dataToSave))}`;
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
  const btn = document.querySelector('#login-modal .btn-primary');
  btn.textContent = 'Logger ind...';
  btn.disabled = true;
  try {
    const fresh = await apiGet();
    mergeStateFromApi(fresh);
    const result = await jsonp(`${API_URL}?action=saveData&password=${encodeURIComponent(pw)}&data=${encodeURIComponent(JSON.stringify(state.data))}`);
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
  } finally {
    btn.textContent = 'Log ind';
    btn.disabled = false;
  }
}

function updateAdminBtn() {
  const btn = document.getElementById('admin-btn');
  document.getElementById('admin-icon').textContent = state.isAdmin ? '✓' : '🔒';
  document.getElementById('admin-label').textContent = 'Admin';
  btn.classList.toggle('logged-in', state.isAdmin);

  const existing = document.getElementById('admin-banner');
  if (state.isAdmin && !existing) {
    const banner = document.createElement('div');
    banner.id = 'admin-banner';
    banner.className = 'admin-banner';
    banner.textContent = 'ADMIN TILSTAND — ÆNDRINGER GEMMES AUTOMATISK';
    document.getElementById('app').insertBefore(banner, document.getElementById('app').firstChild);
  } else if (!state.isAdmin && existing) {
    existing.remove();
  }
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
  const content = document.getElementById('content');
  content.classList.remove('fade-in');
  void content.offsetWidth;
  content.classList.add('fade-in');
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
  const maal = played.reduce((s, k) => {
    return s + (k.hjemmeude === 'H' ? (k.maal_for || 0) : (k.maal_imod || 0));
  }, 0);
  const kommende = kampe.filter(k => k.resultat === 'kommende').length;

  const formPills = played.slice(-5).map(k => {
    if (k.resultat === 'vandt')    return '<span class="form-pill vandt">V</span>';
    if (k.resultat === 'uafgjort') return '<span class="form-pill uafgjort">U</span>';
    return '<span class="form-pill tabte">T</span>';
  }).join('');

  const formStrip = played.length > 0
    ? `<div class="form-strip"><span class="form-label">FORM</span>${formPills}</div>`
    : '';

  document.getElementById('header-stats').innerHTML = `
    <div class="stat-pill"><div class="stat-pill-val">${played.length}</div><div class="stat-pill-lbl">KAMPE</div></div>
    <div class="stat-pill"><div class="stat-pill-val">${vandt}</div><div class="stat-pill-lbl">SEJRE</div></div>
    <div class="stat-pill"><div class="stat-pill-val">${maal}</div><div class="stat-pill-lbl">MÅL</div></div>
    <div class="stat-pill"><div class="stat-pill-val">${kommende}</div><div class="stat-pill-lbl">KOMMENDE</div></div>
    ${formStrip}
  `;
}

// ── KAMPE VIEW ────────────────────────────────────────────────────

function renderKampe(content) {
  const kampe = state.data.kampe || [];
  let html = '';

  if (state.isAdmin) {
    html += `<button class="btn-primary" style="width:100%;margin-bottom:14px" onclick="addKamp()">+ Tilføj kamp</button>`;
    html += `<button class="btn-ghost" style="width:100%;margin-bottom:8px;border:1px dashed #ddd;border-radius:12px" onclick="tilfoejSpiller()">➕ Tilføj spiller</button>`;
    html += `<button class="btn-ghost" style="width:100%;margin-bottom:14px;border:1px dashed #ddd;border-radius:12px" onclick="adminSpillere()">👥 Rediger spillerliste</button>`;
  }

  // Spiller-chips
  const spillere = state.data.spillere || [];
  if (spillere.length > 0) {
    const chips = spillere.map((navn, i) => {
      const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
      const initials = navn.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      return `<div class="squad-chip" title="${navn}">
        <div class="avatar" style="background:${color};width:28px;height:28px;font-size:10px">${initials}</div>
        <span class="squad-chip-name">${navn.split(' ')[0]}</span>
      </div>`;
    }).join('');
    html += `
      <div class="squad-card">
        <div class="squad-title">HOLDET · ${spillere.length} SPILLERE</div>
        <div class="squad-chips">${chips}</div>
      </div>`;
  }

  const kommende = kampe.filter(k => k.resultat === 'kommende')
    .sort((a, b) => new Date(a.dato) - new Date(b.dato));
  const næsteKampId = kommende.length > 0 ? kommende[0].id : null;
  const spillede = kampe.filter(k => k.resultat !== 'kommende').slice().reverse();

  if (kampe.length === 0) {
    html += `<div style="text-align:center;color:#aaa;padding:40px 0;font-size:14px">Ingen kampe endnu${state.isAdmin ? '<br>Tilføj en kamp ovenfor' : ''}</div>`;
  }

  if (kommende.length > 0) {
    html += `<div class="section-label">KOMMENDE</div>`;
    kommende.forEach(k => { html += kampCard(k, k.id === næsteKampId); });
  }
  if (spillede.length > 0) {
    html += `<div class="section-label">RESULTATER</div>`;
    spillede.forEach(k => { html += kampCard(k, false); });
  }

  content.innerHTML = html;
}

function kampCard(k, isNæste = false) {
  const ishoj = '<span class="ishoj">ISHØJ IF</span>';
  const left  = k.hjemmeude === 'H' ? ishoj : k.modstander;
  const right = k.hjemmeude === 'H' ? k.modstander : ishoj;
  const dato  = k.dato ? new Date(k.dato).toLocaleDateString('da-DK', { weekday:'short', day:'numeric', month:'short' }) : '';

  let rightCol;
  if (k.resultat === 'kommende') {
    const days = daysUntil(k.dato);
    const daysLabel = days === 0 ? 'I dag! 🔥' : days === 1 ? 'I morgen' : `om ${days} dage`;
    rightCol = `
      <div class="result-badge kommende">Kommende</div>
      <div class="countdown-badge${isNæste ? ' næste' : ''}">${daysLabel}</div>`;
  } else {
    rightCol = `
      <div class="result-badge ${k.resultat}">${resultLabel(k.resultat)}</div>
      <div class="kamp-score">${k.maal_for ?? '?'}–${k.maal_imod ?? '?'}</div>`;
  }

  const spillere = state.data.spillere || [];
  const topChips = spillere.flatMap(navn => {
    const s = k.spillere?.[navn]; if (!s) return [];
    const chips = [];
    if (s.maal > 0)    chips.push(`<div class="preview-chip">⚽ <strong>${s.maal}</strong> ${navn.split(' ')[0]}</div>`);
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
    <div class="kamp-card${isNæste ? ' næste-kamp' : ''}" onclick="openKamp(${k.id})">
      <div class="kamp-card-inner">
        <div class="kamp-top">
          <div>
            <div class="kamp-date">${dato} · ${k.hjemmeude === 'H' ? 'Hjemme' : 'Ude'}</div>
            <div class="kamp-title">${left} vs ${right}</div>
          </div>
          <div style="text-align:right">
            ${rightCol}
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

  const isTemplate = KAMPE_TEMPLATE.some(t => t.id === kamp.id);
  const deleteBtn = state.isAdmin && !isTemplate
    ? `<button class="back-btn" style="background:rgba(255,0,0,0.25)" onclick="deleteKamp(${kamp.id})">🗑 Slet</button>`
    : '';
  document.getElementById('detail-title').textContent = `vs ${kamp.modstander}`;
  document.getElementById('detail-meta').innerHTML =
    `${kamp.hjemmeude === 'H' ? 'Hjemme' : 'Ude'} · ${kamp.dato ? new Date(kamp.dato).toLocaleDateString('da-DK',{day:'numeric',month:'long',year:'numeric'}) : ''} ${deleteBtn}`;

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
  if (state.currentSection === 'stats')      renderStats(content);
  else if (state.currentSection === 'bøder') renderKampBøder(content);
  else if (state.currentSection === 'motm')  renderMOTM(content);
  else if (state.currentSection === 'referat') renderReferat(content);
}

function renderStats(content) {
  const kamp = state.data.kampe.find(k => k.id === state.currentKamp);
  if (!kamp) return;
  const spillere = state.data.spillere || [];

  const statDef = [
    { key:'maal',        icon:'⚽', label:'MÅL', color:'#22c55e' },
    { key:'assists',     icon:'🅰️', label:'ASS', color:'#3b82f6' },
    { key:'gule_kort',   icon:'🟨', label:'GUL', color:'#eab308' },
    { key:'rode_kort',   icon:'🟥', label:'RØD', color:'#ef4444' },
    { key:'clean_sheet', icon:'🧤', label:'RED', color:'#a855f7' }
  ];

  const html = spillere.map((navn, i) => {
    const s = kamp.spillere?.[navn] || { maal:0, assists:0, gule_kort:0, rode_kort:0, clean_sheet:0 };
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
  const played = (state.data.kampe || []).filter(k => k.resultat !== 'kommende');
  const aiBtn = `<button class="ai-rapport-btn" onclick="kopierAiRapport()">🤖 Kopiér AI-rapport</button>`;
  const kampe = played;
  const spillere = state.data.spillere || [];
  const stats = {};
  spillere.forEach(n => { stats[n] = { maal:0, assists:0, gule_kort:0, rode_kort:0, clean_sheet:0 }; });

  kampe.forEach(k => spillere.forEach(n => {
    const s = k.spillere?.[n]; if (!s) return;
    stats[n].maal        += s.maal        || 0;
    stats[n].assists     += s.assists     || 0;
    stats[n].gule_kort   += s.gule_kort   || 0;
    stats[n].rode_kort   += s.rode_kort   || 0;
    stats[n].clean_sheet += s.clean_sheet || 0;
  }));

  // Shared helper: match breakdown for a stat key
  const matchBreakdown = (navn, key, color, suffix) => {
    return kampe
      .filter(k => (k.spillere?.[navn]?.[key] || 0) > 0)
      .sort((a, b) => new Date(a.dato) - new Date(b.dato))
      .map(k => {
        const val = k.spillere[navn][key];
        const dato = new Date(k.dato).toLocaleDateString('da-DK', { day:'numeric', month:'short' });
        return `<div class="player-match-row">
          <span class="player-match-opp">vs ${k.modstander}</span>
          <span class="player-match-date">${dato}</span>
          <span class="player-match-val" style="color:${color}">${val}${suffix}</span>
        </div>`;
      }).join('');
  };

  const board = (title, key, suffix, color) => {
    const isExpanded = state.boardExpanded === key;
    const rows = Object.entries(stats).sort((a,b) => b[1][key]-a[1][key]).filter(([,s]) => s[key] > 0);
    const displayRows = isExpanded ? rows : rows.slice(0, 5);
    const hasMore = rows.length > 5;
    return `
      <div class="leaderboard-card">
        <div class="leaderboard-title" onclick="toggleBoard('${key}')">
          ${title}
          ${hasMore ? `<span class="board-toggle">${isExpanded ? '▲ Færre' : `▼ Alle (${rows.length})`}</span>` : ''}
        </div>
        ${displayRows.length === 0
          ? '<div class="leaderboard-empty">Ingen data endnu</div>'
          : displayRows.map(([navn, s], i) => {
              const pe = state.boardPlayerExpanded;
              const isOpen = pe && pe.key === key && pe.navn === navn;
              const breakdown = isOpen ? matchBreakdown(navn, key, color, suffix) : '';
              return `
                <div class="leaderboard-row clickable" onclick="togglePlayerBoard('${key}','${navn}')">
                  <div class="leaderboard-rank">${i+1}.</div>
                  <div class="leaderboard-name">${navn} <span class="expand-arrow">${isOpen ? '▲' : '›'}</span></div>
                  <div class="leaderboard-val" style="background:${color}22;color:${color}">${s[key]}${suffix}</div>
                </div>
                ${isOpen ? `<div class="player-breakdown">${breakdown}</div>` : ''}`;
            }).join('')}
      </div>`;
  };

  // MOTM board
  const motmCounts = {};
  spillere.forEach(n => { motmCounts[n] = 0; });
  kampe.forEach(k => { if (k.motm && motmCounts[k.motm] !== undefined) motmCounts[k.motm]++; });

  const motmRows = Object.entries(motmCounts)
    .sort((a,b) => b[1]-a[1]).filter(([,c]) => c > 0);
  const isMotmExpanded = state.boardExpanded === 'motm';
  const displayMotmRows = isMotmExpanded ? motmRows : motmRows.slice(0, 5);

  const motmBoard = `
    <div class="leaderboard-card">
      <div class="leaderboard-title" onclick="toggleBoard('motm')">
        ⭐ MOTM
        ${motmRows.length > 5 ? `<span class="board-toggle">${isMotmExpanded ? '▲ Færre' : `▼ Alle (${motmRows.length})`}</span>` : ''}
      </div>
      ${displayMotmRows.length === 0
        ? '<div class="leaderboard-empty">Ingen data endnu</div>'
        : displayMotmRows.map(([navn, count], i) => {
            const pe = state.boardPlayerExpanded;
            const isOpen = pe && pe.key === 'motm' && pe.navn === navn;
            const breakdown = isOpen
              ? kampe.filter(k => k.motm === navn)
                  .sort((a,b) => new Date(a.dato) - new Date(b.dato))
                  .map(k => {
                    const dato = new Date(k.dato).toLocaleDateString('da-DK', { day:'numeric', month:'short' });
                    return `<div class="player-match-row">
                      <span class="player-match-opp">vs ${k.modstander}</span>
                      <span class="player-match-date">${dato}</span>
                      <span class="player-match-val" style="color:#eab308">⭐</span>
                    </div>`;
                  }).join('')
              : '';
            return `
              <div class="leaderboard-row clickable" onclick="togglePlayerBoard('motm','${navn}')">
                <div class="leaderboard-rank">${i+1}.</div>
                <div class="leaderboard-name">${navn} <span class="expand-arrow">${isOpen ? '▲' : '›'}</span></div>
                <div class="leaderboard-val" style="background:#eab30822;color:#eab308">${count} gang${count !== 1 ? 'e' : ''}</div>
              </div>
              ${isOpen ? `<div class="player-breakdown">${breakdown}</div>` : ''}`;
          }).join('')}
    </div>`;

  // Aktivitets-streak board
  const streakRows = spillere
    .map(navn => [navn, spillerStreak(navn)])
    .sort((a, b) => b[1] - a[1])
    .filter(([, s]) => s > 0);
  const isStreakExpanded = state.boardExpanded === 'streak';
  const displayStreakRows = isStreakExpanded ? streakRows : streakRows.slice(0, 5);
  const hasMoreStreak = streakRows.length > 5;

  const streakBoard = `
    <div class="leaderboard-card">
      <div class="leaderboard-title" onclick="toggleBoard('streak')">
        🔥 Aktive spillere
        ${hasMoreStreak ? `<span class="board-toggle">${isStreakExpanded ? '▲ Færre' : `▼ Alle (${streakRows.length})`}</span>` : ''}
      </div>
      ${displayStreakRows.length === 0
        ? '<div class="leaderboard-empty">Ingen data endnu</div>'
        : displayStreakRows.map(([navn, streak], i) => `
          <div class="leaderboard-row">
            <div class="leaderboard-rank">${i+1}.</div>
            <div class="leaderboard-name">${navn}</div>
            <div class="leaderboard-val" style="background:#f9731622;color:#f97316">${streak} kamp${streak !== 1 ? 'e' : ''}</div>
          </div>`).join('')}
    </div>`;

  // Full player roster
  const rosterRows = spillere.map((navn, i) => {
    const s = stats[navn];
    const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
    const initials = navn.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    const motmCount = motmCounts[navn] || 0;
    const hasAny = s.maal || s.assists || s.clean_sheet || s.gule_kort || s.rode_kort || motmCount;
    return `
      <div class="roster-row ${hasAny ? '' : 'roster-row-empty'}">
        <div class="avatar" style="background:${color};width:34px;height:34px;font-size:12px;flex-shrink:0">${initials}</div>
        <div class="roster-name">${navn}</div>
        <div class="roster-stats">
          ${s.maal      > 0 ? `<span class="roster-chip" style="color:#22c55e">⚽${s.maal}</span>` : ''}
          ${s.assists   > 0 ? `<span class="roster-chip" style="color:#3b82f6">🅰️${s.assists}</span>` : ''}
          ${s.clean_sheet > 0 ? `<span class="roster-chip" style="color:#a855f7">🧤${s.clean_sheet}</span>` : ''}
          ${s.gule_kort > 0 ? `<span class="roster-chip" style="color:#eab308">🟨${s.gule_kort}</span>` : ''}
          ${s.rode_kort > 0 ? `<span class="roster-chip" style="color:#ef4444">🟥${s.rode_kort}</span>` : ''}
          ${motmCount   > 0 ? `<span class="roster-chip" style="color:#eab308">⭐${motmCount}</span>` : ''}
          ${!hasAny ? '<span style="font-size:11px;color:#ccc">Ingen stats</span>' : ''}
        </div>
      </div>`;
  }).join('');

  const rosterBoard = `
    <div class="leaderboard-card">
      <div class="leaderboard-title">👥 Hele holdet</div>
      ${rosterRows}
    </div>`;

  content.innerHTML =
    aiBtn +
    board('⚽ Topscorere',    'maal',       ' mål', '#22c55e') +
    board('🅰️ Flest assists', 'assists',    ' ass', '#3b82f6') +
    board('🧤 Rent bur',      'clean_sheet',' stk', '#a855f7') +
    board('🟨 Gule kort',     'gule_kort',  ' stk', '#eab308') +
    motmBoard +
    streakBoard +
    rosterBoard;
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

  const betalte = state.data.betalte_boeder || {};
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);
  const betaltTotal = Object.entries(totals).reduce((s, [n, v]) => s + (betalte[n] ? v : 0), 0);
  const udestående = grandTotal - betaltTotal;
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  const taksterHTML = state.isAdmin
    ? `<div class="takster-card">
        <div class="takster-header-row">
          <div class="takster-title">BØDETAKSTER</div>
          <button class="takst-add-btn" onclick="tilfoejTakst()">+ Tilføj</button>
        </div>
        ${Object.entries(takster).map(([type, kr]) => {
          const safe = type.replace(/'/g, "\\'");
          return `<div class="takst-row takst-row-edit">
            <button class="takst-type-name" onclick="omdøbTakst('${safe}')">${type} <span class="takst-edit-icon">✏️</span></button>
            <div class="takst-edit-right">
              <input class="takst-belob-input" type="number" min="0" value="${kr}"
                oninput="setTakstBelob('${safe}',this.value)"> kr.
              <button class="takst-slet-btn" onclick="sletTakst('${safe}')">🗑</button>
            </div>
          </div>`;
        }).join('')}
      </div>`
    : `<div class="takster-card">
        <div class="takster-title">BØDETAKSTER</div>
        ${Object.entries(takster).map(([type, kr]) => `
          <div class="takst-row"><span>${type}</span><span class="takst-amount">${kr} kr.</span></div>
        `).join('')}
      </div>`;

  content.innerHTML = `
    <div class="bøde-hero">
      <div class="bøde-hero-label">SÆSON TOTAL</div>
      <div class="bøde-hero-amount">${grandTotal} kr.</div>
      <div class="bøde-hero-pills">
        <span class="bøde-hero-pill red">Udestående ${udestående} kr.</span>
        <span class="bøde-hero-pill green">Betalt ${betaltTotal} kr.</span>
      </div>
      <div class="bøde-hero-sub">${kampe.length} kampe registreret</div>
    </div>
    ${taksterHTML}
    <div class="section-label">SPILLERE</div>
    ${sorted.map(([navn, total], i) => {
      const erBetalt = !!betalte[navn];
      const safeName = navn.replace(/'/g, "\\'");
      return `
      <div class="bøde-spiller-card ${total === 0 ? 'ingen' : ''} ${erBetalt ? 'betalt' : ''}">
        <div class="bøde-rank">${i+1}.</div>
        <div style="flex:1">
          <div class="bøde-name">${navn}</div>
          <div class="bøde-detail">
            ${total === 0 ? 'Ingen bøder' : erBetalt ? '<span class="betalt-label">Betalt ✓</span>' : 'Skylder'}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="bøde-amount" style="color:${total === 0 ? '#aaa' : erBetalt ? 'var(--green)' : '#ef4444'}">${total} kr.</div>
          ${state.isAdmin && total > 0 ? `<button class="betalt-btn ${erBetalt ? 'active' : ''}" onclick="toggleBetalt('${safeName}')">${erBetalt ? 'Fortryd' : '✓ Betalt'}</button>` : ''}
        </div>
      </div>`;
    }).join('')}`;
}

// ── ADMIN ACTIONS ─────────────────────────────────────────────────

function deleteKamp(id) {
  if (!confirm('Slet denne kamp permanent?')) return;
  state.data.kampe = state.data.kampe.filter(k => k.id !== id);
  scheduleSave();
  closeKamp();
}

function addKamp() {
  if (!confirm('Tilføj en ny kamp til programmet?')) return;
  const id = Date.now();
  state.data.kampe.push({
    id,
    dato: new Date().toISOString().split('T')[0],
    modstander: 'Ny modstander',
    hjemmeude: 'H',
    resultat: 'kommende',
    maal_for: 0, maal_imod: 0,
    spillere: {}, boeder: {}, motm: null, referat: ''
  });
  scheduleSave();
  renderAll();
  openKamp(id);
}

function tilfoejSpiller() {
  const navn = prompt('Navn på ny spiller:');
  if (!navn || !navn.trim()) return;
  const trimmed = navn.trim();
  if (state.data.spillere.includes(trimmed)) {
    showToast('Spilleren findes allerede');
    return;
  }
  state.data.spillere.push(trimmed);
  scheduleSave();
  renderAll();
  showToast(`${trimmed} tilføjet ✓`);
}

function adminSpillere() {
  const navne = prompt('Spillere (kommasepareret):\n\nNuværende: ' + (state.data.spillere || []).join(', '));
  if (navne === null) return;
  if (!confirm('Opdater spillerliste? Dette kan ikke fortrydes.')) return;
  state.data.spillere = navne.split(',').map(n => n.trim()).filter(Boolean);
  scheduleSave();
  renderAll();
}

function tilfoejTakst() {
  const navn = prompt('Navn på ny bødetype:');
  if (!navn || !navn.trim()) return;
  const trimmed = navn.trim();
  if (state.data.boede_takster[trimmed] !== undefined) { showToast('Bødetypen findes allerede'); return; }
  const belob = prompt(`Beløb for "${trimmed}" (kr.):`, '50');
  if (belob === null) return;
  state.data.boede_takster[trimmed] = parseInt(belob) || 0;
  scheduleSave();
  renderContent();
  showToast(`${trimmed} tilføjet ✓`);
}

function omdøbTakst(gammeltNavn) {
  const nytNavn = prompt('Omdøb bødetype:', gammeltNavn);
  if (!nytNavn || !nytNavn.trim() || nytNavn.trim() === gammeltNavn) return;
  const trimmed = nytNavn.trim();
  if (state.data.boede_takster[trimmed] !== undefined) { showToast('Bødetypen findes allerede'); return; }
  const kr = state.data.boede_takster[gammeltNavn];
  delete state.data.boede_takster[gammeltNavn];
  state.data.boede_takster[trimmed] = kr;
  state.data.kampe.forEach(k => {
    if (!k.boeder) return;
    Object.keys(k.boeder).forEach(spiller => {
      k.boeder[spiller] = k.boeder[spiller].map(b => b === gammeltNavn ? trimmed : b);
    });
  });
  scheduleSave();
  renderContent();
}

function setTakstBelob(type, val) {
  state.data.boede_takster[type] = parseInt(val) || 0;
  scheduleSave();
}

function sletTakst(type) {
  if (!confirm(`Slet bødetype "${type}"?\nEksisterende bøder af denne type fjernes også.`)) return;
  delete state.data.boede_takster[type];
  state.data.kampe.forEach(k => {
    if (!k.boeder) return;
    Object.keys(k.boeder).forEach(spiller => {
      k.boeder[spiller] = k.boeder[spiller].filter(b => b !== type);
    });
  });
  scheduleSave();
  renderContent();
  showToast(`${type} slettet`);
}

function toggleBetalt(navn) {
  if (!state.data.betalte_boeder) state.data.betalte_boeder = {};
  state.data.betalte_boeder[navn] = !state.data.betalte_boeder[navn];
  scheduleSave();
  renderContent();
}

// ── REFERAT ───────────────────────────────────────────────────────

function renderReferat(content) {
  const kamp = state.data.kampe.find(k => k.id === state.currentKamp);
  if (!kamp) return;

  if (state.isAdmin) {
    content.innerHTML = `
      <div class="referat-hint">Skriv trænernes referat efter kampen. Gemmes automatisk.</div>
      <textarea class="referat-textarea" placeholder="Kampens forløb, taktiske observationer, hvad gik godt/skidt..."
        oninput="setReferat(this.value)">${kamp.referat || ''}</textarea>`;
  } else {
    content.innerHTML = kamp.referat
      ? `<div class="referat-text">${kamp.referat.replace(/\n/g, '<br>')}</div>`
      : `<div class="referat-empty">Intet referat endnu</div>`;
  }
}

function setReferat(val) {
  const kamp = state.data.kampe.find(k => k.id === state.currentKamp);
  if (!kamp) return;
  kamp.referat = val;
  localStorage.setItem(`referat_${kamp.id}`, val);
}

function loadReferaterFromStorage() {
  (state.data.kampe || []).forEach(k => {
    const saved = localStorage.getItem(`referat_${k.id}`);
    if (saved !== null) k.referat = saved;
  });
}

// ── AI-RAPPORT ────────────────────────────────────────────────────

function kopierAiRapport() {
  const kampe = (state.data.kampe || []).filter(k => k.resultat !== 'kommende');
  const spillere = state.data.spillere || [];
  const stats = {};
  spillere.forEach(n => { stats[n] = { maal:0, assists:0, clean_sheet:0, motm:0 }; });
  kampe.forEach(k => {
    spillere.forEach(n => {
      const s = k.spillere?.[n]; if (!s) return;
      stats[n].maal        += s.maal        || 0;
      stats[n].assists     += s.assists     || 0;
      stats[n].clean_sheet += s.clean_sheet || 0;
    });
    if (k.motm && stats[k.motm]) stats[k.motm].motm++;
  });

  const topScorer = Object.entries(stats).sort((a,b) => b[1].maal - a[1].maal)[0];
  const topAssist = Object.entries(stats).sort((a,b) => b[1].assists - a[1].assists)[0];
  const topMotm   = Object.entries(stats).sort((a,b) => b[1].motm - a[1].motm)[0];

  const sejre = kampe.filter(k => k.resultat === 'vandt').length;
  const uafgjort = kampe.filter(k => k.resultat === 'uafgjort').length;
  const tabte = kampe.filter(k => k.resultat === 'tabte').length;
  const maalFor = kampe.reduce((s, k) => s + (k.hjemmeude === 'H' ? (k.maal_for||0) : (k.maal_imod||0)), 0);
  const maalImod = kampe.reduce((s, k) => s + (k.hjemmeude === 'H' ? (k.maal_imod||0) : (k.maal_for||0)), 0);

  const resultaterLines = kampe.map((k, i) => {
    const dato = new Date(k.dato).toLocaleDateString('da-DK', { day:'numeric', month:'short' });
    const hjUde = k.hjemmeude === 'H' ? 'H' : 'U';
    const score = k.hjemmeude === 'H' ? `${k.maal_for}-${k.maal_imod}` : `${k.maal_imod}-${k.maal_for}`;
    return `${i+1}. ${dato} vs ${k.modstander} [${hjUde}] — ${score} (${k.resultat.charAt(0).toUpperCase() + k.resultat.slice(1)})`;
  }).join('\n');

  const referaterLines = kampe.map((k, i) => {
    const dato = new Date(k.dato).toLocaleDateString('da-DK', { day:'numeric', month:'short' });
    return `Kamp ${i+1} — ${k.modstander} (${dato}):\n${k.referat || '(Intet referat)'}`;
  }).join('\n\n');

  const tekst = `ISHØJ IF M+40 · Forår 2026 — Sæsonrapport
${'='.repeat(50)}

RESULTATER (${kampe.length} kampe):
${resultaterLines}

Form: ${sejre}V ${uafgjort}U ${tabte}T | Mål: ${maalFor}-${maalImod}

SÆSONSTATISTIK:
- Topscorer: ${topScorer?.[0] || '—'} (${topScorer?.[1].maal || 0} mål)
- Flest assists: ${topAssist?.[0] || '—'} (${topAssist?.[1].assists || 0} ass)
- Flest MOTM: ${topMotm?.[1].motm > 0 ? topMotm[0] : '—'} (${topMotm?.[1].motm || 0} gange)

REFERATER FRA TRÆNER:
${referaterLines || '(Ingen referater skrevet endnu)'}

${'='.repeat(50)}
SPØRGSMÅL TIL AI:
1. Hvad er holdets styrker og svagheder baseret på disse referater og statistikker?
2. Hvad bør fokuseres på i træning inden næste kamp?
3. Er der mønstre i kampene (fx bedre hjemme vs ude, eller i 1. halvleg vs 2. halvleg)?`;

  navigator.clipboard.writeText(tekst)
    .then(() => showToast('AI-rapport kopieret til clipboard ✓', 3000))
    .catch(() => showToast('Kopiering fejlede — prøv igen'));
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
  if (!kamp.spillere[navn]) kamp.spillere[navn] = { maal:0, assists:0, gule_kort:0, rode_kort:0, clean_sheet:0 };
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

// ── HELPERS ───────────────────────────────────────────────────────

function daysUntil(dato) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dato + 'T00:00:00'); d.setHours(0,0,0,0);
  return Math.round((d - today) / 86400000);
}

function spillerStreak(navn) {
  const kampe = (state.data.kampe || [])
    .filter(k => k.resultat !== 'kommende')
    .sort((a, b) => new Date(b.dato) - new Date(a.dato));
  let streak = 0;
  for (const k of kampe) {
    const s = k.spillere?.[navn];
    if (s && Object.values(s).some(v => v > 0)) streak++;
    else break;
  }
  return streak;
}

function toggleBoard(key) {
  state.boardExpanded = state.boardExpanded === key ? null : key;
  renderContent();
}

function togglePlayerBoard(key, navn) {
  const pe = state.boardPlayerExpanded;
  state.boardPlayerExpanded = (pe && pe.key === key && pe.navn === navn) ? null : { key, navn };
  renderContent();
}

// ── DARK MODE ─────────────────────────────────────────────────────

function initDarkMode() {
  if (localStorage.getItem('darkMode') === '1') {
    document.body.classList.add('dark');
    state.darkMode = true;
    document.getElementById('dark-mode-btn').textContent = '☀️';
  }
}

function toggleDarkMode() {
  state.darkMode = !state.darkMode;
  document.body.classList.toggle('dark', state.darkMode);
  localStorage.setItem('darkMode', state.darkMode ? '1' : '0');
  document.getElementById('dark-mode-btn').textContent = state.darkMode ? '☀️' : '🌙';
}

// ── PULL TO REFRESH ───────────────────────────────────────────────

let _ptStartY = 0;
let _ptActive = false;

document.addEventListener('touchstart', e => {
  _ptStartY = e.touches[0].clientY;
  _ptActive = false;
}, { passive: true });

document.addEventListener('touchmove', e => {
  const delta = e.touches[0].clientY - _ptStartY;
  if (delta > 60 && window.scrollY === 0 && !_ptActive) {
    _ptActive = true;
    document.getElementById('pull-indicator').classList.remove('hidden');
  }
}, { passive: true });

document.addEventListener('touchend', async () => {
  if (!_ptActive) return;
  _ptActive = false;
  document.getElementById('pull-indicator').classList.add('hidden');
  showToast('Opdaterer...', 2000);
  const raw = await apiGet();
  mergeStateFromApi(raw);
  renderAll();
  showToast('Opdateret ✓');
});

// ── TOAST & EVENTS ────────────────────────────────────────────────

function showToast(msg, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), duration);
}

document.getElementById('login-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

init();
