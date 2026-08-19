/* ---------------- Profile — self-service name + photo update ----------------
   Deliberately narrow: a person can change how they're displayed (their
   name and avatar photo) but nothing else lives here — email, phone, and
   password all have their own dedicated flows elsewhere. */
let pendingProfilePhoto = null; // data URL staged until Save is pressed

function openProfile() {
  pendingProfilePhoto = null;
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.id = "profile-backdrop";
  wrap.onclick = (e) => { if (e.target === wrap) closeProfile(); };
  wrap.innerHTML = `
    <div class="modal fade-in">
      <button class="modal-close" onclick="closeProfile()">✕</button>
      <h2 style="margin-top:0;">Edit profile</h2>
      <p class="hint">Update your name and profile photo. Your email stays the same.</p>

      <div style="display:flex; align-items:center; gap:16px; margin:18px 0 6px;">
        <div class="profile-photo-preview" id="pf_preview">
          ${currentUser.profile_photo
            ? `<img src="${currentUser.profile_photo}" alt="" />`
            : `<span>${initials(currentUser.full_name)}</span>`}
        </div>
        <div>
          <input type="file" id="pf_file" accept="image/*" style="display:none;" onchange="handleProfilePhotoPick(event)" />
          <button type="button" class="btn ghost sm" style="margin-top:0;" onclick="document.getElementById('pf_file').click()">Choose photo</button>
          ${currentUser.profile_photo || pendingProfilePhoto ? `<button type="button" class="btn ghost sm" style="margin-top:8px;" onclick="clearProfilePhoto()">Remove photo</button>` : ""}
        </div>
      </div>

      <label>Full name</label>
      <input id="pf_name" value="${(currentUser.full_name || "").replace(/"/g, "&quot;")}" placeholder="Your name" />

      <button class="btn" style="width:100%; margin-top:14px;" onclick="saveProfile()">Save changes</button>
      <div id="pf_msg"></div>
    </div>
  `;
  document.body.appendChild(wrap);
  playModalIn("#profile-backdrop");
}

function closeProfile() {
  const el = document.getElementById("profile-backdrop");
  if (el) el.remove();
  pendingProfilePhoto = null;
}

function handleProfilePhotoPick(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("Please choose an image file.", false);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    // Downscale to a small square so the avatar stays light to store/send.
    const img = new Image();
    img.onload = () => {
      const size = 240;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      pendingProfilePhoto = canvas.toDataURL("image/jpeg", 0.85);
      const preview = document.getElementById("pf_preview");
      if (preview) preview.innerHTML = `<img src="${pendingProfilePhoto}" alt="" />`;
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function clearProfilePhoto() {
  pendingProfilePhoto = "";
  const preview = document.getElementById("pf_preview");
  if (preview) preview.innerHTML = `<span>${initials(document.getElementById("pf_name").value || currentUser.full_name)}</span>`;
}

async function saveProfile() {
  const el = document.getElementById("pf_msg");
  try {
    const full_name = document.getElementById("pf_name").value.trim();
    if (!full_name) throw new Error("Name can't be empty.");
    const body = { full_name };
    if (pendingProfilePhoto !== null) body.profile_photo = pendingProfilePhoto || null;
    const updated = await api(`/users/${currentUser.user_id}`, { method: "PATCH", body: JSON.stringify(body) });
    setUser({ ...currentUser, full_name: updated.full_name, profile_photo: updated.profile_photo });
    toast("Profile updated.");
    closeProfile();
    renderShell();
  } catch (e) { el.innerHTML = `<div class="msg err">${e.message}</div>`; }
}
