/* ---------------- Loans — application stepper + repayment timeline ---------------- */
function loanStepper(status) {
  const steps = ["Applied", "Review", status === "rejected" ? "Rejected" : "Disbursed"];
  const stage = status === "pending" ? 1 : 2;
  return `<div class="stepper" style="margin:10px 0 0;">
    ${steps.map((s,i) => `
      <div class="stepper-step ${i < stage ? 'done' : (i === stage ? 'current' : '')}">
        ${i > 0 ? '<div class="stepper-line"></div>' : ''}
        <div class="node">${i < stage ? '✓' : i+1}</div>
        <div class="lbl">${s}</div>
      </div>
    `).join("")}
  </div>`;
}
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
      <div class="card fade-in"><h2>Application stages</h2><p class="hint">Every loan moves through the same pipeline.</p>${loanStepper("pending")}</div>
    </div>
    <div class="section-title">Your loans</div>
    <div id="ln_list"><div class="empty">Loading…</div></div>
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
    box.innerHTML = loans.length ? loans.map(l => `
      <div class="card fade-in timeline-card" style="margin-bottom:14px;">
        <div class="split" style="justify-content:space-between;">
          <div>
            <div style="font-family:var(--display); font-size:16px; font-weight:600;">$${fmtMoney(l.principal)} · ${l.tenure_months}mo</div>
            <div class="hint" style="margin:2px 0 0;">${l.purpose || 'No purpose given'} · EMI $${fmtMoney(l.monthly_emi)}/mo</div>
          </div>
          ${badge('', l.status)}
        </div>
        ${loanStepper(l.status)}
        <div class="emi-bar"><i style="width:${l.status==='active'?100:l.status==='rejected'?100:33}%; ${l.status==='rejected'?'background:var(--danger)':''}"></i></div>
      </div>
    `).join("") : `<div class="empty"><div class="big">No loans yet</div>Apply for your first one above.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
