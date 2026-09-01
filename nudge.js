/* ─────────────────────────────────────────────────────────────
   dmico life os — the "what needs you" banner
   A thin strip carried on every module EXCEPT Home, so that wherever you
   are in the hub you can still see if something wants you.

   It no longer computes anything itself. It reads window.dmicoComputeState
   (now.js), the same single computation behind Home's state block and the
   lantern rail, so the three surfaces cannot disagree. Before this, the
   banner ran its own private version of "what needs you" and could tell you
   something different from the screen directly beneath it.

   On Home the banner stays hidden, because the state block does the same job
   properly and two of them is just noise.
   ───────────────────────────────────────────────────────────── */

(function () {
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function injectStyles() {
    if (document.getElementById("nudge-styles")) return;
    const s = document.createElement("style");
    s.id = "nudge-styles";
    s.textContent = `
      .nudge-banner{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;
        margin:0 0 1rem;padding:.55rem .9rem;border-radius:var(--radius,14px);
        background:var(--surface,#FEFAE0);border:1px solid var(--line,#E3D7BA);
        font-size:.92rem;color:var(--ink,#45301E);}
      .nudge-eyebrow{font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;
        color:var(--ink-faint,#A89A7C);font-weight:700;}
      .nudge-links{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;}
      .nudge-link{cursor:pointer;background:none;border:none;font:inherit;padding:0;
        color:inherit;text-decoration:underline;text-underline-offset:3px;
        text-decoration-color:var(--line,#E3D7BA);}
      .nudge-link:hover{text-decoration-color:var(--ink-soft,#7C6A4F);}
      .nudge-dot{display:inline-block;width:6px;height:6px;border-radius:999px;
        margin-right:.4rem;vertical-align:middle;}
      .nudge-dot.lit{background:var(--lantern,#C4661F);}
      .nudge-dot.warm{background:var(--amber,#B08A2A);}
      .nudge-x{margin-left:auto;cursor:pointer;background:none;border:none;font:inherit;
        color:inherit;opacity:.5;font-size:1rem;line-height:1;padding:0 .2rem;}
      .nudge-x:hover{opacity:1;}
    `;
    document.head.appendChild(s);
  }

  const currentModule = () =>
    (document.querySelector(".lantern.current") || {}).dataset?.id || null;

  // Dismissal is per-session and cosmetic. These items are live state, not
  // notifications, so "dismiss" means "stop showing me the strip for now", never
  // "pretend this is resolved". Being over budget does not go away because you
  // closed a bar.
  const dismissed = () => sessionStorage.getItem("dmico-nudge-dismissed") === "1";

  window.dmicoRenderNudge = async function (sb) {
    injectStyles();
    const app = document.getElementById("app-view");
    if (!app) return;

    const existing = document.getElementById("nudge-banner");
    if (existing) existing.remove();

    // Home already shows all of this, properly, in the state block.
    if (currentModule() === "dashboard") { setTabCount(0, true); return; }
    if (dismissed()) return;
    if (!window.dmicoComputeState) return;

    let st;
    try { st = await window.dmicoComputeState(sb); }
    catch (e) { console.error("nudge: state read failed", e); return; }

    const items = (st.items || []);
    setTabCount(items.length);
    if (!items.length) return;

    const bar = document.createElement("div");
    bar.id = "nudge-banner";
    bar.className = "nudge-banner";
    const links = items.slice(0, 4).map((it, i) =>
      `<button class="nudge-link" data-mod="${esc(it.module || "dashboard")}" data-i="${i}">` +
      `<span class="nudge-dot ${it.tone === "lit" ? "lit" : "warm"}"></span>${esc(it.text)}</button>`
    ).join(" · ");
    const more = items.length > 4 ? ` <span class="nudge-eyebrow">+${items.length - 4} more</span>` : "";

    bar.innerHTML =
      `<span class="nudge-eyebrow">What needs you</span>` +
      `<span class="nudge-links">${links}${more}</span>` +
      `<button class="nudge-x" title="Hide for now" aria-label="Hide for now">✕</button>`;

    const body = document.getElementById("stage-body");
    if (body && body.parentElement) body.parentElement.insertBefore(bar, body);
    else app.insertBefore(bar, app.firstChild);

    bar.querySelectorAll(".nudge-link").forEach((b) =>
      b.addEventListener("click", () => {
        const mod = b.dataset.mod;
        if (mod && mod !== "dashboard" && window.__openModule) window.__openModule(mod);
      })
    );
    bar.querySelector(".nudge-x").addEventListener("click", () => {
      sessionStorage.setItem("dmico-nudge-dismissed", "1");
      bar.remove();
    });
  };

  // The browser-tab unread count. Kept here because it is the same signal, but it
  // reflects the shared state rather than a private count. Home clears it, since
  // being on Home means you are already looking at the list.
  function setTabCount(n, clear) {
    document.title = (!clear && n > 0) ? `(${n}) DMICO` : "DMICO";
  }
})();
