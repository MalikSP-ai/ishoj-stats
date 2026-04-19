// ════════════════════════════════════════════════════════════════
//  ISHØJ IF — Holdstatistik
//  Frontend JavaScript
// ════════════════════════════════════════════════════════════════

// ── KONFIGURATION ──────────────────────────────────────────────
// VIGTIGT: Indsæt din Google Apps Script URL her efter deployment
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbycgZXxcySiqXgLluesrlJwRsCiRjfJrz5lyq5NS2kuyXt2P9UkZ1Bn7HWziY07T5dH5A/exec";

const BØDE_CONFIG = {
  gult_kort:    { label: "Gult Kort",         icon: "🟨", beløb: 50  },
  rødt_kort:    { label: "Rødt Kort",          icon: "🟥", beløb: 100 },
  for_sent:     { label: "For sent til kamp",  icon: "⏰", beløb: 25  },
  glemt_udstyr: { label: "Glemt trøje/udstyr", icon: "👕", beløb: 25  },
  afbud_dagen:  { label: "Afbud på dagen",      icon: "📵", beløb: 75  },
  ingen_afbud:  { label: "Ingen afbud",         icon: "🚫", beløb: 150 },
};

const KAMP_STATS_KEYS     = ["mål","assists","renbure","gult_kort","rødt_kort"];
const OPFØRSEL_STATS_KEYS = ["for_sent","glemt_udstyr","afbud_dagen","ingen_afbud"];
const ALLE_STAT_KEYS      = [...KAMP_STATS_KEYS, ...OPFØRSEL_STATS_KEYS];

const AVATAR_COLORS = [
  "#1e3a6a","#2a1e5a","#1e4a3a","#4a1e2a","#2a3a1e",
  "#1e2a4a","#3a2a1e","#1e3a2a","#2a1e3a","#3a1e1e",
  "#1a3050","#2a4a1a","#4a2a1a","#1a2a4a","#3a1a2a",
  "#2a1a4a","#1a4a2a",
];

const SPILLERE = [
  { id: 1,  navn: "Adnan Malik" },
  { id: 2,  navn: "Ali Malik" },
  { id: 3,  navn: "Ali Mirza" },
  { id: 4,  navn: "Asam Khokhar",            rolle: "🎽 Spillende træner" },
  { id: 5,  navn: "Azeem Ahmad" },
  { id: 6,  navn: "Barbar Iqbal" },
  { id: 7,  navn: "Faisal Hussain" },
  { id: 8,  navn: "Jamil Jiwani" },
  { id: 9,  navn: "Kasim Hussain" },
  { id: 10, navn: "Khurram Ashraf" },
  { id: 11, navn: "Kim" },
  { id: 12, navn: "M. Irfan Asghar" },
  { id: 13, navn: "Malik Shahzad" },
  { id: 14, navn: "Mohamed Garrouj" },
  { id: 15, navn: "Saqqeb" },
  { id: 16, navn: "Shahid Mahmoood Hussain" },
  { id: 17, navn: "Suleman Malik" },
].map((p, i) => ({ rolle: "", ...p, avatarColor: AVATAR_COLORS[i] }));

const KAMPE_TEMPLATE = [
  { id: 1, dato: "Ons 15. apr", modstander: "BFC Lundegården", hjemme: false, tid: "18:45" },
  { id: 2, dato: "Ons 22. apr", modstander: "Solrød FC",        hjemme: true,  tid: "20:30" },
  { id: 3, dato: "Man 27. apr", modstander: "Taastrup FC",      hjemme: false, tid: "20:15" },
  { id: 4, dato: "Ons 6. maj",  modstander: "Albertslund IF",   hjemme: true,  tid: "20:30" },
  { id: 5, dato: "Ons 13. maj", modstander: "Grønne Stjerne",   hjemme: false, tid: "19:00" },
  { id: 6, dato: "Ons 20. maj", modstander: "Rebæk IF",         hjemme: true,  tid: "20:30" },
  { id: 7, dato: "Ons 27. maj", modstander: "Lundtofte Boldklub",hjemme: true, tid: "20:30" },
  { id: 8, dato: "Man 1. jun",  modstander: "IF Bytoften",      hjemme: false, tid: "20:30" },
  { id: 9, dato: "Ons 10. jun", modstander: "Roskilde Boldklub",hjemme: true,  tid: "20:30" },
];

