/* ---------------- Transfers — resolve recipient, review, then send ----------------
   A real transfer: money actually leaves your account and lands in the
   recipient's, atomically, on the backend (see transfers-service). This
   page resolves the recipient first and shows a review card before any
   money moves, instead of firing the transfer blind. */
let resolvedRecipient = null;

async function renderTransfers() {
  const main = document.getElementById("main");
  const mine = cachedAccounts[0];
  let quickPicks = "";
  try {
    const bens = await api(`/beneficiaries/user/${currentUser.user_id}`);
    if (bens.length) {
      quickPicks = `
        <label>Quick send</label>
        <div class="split" style="gap:8px;">
          ${bens.slice(0,6).map(b => `<button type="button" class="pill" onclick="quickPickRecipient('${b.account_number}')">${b.nickname}</button>`).join("")}
        </div>
      `;
    }
  } catch (e) {}
  main.innerHTML = pageHeader("Transfers", "Send money") + `
    <div class="grid cols-2">
      <div class="card fade-in">
        <h2>Send money</h2>
        <p class="hint">${mine ? `From your account · balance $${fmtMoney(mine.balance)}` : "Open an account first."}</p>
        ${quickPicks}
        <label>Recipient's account number / ID</label>
        <div class="split" style="gap:8px;">
          <input id="tr_number" placeholder="e.g. 48219047335" style="flex:1;" ${mine ? "" : "disabled"} oninput="resolvedRecipient=null; document.getElementById('tr_review').innerHTML='';" />
          <button class="btn ghost sm" style="margin-top:0;" onclick="resolveRecipient()" ${mine ? "" : "disabled"}>Look up</button>
        </div>
        <div id="tr_review"></div>
        <label>Amount</label><input id="tr_amount" type="number" min="0.01" step="0.01" placeholder="0.00" ${mine ? "" : "disabled"} />
        <label>Note (optional)</label><input id="tr_note" placeholder="What's this for?" ${mine ? "" : "disabled"} />
        <p class="hint">Sending as <strong>${currentUser.full_name}</strong> · ${currentUser.email} — the recipient sees this with every transfer.</p>
        <button class="btn" onclick="doTransfer()" ${mine ? "" : "disabled"}>Review & send</button>
        <div id="tr_msg"></div>
      </div>
      <div class="card fade-in">
        <h2>Transfer history</h2>
        <p class="hint">Every transfer in or out of your account.</p>
        <div id="tr_history">${mine ? '<div class="empty">Loading…</div>' : '<div class="empty">No account yet.</div>'}</div>
      </div>
    </div>
  `;
  if (mine) loadTransferHistory();
}
function quickPickRecipient(number) {
  document.getElementById("tr_number").value = number;
  resolveRecipient();
}
async function resolveRecipient() {
  const box = document.getElementById("tr_review");
  const number = document.getElementById("tr_number").value.trim();
  const mine = cachedAccounts[0];
  if (!number) { box.innerHTML = ""; resolvedRecipient = null; return; }
  box.innerHTML = `<div class="hint">Looking up…</div>`;
  try {
    const recipient = await api(`/accounts/by-number/${number}`);
    if (mine && recipient.account_id === mine.account_id) throw new Error("You can't transfer to your own account.");
    resolvedRecipient = recipient;
    box.innerHTML = `
      <div class="split" style="justify-content:space-between; align-items:center; padding:12px 14px; border-radius:14px; background:var(--ledger-dim); border:1px solid rgba(47,230,192,.3); margin-top:10px;">
        <div class="split" style="gap:10px;">
          <div class="contact-avatar" style="width:36px; height:36px; font-size:12px;">${initials(recipient.owner_name)}</div>
          <div><div style="font-weight:700; font-size:13px;">${recipient.owner_name}</div><div class="hint" style="margin:0; font-family:var(--mono);">${recipient.account_number}</div></div>
        </div>
        <span class="badge" style="border-color:var(--ledger); color:var(--ledger);">Verified</span>
      </div>
    `;
  } catch (e) {
    resolvedRecipient = null;
    box.innerHTML = `<div class="msg err" style="margin-top:10px;">${e.message}</div>`;
  }
}
async function doTransfer() {
  const el = document.getElementById("tr_msg");
  const mine = cachedAccounts[0];
  try {
    if (!mine) throw new Error("Open an account first.");
    if (!resolvedRecipient) throw new Error("Click \"Look up\" to verify the recipient's account first.");
    const amount = Number(document.getElementById("tr_amount").value);
    if (!amount || amount <= 0) throw new Error("Enter an amount.");
    const note = document.getElementById("tr_note").value;
    const body = {
      from_account_id: mine.account_id, to_account_id: resolvedRecipient.account_id, amount,
      user_id: currentUser.user_id, note,
      sender_name: currentUser.full_name, sender_email: currentUser.email,
    };
    await api("/transfers", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Sent $${fmtMoney(amount)} to ${resolvedRecipient.owner_name}.</div>`;
    toast(`Transfer to ${resolvedRecipient.owner_name} complete.`);
    document.getElementById("tr_number").value = "";
    document.getElementById("tr_amount").value = "";
    document.getElementById("tr_note").value = "";
    document.getElementById("tr_review").innerHTML = "";
    resolvedRecipient = null;
    loadAccountsSilently();
    loadTransferHistory();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadAccountsSilently() {
  try { cachedAccounts = await fetchMyAccounts(); } catch (e) {}
  const mine = cachedAccounts[0];
  const hint = document.querySelector("#main .card .hint");
  if (mine && hint) hint.textContent = `From your account · balance $${fmtMoney(mine.balance)}`;
}
async function loadTransferHistory() {
  const box = document.getElementById("tr_history");
  const mine = cachedAccounts[0];
  if (!mine) return;
  try {
    const rows = await api(`/transfers/account/${mine.account_id}`);
    box.innerHTML = rows.length ? rows.map(t => {
      const out = t.from_account_id === mine.account_id;
      const fromWhom = !out && t.sender_name ? ` · from ${t.sender_name}${t.sender_email ? ` (${t.sender_email})` : ""}` : "";
      return `
        <div class="split" style="justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--line);">
          <div>
            <div style="font-size:13px; font-weight:600;">${out ? "Sent" : "Received"}${t.note ? " · " + t.note : ""}${fromWhom}</div>
            <div class="when">${fmtWhen(t.created_at)}</div>
          </div>
          <div class="amt ${out ? 'neg' : 'pos'}" style="font-family:var(--mono);">${out ? '−' : '+'}$${fmtMoney(t.amount)}</div>
        </div>
      `;
    }).join("") : `<div class="empty"><div class="big">No transfers yet</div>Send or receive money to see it here.</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}
