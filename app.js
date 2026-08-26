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

/* The modules. Lit ones are built; unlit ones light up as we build them.
   `archived: true` tucks a module into the collapsed Archive group at the foot of
   the rail. Nothing is deleted and no routing changes, so un-archiving is a
   one-word edit. Archived 2026-08-25 after a usage audit: these were either never
   used, went cold, or (Research/Thesis/Self-study, Game Dev) are moving to their
   own separate sites later. */
const MODULES = [
  { id: "dashboard",  label: "Home",       lit: true,
    blurb: "Your life OS at a glance." },
  { id: "week",       label: "Week",       lit: true,
    blurb: "Your full Google Calendar week: anchors, focus, study, and play." },
  { id: "control",    label: "Control",    lit: true,
    blurb: "The cockpit: routine anchors, planning triggers, and bot settings." },
  { id: "life",       label: "Life",       lit: true,
    blurb: "Mood, prompt-driven journal, and reflections." },
  { id: "curators",   label: "Curators",   lit: true,
    blurb: "Proactive, taste-tuned digests. The Content Scout finds what fits you." },
  { id: "finance",    label: "Finance",    lit: true,
    blurb: "Expense tracker and savings goals leaderboard." },
  { id: "exercise",   label: "Exercise",   lit: true,
    blurb: "Weight tracking and a healthy calorie goal." },

  /* ── Archive (hidden by default, one click to reveal) ── */
  { id: "research",   label: "Research",   lit: true, archived: true,
    blurb: "Your reference library and paper discovery live here." },
  { id: "thesis",     label: "Thesis",     lit: true, archived: true,
    blurb: "MPhil chapter tracker and writing log." },
  { id: "selfstudy",  label: "Self-study", lit: true, archived: true,
    blurb: "Track exams with a live countdown and run focus sessions." },
  { id: "gamedev",    label: "Game Dev",   lit: true, archived: true,
    blurb: "JadeFrog Studio projects, devlog, and idea board." },
  { id: "hygiene",    label: "Hygiene",    lit: true, archived: true,
    blurb: "Cleaning timers and supply inventory." },
  { id: "groceries",  label: "Groceries",  lit: true, archived: true,
    blurb: "Kitchen inventory with freshness tracking and your personal cookbook." },
  { id: "entertainment", label: "Entertainment", lit: true, archived: true,
    blurb: "Planned game and movie sessions, and your play/watch library." },
];

const el = (id) => document.getElementById(id);
const loginView = el("login-view");
const appView = el("app-view");

/* ── View switching ──────────────────────────────────────────── */

// Tracks whether the app shell is already rendered, so auth events that don't
// change login state (TOKEN_REFRESHED, INITIAL_SESSION after getSession) can't
// re-render everything and yank you back to the dashboard mid-work.
let appShown = false;

function showLogin() {
  appShown = false;
  appView.hidden = true;
  loginView.hidden = false;
  el("password").value = "";
}

function showApp(session) {
  appShown = true;
  loginView.hidden = true;
  appView.hidden = false;
  el("greeting").textContent = greeting(session);
  renderRail();
  renderBottomBar();
  // Reopen the module you were last in, so a page reload (tab discarded in the
  // background, phone memory eviction, F5) doesn't dump you back on Home.
  const last = localStorage.getItem("dmico-last-module");
  const lastOk = MODULES.some((x) => x.id === last && x.lit);
  openModule(lastOk ? last : "dashboard");
  // NFC tap-action: a tag opens the hub with #do=<action>. Dispatch then clear
  // the hash so a refresh doesn't re-fire it. (QoL Item 8)
  const m = (location.hash || "").match(/do=([a-z0-9_:]+)/i);
  if (m) {
    const act = m[1];
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    setTimeout(() => { try { window.dmicoHandleNfc(act); } catch (e) { console.error("nfc", e); } }, 380);
  }
  // Nudge (PWA): "what's new" banner + tab count, and the bell toggle in the rail.
  try { window.dmicoRenderNudge && window.dmicoRenderNudge(); } catch (e) {}
  try { window.dmicoRefreshRail && window.dmicoRefreshRail(sb); } catch (e) {}
  try { window.dmicoInitNudgeUI && window.dmicoInitNudgeUI(); } catch (e) {}
}

function greeting(session) {
  const h = new Date().getHours();
  const part = h < 5 ? "Late night" : h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening";
  const name = (session?.user?.email || "").split("@")[0];
  return name ? `${part}, ${name}` : part;
}

/* ── The lantern rail ────────────────────────────────────────── */

