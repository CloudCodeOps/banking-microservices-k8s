/* ---------------- Transactions — stat tiles, segmented control, filterable ledger ---------------- */
let txType = "deposit";
let txFilter = "all";
let txCache = [];

async function renderTransactions() {
  const main = document.getElementById("main");
  const mine = cachedAccounts[0];
  main.innerHTML = pageHeader("Transactions", "Post & review activity") + (mine ? `
    <div class="kpi-row" id="tx_kpis">
      <div class="card fade-in stat-tile"><div class="label">TOTAL DEPOSITED</div><div class="value" id="tx_kpi_dep">…</div></div>
      <div class="card fade-in stat-tile"><div class="label">TOTAL WITHDRAWN</div><div class="value" id="tx_kpi_wd">…</div></div>
      <div class="card fade-in stat-tile"><div class="label">NET MOVEMENT</div><div class="value" id="tx_kpi_net">…</div></div>
    </div>
    <div class="grid cols-2">
      <div class="card fade-in">
        <h2>New transaction</h2>
        <p class="hint">Posted instantly; balances update atomically.</p>
        <label>Type</label>
        <div class="tabs" style="margin-top:0;">
          <button class="${txType==='deposit'?'active':''}" onclick="setTxType('deposit')">Deposit</button>
          <button class="${txType==='withdrawal'?'active':''}" onclick="setTxType('withdrawal')">Withdrawal</button>
        </div>
        <label>Amount</label><input id="t_amount" type="number" min="0.01" step="0.01" placeholder="0.00" />
        <div class="amount-quickpicks" style="margin-top:8px;">
          ${[50,100,500,1000].map(v => `<button type="button" onclick="document.getElementById('t_amount').value=${v}">$${v}</button>`).join("")}
        </div>
        <button class="btn" onclick="doTransaction()">Submit transaction</button>
        <div id="t_msg"></div>
      </div>
      <div class="card fade-in">
        <h2>Ledger</h2>
        <p class="hint">Click any row for a downloadable receipt.</p>
        <div class="tabs" style="margin-top:0;">
          <button class="${txFilter==='all'?'active':''}" onclick="setTxFilter('all')">All</button>
          <button class="${txFilter==='deposit'?'active':''}" onclick="setTxFilter('deposit')">Deposits</button>
          <button class="${txFilter==='withdrawal'?'active':''}" onclick="setTxFilter('withdrawal')">Withdrawals</button>
        </div>
        <div id="t_history" style="margin-top:14px;"></div>
      </div>
    </div>
  ` : noAccountCard("transactions"));
  if (mine) loadTransactions();
}
function setTxType(t) { txType = t; render(); }
function setTxFilter(f) { txFilter = f; renderLedgerBox(); }

async function doTransaction() {
  const el = document.getElementById("t_msg");
  try {
    const mine = cachedAccounts[0];
    if (!mine) throw new Error("Open an account first.");
    const body = { account_id: mine.account_id, type: txType, amount: Number(document.getElementById("t_amount").value) };
    await api("/transactions", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Transaction posted.</div>`;
    toast("Transaction posted.");
    document.getElementById("t_amount").value = "";
    loadTransactions();
    loadAccountsSilently();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadTransactions() {
  const mine = cachedAccounts[0];
  if (!mine) return;
  try {
    const txns = await api(`/transactions/${mine.account_id}`);
    txCache = txns;
    const dep = txns.filter(t => t.type === "deposit").reduce((s,t) => s + Number(t.amount), 0);
    const wd = txns.filter(t => t.type === "withdrawal").reduce((s,t) => s + Number(t.amount), 0);
    if (document.getElementById("tx_kpi_dep")) {
      document.getElementById("tx_kpi_dep").textContent = "$" + fmtMoney(dep);
      document.getElementById("tx_kpi_wd").textContent = "$" + fmtMoney(wd);
      const netEl = document.getElementById("tx_kpi_net");
      netEl.textContent = (dep-wd >= 0 ? "+$" : "-$") + fmtMoney(Math.abs(dep-wd));
      netEl.style.color = dep-wd >= 0 ? "var(--ledger)" : "var(--danger)";
    }
    renderLedgerBox();
  } catch (e) {
    const box = document.getElementById("t_history");
    if (box) box.innerHTML = `<div class="empty">${e.message}</div>`;
  }
}
function renderLedgerBox() {
  const box = document.getElementById("t_history");
  if (!box) return;
  const rows = txFilter === "all" ? txCache : txCache.filter(t => t.type === txFilter);
  box.innerHTML = renderLedgerTable(rows, false, true);
}
