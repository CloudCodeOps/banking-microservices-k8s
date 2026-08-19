/* ---------------- Rewards — points gauge + badge grid ---------------- */
async function renderRewards() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Rewards", "Points from banking") + `
    <div class="grid cols-2">
      <div class="card fade-in" style="text-align:center;">
        <h2>Your balance</h2>
        <div id="rw_gauge" style="margin-top:14px;"><div class="empty">Loading…</div></div>
      </div>
      <div class="card fade-in">
        <h2>Redeem points</h2>
        <p class="hint">Earn 1 point per $100 transferred.</p>
        <label>Points to redeem</label><input id="rw_points" type="number" min="1" placeholder="100" />
        <button class="btn" onclick="doRedeem()">Redeem</button>
        <div id="rw_msg"></div>
      </div>
    </div>
    <div class="section-title">Activity</div>
    <div class="badge-grid" id="rw_list"><div class="empty">Loading…</div></div>
  `;
  loadRewards();
}
async function loadRewards() {
  try {
    const bal = await api(`/rewards/user/${currentUser.user_id}/balance`);
    const pct = Math.min(100, bal.points_balance / 10);
    document.getElementById("rw_gauge").innerHTML = `
      <div class="gauge" style="background:conic-gradient(var(--accent) ${pct*3.6}deg, var(--panel) 0deg);">
        <div class="hole"><div class="v">${bal.points_balance}</div><div class="l">points</div></div>
      </div>
    `;
    const items = await api(`/rewards/user/${currentUser.user_id}`);
    document.getElementById("rw_list").innerHTML = items.length ? items.map(r => `
      <div class="badge-tile fade-in">
        <div class="bt-icon">${r.kind === 'earn' ? '★' : '⇩'}</div>
        <div class="bt-lbl">${r.description}</div>
        <div class="bt-val">${r.kind==='earn'?'+':'−'}${r.points} pts</div>
      </div>
    `).join("") : `<div class="empty" style="grid-column:1/-1;">No activity yet.</div>`;
  } catch (e) { document.getElementById("rw_list").innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function doRedeem() {
  const el = document.getElementById("rw_msg");
  try {
    const body = { user_id: currentUser.user_id, points: Number(document.getElementById("rw_points").value) };
    await api("/rewards/redeem", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Redeemed.</div>`; toast("Redeemed.");
    loadRewards();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
