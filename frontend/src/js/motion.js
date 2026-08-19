/* =========================================================================
   Motion layer — every page transition, reveal and counter in the app
   runs through GSAP (loaded via CDN in index.html). Falls back to plain
   CSS (.fade-in, which already exists on most elements) if gsap failed
   to load for any reason, so the app never breaks without it.
   ========================================================================= */
function hasGsap() { return typeof gsap !== "undefined"; }

/* Called once per render() after main's innerHTML is set: sweeps the
   page in and staggers its direct content blocks. */
function playPageEnter() {
  if (!hasGsap()) return;
  const main = document.getElementById("main");
  if (!main) return;
  gsap.fromTo(main, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: .5, ease: "power3.out" });
  const blocks = main.querySelectorAll(".card, .identity-strip, .card-wall, .grid > *");
  gsap.fromTo(blocks, { opacity: 0, y: 22, scale: .98 },
    { opacity: 1, y: 0, scale: 1, duration: .55, ease: "power3.out", stagger: .06, delay: .05 });
}

/* Nav pill underline glide + entrance on shell mount. */
function playNavEnter() {
  if (!hasGsap()) return;
  gsap.fromTo(".topnav", { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: .45, ease: "power2.out" });
  gsap.fromTo(".navitem", { opacity: 0, y: -4 }, { opacity: 1, y: 0, duration: .35, stagger: .02, ease: "power2.out" });
}

/* Smooth count-up used by the dashboard hero balance. */
function animateCount(el, target) {
  if (!hasGsap()) { el.textContent = fmtMoney(target); return; }
  const obj = { v: 0 };
  gsap.to(obj, {
    v: target, duration: 1.1, ease: "power3.out",
    onUpdate: () => { el.textContent = fmtMoney(obj.v); },
  });
}

/* Modal open/close pop, used by onboarding, receipt and card-view modals. */
function playModalIn(selector) {
  if (!hasGsap()) return;
  gsap.fromTo(selector, { opacity: 0 }, { opacity: 1, duration: .25 });
  gsap.fromTo(`${selector} > .modal, ${selector} .card-view-inner`,
    { opacity: 0, y: 24, scale: .94 }, { opacity: 1, y: 0, scale: 1, duration: .45, ease: "back.out(1.6)" });
}

/* Card wall entrance — used on the Cards page so each vcard flies in. */
function playCardWallEnter() {
  if (!hasGsap()) return;
  gsap.fromTo(".card-wall > div", { opacity: 0, y: 30, rotateX: -8 },
    { opacity: 1, y: 0, rotateX: 0, duration: .6, ease: "power3.out", stagger: .09 });
}