function injectRailStyles() {
  if (document.getElementById("rail-archive-styles")) return;
  const s = document.createElement("style");
  s.id = "rail-archive-styles";
  s.textContent = `
    .rail-archive{margin-top:.5rem;border-top:1px solid rgba(128,128,128,.22);padding-top:.5rem;}
    .rail-archive-sum{cursor:pointer;list-style:none;padding:.35rem .5rem;border-radius:.5rem;
      font-size:.78rem;letter-spacing:.04em;text-transform:uppercase;opacity:.55;}
    .rail-archive-sum::-webkit-details-marker{display:none;}
    .rail-archive-sum::before{content:"▸ ";display:inline-block;transition:transform .15s;}
    .rail-archive[open] .rail-archive-sum::before{transform:rotate(90deg);}
    .rail-archive-sum:hover{opacity:.85;}
    .rail-archive-list{display:flex;flex-direction:column;}
    .lantern-archived{opacity:.6;}
    .lantern-archived:hover{opacity:1;}
    /* Attention state. Deliberately NOT called "lit", which already means "module is
       built". These ride on top: warm = something waiting, attn = needs you now. */
    .lantern-attn-warm .dot{background:var(--amber,#B08A2A);}
    .lantern-attn-lit .dot{background:var(--lantern,#C4661F);
      box-shadow:0 0 0 3px var(--lantern-glow,rgba(196,102,31,.32));
      animation:lantern-breathe 2.6s ease-in-out infinite;}
    .lantern-attn-lit .label{font-weight:600;}
    @keyframes lantern-breathe{
      0%,100%{box-shadow:0 0 0 3px var(--lantern-glow,rgba(196,102,31,.32));}
      50%{box-shadow:0 0 0 6px rgba(196,102,31,.14);}
    }
    @media (prefers-reduced-motion:reduce){
      .lantern-attn-lit .dot{animation:none;}
    }
  `;
  document.head.appendChild(s);
}

function renderRail() {
  injectRailStyles();
  // Apply saved order to MODULES array so it persists across sessions.
  const savedOrder = localStorage.getItem("dmico-rail-order");
  if (savedOrder) {
    try {
      const order = JSON.parse(savedOrder);
      MODULES.sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    } catch (_) {}
  }

  const nav = el("modules");
  nav.innerHTML = "";
  let dragSrc = null;

  // Active lanterns render straight into the rail; archived ones go into a
  // collapsed group at the foot (built after this loop).
  const buildLantern = (m, container) => {
    const b = document.createElement("button");
    b.className = "lantern " + (m.lit ? "lit" : "unlit") + (m.archived ? " lantern-archived" : "");
    b.dataset.id = m.id;
    // Only active lanterns reorder; dragging an archived one into the live rail
    // would fight the archive split.
    if (!m.archived) b.setAttribute("draggable", "true");
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

    b.addEventListener("dragstart", (e) => {
      dragSrc = b;
      setTimeout(() => b.classList.add("lantern-dragging"), 0);
      e.dataTransfer.effectAllowed = "move";
    });
    b.addEventListener("dragend", () => {
      b.classList.remove("lantern-dragging");
      nav.querySelectorAll(".lantern").forEach((l) =>
        l.classList.remove("lantern-drag-above", "lantern-drag-below")
      );
    });
    b.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!dragSrc || b === dragSrc) return;
      nav.querySelectorAll(".lantern").forEach((l) =>
        l.classList.remove("lantern-drag-above", "lantern-drag-below")
      );
      const rect = b.getBoundingClientRect();
      b.classList.add(
        e.clientY < rect.top + rect.height / 2
          ? "lantern-drag-above"
          : "lantern-drag-below"
      );
    });
    b.addEventListener("dragleave", () => {
      b.classList.remove("lantern-drag-above", "lantern-drag-below");
    });
    b.addEventListener("drop", (e) => {
      e.preventDefault();
      b.classList.remove("lantern-drag-above", "lantern-drag-below");
      if (!dragSrc || dragSrc === b) return;
      const rect = b.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      nav.insertBefore(dragSrc, above ? b : b.nextSibling);
      const newOrder = Array.from(nav.querySelectorAll(":scope > .lantern")).map((l) => l.dataset.id);
      MODULES.sort((a, bm) => newOrder.indexOf(a.id) - newOrder.indexOf(bm.id));
      localStorage.setItem("dmico-rail-order", JSON.stringify(newOrder));
    });

    container.appendChild(b);
  };

  const active = MODULES.filter((m) => !m.archived);
  const archived = MODULES.filter((m) => m.archived);

  active.forEach((m) => buildLantern(m, nav));

  if (archived.length) {
    const box = document.createElement("details");
    box.className = "rail-archive";
    // Remember whether the drawer was left open.
    box.open = localStorage.getItem("dmico-archive-open") === "1";
    box.addEventListener("toggle", () =>
      localStorage.setItem("dmico-archive-open", box.open ? "1" : "0")
    );
    const sum = document.createElement("summary");
    sum.className = "rail-archive-sum";
    sum.textContent = `Archive (${archived.length})`;
    box.appendChild(sum);
    const inner = document.createElement("div");
    inner.className = "rail-archive-list";
    box.appendChild(inner);
    archived.forEach((m) => buildLantern(m, inner));
    nav.appendChild(box);
  }
}

