/* ---------------- Fixed Deposits — growth gauge cards ---------------- */
async function renderFixedDeposits() {
  const main = document.getElementById("main");
  const mine = await myAccountOrNull();
  main.innerHTML = pageHeader("Fixed Deposits", "Lock in a rate") + (mine ? `
    <div class="card fade-in">
      <h2>Open a fixed deposit</h2>
      <p class="hint">6.5% p.a. · balance $${fmtMoney(mine.balance)}</p>
      <div class="grid cols-2" style="gap:12px;">
        <div><label>Principal</label><input id="fd_principal" type="number" min="1" step="0.01" placeholder="5000" /></div>
        <div><label>Tenure (months)</label><input id="fd_tenure" type="number" min="1" max="120" value="12" /></div>
      </div>
      <button class="btn" onclick="doOpenFd()">Open FD</button>
      <div id="fd_msg"></div>
    </div>
    <div class="section-title">Your fixed deposits</div>
    <div id="fd_list"><div class="empty">Loading…</div></div>
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
    box.innerHTML = fds.length ? fds.map(f => {
      const growthPct = Math.min(100, Math.round(((f.maturity_amount - f.principal) / f.principal) * 100 * 4));
      return `
      <div class="fd-card fade-in" style="margin-bottom:12px;">
        <div class="gauge" style="width:82px; height:82px; background:conic-gradient(var(--accent) ${growthPct*3.6}deg, var(--panel) 0deg);">
          <div class="hole" style="width:60px; height:60px;"><div class="v" style="font-size:13px;">+${((f.maturity_amount-f.principal)/f.principal*100).toFixed(1)}%</div></div>
        </div>
        <div class="meta">
          <div class="amt-row">$${fmtMoney(f.principal)} → $${fmtMoney(f.maturity_amount)}</div>
          <div class="sub">Matures ${f.maturity_date} ${badge('', f.status)}</div>
        </div>
        ${f.status === 'active' ? `<button class="btn ghost sm" onclick="doCloseFd('${f.id}')">Close</button>` : ''}
      </div>
    `;}).join("") : `<div class="empty"><div class="big">No FDs yet</div>Open your first one above.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function doCloseFd(id) {
  try { const fd = await api(`/fixed-deposits/${id}/close`, { method: "PATCH" }); toast(`Closed · paid out $${fmtMoney(fd.payout_amount)}.`); loadFds(); loadAccountsSilently(); }
  catch (e) { toast(e.message, false); }
}
