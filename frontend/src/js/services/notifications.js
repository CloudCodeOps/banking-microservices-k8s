/* ---------------- Notifications — vertical feed timeline ---------------- */
async function renderNotifications() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Notifications", "What's new") + `<div class="card fade-in"><div class="feed-timeline" id="nt_list"><div class="empty">Loading…</div></div></div>`;
  loadNotifications();
}
async function loadNotifications() {
  const box = document.getElementById("nt_list");
  try {
    const items = await api(`/notifications/user/${currentUser.user_id}`);
    box.innerHTML = items.length ? items.map(n => `
      <div class="feed-item ${n.read ? '' : 'unread'}">
        <div class="fs">${n.subject}</div>
        <div class="fm">${n.message}</div>
        <div class="ft">${fmtWhen(n.created_at)} ${n.read ? '' : `· <a style="color:var(--accent); cursor:pointer;" onclick="doMarkRead('${n.id}')">Mark read</a>`}</div>
      </div>
    `).join("") : `<div class="empty"><div class="big">All caught up</div>No notifications.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
async function doMarkRead(id) {
  try { await api(`/notifications/${id}/read`, { method: "PATCH" }); loadNotifications(); }
  catch (e) { toast(e.message, false); }
}
