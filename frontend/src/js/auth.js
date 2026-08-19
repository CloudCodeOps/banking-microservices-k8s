function renderGate() {
  document.getElementById("app").innerHTML = `
    <div class="gate">
      <div class="gate-orbit o1" style="color:var(--violet)"><div class="dot" style="background:var(--violet)"></div></div>
      <div class="gate-orbit o2" style="color:var(--ledger)"><div class="dot" style="background:var(--ledger)"></div></div>
      <div class="gate-card">
        <div class="gate-badge">C</div>
        <div class="gate-heading">
          <h1>Cloud<span style="background:linear-gradient(90deg, var(--violet), var(--ledger)); -webkit-background-clip:text; background-clip:text; color:transparent;">Bank</span></h1>
          <p>${authTab === 'login' ? 'Sign in to your account' : 'Open a Cloud Bank account'}</p>
        </div>
        <div class="gate-chips">
          <span>Cloud-native</span><span>20 services</span><span>EKS-secured</span>
        </div>
        <div class="tabs">
          <button class="${authTab==='login'?'active':''}" onclick="setAuthTab('login')">Login</button>
          <button class="${authTab==='register'?'active':''}" onclick="setAuthTab('register')">Register</button>
        </div>
        <div class="gate-form" id="auth-body"></div>
      </div>
    </div>
  `;
  renderAuthBody();
  if (hasGsap()) gsap.fromTo(".gate-card", { opacity: 0, y: 26, scale: .97 }, { opacity: 1, y: 0, scale: 1, duration: .6, ease: "power3.out" });
}
function setAuthTab(t){ authTab = t; renderGate(); }

function renderAuthBody() {
  const el = document.getElementById("auth-body");
  if (authTab === "login") {
    el.innerHTML = `
      <label>Email</label><input id="l_email" type="email" placeholder="you@cloudbank.com" />
      <label>Password</label><input id="l_password" type="password" placeholder="••••••••" />
      <button class="btn" style="width:100%" onclick="doLogin()">Sign in</button>
      <div id="l_msg"></div>
    `;
  } else {
    el.innerHTML = `
      <label>Full name</label><input id="r_name" placeholder="Ada Lovelace" ${regOtpSent ? "disabled" : ""} value="${regDraft.full_name || ""}" />
      <label>Email</label><input id="r_email" type="email" placeholder="you@cloudbank.com" ${regOtpSent ? "disabled" : ""} value="${regDraft.email || ""}" />
      <label>Phone</label><input id="r_phone" placeholder="+1 555 000 1234" ${regOtpSent ? "disabled" : ""} value="${regDraft.phone || ""}" />
      <label>Password</label><input id="r_password" type="password" placeholder="Create a password" ${regOtpSent ? "disabled" : ""} value="${regDraft.password || ""}" />
      ${regOtpSent ? `
        <label>Verification code</label>
        <p class="hint">We emailed a 6-digit code to <strong>${regDraft.email}</strong>. It expires in 5 minutes.</p>
        <input id="r_otp" inputmode="numeric" maxlength="6" placeholder="123456" />
        <button class="btn gold" style="width:100%" onclick="verifyRegistrationOtp()">Verify & create account</button>
        <button type="button" class="btn ghost sm" style="margin-top:8px;" onclick="resetRegistrationOtp()">Use a different email</button>
      ` : `
        <button class="btn gold" style="width:100%" onclick="startRegistration()">Send verification code</button>
      `}
      <div id="r_msg"></div>
    `;
  }
}

let regOtpSent = false;
let regDraft = {};

async function startRegistration() {
  const el = document.getElementById("r_msg");
  try {
    regDraft = {
      full_name: document.getElementById("r_name").value,
      email: document.getElementById("r_email").value,
      phone: document.getElementById("r_phone").value,
      password: document.getElementById("r_password").value,
    };
    if (!regDraft.full_name || !regDraft.email || !regDraft.phone || !regDraft.password) {
      throw new Error("Fill in every field first.");
    }
    await api("/users/otp/send", { method: "POST", body: JSON.stringify({ email: regDraft.email, purpose: "signup" }) });
    regOtpSent = true;
    renderAuthBody();
    toast("Verification code sent to your email.");
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}

function resetRegistrationOtp() {
  regOtpSent = false;
  renderAuthBody();
}

async function verifyRegistrationOtp() {
  const el = document.getElementById("r_msg");
  try {
    const code = document.getElementById("r_otp").value.trim();
    if (!code) throw new Error("Enter the code we emailed you.");
    await api("/users/otp/verify", { method: "POST", body: JSON.stringify({ email: regDraft.email, code, purpose: "signup" }) });
    const user = await api("/users/register", { method: "POST", body: JSON.stringify(regDraft) });
    setUser(user);
    toast("Account created — welcome to Cloud Bank.");
    regOtpSent = false;
    regDraft = {};
    currentTab = "dashboard";
    afterAuth();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
async function doLogin() {
  const el = document.getElementById("l_msg");
  try {
    const body = {
      email: document.getElementById("l_email").value,
      password: document.getElementById("l_password").value,
    };
    const user = await api("/users/login", { method: "POST", body: JSON.stringify(body) });
    setUser(user);
    toast(`Welcome back, ${user.full_name.split(" ")[0]}.`);
    currentTab = "dashboard";
    afterAuth();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
function doLogout(){ setUser(null); render(); }

/* After every successful login/register, check whether this person has
   an account yet - if not, take them straight to the dashboard AND pop
   the "open your account" modal on top of it, instead of dropping them
   on an empty dashboard with no explanation. See js/onboarding.js. */
async function afterAuth() {
  await render();
  try {
    const accounts = await fetchMyAccounts();
    if (!accounts.length) openOnboarding();
  } catch (e) {}
}