/* ── The mobile bottom bar ────────────────────────────────────
   Below the tablet breakpoint the rail is replaced by a thumb-reachable bottom
   bar: Home / Week / Life / Finance, plus a "More" slot that opens a sheet with
   everything else (Curators, Exercise, Control, then the Archive). Confirmed in
   the design brief, section 8.1. Each slot carries the same dim/warm/lit dot
   language as the rail; More shows the highest state of anything inside it, so
   nothing hides there unnoticed. */

const BOTTOM_BAR_PRIMARY = ["dashboard", "week", "life", "finance"];
const MORE_MODULE_IDS = ["control", "curators", "exercise"]; // + whatever is archived

const BBAR_ICONS = {
  dashboard: '<path d="M4 11.2 12 4.5l8 6.7"></path><path d="M6.2 10.6V19h11.6v-8.4"></path><path d="M10.2 19v-4.6h3.6V19"></path>',
  week: '<rect x="4" y="6" width="16" height="14" rx="2.5"></rect><path d="M8 4.2v3.4M16 4.2v3.4M4.4 10.6h15.2"></path>',
  life: '<path d="M12 20c0-5 2-9 7-10.6C18.4 15 15.8 19 12 20Z"></path><path d="M12 20C9.2 16.6 7.6 12.8 8 8.4c2.6 1.6 4 4.4 4 7.6Z"></path><path d="M12 20v-3"></path>',
  finance: '<ellipse cx="12" cy="7.6" rx="7" ry="3.2"></ellipse><path d="M5 7.6v8.8c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2V7.6"></path><path d="M5 12c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2"></path>',
  more: '<circle cx="6" cy="12" r="1.3"></circle><circle cx="12" cy="12" r="1.3"></circle><circle cx="18" cy="12" r="1.3"></circle>',
};

function svgIcon(id) {
  return `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${BBAR_ICONS[id] || ""}</svg>`;
}

function renderBottomBar() {
  const bar = el("bottom-bar");
  if (!bar) return;
  bar.innerHTML = "";

  BOTTOM_BAR_PRIMARY.forEach((id) => {
    const m = MODULES.find((x) => x.id === id);
    const b = document.createElement("button");
    b.className = "bbar-item";
    b.dataset.id = id;
    b.innerHTML = `<span class="bbar-icon">${svgIcon(id)}</span>` +
      `<span class="bbar-label">${m ? m.label : id}</span>` +
      `<span class="bbar-dot"></span>`;
    b.addEventListener("click", () => openModule(id));
    bar.appendChild(b);
  });

  const moreBtn = document.createElement("button");
  moreBtn.className = "bbar-item";
  moreBtn.dataset.id = "more";
  moreBtn.innerHTML = `<span class="bbar-icon">${svgIcon("more")}</span>` +
    `<span class="bbar-label">More</span><span class="bbar-dot"></span>`;
  moreBtn.addEventListener("click", openMoreSheet);
  bar.appendChild(moreBtn);
}

function moreSheetModuleIds() {
  // Everything not already on the bottom bar: the three "more" modules, then
  // whatever is archived, in rail order.
  const archivedIds = MODULES.filter((m) => m.archived).map((m) => m.id);
  return MORE_MODULE_IDS.concat(archivedIds);
}

function openMoreSheet() {
  const sheet = el("more-sheet");
  const list = el("more-sheet-list");
  if (!sheet || !list) return;

  list.innerHTML = moreSheetModuleIds().map((id) => {
    const m = MODULES.find((x) => x.id === id);
    if (!m) return "";
    return `<button class="more-sheet-row" data-id="${id}">
        <span class="more-sheet-dot" data-dot="${id}"></span>
        <span class="more-sheet-label">${m.label}</span>
      </button>`;
  }).join("");

  list.querySelectorAll(".more-sheet-row").forEach((row) =>
    row.addEventListener("click", () => {
      closeMoreSheet();
      openModule(row.dataset.id);
    })
  );

  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add("open"));
  try { window.dmicoRefreshRail && window.dmicoRefreshRail(sb); } catch (e) {}
}

