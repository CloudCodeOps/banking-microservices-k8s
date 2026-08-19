let onboardType = "savings";
let onboardAmount = 0;

function openOnboarding() {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.id = "onboard-backdrop";
  wrap.innerHTML = `
    <div class="modal fade-in">
      <div class="onboard-hero">
        <div class="mark">V</div>
        <h2>Welcome, ${(currentUser.full_name||"there").split(" ")[0]}.</h2>
        <p>Let's open your Cloud Bank account. Choose a type and how much you'd like to start with — it's credited the instant your account opens.</p>
      </div>

      <label>Account type</label>
      <div class="account-type-picks" id="ob-type-picks">
        <button type="button" class="active" data-type="savings" onclick="pickOnboardType('savings')">
          <div class="t">Savings</div><div class="s hint">Everyday balance, earns rewards</div>
        </button>
        <button type="button" data-type="current" onclick="pickOnboardType('current')">
          <div class="t">Current</div><div class="s hint">Built for frequent transactions</div>
        </button>
      </div>

      <label>Opening balance</label>
      <input id="ob-amount" type="number" min="0" step="0.01" placeholder="0.00" value="0" oninput="onboardAmount=Number(this.value||0); syncOnboardPicks();" />
      <div class="amount-quickpicks" id="ob-quickpicks">
        ${[100, 500, 1000, 5000].map(v => `<button type="button" onclick="setOnboardAmount(${v})">$${v.toLocaleString()}</button>`).join("")}
      </div>

      <button class="btn" style="width:100%" onclick="doOnboardCreateAccount()">Open my account</button>
      <div id="ob-msg"></div>
    </div>
  `;
  document.body.appendChild(wrap);
  playModalIn("#onboard-backdrop");
}
function pickOnboardType(t) {
  onboardType = t;
  document.querySelectorAll("#ob-type-picks button").forEach(b => b.classList.toggle("active", b.dataset.type === t));
}
function setOnboardAmount(v) {
  onboardAmount = v;
  document.getElementById("ob-amount").value = v;
  syncOnboardPicks();
}
function syncOnboardPicks() {
  document.querySelectorAll("#ob-quickpicks button").forEach(b => {
    b.classList.toggle("active", Number(b.textContent.replace(/[^0-9.]/g,"")) === onboardAmount);
  });
}
function closeOnboarding() {
  const el = document.getElementById("onboard-backdrop");
  if (el) el.remove();
}
async function doOnboardCreateAccount() {
  const el = document.getElementById("ob-msg");
  try {
    const body = {
      user_id: currentUser.user_id,
      account_type: onboardType,
      opening_balance: onboardAmount,
    };
    await api("/accounts", { method: "POST", body: JSON.stringify(body) });
    toast("Account opened — welcome to Cloud Bank.");
    closeOnboarding();
    currentTab = "dashboard";
    render();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
