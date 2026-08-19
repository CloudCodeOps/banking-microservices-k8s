/* ---------------- Admin — data console ---------------- */
async function renderAdmin() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Admin", "Staff console") + `
    <div class="kpi-row" id="ad_overview"><div class="empty">Loading…</div></div>
    <div class="grid cols-2">
      <div class="console fade-in"><div class="console-head"><span class="ch-title">Pending loans</span></div><div id="ad_loans"><div class="empty">Loading…</div></div></div>
      <div class="console fade-in"><div class="console-head"><span class="ch-title">Pending KYC</span></div><div id="ad_kyc"><div class="empty">Loading…</div></div></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px;">
      <div class="console fade-in"><div class="console-head"><span class="ch-title">Open tickets</span></div><div id="ad_tickets"><div class="empty">Loading…</div></div></div>
      <div class="console fade-in"><div class="console-head"><span class="ch-title">Open disputes</span></div><div id="ad_disputes"><div class="empty">Loading…</div></div></div>
    </div>
  `;
  loadAdmin();
}
async function loadAdmin() {
  try {
    const o = await api("/admin/overview");
    document.getElementById("ad_overview").innerHTML = [
      ["Total users", o.total_users], ["Total accounts", o.total_accounts], ["Open fraud flags", o.open_fraud_flags],
    ].map(([l,v]) => `<div class="card fade-in stat-tile"><div class="label">${l.toUpperCase()}</div><div class="value">${v}</div></div>`).join("");
  } catch (e) {}
  try {
    const loans = await api("/loans/pending");
    document.getElementById("ad_loans").innerHTML = loans.length ? loans.map(l => `
      <div class="console-row"><span>$${fmtMoney(l.principal)} · ${l.purpose||''}</span>
        <span><button class="btn ghost sm" onclick="doApproveLoan('${l.id}')">Approve</button> <button class="btn ghost sm" onclick="doRejectLoan('${l.id}')">Reject</button></span></div>
    `).join("") : `<div class="empty">Nothing pending.</div>`;
  } catch (e) { document.getElementById("ad_loans").innerHTML = `<div class="empty">${e.message}</div>`; }
  try {
    const kyc = await api("/kyc/pending");
    document.getElementById("ad_kyc").innerHTML = kyc.length ? kyc.map(k => `
      <div class="console-row"><span style="text-transform:capitalize;">${k.document_type.replace('_',' ')} · ${k.document_number}</span>
        <span><button class="btn ghost sm" onclick="doVerifyKyc('${k.id}')">Verify</button> <button class="btn ghost sm" onclick="doRejectKyc('${k.id}')">Reject</button></span></div>
    `).join("") : `<div class="empty">Nothing pending.</div>`;
  } catch (e) { document.getElementById("ad_kyc").innerHTML = `<div class="empty">${e.message}</div>`; }
  try {
    const tickets = await api("/support-tickets/open");
    document.getElementById("ad_tickets").innerHTML = tickets.length ? tickets.map(t => `
      <div class="console-row"><span>${t.subject}</span><button class="btn ghost sm" onclick="doCloseTicket('${t.id}')">Close</button></div>
    `).join("") : `<div class="empty">Nothing open.</div>`;
  } catch (e) { document.getElementById("ad_tickets").innerHTML = `<div class="empty">${e.message}</div>`; }
  try {
    const disputes = await api("/disputes/open");
    document.getElementById("ad_disputes").innerHTML = disputes.length ? disputes.map(d => `
      <div class="console-row"><span>${d.reason}</span><button class="btn ghost sm" onclick="doResolveDispute('${d.id}')">Resolve</button></div>
    `).join("") : `<div class="empty">Nothing open.</div>`;
  } catch (e) { document.getElementById("ad_disputes").innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function doApproveLoan(id) { try { await api(`/loans/${id}/approve`, { method: "PATCH" }); toast("Loan approved."); loadAdmin(); } catch (e) { toast(e.message, false); } }
async function doRejectLoan(id) { try { await api(`/loans/${id}/reject`, { method: "PATCH" }); toast("Loan rejected."); loadAdmin(); } catch (e) { toast(e.message, false); } }
async function doVerifyKyc(id) { try { await api(`/kyc/${id}/verify`, { method: "PATCH" }); toast("KYC verified."); loadAdmin(); } catch (e) { toast(e.message, false); } }
async function doRejectKyc(id) { try { await api(`/kyc/${id}/reject`, { method: "PATCH", body: JSON.stringify({reason:"Documents did not pass verification"}) }); toast("KYC rejected."); loadAdmin(); } catch (e) { toast(e.message, false); } }
async function doCloseTicket(id) { try { await api(`/support-tickets/${id}/close`, { method: "PATCH" }); toast("Ticket closed."); loadAdmin(); } catch (e) { toast(e.message, false); } }
async function doResolveDispute(id) { try { await api(`/disputes/${id}/resolve`, { method: "PATCH", body: JSON.stringify({resolution_note:"Resolved by staff"}) }); toast("Dispute resolved."); loadAdmin(); } catch (e) { toast(e.message, false); } }
