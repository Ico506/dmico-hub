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
  { id: "dashboard",  label: "Home",       lit: true,
    blurb: "Your life OS at a glance." },
  { id: "research",   label: "Research",   lit: true,
    blurb: "Your reference library and paper discovery live here." },
  { id: "selfstudy",  label: "Self-study", lit: true,
    blurb: "Track exams with a live countdown and run focus sessions." },
  { id: "hygiene",    label: "Hygiene",    lit: true,
    blurb: "Cleaning timers and supply inventory." },
  { id: "gamedev",    label: "Game Dev",   lit: true,
    blurb: "JadeFrog Studio projects, devlog, and idea board." },
  { id: "finance",    label: "Finance",    lit: true,
    blurb: "Expense tracker and savings goals leaderboard." },
  { id: "thesis",     label: "Thesis",     lit: true,
    blurb: "MPhil chapter tracker and writing log." },
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
  openModule("dashboard");
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

// Exposed for dashboard cards to navigate between modules
window.__openModule = function (id) { openModule(id); };

function openModule(id) {
  const m = MODULES.find((x) => x.id === id);
  if (!m || !m.lit) return;

  document.querySelectorAll(".lantern").forEach((n) =>
    n.classList.toggle("current", n.dataset.id === id)
  );

  el("module-eyebrow").textContent = m.label;
  const body = el("stage-body");
  if (id === "dashboard" && window.renderDashboard) {
    window.renderDashboard(body, sb);
  } else if (id === "research" && window.renderResearch) {
    window.renderResearch(body, sb);
  } else if (id === "selfstudy" && window.renderSelfStudy) {
    window.renderSelfStudy(body, sb);
  } else if (id === "hygiene" && window.renderHygiene) {
    window.renderHygiene(body, sb);
  } else if (id === "gamedev" && window.renderGameDev) {
    window.renderGameDev(body, sb);
  } else if (id === "finance" && window.renderFinance) {
    window.renderFinance(body, sb);
  } else if (id === "thesis" && window.renderThesis) {
    window.renderThesis(body, sb);
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

/* ── Draggable tabs ──────────────────────────────────────────── */
// Auto-attaches to every .r-tabs bar that appears anywhere in #stage-body.
// Order persists per-module in localStorage so it survives refresh.

function currentModuleId() {
  return document.querySelector(".lantern.current")?.dataset.id ?? null;
}

function saveTabOrder(tabBar) {
  const id = currentModuleId();
  if (!id) return;
  const order = Array.from(tabBar.querySelectorAll(".r-tab")).map((t) => t.dataset.tab);
  localStorage.setItem(`dmico-tab-order-${id}`, JSON.stringify(order));
}

function applyTabOrder(tabBar) {
  const id = currentModuleId();
  if (!id) return;
  const raw = localStorage.getItem(`dmico-tab-order-${id}`);
  if (!raw) return;
  try {
    const order = JSON.parse(raw);
    order.forEach((key) => {
      const tab = tabBar.querySelector(`.r-tab[data-tab="${key}"]`);
      if (tab) tabBar.appendChild(tab); // moves to end in saved order
    });
  } catch (e) { /* ignore corrupt storage */ }
}

function attachDraggableTabs(tabBar) {
  tabBar.setAttribute("data-draggable", "true");
  applyTabOrder(tabBar);

  let dragSrc = null;

  tabBar.querySelectorAll(".r-tab").forEach((tab) => {
    tab.setAttribute("draggable", "true");

    tab.addEventListener("dragstart", (e) => {
      dragSrc = tab;
      setTimeout(() => tab.classList.add("r-tab-dragging"), 0);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tab.dataset.tab ?? "");
    });

    tab.addEventListener("dragend", () => {
      tab.classList.remove("r-tab-dragging");
      tabBar.querySelectorAll(".r-tab").forEach((t) => {
        t.classList.remove("r-tab-drag-before", "r-tab-drag-after");
      });
    });

    tab.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!dragSrc || tab === dragSrc) return;
      tabBar.querySelectorAll(".r-tab").forEach((t) => {
        t.classList.remove("r-tab-drag-before", "r-tab-drag-after");
      });
      const rect = tab.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      tab.classList.add(before ? "r-tab-drag-before" : "r-tab-drag-after");
    });

    tab.addEventListener("dragleave", () => {
      tab.classList.remove("r-tab-drag-before", "r-tab-drag-after");
    });

    tab.addEventListener("drop", (e) => {
      e.preventDefault();
      tab.classList.remove("r-tab-drag-before", "r-tab-drag-after");
      if (!dragSrc || dragSrc === tab) return;
      const rect = tab.getBoundingClientRect();
      const before = e.clientX < rect.left + rect.width / 2;
      tabBar.insertBefore(dragSrc, before ? tab : tab.nextSibling);
      saveTabOrder(tabBar);
    });
  });
}

// Watch #stage-body for any new .r-tabs and attach automatically.
(function initTabObserver() {
  const stage = document.getElementById("stage-body");
  if (!stage) return;
  new MutationObserver(() => {
    stage.querySelectorAll(".r-tabs:not([data-draggable])").forEach(attachDraggableTabs);
  }).observe(stage, { childList: true, subtree: true });
})();

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