// ── STATE ───────────────────────────────────────────────────────
let state = {
  kampe: KAMPE_TEMPLATE.map(k => ({
    ...k,
    resultat: "kommende",
    målFor: "", målMod: "",
    motm: null,
    stats: Object.fromEntries(SPILLERE.map(p => [p.id, Object.fromEntries(ALLE_STAT_KEYS.map(k => [k,0]))]))
  })),
  view: "kampe",
  åbenKampId: null,
  sektion: "stats",
  isAdmin: false,
  isSaving: false,
};

let saveTimeout = null;

// ── HELPERS ─────────────────────────────────────────────────────
function initials(navn) {
  return navn.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function spillerBøde(stats) {
  return Object.entries(BØDE_CONFIG).reduce((sum, [key, cfg]) => sum + (stats[key] || 0) * cfg.beløb, 0);
}

function sæsonTotaler() {
  return SPILLERE.map(p => {
    const tot = Object.fromEntries([...ALLE_STAT_KEYS, "motm"].map(k => [k, 0]));
    state.kampe.forEach(k => {
      const s = k.stats[p.id];
      if (s) ALLE_STAT_KEYS.forEach(key => { tot[key] += s[key] || 0; });
      if (k.motm == p.id) tot.motm++;
    });
    return { ...p, tot, bøde: spillerBøde(tot) };
  });
}

function samletBødekasse() {
  return sæsonTotaler().reduce((s, p) => s + p.bøde, 0);
}

function getKamp(id) {
  return state.kampe.find(k => k.id == id);
}

function makeAvatar(spiller, size = 40, fontSize = 13) {
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${fontSize}px;background:${spiller.avatarColor}">${initials(spiller.navn)}</div>`;
}

// ── API ─────────────────────────────────────────────────────────
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Date.now();
    window[cb] = (data) => { delete window[cb]; document.head.removeChild(script); resolve(data); };
    const script = document.createElement("script");
    script.src = url + "0026callback=" + cb;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadData() {
  try {
    const data = await jsonp(`${APPS_SCRIPT_URL}?action=getData&t=${Date.now()}`);
    if (data.kampe) {
      // Merge saved data with template (to preserve structure if new fields added)
      state.kampe = KAMPE_TEMPLATE.map(template => {
        const saved = data.kampe.find(k => k.id === template.id);
        if (!saved) return { ...template, resultat:"kommende", målFor:"", målMod:"", motm:null,
          stats: Object.fromEntries(SPILLERE.map(p => [p.id, Object.fromEntries(ALLE_STAT_KEYS.map(k => [k,0]))]))
        };
        // Ensure all spiller stats exist
        const stats = Object.fromEntries(SPILLERE.map(p => {
          const ps = saved.stats?.[p.id] || {};
          return [p.id, Object.fromEntries(ALLE_STAT_KEYS.map(k => [k, ps[k] || 0]))];
        }));
        return { ...template, ...saved, stats };
      });
    }
  } catch (e) {
    console.log("Kunne ikke hente data, bruger lokal tilstand");
  }
}

function scheduleSave() {
  if (!state.isAdmin) return;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveData, 1500);
}

async function saveData() {
  if (!state.isAdmin) return;
  const password = sessionStorage.getItem("adminPass");
  if (!password) return;

  state.isSaving = true;
  updateSavingIndicator(true);

  try {
    const result = await jsonp(`${APPS_SCRIPT_URL}?action=saveData&password=${encodeURIComponent(password)}&data=${encodeURIComponent(JSON.stringify({ kampe: state.kampe }))}`);
    if (!result.success) {
      showToast("❌ Gem fejlede: " + (result.error || "ukendt fejl"));
    }
  } catch (e) {
    showToast("❌ Kunne ikke gemme — tjek forbindelsen");
  } finally {
    state.isSaving = false;
    updateSavingIndicator(false);
  }
}

// ── ADMIN ────────────────────────────────────────────────────────
function toggleAdmin() {
  if (state.isAdmin) {
    state.isAdmin = false;
    sessionStorage.removeItem("adminPass");
    updateAdminBtn();
    render();
    showToast("Logget ud");
  } else {
    showLoginModal();
  }
}

function showLoginModal() {
  document.getElementById("login-modal").classList.remove("hidden");
  document.getElementById("login-input").value = "";
  document.getElementById("login-error").classList.add("hidden");
  setTimeout(() => document.getElementById("login-input").focus(), 100);
}

