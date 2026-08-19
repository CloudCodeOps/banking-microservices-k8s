/* ---------------- Reports — KPI tiles + bar chart ---------------- */
async function renderReports() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Reports", "Bank-wide analytics") + `
    <div class="kpi-row" id="rp_kpis"><div class="empty">Loading…</div></div>
    <div class="chart-card fade-in">
      <h2>Transfer volume snapshot</h2>
      <p class="hint">Relative scale across key metrics.</p>
      <div class="chart-bars" id="rp_chart"></div>
    </div>
  `;
  try {
    const r = await api("/reports/summary");
    document.getElementById("rp_kpis").innerHTML = [
      ["Total accounts", r.total_accounts], ["Total balance", "$" + fmtMoney(r.total_balance_across_bank)], ["Total transfers", r.total_transfers],
    ].map(([l,v]) => `<div class="card fade-in stat-tile"><div class="label">${l.toUpperCase()}</div><div class="value">${v}</div></div>`).join("");
    const metrics = [
      ["Volume", Number(r.total_transfer_volume)], ["Avg transfer", Number(r.average_transfer_amount)], ["Largest balance", Number(r.largest_account_balance)],
    ];
    const max = Math.max(...metrics.map(m => m[1]), 1);
    document.getElementById("rp_chart").innerHTML = metrics.map(([l,v]) => `
      <div class="bar-col"><div class="bar" style="height:${Math.max(6, Math.round((v/max)*120))}px" title="$${fmtMoney(v)}"></div><div class="bar-lbl">${l}<br/>$${fmtMoney(v)}</div></div>
    `).join("");
  } catch (e) { document.getElementById("rp_kpis").innerHTML = `<div class="empty">${e.message}</div>`; }
}
