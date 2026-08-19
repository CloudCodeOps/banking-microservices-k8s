/* ---------------- Loans ---------------- */
async function renderLoans() {
  const main = document.getElementById("main");
  const mine = await myAccountOrNull();
  main.innerHTML = pageHeader("Loans", "Apply & track") + (mine ? `
    <div class="grid cols-2">
      <div class="card fade-in">
        <h2>Apply for a loan</h2>
        <p class="hint">Under $500,000 auto-approves and disburses instantly.</p>
        <label>Principal</label><input id="ln_principal" type="number" min="1" step="0.01" placeholder="10000" />
        <label>Tenure (months)</label><input id="ln_tenure" type="number" min="1" max="360" value="12" />
        <label>Purpose</label><input id="ln_purpose" placeholder="Home renovation" />
        <button class="btn" onclick="doApplyLoan()">Apply</button>
        <div id="ln_msg"></div>
      </div>
      <div class="card fade-in"><h2>Your loans</h2><div id="ln_list"><div class="empty">Loading…</div></div></div>
    </div>
  ` : noAccountCard("loans"));
  if (mine) loadLoans();
}
async function doApplyLoan() {
  const el = document.getElementById("ln_msg");
  try {
    const body = { user_id: currentUser.user_id, account_id: cachedAccounts[0].account_id,
      principal: Number(document.getElementById("ln_principal").value), tenure_months: Number(document.getElementById("ln_tenure").value),
      purpose: document.getElementById("ln_purpose").value };
    const loan = await api("/loans/apply", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">${loan.status === 'active' ? 'Approved & disbursed instantly.' : 'Submitted for review.'}</div>`;
    toast("Loan application submitted.");
    loadLoans(); loadAccountsSilently();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadLoans() {
  const box = document.getElementById("ln_list");
  try {
    const loans = await api(`/loans/user/${currentUser.user_id}`);
    box.innerHTML = loans.length ? loans.map(l => row(
      `$${fmtMoney(l.principal)} · ${l.tenure_months}mo`, badge('', l.status), `EMI $${fmtMoney(l.monthly_emi)}/mo · ${l.purpose || 'No purpose given'}`
    )).join("") : `<div class="empty"><div class="big">No loans yet</div>Apply for your first one.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}

/* ---------------- Payments ---------------- */
async function renderPayments() {
  const main = document.getElementById("main");
  const mine = await myAccountOrNull();
  main.innerHTML = pageHeader("Payments", "Pay a bill") + (mine ? `
    <div class="grid cols-2">
      <div class="card fade-in">
        <h2>Pay a bill</h2>
        <p class="hint">Balance $${fmtMoney(mine.balance)}</p>
        <label>Quick services</label>
        <div class="amount-quickpicks" id="pm_service_picks">
          <button type="button" data-category="mobile_recharge" onclick="pickPaymentService(this,'mobile_recharge','Mobile Recharge')">Mobile Recharge</button>
          <button type="button" data-category="phone_recharge" onclick="pickPaymentService(this,'phone_recharge','Phone Recharge')">Phone Recharge</button>
          <button type="button" data-category="dth" onclick="pickPaymentService(this,'dth','DTH / Cable')">DTH / Cable</button>
          <button type="button" data-category="electricity" onclick="pickPaymentService(this,'electricity','Electricity Board')">Electricity</button>
          <button type="button" data-category="water" onclick="pickPaymentService(this,'water','Water Utility')">Water</button>
          <button type="button" data-category="broadband" onclick="pickPaymentService(this,'broadband','Broadband / Wifi')">Broadband</button>
          <button type="button" data-category="insurance" onclick="pickPaymentService(this,'insurance','Insurance')">Insurance</button>
          <button type="button" data-category="other" onclick="pickPaymentService(this,'other','')">More services</button>
        </div>
        <label>Payee</label><input id="pm_payee" placeholder="Acme Electric" />
        <label>Category</label>
        <select id="pm_category">
          <option value="mobile_recharge">Mobile recharge</option>
          <option value="phone_recharge">Phone recharge</option>
          <option value="dth">DTH / Cable</option>
          <option value="utility">Utility</option>
          <option value="electricity">Electricity</option>
          <option value="water">Water</option>
          <option value="broadband">Broadband / Wifi</option>
          <option value="insurance">Insurance</option>
          <option value="credit_card">Credit card</option>
          <option value="other">Other</option>
        </select>
        <label>Amount</label><input id="pm_amount" type="number" min="0.01" step="0.01" placeholder="0.00" />
        <button class="btn" onclick="doPay()">Pay</button>
        <div id="pm_msg"></div>
      </div>
      <div class="card fade-in"><h2>Payment history</h2><div id="pm_list"><div class="empty">Loading…</div></div></div>
    </div>
  ` : noAccountCard("payments"));
  if (mine) loadPayments();
}
function pickPaymentService(btn, category, payeeHint) {
  document.querySelectorAll("#pm_service_picks button").forEach(b => b.classList.toggle("active", b === btn));
  document.getElementById("pm_category").value = category;
  if (payeeHint) document.getElementById("pm_payee").value = payeeHint;
  document.getElementById("pm_amount").focus();
}
async function doPay() {
  const el = document.getElementById("pm_msg");
  try {
    const body = { user_id: currentUser.user_id, account_id: cachedAccounts[0].account_id, payee_name: document.getElementById("pm_payee").value,
      category: document.getElementById("pm_category").value, amount: Number(document.getElementById("pm_amount").value) };
    await api("/payments", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Payment sent.</div>`; toast("Payment sent.");
    loadPayments(); loadAccountsSilently();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadPayments() {
  const box = document.getElementById("pm_list");
  try {
    const payments = await api(`/payments/user/${currentUser.user_id}`);
    box.innerHTML = payments.length ? payments.map(p => row(
      `${p.payee_name} <span class="badge">${p.category}</span>`, `<span class="amt neg" style="font-family:var(--mono);">−$${fmtMoney(p.amount)}</span>`, fmtWhen(p.created_at)
    )).join("") : `<div class="empty"><div class="big">No payments yet</div>Pay your first bill.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}

/* ---------------- Beneficiaries ---------------- */
async function renderBeneficiaries() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Beneficiaries", "Saved payees") + `
    <div class="grid cols-2">
      <div class="card fade-in">
        <h2>Add a beneficiary</h2>
        <p class="hint">Verified against a real Cloud Bank account number.</p>
        <label>Account number</label><input id="bn_number" placeholder="e.g. 48219047335" />
        <label>Nickname (optional)</label><input id="bn_nickname" placeholder="Mom, Landlord, ..." />
        <button class="btn" onclick="doAddBeneficiary()">Add</button>
        <div id="bn_msg"></div>
      </div>
      <div class="card fade-in"><h2>Your beneficiaries</h2><div id="bn_list"><div class="empty">Loading…</div></div></div>
    </div>
  `;
  loadBeneficiaries();
}
async function doAddBeneficiary() {
  const el = document.getElementById("bn_msg");
  try {
    const body = { user_id: currentUser.user_id, account_number: document.getElementById("bn_number").value, nickname: document.getElementById("bn_nickname").value };
    await api("/beneficiaries", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Added.</div>`; toast("Beneficiary added.");
    loadBeneficiaries();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadBeneficiaries() {
  const box = document.getElementById("bn_list");
  try {
    const list = await api(`/beneficiaries/user/${currentUser.user_id}`);
    box.innerHTML = list.length ? list.map(b => row(
      b.nickname, `<button class="btn ghost sm" onclick="doRemoveBeneficiary('${b.id}')">Remove</button>`, b.account_number
    )).join("") : `<div class="empty"><div class="big">No beneficiaries yet</div>Add someone you send money to often.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function doRemoveBeneficiary(id) {
  try { await api(`/beneficiaries/${id}`, { method: "DELETE" }); toast("Removed."); loadBeneficiaries(); }
  catch (e) { toast(e.message, false); }
}

/* ---------------- Statements ----------------
   Selecting your account is mandatory here: with no account there is
   nothing to run a statement against, so noAccountCard blocks the whole
   page (no partial/disabled form). Once you have an account, pick a
   quick time range instead of typing dates - "Today", "1 hr before",
   or "30 min before" (relative to right now). */
let stRange = "today";
async function renderStatements() {
  const main = document.getElementById("main");
  const mine = await myAccountOrNull();
  main.innerHTML = pageHeader("Statements", "Your account activity") + (mine ? `
    <div class="card fade-in">
      <h2>Statement for ${mine.account_number}</h2>
      <label>Time range</label>
      <div class="amount-quickpicks" id="st_range_picks">
        <button type="button" class="active" data-range="today" onclick="pickStatementRange('today')">Today</button>
        <button type="button" data-range="1h" onclick="pickStatementRange('1h')">1 hr before</button>
        <button type="button" data-range="30m" onclick="pickStatementRange('30m')">30 min before</button>
      </div>
      <div id="st_summary" style="margin:14px 0;"></div>
      <div id="st_list"><div class="empty">Loading…</div></div>
    </div>
  ` : noAccountCard("statements"));
  if (mine) { stRange = "today"; loadStatement(); }
}
function pickStatementRange(r) {
  stRange = r;
  document.querySelectorAll("#st_range_picks button").forEach(b => b.classList.toggle("active", b.dataset.range === r));
  loadStatement();
}
function statementRangeBounds(r) {
  const now = new Date();
  let from;
  if (r === "1h") from = new Date(now.getTime() - 60 * 60 * 1000);
  else if (r === "30m") from = new Date(now.getTime() - 30 * 60 * 1000);
  else from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // start of today
  return { from: from.toISOString(), to: now.toISOString() };
}
async function loadStatement() {
  const mine = cachedAccounts[0];
  const box = document.getElementById("st_list"), sum = document.getElementById("st_summary");
  try {
    const { from, to } = statementRangeBounds(stRange);
    const q = new URLSearchParams({ from_ts: from, to_ts: to });
    const s = await api(`/statements/${mine.account_id}?${q}`);
    sum.innerHTML = `<div class="split" style="gap:20px;">
      <div><div style="font-size:11px; color:var(--muted-2);">CREDITS</div><div class="amt pos" style="font-family:var(--mono);">+$${fmtMoney(s.total_credits)}</div></div>
      <div><div style="font-size:11px; color:var(--muted-2);">DEBITS</div><div class="amt neg" style="font-family:var(--mono);">−$${fmtMoney(s.total_debits)}</div></div>
      <div><div style="font-size:11px; color:var(--muted-2);">BALANCE</div><div style="font-family:var(--mono);">$${fmtMoney(s.current_balance)}</div></div>
    </div>`;
    box.innerHTML = s.lines.length ? s.lines.map(l => row(l.description, `<span class="amt ${l.amount<0?'neg':'pos'}" style="font-family:var(--mono);">${l.amount<0?'−':'+'}$${fmtMoney(Math.abs(l.amount))}</span>`, fmtWhen(l.date))).join("")
      : `<div class="empty">No activity in this period.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}

/* ---------------- Notifications ---------------- */
async function renderNotifications() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Notifications", "What's new") + `<div class="card fade-in"><div id="nt_list"><div class="empty">Loading…</div></div></div>`;
  loadNotifications();
}
async function loadNotifications() {
  const box = document.getElementById("nt_list");
  try {
    const items = await api(`/notifications/user/${currentUser.user_id}`);
    box.innerHTML = items.length ? items.map(n => row(
      `${n.read ? '' : '● '}${n.subject}`, n.read ? '' : `<button class="btn ghost sm" onclick="doMarkRead('${n.id}')">Mark read</button>`, `${n.message} · ${fmtWhen(n.created_at)}`
    )).join("") : `<div class="empty"><div class="big">All caught up</div>No notifications.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function doMarkRead(id) {
  try { await api(`/notifications/${id}/read`, { method: "PATCH" }); loadNotifications(); }
  catch (e) { toast(e.message, false); }
}

/* ---------------- KYC ---------------- */
async function renderKyc() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("KYC", "Identity verification") + `
    <div class="grid cols-2">
      <div class="card fade-in">
        <h2>Submit documents</h2>
        <label>Document type</label>
        <select id="kc_type"><option value="passport">Passport</option><option value="national_id">National ID</option><option value="drivers_license">Driver's license</option></select>
        <label>Document number</label><input id="kc_number" placeholder="e.g. X1234567" />
        <button class="btn" onclick="doSubmitKyc()">Submit</button>
        <div id="kc_msg"></div>
      </div>
      <div class="card fade-in"><h2>Your submissions</h2><div id="kc_list"><div class="empty">Loading…</div></div></div>
    </div>
  `;
  loadKyc();
}
async function doSubmitKyc() {
  const el = document.getElementById("kc_msg");
  try {
    const body = { user_id: currentUser.user_id, document_type: document.getElementById("kc_type").value, document_number: document.getElementById("kc_number").value };
    await api("/kyc/submit", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Submitted for review.</div>`; toast("KYC submitted.");
    loadKyc();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadKyc() {
  const box = document.getElementById("kc_list");
  try {
    const items = await api(`/kyc/user/${currentUser.user_id}`);
    box.innerHTML = items.length ? items.map(k => row(`${k.document_type.replace('_',' ')} · ${k.document_number}`, badge('', k.status), fmtWhen(k.created_at))).join("")
      : `<div class="empty"><div class="big">Not submitted yet</div>Verify your identity to unlock full limits.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}

/* ---------------- Fixed Deposits ---------------- */
async function renderFixedDeposits() {
  const main = document.getElementById("main");
  const mine = await myAccountOrNull();
  main.innerHTML = pageHeader("Fixed Deposits", "Lock in a rate") + (mine ? `
    <div class="grid cols-2">
      <div class="card fade-in">
        <h2>Open a fixed deposit</h2>
        <p class="hint">6.5% p.a. · balance $${fmtMoney(mine.balance)}</p>
        <label>Principal</label><input id="fd_principal" type="number" min="1" step="0.01" placeholder="5000" />
        <label>Tenure (months)</label><input id="fd_tenure" type="number" min="1" max="120" value="12" />
        <button class="btn" onclick="doOpenFd()">Open FD</button>
        <div id="fd_msg"></div>
      </div>
      <div class="card fade-in"><h2>Your fixed deposits</h2><div id="fd_list"><div class="empty">Loading…</div></div></div>
    </div>
  ` : noAccountCard("fixed deposits"));
  if (mine) loadFds();
}
async function doOpenFd() {
  const el = document.getElementById("fd_msg");
  try {
    const body = { user_id: currentUser.user_id, account_id: cachedAccounts[0].account_id, principal: Number(document.getElementById("fd_principal").value), tenure_months: Number(document.getElementById("fd_tenure").value) };
    const fd = await api("/fixed-deposits", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Opened. Matures ${fd.maturity_date} at $${fmtMoney(fd.maturity_amount)}.</div>`; toast("FD opened.");
    loadFds(); loadAccountsSilently();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadFds() {
  const box = document.getElementById("fd_list");
  try {
    const fds = await api(`/fixed-deposits/user/${currentUser.user_id}`);
    box.innerHTML = fds.length ? fds.map(f => row(
      `$${fmtMoney(f.principal)} → $${fmtMoney(f.maturity_amount)}`,
      `${badge('', f.status)}${f.status === 'active' ? ` <button class="btn ghost sm" onclick="doCloseFd('${f.id}')">Close</button>` : ''}`,
      `Matures ${f.maturity_date}`
    )).join("") : `<div class="empty"><div class="big">No FDs yet</div>Open your first one.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function doCloseFd(id) {
  try { const fd = await api(`/fixed-deposits/${id}/close`, { method: "PATCH" }); toast(`Closed · paid out $${fmtMoney(fd.payout_amount)}.`); loadFds(); loadAccountsSilently(); }
  catch (e) { toast(e.message, false); }
}

/* ---------------- Cheques ----------------
   Issuing a cheque now optionally asks for the payee's VeeraBank account
   number. If given, clearing the cheque actually moves the money into
   that account (atomically) instead of just debiting the issuer into
   the void — see backend/services/cheques. */
async function renderCheques() {
  const main = document.getElementById("main");
  const mine = await myAccountOrNull();
  main.innerHTML = pageHeader("Cheques", "Issue & clear") + (mine ? `
    <div class="grid cols-2">
      <div class="card fade-in">
        <h2>Issue a cheque</h2>
        <p class="hint">Funds only leave your account once it's cleared.</p>
        <label>Payee name</label><input id="ch_payee" placeholder="Payee name" />
        <label>Payee's account number (optional)</label><input id="ch_payee_account" placeholder="e.g. 48219047335 — leave blank if they're not a Cloud Bank customer" />
        <label>Amount</label><input id="ch_amount" type="number" min="0.01" step="0.01" placeholder="0.00" />
        <button class="btn" onclick="doIssueCheque()">Issue</button>
        <div id="ch_msg"></div>
      </div>
      <div class="card fade-in"><h2>Your cheques</h2><div id="ch_list"><div class="empty">Loading…</div></div></div>
    </div>
  ` : noAccountCard("cheques"));
  if (mine) loadCheques();
}
async function doIssueCheque() {
  const el = document.getElementById("ch_msg");
  try {
    const body = {
      user_id: currentUser.user_id,
      account_id: cachedAccounts[0].account_id,
      payee_name: document.getElementById("ch_payee").value,
      amount: Number(document.getElementById("ch_amount").value),
    };
    const payeeAccount = document.getElementById("ch_payee_account").value.trim();
    if (payeeAccount) body.payee_account_number = payeeAccount;
    const c = await api("/cheques/issue", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Cheque #${c.cheque_number} issued.</div>`; toast("Cheque issued.");
    loadCheques();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadCheques() {
  const box = document.getElementById("ch_list");
  try {
    const items = await api(`/cheques/user/${currentUser.user_id}`);
    box.innerHTML = items.length ? items.map(c => row(
      `#${c.cheque_number} · ${c.payee_name} · $${fmtMoney(c.amount)}${c.payee_account_id ? ' <span class="badge">to account</span>' : ''}`,
      `${badge('', c.status)}${c.status === 'issued' ? ` <button class="btn ghost sm" onclick="doClearCheque('${c.id}')">Clear</button>` : ''}`,
      fmtWhen(c.created_at)
    )).join("") : `<div class="empty"><div class="big">No cheques yet</div>Issue your first one.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function doClearCheque(id) {
  try { const c = await api(`/cheques/${id}/clear`, { method: "PATCH" }); toast(c.status === 'cleared' ? "Cheque cleared." : "Cheque bounced - insufficient funds."); loadCheques(); loadAccountsSilently(); }
  catch (e) { toast(e.message, false); }
}

/* ---------------- Disputes ---------------- */
async function renderDisputes() {
  const main = document.getElementById("main");
  const mine = await myAccountOrNull();
  let options = "";
  if (mine) {
    try { const transfers = await api(`/transfers/account/${mine.account_id}`); options = transfers.map(t => `<option value="${t.id}">${fmtWhen(t.created_at)} · $${fmtMoney(t.amount)}</option>`).join(""); } catch (e) {}
  }
  main.innerHTML = pageHeader("Disputes", "Flag a transfer") + `
    <div class="grid cols-2">
      <div class="card fade-in">
        <h2>Raise a dispute</h2>
        <label>Transfer</label><select id="ds_transfer">${options || '<option value="">No transfers yet</option>'}</select>
        <label>Reason</label><input id="ds_reason" placeholder="Didn't authorize this" />
        <button class="btn" onclick="doRaiseDispute()">Submit</button>
        <div id="ds_msg"></div>
      </div>
      <div class="card fade-in"><h2>Your disputes</h2><div id="ds_list"><div class="empty">Loading…</div></div></div>
    </div>
  `;
  loadDisputes();
}
async function doRaiseDispute() {
  const el = document.getElementById("ds_msg");
  try {
    const transferId = document.getElementById("ds_transfer").value;
    if (!transferId) throw new Error("No transfer selected.");
    const body = { user_id: currentUser.user_id, transfer_id: transferId, reason: document.getElementById("ds_reason").value };
    await api("/disputes", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Dispute filed.</div>`; toast("Dispute filed.");
    loadDisputes();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadDisputes() {
  const box = document.getElementById("ds_list");
  try {
    const items = await api(`/disputes/user/${currentUser.user_id}`);
    box.innerHTML = items.length ? items.map(d => row(d.reason, badge('', d.status), fmtWhen(d.created_at))).join("")
      : `<div class="empty"><div class="big">No disputes</div>Nothing flagged.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}

/* ---------------- Audit Log (staff-facing feed) ---------------- */
async function renderAuditLog() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Audit Log", "Bank-wide activity trail") + `<div class="card fade-in"><div id="al_list"><div class="empty">Loading…</div></div></div>`;
  try {
    const items = await api(`/audit-log/all`);
    document.getElementById("al_list").innerHTML = items.length ? items.map(a => row(a.action.replace(/_/g,' '), '', `${fmtWhen(a.created_at)} · ${JSON.stringify(a.details)}`)).join("")
      : `<div class="empty">Nothing logged yet.</div>`;
  } catch (e) { document.getElementById("al_list").innerHTML = `<div class="empty">${e.message}</div>`; }
}

/* ---------------- Fraud Detection (staff-facing) ---------------- */
async function renderFraudDetection() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Fraud Detection", "Auto-flagged transfers") + `<div class="card fade-in"><div id="fr_list"><div class="empty">Loading…</div></div></div>`;
  loadFraudFlags();
}
async function loadFraudFlags() {
  try {
    const items = await api(`/fraud-detection/flags`);
    document.getElementById("fr_list").innerHTML = items.length ? items.map(f => row(
      `$${fmtMoney(f.amount)} · ${f.reason}`, `${badge('', f.status)}${f.status === 'open' ? ` <button class="btn ghost sm" onclick="doClearFlag('${f.id}')">Clear</button>` : ''}`, fmtWhen(f.created_at)
    )).join("") : `<div class="empty"><div class="big">No flags</div>Nothing suspicious yet.</div>`;
  } catch (e) { document.getElementById("fr_list").innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function doClearFlag(id) {
  try { await api(`/fraud-detection/flags/${id}/clear`, { method: "PATCH" }); toast("Flag cleared."); loadFraudFlags(); }
  catch (e) { toast(e.message, false); }
}

/* ---------------- Support Tickets ---------------- */
async function renderSupportTickets() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Support", "Get help") + `
    <div class="grid cols-2">
      <div class="card fade-in">
        <h2>Raise a ticket</h2>
        <label>Subject</label><input id="tk_subject" placeholder="Trouble with a transfer" />
        <label>Message</label><input id="tk_message" placeholder="Describe the issue" />
        <button class="btn" onclick="doCreateTicket()">Submit</button>
        <div id="tk_msg"></div>
      </div>
      <div class="card fade-in"><h2>Your tickets</h2><div id="tk_list"><div class="empty">Loading…</div></div></div>
    </div>
  `;
  loadTickets();
}
async function doCreateTicket() {
  const el = document.getElementById("tk_msg");
  try {
    const body = { user_id: currentUser.user_id, subject: document.getElementById("tk_subject").value, message: document.getElementById("tk_message").value };
    await api("/support-tickets", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Ticket opened.</div>`; toast("Ticket opened.");
    loadTickets();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadTickets() {
  const box = document.getElementById("tk_list");
  try {
    const items = await api(`/support-tickets/user/${currentUser.user_id}`);
    box.innerHTML = items.length ? items.map(t => row(
      t.subject, badge('', t.status), (t.messages||[]).map(m => `${m.from_staff ? 'Staff' : 'You'}: ${m.message}`).join(' · ')
    )).join("") : `<div class="empty"><div class="big">No tickets</div>You're all set.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}

/* ---------------- Rewards ---------------- */
async function renderRewards() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Rewards", "Points from banking") + `
    <div class="grid cols-2">
      <div class="card fade-in">
        <h2>Your balance</h2>
        <div id="rw_balance" style="font-family:var(--mono); font-size:28px; margin:10px 0;">…</div>
        <p class="hint">Earn 1 point per $100 transferred. Redeem below.</p>
        <label>Points to redeem</label><input id="rw_points" type="number" min="1" placeholder="100" />
        <button class="btn" onclick="doRedeem()">Redeem</button>
        <div id="rw_msg"></div>
      </div>
      <div class="card fade-in"><h2>History</h2><div id="rw_list"><div class="empty">Loading…</div></div></div>
    </div>
  `;
  loadRewards();
}
async function loadRewards() {
  try {
    const bal = await api(`/rewards/user/${currentUser.user_id}/balance`);
    document.getElementById("rw_balance").textContent = `${bal.points_balance} pts`;
    const items = await api(`/rewards/user/${currentUser.user_id}`);
    document.getElementById("rw_list").innerHTML = items.length ? items.map(r => row(
      r.description, `<span class="amt ${r.kind==='earn'?'pos':'neg'}">${r.kind==='earn'?'+':'−'}${r.points}</span>`, fmtWhen(r.created_at)
    )).join("") : `<div class="empty">No activity yet.</div>`;
  } catch (e) { document.getElementById("rw_list").innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function doRedeem() {
  const el = document.getElementById("rw_msg");
  try {
    const body = { user_id: currentUser.user_id, points: Number(document.getElementById("rw_points").value) };
    await api("/rewards/redeem", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Redeemed.</div>`; toast("Redeemed.");
    loadRewards();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}

/* ---------------- Admin console (staff, cross-service overview + approvals) ---------------- */
async function renderAdmin() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Admin", "Staff console") + `
    <div class="grid cols-3" id="ad_overview"><div class="empty">Loading…</div></div>
    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card fade-in"><h2>Pending loans</h2><div id="ad_loans"><div class="empty">Loading…</div></div></div>
      <div class="card fade-in"><h2>Pending KYC</h2><div id="ad_kyc"><div class="empty">Loading…</div></div></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px;">
      <div class="card fade-in"><h2>Open tickets</h2><div id="ad_tickets"><div class="empty">Loading…</div></div></div>
      <div class="card fade-in"><h2>Open disputes</h2><div id="ad_disputes"><div class="empty">Loading…</div></div></div>
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
    document.getElementById("ad_loans").innerHTML = loans.length ? loans.map(l => row(`$${fmtMoney(l.principal)} · ${l.purpose||''}`,
      `<button class="btn ghost sm" onclick="doApproveLoan('${l.id}')">Approve</button> <button class="btn ghost sm" onclick="doRejectLoan('${l.id}')">Reject</button>`)).join("")
      : `<div class="empty">Nothing pending.</div>`;
  } catch (e) { document.getElementById("ad_loans").innerHTML = `<div class="empty">${e.message}</div>`; }
  try {
    const kyc = await api("/kyc/pending");
    document.getElementById("ad_kyc").innerHTML = kyc.length ? kyc.map(k => row(`${k.document_type.replace('_',' ')} · ${k.document_number}`,
      `<button class="btn ghost sm" onclick="doVerifyKyc('${k.id}')">Verify</button> <button class="btn ghost sm" onclick="doRejectKyc('${k.id}')">Reject</button>`)).join("")
      : `<div class="empty">Nothing pending.</div>`;
  } catch (e) { document.getElementById("ad_kyc").innerHTML = `<div class="empty">${e.message}</div>`; }
  try {
    const tickets = await api("/support-tickets/open");
    document.getElementById("ad_tickets").innerHTML = tickets.length ? tickets.map(t => row(t.subject,
      `<button class="btn ghost sm" onclick="doCloseTicket('${t.id}')">Close</button>`)).join("") : `<div class="empty">Nothing open.</div>`;
  } catch (e) { document.getElementById("ad_tickets").innerHTML = `<div class="empty">${e.message}</div>`; }
  try {
    const disputes = await api("/disputes/open");
    document.getElementById("ad_disputes").innerHTML = disputes.length ? disputes.map(d => row(d.reason,
      `<button class="btn ghost sm" onclick="doResolveDispute('${d.id}')">Resolve</button>`)).join("") : `<div class="empty">Nothing open.</div>`;
  } catch (e) { document.getElementById("ad_disputes").innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function doApproveLoan(id) { try { await api(`/loans/${id}/approve`, { method: "PATCH" }); toast("Loan approved."); loadAdmin(); } catch (e) { toast(e.message, false); } }
async function doRejectLoan(id) { try { await api(`/loans/${id}/reject`, { method: "PATCH" }); toast("Loan rejected."); loadAdmin(); } catch (e) { toast(e.message, false); } }
async function doVerifyKyc(id) { try { await api(`/kyc/${id}/verify`, { method: "PATCH" }); toast("KYC verified."); loadAdmin(); } catch (e) { toast(e.message, false); } }
async function doRejectKyc(id) { try { await api(`/kyc/${id}/reject`, { method: "PATCH", body: JSON.stringify({reason:"Documents did not pass verification"}) }); toast("KYC rejected."); loadAdmin(); } catch (e) { toast(e.message, false); } }
async function doCloseTicket(id) { try { await api(`/support-tickets/${id}/close`, { method: "PATCH" }); toast("Ticket closed."); loadAdmin(); } catch (e) { toast(e.message, false); } }
async function doResolveDispute(id) { try { await api(`/disputes/${id}/resolve`, { method: "PATCH", body: JSON.stringify({resolution_note:"Resolved by staff"}) }); toast("Dispute resolved."); loadAdmin(); } catch (e) { toast(e.message, false); } }

/* ---------------- Reports (bank-wide analytics) ---------------- */
async function renderReports() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Reports", "Bank-wide analytics") + `<div class="grid cols-3" id="rp_grid"><div class="empty">Loading…</div></div>`;
  try {
    const r = await api("/reports/summary");
    document.getElementById("rp_grid").innerHTML = [
      ["Total accounts", r.total_accounts], ["Total balance", "$" + fmtMoney(r.total_balance_across_bank)],
      ["Total transfers", r.total_transfers], ["Transfer volume", "$" + fmtMoney(r.total_transfer_volume)],
      ["Avg transfer", "$" + fmtMoney(r.average_transfer_amount)], ["Largest balance", "$" + fmtMoney(r.largest_account_balance)],
    ].map(([l,v]) => `<div class="card fade-in stat-tile"><div class="label">${l.toUpperCase()}</div><div class="value">${v}</div></div>`).join("");
  } catch (e) { document.getElementById("rp_grid").innerHTML = `<div class="empty">${e.message}</div>`; }
}

/* ---------------- Services hub (directory of the 16 pages above) ---------------- */
const SERVICE_PAGES = {
  cards: renderCards, loans: renderLoans, payments: renderPayments, beneficiaries: renderBeneficiaries,
  statements: renderStatements, notifications: renderNotifications, kyc: renderKyc, "fixed-deposits": renderFixedDeposits,
  cheques: renderCheques, disputes: renderDisputes, "audit-log": renderAuditLog, "fraud-detection": renderFraudDetection,
  "support-tickets": renderSupportTickets, rewards: renderRewards, admin: renderAdmin, reports: renderReports,
};
function renderServices() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Services", "Every Cloud Bank feature") + `
    <div class="grid cols-3">
      ${GENERIC_SERVICES.map(s => `
        <button class="card fade-in svc-tile" onclick="currentTab='${s}'; render();">
          <div class="icon">${SERVICE_ICONS[s] || "◆"}</div>
          <h2>${s.replace('-',' ')}</h2>
          <p class="hint">Open ${s.replace('-',' ')}</p>
        </button>
      `).join("")}
    </div>
  `;
}
