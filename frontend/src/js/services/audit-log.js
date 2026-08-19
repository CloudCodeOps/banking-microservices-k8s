/* ---------------- Audit Log — live terminal console ---------------- */
async function renderAuditLog() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Audit Log", "Bank-wide activity trail") + `<div class="terminal fade-in" id="al_list"><div class="empty">Loading…</div></div>`;
  try {
    const items = await api(`/audit-log/all`);
    document.getElementById("al_list").innerHTML = items.length ? items.map(a => `
      <div class="terminal-line"><span class="ts">[${fmtWhen(a.created_at)}]</span><span class="act">${a.action.replace(/_/g,' ')}</span><span class="det">${JSON.stringify(a.details)}</span></div>
    `).join("") + `<div class="terminal-line"><span class="ts">$</span><span class="terminal-cursor"></span></div>`
      : `<div class="empty">Nothing logged yet.</div>`;
  } catch (e) { document.getElementById("al_list").innerHTML = `<div class="empty">${e.message}</div>`; }
}
