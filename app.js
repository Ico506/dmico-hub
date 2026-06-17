/* ─────────────────────────────────────────────────────────────
   dmico life os — shell logic
   Connection details (Supabase URL + key) live in config.js so they
   survive every update to THIS file. You should not need to touch them
   here again. If the hub says it needs setup, open config.js.
   ───────────────────────────────────────────────────────────── */

const CFG = window.DMICO_CONFIG || {};
const SUPABASE_URL = CFG.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = CFG.SUPABASE_ANON_KEY || "";

const configured =
  SUPABASE_URL && SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes("PASTE") && !SUPABASE_ANON_KEY.includes("PASTE");

const sb = configured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/* The modules. Lit ones are built; unlit ones light up as we build them. */
const MODULES = [
  { id: "research",  label: "Research",   lit: true,
    blurb: "Your reference library and paper discovery live here. The next build wires up search across Semantic Scholar, one-tap save to your library, tag filtering by your themes, and BibTeX export for writing." },
  { id: "selfstudy", label: "Self-study", lit: true,
    blurb: "Track exams with a live countdown and run focus sessions. The balanced study-plan generator lands in the next build." },
  { id: "hygiene",   label: "Hygiene",    lit: true,
    blurb: "Cleaning timers and supply inventory." },
  { id: "gamedev",   label: "Game Dev",   lit: true,
    blurb: "JadeFrog Studio projects, devlog, and idea board." },
  { id: "finance",   label: "Finance",    lit: false },
];

const el = (id) => document.getElementById(id);
const loginView = el("login-view");
const appView = el("app-view");

/* ── View switching ──────────────────────────────────────────── */

function showLogin() {
  appView.hidden = true;
  loginView.hidden = false;
  el("password").value = "";
}

function showApp(session) {
  loginView.hidden = true;
  appView.hidden = false;
  el("greeting").textContent = greeting(session);
  renderRail();
  openModule("research");
}

function greeting(session) {
  const h = new Date().getHours();
  const part = h < 5 ? "Late night" : h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening";
  const name = (session?.user?.email || "").split("@")[0];
  return name ? `${part}, ${name}` : part;
}

/* ── The lantern rail ────────────────────────────────────────── */

function renderRail() {
  const nav = el("modules");
  nav.innerHTML = "";
  MODULES.forEach((m) => {
    const b = document.createElement("button");
    b.className = "lantern " + (m.lit ? "lit" : "unlit");
    b.dataset.id = m.id;
    b.innerHTML =
      `<span class="dot"></span>` +
      `<span class="label">${m.label}</span>` +
      `<span class="state">${m.lit ? "ready" : "soon"}</span>`;
    if (m.lit) {
      b.addEventListener("click", () => openModule(m.id));
    } else {
      b.disabled = true;
      b.setAttribute("aria-disabled", "true");
    }
    nav.appendChild(b);
  });
}

function openModule(id) {
  const m = MODULES.find((x) => x.id === id);
  if (!m || !m.lit) return;

  document.querySelectorAll(".lantern").forEach((n) =>
    n.classList.toggle("current", n.dataset.id === id)
  );

  el("module-eyebrow").textContent = m.label;
  const body = el("stage-body");
  if (id === "research" && window.renderResearch) {
    window.renderResearch(body, sb);
  } else if (id === "selfstudy" && window.renderSelfStudy) {
    window.renderSelfStudy(body, sb);
  } else if (id === "hygiene" && window.renderHygiene) {
    window.renderHygiene(body, sb);
  } else if (id === "gamedev" && window.renderGameDev) {
    window.renderGameDev(body, sb);
  } else {
    body.innerHTML =
      `<div class="empty">
         <h2>${m.label}</h2>
         <p>${m.blurb || "Coming soon."}</p>
       </div>`;
  }
}

/* ── Auth ────────────────────────────────────────────────────── */

async function signIn() {
  const email = el("email").value.trim();
  const password = el("password").value;
  const msg = el("login-msg");
  const btn = el("sign-in");

  if (!email || !password) {
    msg.classList.remove("ok");
    msg.textContent = "Enter your email and password to continue.";
    return;
  }

  btn.disabled = true;
  msg.classList.remove("ok");
  msg.textContent = "Signing in…";

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false;

  if (error) {
    msg.textContent = "That email and password didn't match. Try again.";
    return;
  }
  msg.textContent = "";
  showApp(data.session);
}

async function signOut() {
  await sb.auth.signOut();
  showLogin();
}

/* ── Wire up + restore session on load ───────────────────────── */

if (!sb) {
  // config.js hasn't been filled in yet — show a calm pointer, not a broken page
  loginView.hidden = false;
  appView.hidden = true;
  const msg = el("login-msg");
  if (msg) msg.textContent = "Add your publishable key to config.js, then refresh.";
  const btn = el("sign-in");
  if (btn) btn.disabled = true;
} else {
  el("sign-in").addEventListener("click", signIn);
  el("password").addEventListener("keydown", (e) => { if (e.key === "Enter") signIn(); });
  el("sign-out").addEventListener("click", signOut);

  sb.auth.getSession().then(({ data }) => {
    if (data.session) showApp(data.session);
    else showLogin();
  });

  sb.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session);
    else showLogin();
  });
}
