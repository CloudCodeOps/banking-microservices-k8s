/* ---------------- KYC — verification gauge + document checklist ---------------- */
async function renderKyc() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("KYC", "Identity verification") + `
    <div class="grid cols-2">
      <div class="card fade-in" style="text-align:center;">
        <h2>Verification status</h2>
        <div id="kc_gauge" style="margin-top:14px;"><div class="empty">Loading…</div></div>
      </div>
      <div class="card fade-in">
        <h2>Submit a document</h2>
        <label>Document type</label>
        <select id="kc_type"><option value="passport">Passport</option><option value="national_id">National ID</option><option value="drivers_license">Driver's license</option></select>
        <label>Document number</label><input id="kc_number" placeholder="e.g. X1234567" />
        <button class="btn" onclick="doSubmitKyc()">Submit</button>
        <div id="kc_msg"></div>
      </div>
    </div>
    <div class="section-title">Your submissions</div>
    <div class="checklist" id="kc_list"><div class="empty">Loading…</div></div>
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
  const gauge = document.getElementById("kc_gauge");
  try {
    const items = await api(`/kyc/user/${currentUser.user_id}`);
    const verified = items.some(k => k.status === "verified");
    const pending = items.some(k => k.status === "pending_review");
    const pct = verified ? 100 : pending ? 50 : 0;
    gauge.innerHTML = `
      <div class="gauge" style="background:conic-gradient(var(--accent) ${pct*3.6}deg, var(--panel) 0deg);">
        <div class="hole"><div class="v">${pct}%</div><div class="l">${verified?'Verified':pending?'In review':'Not started'}</div></div>
      </div>
    `;
    box.innerHTML = items.length ? items.map(k => `
      <div class="checklist-item ${k.status==='verified' ? 'done' : ''}">
        <div class="chk">${k.status==='verified' ? '✓' : ''}</div>
        <div style="flex:1;"><div style="font-weight:700; font-size:12.5px; text-transform:capitalize;">${k.document_type.replace('_',' ')}</div><div class="hint" style="margin:2px 0 0;">${k.document_number} · ${fmtWhen(k.created_at)}</div></div>
        ${badge('', k.status)}
      </div>
    `).join("") : `<div class="empty"><div class="big">Not submitted yet</div>Verify your identity to unlock full limits.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
