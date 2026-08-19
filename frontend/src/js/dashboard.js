/* ---------------- Dashboard ---------------- */
async function renderDashboard() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Overview", "Good to see you") + `
    <div class="grid" id="dash-grid">
      <div class="card hero fade-in">
        <div class="hero-top">
          <div>
            <div class="hero-label">Total balance across accounts</div>
            <div class="hero-amount"><span class="cur">$</span><span id="hero-total">0.00</span></div>
            <div class="hero-sub"><span id="hero-accounts-count">0</span> accounts open · <span class="up" id="hero-txn-count">0 transactions</span></div>
          </div>
          <div class="hero-actions">
            <button class="btn ghost sm" onclick="currentTab='accounts'; render();">Open account</button>
            <button class="btn sm" onclick="currentTab='transactions'; render();">New transaction</button>
          </div>
        </div>
        <div class="sparkline" id="sparkline"></div>
      </div>
      <div class="identity-strip fade-in" id="identity-strip" style="display:none;">
        <div class="identity-cell">
          <div class="identity-label">Account number</div>
          <div class="identity-value" id="id-acct-num" onclick="copyIdentity('acct')">—</div>
        </div>
        <div class="identity-cell">
          <div class="identity-label">Account holder</div>
          <div class="identity-value name" id="id-name">—</div>
        </div>
        <div class="identity-cell">
          <div class="identity-label">Email on file</div>
          <div class="identity-value" id="id-email" onclick="copyIdentity('email')">—</div>
        </div>
      </div>
    </div>
    <div class="grid cols-2" style="margin-top:18px;">
      <div class="card fade-in">
        <h2>Recent activity</h2>
        <p class="hint">Latest movement across every account, newest first. Click any row for a receipt.</p>
        <div id="recent-ledger"><div class="empty">Loading…</div></div>
      </div>
      <div class="card fade-in">
        <h2>Your accounts</h2>
        <p class="hint">Balances update the moment a transaction posts.</p>
        <div id="dash-accounts"><div class="empty">Loading…</div></div>
      </div>
    </div>
  `;

  try {
    const accounts = await fetchMyAccounts();
    cachedAccounts = accounts;
    const total = accounts.reduce((s,a) => s + Number(a.balance || 0), 0);
    animateCount(document.getElementById("hero-total"), total);
    document.getElementById("hero-accounts-count").textContent = accounts.length;

    if (accounts.length) {
      const a = accounts[0];
      const strip = document.getElementById("identity-strip");
      strip.style.display = "grid";
      document.getElementById("id-acct-num").textContent = a.account_number;
      document.getElementById("id-name").textContent = a.owner_name;
      document.getElementById("id-email").textContent = currentUser.email;
    }

    document.getElementById("dash-accounts").innerHTML = accounts.length ? accounts.slice(0,6).map(a => `
      <div class="split" style="justify-content:space-between; padding:9px 0; border-bottom:1px solid var(--line);">
        <div>
          <div style="font-size:13px; font-weight:600;">${a.owner_name}</div>
          <div class="badge">${a.account_type}</div>
        </div>
        <div class="amt" style="font-family:var(--mono); font-size:14px;">$${fmtMoney(a.balance)}</div>
      </div>
    `).join("") : `<div class="empty"><div class="big">No accounts yet</div>Open your first account to get started.</div>`;

    // pull recent transactions across up to 4 accounts for the sparkline/ledger
    let all = [];
    for (const a of accounts.slice(0,4)) {
      try { const t = await api(`/transactions/${a.account_id}`); all = all.concat(t.map(x => ({...x, owner: a.owner_name}))); } catch (e) {}
    }
    all.sort((a,b) => (b.created_at || "").localeCompare(a.created_at || ""));
    document.getElementById("hero-txn-count").textContent = `${all.length} transactions`;

    const spark = document.getElementById("sparkline");
    const recent = all.slice(0,28).reverse();
    if (recent.length) {
      const max = Math.max(...recent.map(t => Number(t.amount)), 1);
      spark.innerHTML = recent.map(t => {
        const h = Math.max(6, Math.round((Number(t.amount)/max)*64));
        return `<i class="${t.type==='withdrawal'?'neg':''}" style="height:${h}px" title="${t.type} $${fmtMoney(t.amount)}"></i>`;
      }).join("");
    } else {
      spark.innerHTML = `<div class="empty" style="width:100%">No transactions yet — activity will chart here.</div>`;
    }

    document.getElementById("recent-ledger").innerHTML = renderLedgerTable(all.slice(0,8), true, true);
  } catch (e) {
    toast(e.message, false);
  }
}
function copyIdentity(which) {
  const el = document.getElementById(which === 'acct' ? 'id-acct-num' : 'id-email');
  navigator.clipboard.writeText(el.textContent);
  toast((which === 'acct' ? "Account number" : "Email") + " copied.");
}


