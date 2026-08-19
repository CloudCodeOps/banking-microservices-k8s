/* ---------------- Accounts ----------------
   Cloud Bank is one person, one name, one account: this page either shows
   the account you already have, or - if you don't have one yet - a form
   to open your only account. owner_name is never typed in; the account
   service fetches it straight from your registered user record. */
async function renderAccounts() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Accounts", "Your account") + `
    <div class="grid cols-2">
      <div class="card fade-in" id="a_panel"><div class="empty">Loading…</div></div>
      <div class="card fade-in">
        <h2>How it works</h2>
        <p class="hint">Every Cloud Bank customer gets exactly one account, opened under the one name they registered with. Money only ever moves between accounts through a real transfer — see the Transfers page.</p>
      </div>
    </div>
  `;
  loadAccounts();
}
async function doCreateAccount() {
  const el = document.getElementById("a_msg");
  try {
    const body = {
      user_id: currentUser.user_id,
      account_type: document.getElementById("a_type").value,
      opening_balance: Number(document.getElementById("a_balance").value || 0),
    };
    await api("/accounts", { method: "POST", body: JSON.stringify(body) });
    toast("Account opened.");
    loadAccounts();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadAccounts() {
  const panel = document.getElementById("a_panel");
  try {
    const accounts = await fetchMyAccounts();
    cachedAccounts = accounts;
    if (!accounts.length) {
      panel.innerHTML = `
        <h2>Open your account</h2>
        <p class="hint">Savings or current, funded immediately with an opening balance. One per customer.</p>
        <label>Account type</label>
        <select id="a_type"><option value="savings">Savings</option><option value="current">Current</option></select>
        <label>Opening balance</label><input id="a_balance" type="number" min="0" step="0.01" value="0" />
        <button class="btn" onclick="doCreateAccount()">Open account</button>
        <div id="a_msg"></div>
      `;
      return;
    }
    const a = accounts[0];
    panel.innerHTML = `
      <h2>Your account</h2>
      <p class="hint">Share your account number (not the internal ID) with anyone sending you money.</p>
      <div style="padding:14px 0; border-bottom:1px solid var(--line);">
        <div style="font-size:12px; color:var(--muted-2); letter-spacing:.4px;">ACCOUNT NUMBER</div>
        <div class="idcell" style="cursor:pointer; font-size:16px; margin-top:3px;" onclick="navigator.clipboard.writeText('${a.account_number}'); toast('Account number copied.')">${a.account_number}</div>
      </div>
      <div style="padding:14px 0; border-bottom:1px solid var(--line);">
        <div style="font-size:13px; font-weight:600;">${a.owner_name} <span class="badge">${a.account_type}</span></div>
        <div style="font-size:11px; color:var(--muted-2); margin-top:3px;">Opened ${fmtWhen(a.created_at)}</div>
      </div>
      <div style="padding:14px 0;">
        <div style="font-size:12px; color:var(--muted-2);">BALANCE</div>
        <div class="amt" style="font-family:var(--mono); font-size:22px; margin-top:3px;">$${fmtMoney(a.balance)}</div>
      </div>
    `;
  } catch (e) { toast(e.message, false); }
}