function closeLogin() {
  document.getElementById("login-modal").classList.add("hidden");
}

async function doLogin() {
  const pass = document.getElementById("login-input").value;
  document.getElementById("login-error").classList.add("hidden");

  try {
    const result = await jsonp(`${APPS_SCRIPT_URL}?action=saveData&password=${encodeURIComponent(pass)}&data=${encodeURIComponent(JSON.stringify({ kampe: state.kampe }))}`);

    if (result.success) {
      state.isAdmin = true;
      sessionStorage.setItem("adminPass", pass);
      closeLogin();
      updateAdminBtn();
      render();
      showToast("✅ Logget ind som admin");
    } else {
      document.getElementById("login-error").classList.remove("hidden");
    }
  } catch (e) {
    document.getElementById("login-error").classList.remove("hidden");
  }
}

// Allow Enter key in login
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("login-input").addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });
  // Close modal on backdrop click
  document.querySelector(".modal-backdrop").addEventListener("click", closeLogin);
});

function updateAdminBtn() {
  const btn = document.getElementById("admin-btn");
  document.getElementById("admin-icon").textContent = state.isAdmin ? "🔓" : "🔒";
  document.getElementById("admin-label").textContent = state.isAdmin ? "Admin" : "Admin";
  btn.classList.toggle("logged-in", state.isAdmin);
}

function updateSavingIndicator(saving) {
  // Small visual indicator — could be enhanced
}

// ── NAVIGATION ───────────────────────────────────────────────────
function setView(view) {
  state.view = view;
  document.querySelectorAll("#main-nav .nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.view === view);
  });
  render();
}

function setSection(section) {
  state.sektion = section;
  document.querySelectorAll("#detail-nav .nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.section === section);
  });
  renderContent();
}

function openKamp(id) {
  state.åbenKampId = id;
  state.sektion = "stats";
  document.getElementById("main-header").classList.add("hidden");
  document.getElementById("main-nav").classList.add("hidden");
  document.getElementById("detail-header").classList.remove("hidden");
  document.getElementById("detail-nav").classList.remove("hidden");
  document.querySelectorAll("#detail-nav .nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.section === "stats");
  });
  renderDetailHeader();
  renderContent();
  window.scrollTo(0, 0);
}

function closeKamp() {
  state.åbenKampId = null;
  document.getElementById("main-header").classList.remove("hidden");
  document.getElementById("main-nav").classList.remove("hidden");
  document.getElementById("detail-header").classList.add("hidden");
  document.getElementById("detail-nav").classList.add("hidden");
  renderHeaderStats();
  renderContent();
  window.scrollTo(0, 0);
}

// ── RENDER ───────────────────────────────────────────────────────
function render() {
  renderHeaderStats();
  renderContent();
}

function renderHeaderStats() {
  const v = state.kampe.filter(k => k.resultat === "vandt").length;
  const u = state.kampe.filter(k => k.resultat === "uafgjort").length;
  const t = state.kampe.filter(k => k.resultat === "tabte").length;
  const bøde = samletBødekasse();
  document.getElementById("header-stats").innerHTML = `
    <div class="stat-pill"><div class="stat-pill-val" style="color:#22c55e">${v}</div><div class="stat-pill-lbl">V</div></div>
    <div class="stat-pill"><div class="stat-pill-val" style="color:#eab308">${u}</div><div class="stat-pill-lbl">U</div></div>
    <div class="stat-pill"><div class="stat-pill-val" style="color:#ef4444">${t}</div><div class="stat-pill-lbl">T</div></div>
    <div class="stat-pill"><div class="stat-pill-val">${bøde} kr</div><div class="stat-pill-lbl">💰</div></div>
  `;
}

function renderDetailHeader() {
  const k = getKamp(state.åbenKampId);
  if (!k) return;
  document.getElementById("detail-title").textContent =
    k.hjemme ? `Ishøj IF vs ${k.modstander}` : `${k.modstander} vs Ishøj IF`;
  document.getElementById("detail-meta").textContent = `${k.dato} · ${k.tid} · ${k.hjemme ? "Hjemme" : "Ude"}`;

  const resultats = ["vandt","uafgjort","tabte","kommende"];
  const labels = { vandt:"Vandt", uafgjort:"Uafgjort", tabte:"Tabte", kommende:"Ikke spillet" };
  document.getElementById("result-row").innerHTML = resultats.map(r => `
    <button class="result-btn ${r} ${k.resultat === r ? 'active' : ''}"
      onclick="setResultat(${k.id},'${r}')">${labels[r]}</button>
  `).join("");

  renderScoreRow(k);
}

