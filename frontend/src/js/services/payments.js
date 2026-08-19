/* ---------------- Payments — category tile picker + proper row table ---------------- */
let pmCategory = "utility";
let pmCache = {};
const PM_ICONS = { utility:"⚡", phone:"☎", credit_card:"◈", other:"◆" };
async function renderPayments() {
  const main = document.getElementById("main");
  const mine = await myAccountOrNull();
  main.innerHTML = pageHeader("Payments", "Pay a bill") + (mine ? `
    <div class="grid cols-2">
      <div class="card fade-in">
        <h2>Pay a bill</h2>
        <p class="hint">Balance $${fmtMoney(mine.balance)}</p>
        <label>Category</label>
        <div class="tile-picker" id="pm_tiles">
          ${Object.keys(PM_ICONS).map(c => `<button type="button" class="${c===pmCategory?'active':''}" data-c="${c}" onclick="pickPmCategory('${c}')"><span class="ic">${PM_ICONS[c]}</span>${c.replace('_',' ')}</button>`).join("")}
        </div>
        <label>Payee</label><input id="pm_payee" placeholder="Acme Electric" />
        <label>Amount</label><input id="pm_amount" type="number" min="0.01" step="0.01" placeholder="0.00" />
        <button class="btn" onclick="doPay()">Pay</button>
        <div id="pm_msg"></div>
      </div>
      <div class="card fade-in">
        <h2>Payment history</h2>
        <p class="hint">Click any row for the full breakdown.</p>
        <div id="pm_list"><div class="empty">Loading…</div></div>
      </div>
    </div>
  ` : noAccountCard("payments"));
  if (mine) loadPayments();
}
function pickPmCategory(c) {
  pmCategory = c;
  document.querySelectorAll("#pm_tiles button").forEach(b => b.classList.toggle("active", b.dataset.c === c));
}
async function doPay() {
  const el = document.getElementById("pm_msg");
  try {
    const body = { user_id: currentUser.user_id, account_id: cachedAccounts[0].account_id, payee_name: document.getElementById("pm_payee").value,
      category: pmCategory, amount: Number(document.getElementById("pm_amount").value) };
    await api("/payments", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Payment sent.</div>`; toast("Payment sent.");
    loadPayments(); loadAccountsSilently();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadPayments() {
  const box = document.getElementById("pm_list");
  try {
    const payments = await api(`/payments/user/${currentUser.user_id}`);
    pmCache = Object.fromEntries(payments.map(p => [p.id, p]));
    box.innerHTML = payments.length ? `
      <table class="ledger">
        <thead><tr><th>Payee</th><th>Category</th><th>Amount</th><th>When</th></tr></thead>
        <tbody>
          ${payments.map(p => `
            <tr class="clickable" onclick="openPaymentDetail('${p.id}')">
              <td><div class="tcell"><span style="font-size:16px;">${PM_ICONS[p.category]||'◆'}</span><span style="font-weight:600;">${p.payee_name}</span></div></td>
              <td><span class="badge">${p.category.replace('_',' ')}</span></td>
              <td class="amt neg">−$${fmtMoney(p.amount)}</td>
              <td class="when">${fmtWhen(p.created_at)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    ` : `<div class="empty"><div class="big">No payments yet</div>Pay your first bill.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
function openPaymentDetail(id) {
  const p = pmCache[id];
  if (!p) return;
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.id = "payment-detail-backdrop";
  wrap.onclick = (e) => { if (e.target === wrap) wrap.remove(); };
  const rows = [
    ["Payee", p.payee_name],
    ["Category", p.category.replace("_"," ")],
    ["Amount", `$${fmtMoney(p.amount)}`],
    ["Status", p.status],
    ["Payment ID", p.id],
    ["Date & time", fmtWhen(p.created_at)],
    ["Paid from account", cachedAccounts[0]?.account_number || "—"],
  ];
  wrap.innerHTML = `
    <div class="modal fade-in">
      <button class="modal-close" onclick="document.getElementById('payment-detail-backdrop').remove()">✕</button>
      <div style="text-align:center; margin-bottom:6px;">
        <div style="font-size:30px;">${PM_ICONS[p.category]||'◆'}</div>
        <div class="pagetitle" style="font-size:20px; margin-top:6px;">${p.payee_name}</div>
        <div class="amt neg" style="font-family:var(--mono); font-size:22px; margin-top:6px;">−$${fmtMoney(p.amount)}</div>
      </div>
      <div style="margin-top:14px;">
        ${rows.map(([k,v]) => `<div class="split" style="justify-content:space-between; padding:9px 0; border-bottom:1px solid var(--line); font-size:12.5px;"><span style="color:var(--muted-2);">${k}</span><span style="font-weight:600; font-family:var(--mono);">${v}</span></div>`).join("")}
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  playModalIn("#payment-detail-backdrop");
}
