/* ---------------- Cheques — chequebook of real cheque leaves ----------------
   Payee's account number is required: a cheque must always name a real
   destination account so money actually lands somewhere when it clears
   (see backend/services/cheques — clear() moves money atomically). */
async function renderCheques() {
  const main = document.getElementById("main");
  const mine = await myAccountOrNull();
  main.innerHTML = pageHeader("Cheques", "Issue & clear") + (mine ? `
    <div class="card fade-in">
      <h2>Issue a cheque</h2>
      <p class="hint">Funds only leave your account once it's cleared. The payee must be a real Cloud Bank account.</p>
      <div class="grid cols-2" style="gap:12px;">
        <div><label>Payee name</label><input id="ch_payee" placeholder="Payee name" /></div>
        <div><label>Amount</label><input id="ch_amount" type="number" min="0.01" step="0.01" placeholder="0.00" /></div>
      </div>
      <label>Payee's account number <span style="color:var(--danger);">*</span></label>
      <input id="ch_payee_account" placeholder="e.g. 48219047335" required />
      <button class="btn" onclick="doIssueCheque()">Issue</button>
      <div id="ch_msg"></div>
    </div>
    <div class="section-title">Your chequebook</div>
    <div class="chequebook" id="ch_list"><div class="empty">Loading…</div></div>
  ` : noAccountCard("cheques"));
  if (mine) loadCheques();
}
async function doIssueCheque() {
  const el = document.getElementById("ch_msg");
  try {
    const payeeAccount = document.getElementById("ch_payee_account").value.trim();
    if (!payeeAccount) throw new Error("Payee's account number is required.");
    const body = {
      user_id: currentUser.user_id,
      account_id: cachedAccounts[0].account_id,
      payee_name: document.getElementById("ch_payee").value,
      amount: Number(document.getElementById("ch_amount").value),
      payee_account_number: payeeAccount,
    };
    const c = await api("/cheques/issue", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Cheque #${c.cheque_number} issued.</div>`; toast("Cheque issued.");
    loadCheques();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadCheques() {
  const box = document.getElementById("ch_list");
  try {
    const items = await api(`/cheques/user/${currentUser.user_id}`);
    box.innerHTML = items.length ? items.map(c => `
      <div class="cheque-leaf fade-in">
        <div class="cheque-top"><span>Cloud Bank · Pay to the order of</span><span>№ ${c.cheque_number}</span></div>
        <div class="cheque-pay-row"><span class="payee">${c.payee_name} <span class="badge">to account</span></span><span class="amt">$${fmtMoney(c.amount)}</span></div>
        <div class="cheque-bottom">
          <span class="cheque-number">Issued ${fmtWhen(c.created_at)}</span>
          <div class="split">${badge('', c.status)}${c.status === 'issued' ? `<button class="btn ghost sm" onclick="doClearCheque('${c.id}')">Clear</button>` : ''}</div>
        </div>
      </div>
    `).join("") : `<div class="empty"><div class="big">No cheques yet</div>Issue your first one above.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function doClearCheque(id) {
  try { const c = await api(`/cheques/${id}/clear`, { method: "PATCH" }); toast(c.status === 'cleared' ? "Cheque cleared." : "Cheque bounced - insufficient funds."); loadCheques(); loadAccountsSilently(); }
  catch (e) { toast(e.message, false); }
}