function renderScoreRow(k) {
  const scoreRow = document.getElementById("score-row");
  if (k.resultat === "kommende") {
    scoreRow.classList.add("hidden");
    return;
  }
  scoreRow.classList.remove("hidden");
  scoreRow.innerHTML = `
    <span class="score-label">Ishøj IF</span>
    <input class="score-input" type="number" min="0" value="${k.målFor}"
      onchange="setScore(${k.id},'målFor',this.value)" placeholder="0" ${state.isAdmin ? "" : "readonly"} />
    <span class="score-sep">–</span>
    <input class="score-input" type="number" min="0" value="${k.målMod}"
      onchange="setScore(${k.id},'målMod',this.value)" placeholder="0" ${state.isAdmin ? "" : "readonly"} />
    <span class="score-label">${k.modstander}</span>
  `;
}

function renderContent() {
  const el = document.getElementById("content");

  if (state.åbenKampId) {
    // Detail view
    const k = getKamp(state.åbenKampId);
    if (state.sektion === "stats")  el.innerHTML = renderStats(k);
    if (state.sektion === "bøder")  el.innerHTML = renderKampBøder(k);
    if (state.sektion === "motm")   el.innerHTML = renderMotm(k);
    return;
  }

  if (state.view === "kampe")  el.innerHTML = renderKampe();
  if (state.view === "sæson")  el.innerHTML = renderSæson();
  if (state.view === "bøder")  el.innerHTML = renderBøder();
}

// ── KAMPE VIEW ───────────────────────────────────────────────────
function renderKampe() {
  const måneder = [
    { label: "April 2026", filter: k => k.dato.includes("apr") },
    { label: "Maj 2026",   filter: k => k.dato.includes("maj") },
    { label: "Juni 2026",  filter: k => k.dato.includes("jun") },
  ];
  return måneder.map(m => {
    const mk = state.kampe.filter(m.filter);
    if (!mk.length) return "";
    return `
      <div class="section-label">${m.label}</div>
      ${mk.map(k => renderKampCard(k)).join("")}
    `;
  }).join("");
}

function renderKampCard(k) {
  const motmSpiller = k.motm ? SPILLERE.find(p => p.id == k.motm) : null;
  const harStats = SPILLERE.some(p => ALLE_STAT_KEYS.some(key => k.stats[p.id]?.[key] > 0));
  const kampBøde = SPILLERE.reduce((s, p) => s + spillerBøde(k.stats[p.id] || {}), 0);
  const hjemTitle = k.hjemme
    ? `<span class="ishoj">Ishøj IF</span> – ${k.modstander}`
    : `${k.modstander} – <span class="ishoj">Ishøj IF</span>`;

  const preview = harStats ? `
    <div class="kamp-preview">
      ${SPILLERE.map(p => {
        const s = k.stats[p.id];
        if (!s || ALLE_STAT_KEYS.every(key => !s[key])) return "";
        const icons = [
          s.mål        > 0 ? `<span>⚽${s.mål}</span>` : "",
          s.assists    > 0 ? `<span>🎯${s.assists}</span>` : "",
          s.renbure    > 0 ? `<span>🧤${s.renbure}</span>` : "",
          s.gult_kort  > 0 ? `<span>🟨${s.gult_kort}</span>` : "",
          s.rødt_kort  > 0 ? `<span>🟥${s.rødt_kort}</span>` : "",
          s.for_sent   > 0 ? `<span>⏰${s.for_sent}</span>` : "",
          s.glemt_udstyr>0 ? `<span>👕${s.glemt_udstyr}</span>` : "",
          s.afbud_dagen>0  ? `<span>📵${s.afbud_dagen}</span>` : "",
          s.ingen_afbud>0  ? `<span>🚫${s.ingen_afbud}</span>` : "",
        ].join("");
        if (!icons) return "";
        return `<div class="preview-chip"><strong>${p.navn.split(" ")[0]}</strong>${icons}</div>`;
      }).join("")}
    </div>
  ` : "";

  const footer = (motmSpiller || kampBøde > 0) ? `
    <div class="kamp-footer">
      ${motmSpiller ? `<div class="kamp-motm">⭐ <strong>MOTM:</strong> ${motmSpiller.navn}</div>` : "<div></div>"}
      ${kampBøde > 0 ? `<div class="kamp-bøde">💰 ${kampBøde} kr</div>` : ""}
    </div>
  ` : "";

  return `
    <div class="kamp-card" onclick="openKamp(${k.id})">
      <div class="kamp-card-inner">
        <div class="kamp-top">
          <div>
            <div class="kamp-date">${k.dato} · ${k.tid}</div>
            <div class="kamp-title">${hjemTitle}</div>
            <div class="kamp-subtitle">${k.hjemme ? "Hjemme" : "Ude"} · M+40 I 8:8</div>
          </div>
          <div style="text-align:right">
            <div class="result-badge ${k.resultat}">${
              {vandt:"Vandt",uafgjort:"Uafgjort",tabte:"Tabte",kommende:"Kommende"}[k.resultat]
            }</div>
            ${k.resultat !== "kommende" && k.målFor !== "" ? `<div class="kamp-score">${k.målFor} – ${k.målMod}</div>` : ""}
          </div>
        </div>
        ${preview}
        ${footer}
      </div>
    </div>
  `;
}