function closeMoreSheet() {
  const sheet = el("more-sheet");
  if (!sheet) return;
  sheet.classList.remove("open");
  setTimeout(() => { sheet.hidden = true; }, 200);
}

(function initMoreSheet() {
  const sheet = el("more-sheet");
  if (!sheet) return;
  sheet.querySelector(".more-sheet-backdrop")?.addEventListener("click", closeMoreSheet);
})();

// Exposed for dashboard cards to navigate between modules
window.__openModule = function (id) { openModule(id); };

/* Single source of truth for what is archived. The MODULES array above decides, and
   every other surface (rail, Home cards) asks here, so archiving a module in one
   place hides it everywhere. */
window.dmicoIsArchived = function (id) {
  const m = MODULES.find((x) => x.id === id);
  return !!(m && m.archived);
};
window.dmicoVisibleCount = function () {
  return MODULES.filter((m) => !m.archived).length;
};

/* Paint the rail AND the mobile bottom bar with attention state, so a glance at
   either tells you where something is waiting. Reads the same shared computation
   as the Home block, so every surface agrees. Best-effort and non-blocking. */
window.dmicoRefreshRail = async function (sbClient) {
  if (!window.dmicoAttentionMap) return;
  try {
    const map = await window.dmicoAttentionMap(sbClient || sb);

    document.querySelectorAll(".lantern").forEach((l) => {
      const tone = map[l.dataset.id];
      l.classList.toggle("lantern-attn-lit", tone === "lit");
      l.classList.toggle("lantern-attn-warm", tone === "warm");
    });

    const paintDot = (dotEl, tone) => {
      if (!dotEl) return;
      dotEl.classList.toggle("bbar-dot-lit", tone === "lit");
      dotEl.classList.toggle("bbar-dot-warm", tone === "warm");
    };

    document.querySelectorAll(".bbar-item").forEach((b) => {
      const id = b.dataset.id;
      if (id === "more") {
        // More carries the highest state of anything tucked inside it, so
        // nothing hides there unnoticed.
        const inside = moreSheetModuleIds();
        const tone = inside.some((mid) => map[mid] === "lit") ? "lit"
          : inside.some((mid) => map[mid] === "warm") ? "warm" : null;
        paintDot(b.querySelector(".bbar-dot"), tone);
      } else {
        paintDot(b.querySelector(".bbar-dot"), map[id]);
      }
    });

    // The More sheet, if open, carries its own per-row dots.
    document.querySelectorAll(".more-sheet-dot").forEach((dotEl) => {
      paintDot(dotEl, map[dotEl.dataset.dot]);
    });
  } catch (e) { console.error("rail refresh failed", e); }
};

/* NFC tap-actions: an NFC tag opens the hub with #do=<action>; this dispatches
   it to the right place. Each follow-up is best-effort and guarded, so a missing
   element just leaves you on the opened tab. (QoL Item 8) */
window.dmicoHandleNfc = function (action) {
  if (!action) return;
  const after = (fn, ms) => setTimeout(() => { try { fn(); } catch (e) { console.error("nfc step", e); } }, ms || 500);
  const click = (sel) => { const n = document.querySelector(sel); if (n) n.click(); };
  const focusEl = (sel) => { const n = document.querySelector(sel); if (n && n.focus) n.focus(); };
  const scrollTo = (sel) => { const n = document.querySelector(sel); if (n && n.scrollIntoView) n.scrollIntoView({ behavior: "smooth", block: "center" }); };

  if (action.indexOf("tab:") === 0) { openModule(action.slice(4)); return; }

  switch (action) {
    case "focus":
      openModule("selfstudy");
      after(() => { click('.r-tab[data-tab="focus"]'); after(() => click("#s-start"), 300); });
      break;
    case "weighin":
      openModule("exercise");
      after(() => focusEl("#ex-weight"));
      break;
    case "mood":
      openModule("life");
      after(() => scrollTo("#life-mood"));
      break;
    case "reflect":
      openModule("life");
      after(() => scrollTo("#life-reflect-top"));
      break;
    case "expense":
      openModule("finance");
      after(() => click('.r-tab[data-tab="expenses"]'));
      break;
    case "ripple":
      openModule("week");
      after(() => { const d = document.querySelector(".wk-ripple-wrap"); if (d) { d.open = true; if (d.scrollIntoView) d.scrollIntoView({ behavior: "smooth", block: "center" }); } });
      break;
    case "workout":
      openModule("control");
      after(() => scrollTo("#ctl-checkin-today"));
      break;
    default:
      openModule("dashboard");
  }
};

