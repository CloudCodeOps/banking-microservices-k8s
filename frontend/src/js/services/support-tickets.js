/* ---------------- Support Tickets — chat threads ---------------- */
async function renderSupportTickets() {
  const main = document.getElementById("main");
  main.innerHTML = pageHeader("Support", "Get help") + `
    <div class="card fade-in">
      <h2>Raise a ticket</h2>
      <div class="grid cols-2" style="gap:12px;">
        <div><label>Subject</label><input id="tk_subject" placeholder="Trouble with a transfer" /></div>
        <div><label>Message</label><input id="tk_message" placeholder="Describe the issue" /></div>
      </div>
      <button class="btn" onclick="doCreateTicket()">Submit</button>
      <div id="tk_msg"></div>
    </div>
    <div class="section-title">Your tickets</div>
    <div id="tk_list"><div class="empty">Loading…</div></div>
  `;
  loadTickets();
}
async function doCreateTicket() {
  const el = document.getElementById("tk_msg");
  try {
    const body = { user_id: currentUser.user_id, subject: document.getElementById("tk_subject").value, message: document.getElementById("tk_message").value };
    await api("/support-tickets", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Ticket opened.</div>`; toast("Ticket opened.");
    loadTickets();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadTickets() {
  const box = document.getElementById("tk_list");
  try {
    const items = await api(`/support-tickets/user/${currentUser.user_id}`);
    box.innerHTML = items.length ? items.map(t => `
      <div class="card fade-in" style="margin-bottom:14px;">
        <div class="split" style="justify-content:space-between;"><h2 style="margin:0;">${t.subject}</h2>${badge('', t.status)}</div>
        <div class="chat-thread" style="margin-top:12px;">
          ${(t.messages||[]).map(m => `<div class="chat-bubble ${m.from_staff ? 'staff' : 'me'}">${m.message}</div>`).join("") || '<div class="hint">No messages yet.</div>'}
        </div>
      </div>
    `).join("") : `<div class="empty"><div class="big">No tickets</div>You're all set.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