// ── STATS VIEW (kamp detail) ─────────────────────────────────────
function renderStats(k) {
  return SPILLERE.map(spiller => {
    const s = k.stats[spiller.id];
    const harNoget = ALLE_STAT_KEYS.some(key => s[key] > 0);
    const bøde = spillerBøde(s);

    const kampStatCells = [
      {key:"mål",      icon:"⚽", color:"#22c55e"},
      {key:"assists",  icon:"🎯", color:"#3b82f6"},
      {key:"renbure",  icon:"🧤", color:"#a855f7"},
      {key:"gult_kort",icon:"🟨", color:"#eab308"},
      {key:"rødt_kort",icon:"🟥", color:"#ef4444"},
    ].map(c => makeStatCell(k.id, spiller.id, c.key, c.icon, c.color, s[c.key])).join("");

    const opførselCells = OPFØRSEL_STATS_KEYS.map(key => {
      const cfg = BØDE_CONFIG[key];
      return makeStatCell(k.id, spiller.id, key, cfg.icon, "#f97316", s[key], `${cfg.beløb}kr`);
    }).join("");

    return `
      <div class="spiller-card ${harNoget ? 'has-stats' : ''}">
        <div class="spiller-header">
          ${makeAvatar(spiller, 38, 12)}
          <div>
            <div class="spiller-name">${spiller.navn}</div>
            ${spiller.rolle ? `<div class="spiller-rolle">${spiller.rolle}</div>` : ""}
          </div>
          ${bøde > 0 ? `<div class="spiller-bøde-badge">${bøde} kr</div>` : ""}
        </div>
        <div class="stats-section">
          <div class="stats-section-label">KAMP</div>
          <div class="stats-grid stats-grid-5">${kampStatCells}</div>
        </div>
        <div class="stats-section">
          <div class="stats-section-label">OPFØRSEL</div>
          <div class="stats-grid stats-grid-4">${opførselCells}</div>
        </div>
      </div>
    `;
  }).join("");
}

function makeStatCell(kampId, spillerId, statKey, icon, color, value, sublabel = "") {
  const isAdmin = state.isAdmin;
  const btnMinus = isAdmin ? `<button class="stat-btn stat-btn-minus" onclick="updateStat(${kampId},${spillerId},'${statKey}',-1)">−</button>` : "";
  const btnPlus  = isAdmin ? `<button class="stat-btn stat-btn-plus" style="background:${color}" onclick="updateStat(${kampId},${spillerId},'${statKey}',1)">+</button>` : "";
  return `
    <div class="stat-cell" id="stat-${kampId}-${spillerId}-${statKey}">
      <div class="stat-icon">${icon}</div>
      <div class="stat-value" style="color:${value > 0 ? color : '#ddd'}">${value}</div>
      ${sublabel ? `<div class="stat-sublabel">${sublabel}</div>` : ""}
      ${isAdmin ? `<div class="stat-btns">${btnMinus}${btnPlus}</div>` : ""}
    </div>
  `;
}

