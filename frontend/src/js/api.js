/* =========================================================================
   Config — each microservice is reached via its own ingress path prefix.
   ========================================================================= */
const GENERIC_SERVICES = [
  "cards","loans","payments","beneficiaries","statements",
  "notifications","kyc","fixed-deposits","cheques","disputes",
  "audit-log","fraud-detection","support-tickets","rewards","admin","reports"
];
const SERVICE_ICONS = {
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19"/><path d="M6 15h5"/></svg>',
  loans: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9 15.5c0 1 1 1.6 3 1.6s3-.7 3-1.7c0-2.3-6-1-6-3.3 0-1 1-1.7 3-1.7s3 .6 3 1.6"/><path d="M12 6.7v1.1M12 16.2v1.1"/></svg>',
  payments: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h13"/><path d="M12 6l6 6-6 6"/><path d="M21 5v14"/></svg>',
  beneficiaries: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.4"/><path d="M2.7 19c.9-3.4 3.4-5.2 6.3-5.2s5.4 1.8 6.3 5.2"/><path d="M16.5 5.3c1.6.4 2.7 1.8 2.7 3.4s-1.1 3-2.7 3.4"/><path d="M18.6 13.9c2 .6 3.4 2.2 4 4.6"/></svg>',
  statements: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2.5h9l4 4V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M14.5 2.5V7h4.5"/><path d="M8 12.5h8M8 16h5.5"/></svg>',
  notifications: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 10.5a6 6 0 1 1 12 0c0 4 1.4 5.4 2 6.5H4c.6-1.1 2-2.5 2-6.5Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  kyc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2.5 4.5 5.5V11c0 5 3.2 8.4 7.5 10.5 4.3-2.1 7.5-5.5 7.5-10.5V5.5L12 2.5Z"/><path d="M8.7 12.2l2.2 2.2 4.4-4.6"/></svg>',
  "fixed-deposits": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V9.5l8-5 8 5V20"/><path d="M4 20h16"/><path d="M12 20v-6.5"/><path d="M8.5 20v-4M15.5 20v-4"/></svg>',
  cheques: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 15.5c1.4 0 1.4-1.6 2.8-1.6s1.4 1.6 2.8 1.6 1.4-1.6 2.8-1.6 1.4 1.6 2.8 1.6"/><path d="M6 10h6"/></svg>',
  disputes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2.7 22 20H2L12 2.7Z"/><path d="M12 9.5v4.2"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/></svg>',
  "audit-log": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.5" cy="10.5" r="7"/><path d="M20.5 20.5 15.8 15.8"/><path d="M7.2 10.5h6.6M10.5 7.2v6.6"/></svg>',
  "fraud-detection": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2.5 4.5 5.5V11c0 5 3.2 8.4 7.5 10.5 4.3-2.1 7.5-5.5 7.5-10.5V5.5L12 2.5Z"/><path d="M12 8v4.4"/><circle cx="12" cy="15.3" r="0.9" fill="currentColor" stroke="none"/></svg>',
  "support-tickets": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 5.5h17v11h-9L6.5 20v-3.5h-3Z"/><path d="M9.5 10a2.5 2.5 0 1 1 3.3 2.4c-.8.3-1.3.9-1.3 1.6"/><circle cx="12" cy="16.6" r="0.05" fill="currentColor" stroke="currentColor" stroke-width="1.6"/></svg>',
  rewards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2.8l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.1l6-.8L12 2.8Z"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1h-.2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5v-.2a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21V3"/><path d="M4 21h17"/><rect x="7" y="13" width="3" height="6"/><rect x="12" y="9" width="3" height="10"/><rect x="17" y="5" width="3" height="14"/></svg>',
};

let currentUser = JSON.parse(localStorage.getItem("veera_user") || "null");
let currentTab = "dashboard";
let authTab = "login";
let cachedAccounts = [];

/* ---------------------------------------------------------------------- */
async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || res.statusText || "Request failed");
  return body;
}
/* Cloud Bank is one-account-per-person: this returns [] or [theirAccount],
   never the whole bank's accounts, so every screen that used to say
   "your accounts" (plural, from a naive /accounts list-all) now shows
   only what's actually theirs. */
async function fetchMyAccounts() {
  try {
    const acct = await api(`/accounts/by-user/${currentUser.user_id}`);
    return [acct];
  } catch (e) {
    return [];
  }
}
async function myAccountOrNull() {
  const accts = await fetchMyAccounts();
  cachedAccounts = accts;
  return accts[0] || null;
}
function toast(text, ok = true) {
  const wrap = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast" + (ok ? "" : " err");
  el.textContent = text;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString(undefined, { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}
function initials(name) {
  return (name || "?").trim().split(/\s+/).slice(0,2).map(w => w[0]?.toUpperCase() || "").join("");
}
function setUser(u) {
  currentUser = u;
  if (u) localStorage.setItem("veera_user", JSON.stringify(u));
  else localStorage.removeItem("veera_user");
}

/* ---------------- Shared helpers for the service pages ---------------- */
function row(left, right, sub) {
  return `<div class="split" style="justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--line);">
    <div><div style="font-size:13px; font-weight:600;">${left}</div>${sub ? `<div class="when">${sub}</div>` : ""}</div>
    <div>${right}</div>
  </div>`;
}
function badge(text, tone) {
  const colors = { open:"var(--gold)", active:"var(--ledger)", pending:"var(--gold)", pending_review:"var(--gold)",
    verified:"var(--ledger)", cleared:"var(--ledger)", resolved:"var(--ledger)", completed:"var(--ledger)", closed:"var(--muted-2)",
    rejected:"var(--danger)", bounced:"var(--danger)", frozen:"var(--danger)", matured:"var(--ledger)", closed_early:"var(--muted-2)" };
  return `<span class="badge" style="border-color:${colors[tone]||'var(--line)'}; color:${colors[tone]||'var(--text)'}">${(tone||'').replace('_',' ')}</span>`;
}
function noAccountCard(serviceLabel) {
  return `<div class="card fade-in"><div class="empty"><div class="big">No account yet</div>Open your Cloud Bank account first to use ${serviceLabel}.</div></div>`;
}
function renderLedgerTable(rows, showOwner, clickable) {
  if (!rows.length) return `<div class="empty"><div class="big">Nothing here yet</div>Transactions will appear as soon as they post.</div>`;
  return `
    <table class="ledger">
      <thead><tr><th>Transaction</th>${showOwner ? "<th>Account</th>" : ""}<th>Amount</th><th>Balance after</th><th>When</th></tr></thead>
      <tbody>
        ${rows.map((t,i) => `
          <tr class="${clickable ? 'clickable' : ''}" ${clickable ? `onclick='openReceipt(${JSON.stringify(t).replace(/'/g,"&apos;")})'` : ""}>
            <td><div class="tcell"><div class="tick ${t.type==='withdrawal'?'neg':''}"></div><div><div style="font-weight:600; font-size:12.5px; text-transform:capitalize;">${t.type}</div><div class="idcell">${(t.transaction_id||'').slice(0,8)}</div></div></div></td>
            ${showOwner ? `<td>${t.owner || ''}</td>` : ""}
            <td class="amt ${t.type==='withdrawal'?'neg':'pos'}">${t.type==='withdrawal'?'−':'+'}$${fmtMoney(t.amount)}</td>
            <td class="amt">$${fmtMoney(t.balance_after)}</td>
            <td class="when">${fmtWhen(t.created_at)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}
