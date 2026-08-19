/* ---------------- Services hub — categorized directory of all 16 pages ---------------- */
const SERVICE_PAGES = {
  cards: renderCards, loans: renderLoans, payments: renderPayments, beneficiaries: renderBeneficiaries,
  statements: renderStatements, notifications: renderNotifications, kyc: renderKyc, "fixed-deposits": renderFixedDeposits,
  cheques: renderCheques, disputes: renderDisputes, "audit-log": renderAuditLog, "fraud-detection": renderFraudDetection,
  "support-tickets": renderSupportTickets, rewards: renderRewards, admin: renderAdmin, reports: renderReports,
};
const SERVICE_GROUPS = {
  "Banking": ["cards","loans","fixed-deposits","cheques"],
  "Money movement": ["payments","beneficiaries","statements"],
  "Account care": ["notifications","kyc","disputes","support-tickets","rewards"],
  "Operations": ["audit-log","fraud-detection","admin","reports"],
};
function renderServices() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Services", "Every Cloud Bank feature") +
    Object.entries(SERVICE_GROUPS).map(([group, list]) => `
      <div class="section-title" style="margin-top:28px;">${group}</div>
      <div class="grid cols-3">
        ${list.map(s => `
          <button class="card fade-in svc-tile" onclick="currentTab='${s}'; render();">
            <div class="icon">${SERVICE_ICONS[s] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l9 9-9 9-9-9 9-9Z"/></svg>'}</div>
            <h2>${s.replace('-',' ')}</h2>
            <p class="hint">Open ${s.replace('-',' ')}</p>
          </button>
        `).join("")}
      </div>
    `).join("");
}