/* Direct kv read/write for instant personal-data saves (mood, journal,
   reflections, profile, countdowns). The bot reads these same keys live, so a
   hub write is picked up with no queue lag. Read-modify-write in the caller. */
window.dmicoKvGet = async function (key) {
  if (!sb) return null;
  try {
    const res = await sb.from("kv_store").select("value").eq("key", key).limit(1);
    return res?.data?.[0]?.value ?? null;
  } catch (e) { console.error("kvGet threw", e); return null; }
};
window.dmicoKvSet = async function (key, value) {
  if (!sb) return false;
  try {
    const { error } = await sb.from("kv_store").upsert({ key, value }, { onConflict: "key" });
    if (error) { console.error("kvSet failed", error); return false; }
    return true;
  } catch (e) { console.error("kvSet threw", e); return false; }
};

/* Hub-as-editor: append an edit intent to the kv 'hub_actions' queue. The bot
   drains it (~30s) and applies to Google Calendar / the library server-side,
   then refreshes the snapshot. Returns true on success. */
window.dmicoEnqueue = async function (action) {
  if (!sb) return false;
  action.id = action.id ||
    (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
  action.ts = new Date().toISOString();
  try {
    const res = await sb.from("kv_store").select("value").eq("key", "hub_actions").limit(1);
    const cur = res?.data?.[0]?.value;
    const queue = (cur && Array.isArray(cur.queue)) ? cur.queue : [];
    queue.push(action);
    const { error } = await sb.from("kv_store")
      .upsert({ key: "hub_actions", value: { queue } }, { onConflict: "key" });
    if (error) { console.error("enqueue failed", error); return false; }
    return true;
  } catch (e) {
    console.error("enqueue threw", e);
    return false;
  }
};

function openModule(id) {
  const m = MODULES.find((x) => x.id === id);
  if (!m || !m.lit) return;

  // Remember where you are so a reload can restore it.
  try { localStorage.setItem("dmico-last-module", id); } catch (e) {}

  document.querySelectorAll(".lantern").forEach((n) =>
    n.classList.toggle("current", n.dataset.id === id)
  );
  document.querySelectorAll(".bbar-item").forEach((n) =>
    n.classList.toggle("current", n.dataset.id === id ||
      (n.dataset.id === "more" && moreSheetModuleIds().includes(id)))
  );

  el("module-eyebrow").textContent = m.label;
  const body = el("stage-body");
  if (id === "dashboard" && window.renderDashboard) {
    window.renderDashboard(body, sb);
  } else if (id === "week" && window.renderWeek) {
    window.renderWeek(body, sb);
  } else if (id === "control" && window.renderControl) {
    window.renderControl(body, sb);
  } else if (id === "life" && window.renderLife) {
    window.renderLife(body, sb);
  } else if (id === "research" && window.renderResearch) {
    window.renderResearch(body, sb);
  } else if (id === "curators" && window.renderCurators) {
    window.renderCurators(body, sb);
  } else if (id === "selfstudy" && window.renderSelfStudy) {
    window.renderSelfStudy(body, sb);
  } else if (id === "hygiene" && window.renderHygiene) {
    window.renderHygiene(body, sb);
  } else if (id === "groceries" && window.renderGroceries) {
    window.renderGroceries(body, sb);
  } else if (id === "gamedev" && window.renderGameDev) {
    window.renderGameDev(body, sb);
  } else if (id === "finance" && window.renderFinance) {
    window.renderFinance(body, sb);
  } else if (id === "thesis" && window.renderThesis) {
    window.renderThesis(body, sb);
  } else if (id === "exercise" && window.renderExercise) {
    window.renderExercise(body, sb);
  } else if (id === "entertainment" && window.renderEntertainment) {
    window.renderEntertainment(body, sb);
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

  // Only rebuild the app on a real logged-out -> logged-in transition.
  // showApp/showLogin maintain the appShown flag, so a direct signIn() call
  // and the SIGNED_IN event that follows it can't double-render either.
  function handleSession(session) {
    if (session && !appShown) showApp(session);
    else if (!session) showLogin();
    // session && appShown -> token refresh etc.; leave the UI alone.
  }

  sb.auth.getSession().then(({ data }) => handleSession(data.session));

  sb.auth.onAuthStateChange((_event, session) => handleSession(session));
}
