/* ---------------- Support chatbot — floating widget, Groq-backed ----------------
   Mounted directly to <body> (not #app) so switching tabs, which re-renders
   the whole shell, doesn't wipe out an open conversation. History is kept
   in memory only (chatHistory) and sent with every request - the backend
   is stateless (see backend/services/chatbot). */
let chatHistory = [];   // [{role:"user"|"assistant", content:"..."}]
let chatOpen = false;
let chatSending = false;

function mountChatbot() {
  if (document.getElementById("chat-widget-root")) return; // already mounted
  const root = document.createElement("div");
  root.id = "chat-widget-root";
  root.innerHTML = `
    <button class="chat-fab" id="chat-fab" onclick="toggleChat()" title="Chat with Cloud Bank support" aria-label="Open chat">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 5.5h17v11h-9L6.5 20v-3.5h-3Z"/><circle cx="8.3" cy="11" r="1"/><circle cx="12" cy="11" r="1"/><circle cx="15.7" cy="11" r="1"/></svg>
    </button>
    <div class="chat-panel" id="chat-panel" style="display:none;">
      <div class="chat-head">
        <div>
          <div class="chat-title">Cloud Bank Assistant</div>
          <div class="chat-sub">Ask about your accounts, cards, transfers…</div>
        </div>
        <button class="chat-close" onclick="toggleChat()">✕</button>
      </div>
      <div class="chat-body" id="chat-body">
        <div class="chat-msg bot"><div class="bubble">Hi${currentUser ? " " + currentUser.full_name.split(" ")[0] : ""} 👋 I'm the Cloud Bank assistant. Ask me anything about your account or how to use the app.</div></div>
      </div>
      <div class="chat-input-row">
        <input id="chat-input" placeholder="Type a message…" onkeydown="if(event.key==='Enter') sendChatMessage();" />
        <button class="btn sm" onclick="sendChatMessage()" id="chat-send">Send</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);
}

function removeChatbot() {
  const el = document.getElementById("chat-widget-root");
  if (el) el.remove();
  chatHistory = [];
  chatOpen = false;
}

function toggleChat() {
  chatOpen = !chatOpen;
  const panel = document.getElementById("chat-panel");
  if (!panel) return;
  panel.style.display = chatOpen ? "flex" : "none";
  if (chatOpen) document.getElementById("chat-input")?.focus();
}

function appendChatBubble(role, text) {
  const body = document.getElementById("chat-body");
  if (!body) return;
  const div = document.createElement("div");
  div.className = `chat-msg ${role === "user" ? "user" : "bot"}`;
  div.innerHTML = `<div class="bubble"></div>`;
  div.querySelector(".bubble").textContent = text; // textContent, never innerHTML, for user/model text
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  return div;
}

async function sendChatMessage() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text || chatSending) return;
  input.value = "";
  appendChatBubble("user", text);
  chatHistory.push({ role: "user", content: text });

  chatSending = true;
  const typingEl = appendChatBubble("bot", "…");
  typingEl.classList.add("typing");
  document.getElementById("chat-send").disabled = true;

  try {
    const res = await api("/chatbot/message", {
      method: "POST",
      body: JSON.stringify({ message: text, history: chatHistory.slice(0, -1).slice(-12) }),
    });
    typingEl.classList.remove("typing");
    typingEl.querySelector(".bubble").textContent = res.reply;
    chatHistory.push({ role: "assistant", content: res.reply });
  } catch (e) {
    typingEl.classList.remove("typing");
    typingEl.querySelector(".bubble").textContent = "Sorry, I couldn't reach support just now. Try again in a moment.";
  } finally {
    chatSending = false;
    document.getElementById("chat-send").disabled = false;
    document.getElementById("chat-body").scrollTop = document.getElementById("chat-body").scrollHeight;
  }
}
