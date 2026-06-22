/* ─────────────────────────────────────────────────────────────
   dmico life os — interaction layer (global, self-contained)
     1. Sliding tab indicator: a soft pill glides behind the active
        tab in any .r-tabs bar. Degrades safe: if this never runs,
        the static .current highlight still shows (see styles.css).
     2. window.dmicoCelebrate(originEl): a brief confetti burst in the
        brand palette, for goal/streak completions.
   Both honour prefers-reduced-motion. No module logic is touched.
   ───────────────────────────────────────────────────────────── */

(function () {
  const reduce = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Sliding tab indicator ───────────────────────────────────
  function ensureIndicator(tabs) {
    let ind = tabs.querySelector(":scope > .r-tab-ind");
    if (!ind) {
      tabs.classList.add("has-ind");
      if (getComputedStyle(tabs).position === "static") tabs.style.position = "relative";
      ind = document.createElement("div");
      ind.className = "r-tab-ind";
      ind.setAttribute("aria-hidden", "true");
      tabs.insertBefore(ind, tabs.firstChild);
      ind._init = false;
    }
    return ind;
  }

  function place(tabs) {
    if (!tabs || !tabs.querySelector) return;
    const cur = tabs.querySelector(".r-tab.current");
    const ind = ensureIndicator(tabs);
    if (!cur) { ind.style.opacity = "0"; return; }
    ind.style.width = cur.offsetWidth + "px";
    ind.style.height = cur.offsetHeight + "px";
    ind.style.transform = "translate(" + cur.offsetLeft + "px, " + cur.offsetTop + "px)";
    ind.style.opacity = "1";
    if (!ind._init) {
      // First placement should not slide in from (0,0).
      ind._init = true;
      ind.style.transition = "none";
      requestAnimationFrame(() => {
        ind.style.transition = reduce()
          ? "opacity .15s ease"
          : "transform .28s cubic-bezier(.4,0,.2,1), width .28s ease, height .28s ease, opacity .2s ease";
      });
    }
  }

  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.matches && node.matches(".r-tabs")) requestAnimationFrame(() => place(node));
    if (node.querySelectorAll) node.querySelectorAll(".r-tabs").forEach((t) => requestAnimationFrame(() => place(t)));
  }

  function placeAll() {
    document.querySelectorAll(".r-tabs").forEach(place);
  }

  // Re-place after a tab is clicked (the module sets .current synchronously,
  // so by the time this bubble handler runs the new tab is current).
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest(".r-tab");
    if (!t) return;
    const tabs = t.closest(".r-tabs");
    if (tabs) requestAnimationFrame(() => place(tabs));
  });

  window.addEventListener("resize", () => placeAll());

  // New tab bars appear whenever a module renders. Watch and wire them.
  const mo = new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes && m.addedNodes.forEach(scan));
  });
  function startObserving() {
    mo.observe(document.body, { childList: true, subtree: true });
    requestAnimationFrame(placeAll);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startObserving);
  else startObserving();

  // ── Celebration confetti ────────────────────────────────────
  const CONFETTI = ["#C4661F", "#5F6F52", "#B08A2A", "#8A3F1E", "#EADCBD"];
  window.dmicoCelebrate = function (origin) {
    if (reduce()) return;
    let x = window.innerWidth / 2, y = window.innerHeight / 3;
    try {
      const r = origin && origin.getBoundingClientRect && origin.getBoundingClientRect();
      if (r) { x = r.left + r.width / 2; y = r.top + r.height / 2; }
    } catch (e) {}
    const wrap = document.createElement("div");
    wrap.className = "dmico-confetti";
    wrap.style.left = x + "px";
    wrap.style.top = y + "px";
    for (let i = 0; i < 28; i++) {
      const p = document.createElement("i");
      const ang = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 130;
      p.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      p.style.setProperty("--dy", Math.sin(ang) * dist - 50 + "px");
      p.style.setProperty("--rot", Math.random() * 720 - 360 + "deg");
      p.style.background = CONFETTI[i % CONFETTI.length];
      p.style.animationDelay = Math.random() * 70 + "ms";
      wrap.appendChild(p);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 1400);
  };
})();