// ── KAMP BØDER VIEW ──────────────────────────────────────────────
function renderKampBøder(k) {
  const total = SPILLERE.reduce((s, p) => s + spillerBøde(k.stats[p.id] || {}), 0);
  const takster = Object.entries(BØDE_CONFIG).map(([, cfg]) =>
    `<div class="takst-row"><span>${cfg.icon} ${cfg.label}</span><span class="takst-amount">${cfg.beløb} kr</span></div>`
  ).join("");

  const spillerRows = SPILLERE.map(p => {
    const s = k.stats[p.id];
    const bøde = spillerBøde(s);
    if (bøde === 0) return "";
    const detail = Object.entries(BØDE_CONFIG)
      .filter(([key]) => s[key] > 0)
      .map(([key, cfg]) => `${cfg.icon}${s[key]}×${cfg.beløb}kr`)
      .join("  ");
    return `
      <div class="bøde-spiller-card">
        ${makeAvatar(p, 36, 11)}
        <div>
          <div class="bøde-name">${p.navn}</div>
          <div class="bøde-detail">${detail}</div>
        </div>
        <div class="bøde-amount" style="color:#1a8a3a">${bøde} kr</div>
      </div>
    `;
  }).join("");

  return `
    <div class="bøde-hero">
      <div class="bøde-hero-label">KAMPENS BØDER</div>
      <div class="bøde-hero-amount">${total} kr</div>
    </div>
    <div class="takster-card">
      <div class="takster-title">Takster</div>
      ${takster}
    </div>
    ${spillerRows || `<div style="text-align:center;color:#bbb;padding:30px">Ingen bøder i denne kamp 🙌</div>`}
  `;
}

// ── MOTM VIEW ────────────────────────────────────────────────────
function renderMotm(k) {
  const rows = SPILLERE.map(p => `
    <div class="motm-card ${k.motm == p.id ? 'selected' : ''}"
      onclick="${state.isAdmin ? `setMotm(${k.id},${p.id})` : 'void(0)'}">
      ${makeAvatar(p, 40, 13)}
      <div>
        <div class="spiller-name">${p.navn}</div>
        ${p.rolle ? `<div class="spiller-rolle">${p.rolle}</div>` : ""}
      </div>
      ${k.motm == p.id
        ? `<div class="motm-star">⭐</div>`
        : `<div class="motm-arrow">›</div>`}
    </div>
  `).join("");
  return `
    <div class="motm-intro">${state.isAdmin ? "Vælg kampens bedste spiller" : "Kampens bedste spiller"}</div>
    ${rows}
  `;
}

// ── SÆSON VIEW ───────────────────────────────────────────────────
function renderSæson() {
  const totaler = sæsonTotaler();
  const kategorier = [
    {key:"mål",       label:"Topscorere",      icon:"⚽", color:"#22c55e"},
    {key:"assists",   label:"Flest Assists",    icon:"🎯", color:"#3b82f6"},
    {key:"renbure",   label:"Renbure",          icon:"🧤", color:"#a855f7"},
    {key:"motm",      label:"Man of the Match", icon:"⭐", color:"#f59e0b"},
    {key:"gult_kort", label:"Gule Kort",        icon:"🟨", color:"#eab308"},
    {key:"rødt_kort", label:"Røde Kort",        icon:"🟥", color:"#ef4444"},
  ];
  return kategorier.map(cat => {
    const sorted = [...totaler].filter(p => p.tot[cat.key] > 0).sort((a,b) => b.tot[cat.key] - a.tot[cat.key]);
    const rows = sorted.slice(0,5).map((p,i) => `
      <div class="leaderboard-row">
        <span class="leaderboard-rank">#${i+1}</span>
        ${makeAvatar(p, 30, 10)}
        <span class="leaderboard-name">${p.navn}</span>
        <div class="leaderboard-val" style="background:${cat.color}22;color:${cat.color}">${p.tot[cat.key]}</div>
      </div>
    `).join("");
    return `
      <div class="leaderboard-card">
        <div class="leaderboard-title">${cat.icon} ${cat.label}</div>
        ${rows || `<div class="leaderboard-empty">Ingen endnu</div>`}
      </div>
    `;
  }).join("");
}

