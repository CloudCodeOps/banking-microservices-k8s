const ICONS = {
  dashboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="5" rx="2"/><rect x="13" y="10" width="8" height="11" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/></svg>',
  accounts:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="6" width="19" height="13" rx="3"/><path d="M2.5 10h19"/><path d="M6 15h4"/></svg>',
  transactions:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h13l-3-3M20 17H7l3 3"/></svg>',
  transfers:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 7l4 4-4 4M21 11H3M7 3l-4 4 4 4M3 7h18"/></svg>',
  services:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
};
function iconFor(key){ return ICONS[key] || ICONS.services; }

/* -------- Per-page accent theming: every page/service gets its own hue,
   so no two sections of the app share exactly the same accent color. -------- */
const ACCENT_PALETTE = ["#8b7cff","#2fe6c0","#ffb648","#ff5c72","#5ec8ff","#ff7fd8","#b3ff5c","#ff9d52","#7c93ff","#4be8e0","#e05cff","#ffd15c"];
const PAGE_ORDER = ["dashboard","accounts","transfers","transactions","services", ...GENERIC_SERVICES];
function accentFor(tab){
  const i = PAGE_ORDER.indexOf(tab);
  return ACCENT_PALETTE[(i < 0 ? 0 : i) % ACCENT_PALETTE.length];
}
function hexToRgba(hex, a){
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n>>16)&255}, ${(n>>8)&255}, ${n&255}, ${a})`;
}
function applyAccent(tab){
  const hex = accentFor(tab);
  document.documentElement.style.setProperty("--accent", hex);
  document.documentElement.style.setProperty("--accent-dim", hexToRgba(hex, .16));
}

function renderShell() {
  applyAccent(currentTab);
  document.getElementById("app").innerHTML = `
    <div class="shell">
      <div class="topnav">
        <div class="brand">
          <div class="mark">C</div>
          <div class="word">Cloud<b>Bank</b></div>
        </div>
        <nav class="navpills" id="nav-primary"></nav>
        <div class="who-wrap">
          <div class="who" onclick="openProfile()" title="Edit profile">
            <div class="avatar">${currentUser.profile_photo ? `<img src="${currentUser.profile_photo}" alt="" />` : initials(currentUser.full_name)}</div>
            <div class="meta">
              <div class="name">${currentUser.full_name}</div>
              <div class="sub">${currentUser.email}</div>
            </div>
          </div>
          <button class="signout" onclick="doLogout()">Sign out</button>
        </div>
      </div>
      <nav class="svcnav" id="nav-services"></nav>
      <main id="main"></main>
    </div>
  `;
  renderNav();
  playNavEnter();
}

function renderNav() {
  const primary = document.getElementById("nav-primary");
  const secondary = document.getElementById("nav-services");
  const mk = (key, label, icon) => {
    const b = document.createElement("button");
    b.className = "navitem" + (key === currentTab ? " active" : "");
    b.innerHTML = `${icon}<span>${label}</span>`;
    b.onclick = () => { currentTab = key; render(); };
    return b;
  };
  primary.innerHTML = "";
  [["dashboard","Dashboard",iconFor("dashboard")], ["accounts","Account",iconFor("accounts")],
   ["transfers","Transfers",iconFor("transfers")], ["transactions","Transactions",iconFor("transactions")],
   ["services","Services",iconFor("services")]].forEach(([k,l,i]) => primary.appendChild(mk(k,l,i)));

  secondary.innerHTML = "";
  GENERIC_SERVICES.forEach(s => {
    const b = document.createElement("button");
    b.className = "navitem" + (s === currentTab ? " active" : "");
    b.innerHTML = `<span>${SERVICE_ICONS[s] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l9 9-9 9-9-9 9-9Z"/></svg>'}</span><span style="text-transform:capitalize">${s.replace("-"," ")}</span>`;
    b.onclick = () => { currentTab = s; render(); };
    secondary.appendChild(b);
  });
}

function pageHeader(eyebrow, title) {
  return `
    <div class="topline">
      <div>
        <div class="eyebrow">${eyebrow}</div>
        <div class="pagetitle">${title}</div>
      </div>
      <div class="clock" id="clock"></div>
    </div>
  `;
}
function tickClock() {
  const el = document.getElementById("clock");
  if (!el) return;
  el.textContent = new Date().toLocaleString(undefined, { weekday:"short", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" });
}
setInterval(tickClock, 1000);

/* ---------------------------------------------------------------------- */
async function render() {
  if (!currentUser) { removeChatbot(); renderGate(); return; }
  renderShell();
  mountChatbot();
  if (currentTab === "dashboard") await renderDashboard();
  else if (currentTab === "accounts") await renderAccounts();
  else if (currentTab === "transfers") await renderTransfers();
  else if (currentTab === "transactions") await renderTransactions();
  else if (currentTab === "services") renderServices();
  else if (SERVICE_PAGES[currentTab]) await SERVICE_PAGES[currentTab]();
  tickClock();
  playPageEnter();
}
