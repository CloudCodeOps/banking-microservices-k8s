/* ---------------- Cards ---------------- */
let revealedCards = {}; // cardId -> { card_number, cvv } once fetched, kept only in memory
let cardsCache = {};    // cardId -> last-loaded card record, used by the big-screen view modal

async function renderCards() {
  const main = document.getElementById("main");
  const mine = await myAccountOrNull();
  main.innerHTML = pageHeader("Cards", "Debit & credit cards") + (mine ? `
    <div class="grid cols-2">
      <div class="card fade-in">
        <h2>Issue a new card</h2>
        <p class="hint">Linked to your account · ${mine.account_number}</p>
        <label>Card type</label>
        <select id="cd_type"><option value="debit">Debit</option><option value="credit">Credit</option></select>
        <button class="btn" onclick="doIssueCard()">Issue card</button>
        <div id="cd_msg"></div>
      </div>
      <div class="card fade-in">
        <h2>How to view your card</h2>
        <p class="hint">Click a card to flip it and see the back (CVV). Click the eye icon to reveal the full number whenever you need it. Hit <b>View</b> for a big-screen version of any card.</p>
      </div>
    </div>
    <div class="section-title">Your cards</div>
    <div class="card-wall" id="cd_list"><div class="empty">Loading…</div></div>
  ` : noAccountCard("cards"));
  if (mine) loadCards();
}
async function doIssueCard() {
  const el = document.getElementById("cd_msg");
  try {
    const body = { user_id: currentUser.user_id, account_id: cachedAccounts[0].account_id, card_type: document.getElementById("cd_type").value };
    await api("/cards", { method: "POST", body: JSON.stringify(body) });
    el.innerHTML = `<div class="msg ok">Card issued.</div>`;
    toast("Card issued.");
    loadCards();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function loadCards() {
  const box = document.getElementById("cd_list");
  try {
    const cards = await api(`/cards/user/${currentUser.user_id}`);
    cardsCache = Object.fromEntries(cards.map(c => [c.id, c]));
    box.innerHTML = cards.length ? cards.map(c => renderVirtualCard(c)).join("") :
      `<div class="empty" style="width:100%"><div class="big">No cards yet</div>Issue your first one above.</div>`;
    playCardWallEnter();
  } catch (e) { box.innerHTML = `<div class="empty">${e.message}</div>`; }
}

function cardFacesHtml(c, idPrefix) {
  const revealed = revealedCards[c.id];
  const number = revealed ? formatCardNumber(revealed.card_number) : c.card_number_masked;
  const cvv = revealed ? revealed.cvv : "•••";
  const frozen = c.status !== "active";
  return `
    <div class="vcard-face front ${c.card_type}">
      ${frozen ? `<div class="vcard-status-flag">Frozen</div>` : ""}
      <div class="vcard-top">
        <div class="vcard-bank">Veera<b>Bank</b></div>
        <div class="vcard-type">${c.card_type}</div>
      </div>
      <div class="vcard-chip"></div>
      <div class="vcard-number">
        <span id="${idPrefix}-number-${c.id}">${number}</span>
        <button class="vcard-reveal-btn" title="${revealed ? 'Hide number' : 'Reveal number'}" onclick="toggleReveal('${c.id}', event)">${revealed ? '🙈' : '👁'}</button>
      </div>
      <div class="vcard-bottom">
        <div class="vcard-holder"><div>Card holder</div><div class="name">${(currentUser.full_name||'').toUpperCase()}</div></div>
        <div class="vcard-expiry"><div>Valid thru</div><div class="val">${c.expiry}</div></div>
      </div>
    </div>
    <div class="vcard-face back">
      <div class="vcard-stripe"></div>
      <div class="vcard-cvv-strip">
        <div>
          <div class="vcard-cvv-label">CVV</div>
          <div class="vcard-cvv-panel">${cvv}</div>
        </div>
      </div>
      <div class="vcard-back-note">This card is issued by Cloud Bank and is property of the account holder above. Tap the front to flip back. For lost/stolen cards, freeze it instantly from the app.</div>
      <div class="vcard-bottom" style="margin-top:14px;">
        <div class="vcard-holder"><div>Card number</div><div class="name" style="font-family:var(--mono); letter-spacing:1px;">${number}</div></div>
        <div class="vcard-network">VB</div>
      </div>
    </div>
  `;
}
function renderVirtualCard(c) {
  const frozen = c.status !== "active";
  return `
    <div>
      <div class="vcard-scene ${frozen ? 'frozen' : ''}">
        <div class="vcard" id="vcard-${c.id}" onclick="flipCard('${c.id}', event)">
          ${cardFacesHtml(c, "vcard")}
        </div>
      </div>
      <div class="vcard-meta-row">
        <span class="badge">${c.card_type}</span>
        <div class="split" style="gap:8px;">
          <button class="btn ghost sm" onclick="openCardView('${c.id}', event)">View</button>
          <button class="btn ghost sm" onclick="doToggleCard('${c.id}','${c.status}', event)">${frozen ? 'Unfreeze' : 'Freeze'}</button>
        </div>
      </div>
    </div>
  `;
}
function openCardView(id, evt) {
  if (evt) evt.stopPropagation();
  const c = cardsCache[id];
  if (!c) return;
  const wrap = document.createElement("div");
  wrap.className = "card-view-backdrop";
  wrap.id = "card-view-backdrop";
  wrap.onclick = (e) => { if (e.target === wrap) closeCardView(); };
  wrap.innerHTML = `
    <div class="card-view-inner">
      <button class="card-view-close" onclick="closeCardView()">✕</button>
      <div class="vcard-scene ${c.status !== 'active' ? 'frozen' : ''}">
        <div class="vcard" id="vcardview-${c.id}" onclick="this.classList.toggle('flipped')">
          ${cardFacesHtml(c, "vcardview")}
        </div>
      </div>
      <div class="card-view-actions">
        <button class="btn ghost sm" onclick="toggleReveal('${c.id}', event)">Reveal number</button>
        <button class="btn ghost sm" onclick="document.getElementById('vcardview-${c.id}').classList.toggle('flipped')">Flip card</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  playModalIn("#card-view-backdrop");
}
function refreshCardView(id) {
  // toggleReveal() re-renders the card wall (loadCards); after that
  // finishes, resync the big-screen view's faces with the same state.
  setTimeout(() => {
    const scene = document.getElementById(`vcardview-${id}`);
    const c = cardsCache[id];
    if (scene && c) scene.innerHTML = cardFacesHtml(c, "vcardview");
  }, 50);
}
function closeCardView() {
  const el = document.getElementById("card-view-backdrop");
  if (el) el.remove();
}
function formatCardNumber(n) {
  return (n || "").replace(/(.{4})/g, "$1 ").trim();
}
function flipCard(id, evt) {
  if (evt) evt.stopPropagation();
  document.getElementById(`vcard-${id}`).classList.toggle("flipped");
}
async function toggleReveal(id, evt) {
  if (evt) evt.stopPropagation();
  if (revealedCards[id]) {
    delete revealedCards[id];
    loadCards();
    refreshCardView(id);
    return;
  }
  try {
    const full = await api(`/cards/${id}/reveal/${currentUser.user_id}`);
    revealedCards[id] = full;
    loadCards();
    refreshCardView(id);
  } catch (e) { toast(e.message, false); }
}
async function doToggleCard(id, status, evt) {
  if (evt) evt.stopPropagation();
  try { await api(`/cards/${id}/${status === 'active' ? 'freeze' : 'unfreeze'}`, { method: "PATCH" }); toast("Card updated."); loadCards(); }
  catch (e) { toast(e.message, false); }
}
