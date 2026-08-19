/* ---------------- Statements — printed letterhead document ----------------
   Instead of a manual from/to date picker, the person jumps straight to a
   recent activity window via quick-period buttons (last 5 minutes, last
   1 hour 30 minutes, or everything). Selecting a period sends full
   ISO timestamps to the statements-service rather than day-granularity
   dates, so short windows actually narrow anything down. */
let statementPeriodMinutes = null; // null = all activity

async function renderStatements() {
  const main = document.getElementById("main");
  const mine = await myAccountOrNull();
  main.innerHTML = pageHeader("Statements", "Your account activity") + (mine ? `
    <div class="card fade-in">
      <label>Time period</label>
      <div class="split" style="gap:8px;" id="st_periods">
        <button type="button" class="pill" data-mins="5" onclick="setStatementPeriod(5)">Last 5 minutes</button>
        <button type="button" class="pill" data-mins="90" onclick="setStatementPeriod(90)">Last 1 hour 30 minutes</button>
        <button type="button" class="pill" data-mins="" onclick="setStatementPeriod(null)">All activity</button>
      </div>
    </div>
    <div class="letterhead fade-in" style="margin-top:16px;">
      <div class="letterhead-head">
        <div class="lh-brand">Cloud Bank</div>
        <div class="lh-acct">${mine.account_number}<br/>${mine.owner_name}</div>
      </div>
      <div id="st_totals"></div>
      <div class="letterhead-body" id="st_list"><div class="empty">Loading…</div></div>
    </div>
  ` : noAccountCard("statements"));
  if (mine) { setStatementPeriod(statementPeriodMinutes, true); }
}
function setStatementPeriod(minutes, silent) {
  statementPeriodMinutes = minutes;
  document.querySelectorAll("#st_periods .pill").forEach(b => {
    b.classList.toggle("active", (b.dataset.mins ? Number(b.dataset.mins) : null) === minutes);
  });
  loadStatement();
}
async function loadStatement() {
  const mine = cachedAccounts[0];
  const box = document.getElementById("st_list"), sum = document.getElementById("st_totals");
  try {
    const q = new URLSearchParams();
    if (statementPeriodMinutes) {
      const to = new Date();
      const from = new Date(to.getTime() - statementPeriodMinutes * 60000);
      q.set("from_date", from.toISOString());
      q.set("to_date", to.toISOString());
    }
    const s = await api(`/statements/${mine.account_id}?${q}`);
    sum.innerHTML = `<div class="letterhead-totals">
      <div><div class="t-lbl">Credits</div><div class="t-val" style="color:#177a53;">+$${fmtMoney(s.total_credits)}</div></div>
      <div><div class="t-lbl">Debits</div><div class="t-val" style="color:#b3392f;">−$${fmtMoney(s.total_debits)}</div></div>
      <div><div class="t-lbl">Balance</div><div class="t-val">$${fmtMoney(s.current_balance)}</div></div>
    </div>`;
    box.innerHTML = s.lines.length ? s.lines.map(l => `
      <div class="letterhead-row"><span class="desc">${l.description}</span><span>${l.amount<0?'−':'+'}$${fmtMoney(Math.abs(l.amount))} <span class="dt">${fmtWhen(l.date)}</span></span></div>
    `).join("") : `<div class="empty" style="color:#7a7460;">No activity in this period.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