// ── BØDER VIEW ───────────────────────────────────────────────────
function renderBøder() {
  const totaler = sæsonTotaler();
  const total = samletBødekasse();
  const sorted = [...totaler].sort((a,b) => b.bøde - a.bøde);

  const takster = Object.entries(BØDE_CONFIG).map(([,cfg]) =>
    `<div class="takst-row"><span>${cfg.icon} ${cfg.label}</span><span class="takst-amount">${cfg.beløb} kr</span></div>`
  ).join("");

  const rows = sorted.map((p, i) => {
    const detail = Object.entries(BØDE_CONFIG)
      .filter(([key]) => p.tot[key] > 0)
      .map(([key,cfg]) => `${cfg.icon}${p.tot[key]}×${cfg.beløb}kr`)
      .join("  ") || "Ingen bøder 🙌";
    return `
      <div class="bøde-spiller-card ${p.bøde === 0 ? 'ingen' : ''}">
        <span class="bøde-rank">#${i+1}</span>
        ${makeAvatar(p, 36, 11)}
        <div>
          <div class="bøde-name">${p.navn}</div>
          <div class="bøde-detail">${detail}</div>
        </div>
        <div class="bøde-amount" style="color:${p.bøde>0?'#1a8a3a':'#ddd'}">${p.bøde} kr</div>
      </div>
    `;
  }).join("");

  return `
    <div class="bøde-hero">
      <div class="bøde-hero-label">TOTAL BØDEKASSE</div>
      <div class="bøde-hero-amount">${total} kr</div>
      <div class="bøde-hero-sub">Sæson 2025/26</div>
    </div>
    <div class="takster-card">
      <div class="takster-title">Takster</div>
      ${takster}
    </div>
    ${rows}
  `;
}

// ── STATE MUTATIONS ──────────────────────────────────────────────
function updateStat(kampId, spillerId, statKey, delta) {
  if (!state.isAdmin) return;
  const kamp = getKamp(kampId);
  const cur = kamp.stats[spillerId][statKey];
  kamp.stats[spillerId][statKey] = Math.max(0, cur + delta);

  // Update only the cell DOM element for performance
  const cell = document.getElementById(`stat-${kampId}-${spillerId}-${statKey}`);
  if (cell) {
    const newVal = kamp.stats[spillerId][statKey];
    const allCfg = { ...Object.fromEntries([
      {key:"mål",color:"#22c55e"},{key:"assists",color:"#3b82f6"},{key:"renbure",color:"#a855f7"},
      {key:"gult_kort",color:"#eab308"},{key:"rødt_kort",color:"#ef4444"},
    ].map(c=>[c.key,c.color])), ...Object.fromEntries(OPFØRSEL_STATS_KEYS.map(k=>[k,"#f97316"])) };
    const color = allCfg[statKey];
    cell.querySelector(".stat-value").textContent = newVal;
    cell.querySelector(".stat-value").style.color = newVal > 0 ? color : "#ddd";

    // Update bøde badge on spiller header
    const bøde = spillerBøde(kamp.stats[spillerId]);
    const card = cell.closest(".spiller-card");
    if (card) {
      let badge = card.querySelector(".spiller-bøde-badge");
      if (bøde > 0) {
        if (!badge) {
          badge = document.createElement("div");
          badge.className = "spiller-bøde-badge";
          card.querySelector(".spiller-header").appendChild(badge);
        }
        badge.textContent = `${bøde} kr`;
      } else if (badge) {
        badge.remove();
      }
    }
  }

  if (delta > 0) {
    const spiller = SPILLERE.find(p => p.id == spillerId);
    const allIcons = {mål:"⚽",assists:"🎯",renbure:"🧤",gult_kort:"🟨",rødt_kort:"🟥",for_sent:"⏰",glemt_udstyr:"👕",afbud_dagen:"📵",ingen_afbud:"🚫"};
    showToast(`${spiller.navn.split(" ")[0]} +1 ${allIcons[statKey]}`);
  }

  scheduleSave();
}

function setResultat(kampId, resultat) {
  if (!state.isAdmin) return;
  const k = getKamp(kampId);
  k.resultat = resultat;
  renderDetailHeader();
  scheduleSave();
}

function setScore(kampId, felt, val) {
  if (!state.isAdmin) return;
  getKamp(kampId)[felt] = val;
  scheduleSave();
}

function setMotm(kampId, spillerId) {
  if (!state.isAdmin) return;
  const k = getKamp(kampId);
  k.motm = k.motm == spillerId ? null : spillerId;
  const spiller = SPILLERE.find(p => p.id == spillerId);
  if (k.motm) showToast(`⭐ ${spiller.navn.split(" ")[0]} er MOTM!`);
  renderContent();
  scheduleSave();
}

// ── TOAST ────────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.add("hidden"), 2200);
}

// ── INIT ─────────────────────────────────────────────────────────
async function init() {
  await loadData();
  document.getElementById("loading-screen").style.display = "none";
  render();
}

init();
