/* ---------------- Fraud Detection — radar + alert cards ---------------- */
async function renderFraudDetection() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Fraud Detection", "Auto-flagged transfers") + `
    <div class="radar-wrap"><div class="radar"><div class="radar-sweep"></div><div class="radar-count" id="fr_count"><div class="n">…</div><div class="l">open flags</div></div></div></div>
    <div id="fr_list"><div class="empty">Loading…</div></div>
  `;
  loadFraudFlags();
}
async function loadFraudFlags() {
  try {
    const items = await api(`/fraud-detection/flags`);
    const open = items.filter(f => f.status === 'open').length;
    document.getElementById("fr_count").innerHTML = `<div class="n">${open}</div><div class="l">open flags</div>`;
    document.getElementById("fr_list").innerHTML = items.length ? items.map(f => `
      <div class="alert-card fade-in">
        <div class="split" style="justify-content:space-between;">
          <div><div style="font-weight:700; font-size:13.5px;">$${fmtMoney(f.amount)}</div><div class="hint" style="margin:2px 0 0;">${f.reason} · ${fmtWhen(f.created_at)}</div></div>
          <div class="split">${badge('', f.status)}${f.status === 'open' ? `<button class="btn ghost sm" onclick="doClearFlag('${f.id}')">Clear</button>` : ''}</div>
        </div>
      </div>
    `).join("") : `<div class="empty"><div class="big">No flags</div>Nothing suspicious yet.</div>`;
  } catch (e) { document.getElementById("fr_list").innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function doClearFlag(id) {
  try { await api(`/fraud-detection/flags/${id}/clear`, { method: "PATCH" }); toast("Flag cleared."); loadFraudFlags(); }
  catch (e) { toast(e.message, false); }
}
