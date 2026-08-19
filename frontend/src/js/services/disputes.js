/* ---------------- Disputes — case files with resolution stepper ---------------- */
function disputeStepper(status) {
  const steps = ["Filed", "Investigating", status === "rejected" ? "Rejected" : "Resolved"];
  const stage = status === "open" ? 1 : 2;
  return `<div class="stepper">
    ${steps.map((s,i) => `<div class="stepper-step ${i < stage ? 'done' : (i === stage ? 'current' : '')}">${i>0?'<div class="stepper-line"></div>':''}<div class="node">${i<stage?'✓':i+1}</div><div class="lbl">${s}</div></div>`).join("")}
  </div>`;
}
async function renderDisputes() {
  const main = document.getElementById("main");
  const mine = await myAccountOrNull();
  let options = "";
  if (mine) {
    try { const transfers = await api(`/transfers/account/${mine.account_id}`); options = transfers.map(t => `<option value="${t.id}">${fmtWhen(t.created_at)} · $${fmtMoney(t.amount)}</option>`).join(""); } catch (e) {}
  }
  main.innerHTML = pageHeader("Disputes", "Flag a transfer") + `
    <div class="card fade-in">
      <h2>Raise a dispute</h2>
      <div class="grid cols-2" style="gap:12px;">
        <div><label>Transfer</label><select id="ds_transfer">${options || '<option value="">No transfers yet</option>'}</select></div>
        <div><label>Reason</label><input id="ds_reason" placeholder="Didn't authorize this" /></div>
      </div>
      <button class="btn" onclick="doRaiseDispute()">Submit</button>
      <div id="ds_msg"></div>
    </div>
    <div class="section-title">Your case files</div>
    <div id="ds_list"><div class="empty">Loading…</div></div>
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
    box.innerHTML = items.length ? items.map((d,i) => `
      <div class="case-file fade-in">
        <div class="cf-head"><div><div class="cf-id">CASE-${String(i+1).padStart(4,'0')}</div><div style="font-weight:700; font-size:13.5px; margin-top:2px;">${d.reason}</div></div>${badge('', d.status)}</div>
        ${disputeStepper(d.status)}
      </div>
    `).join("") : `<div class="empty"><div class="big">No disputes</div>Nothing flagged.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
