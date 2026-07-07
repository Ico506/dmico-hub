/* ─────────────────────────────────────────────────────────────
   dmico life os — in-hub "what's new" banner + tab unread count
   Zero-permission ambient signals for when a hub tab is already open.
   The evening push (push.js + the bot) covers the closed-tab case.

   "Unseen" = curator digests dated today that you haven't dismissed.
   Dismissing records the signature in kv 'hub_last_seen' so it stays
   quiet until something genuinely new lands.
   ───────────────────────────────────────────────────────────── */

(function () {
  const DOMAINS = [
    { id: "content", label: "Content" },
    { id: "research", label: "Research" },
    { id: "markets", label: "Markets" },
  ];

  const today = () => new Date().toISOString().slice(0, 10);

  function injectStyles() {
    if (document.getElementById("nudge-styles")) return;
    const s = document.createElement("style");
    s.id = "nudge-styles";
    s.textContent = `
      .nudge-banner{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;
        margin:0 0 .9rem;padding:.6rem .9rem;border-radius:.6rem;
        background:rgba(226,178,94,.16);border:1px solid rgba(226,178,94,.5);
        font-size:.95rem;}
      .nudge-banner strong{font-weight:700;}
      .nudge-links{display:flex;gap:.5rem;flex-wrap:wrap;}
      .nudge-link{cursor:pointer;text-decoration:underline;color:inherit;background:none;border:none;font:inherit;padding:0;}
      .nudge-x{margin-left:auto;cursor:pointer;background:none;border:none;font:inherit;
        color:inherit;opacity:.6;font-size:1.1rem;line-height:1;}
      .nudge-x:hover{opacity:1;}
    `;
    document.head.appendChild(s);
  }

  async function unseen() {
    const digest = (await window.dmicoKvGet("curator_digest")) || {};
    const seenBlob = (await window.dmicoKvGet("hub_last_seen")) || {};
    const seen = (seenBlob && seenBlob.seen) || {};
    const t = today();
    const items = [];
    DOMAINS.forEach((d) => {
      const dg = digest[d.id];
      if (dg && dg.date === t) {
        const sig = `${d.id}:${t}`;
        if (!seen[sig]) items.push({ label: `${d.label} digest`, sig });
      }
    });
    return items;
  }

  async function markSeen(sigs) {
    const blob = (await window.dmicoKvGet("hub_last_seen")) || {};
    const seen = (blob && blob.seen) || {};
    sigs.forEach((s) => (seen[s] = true));
    // keep the map from growing forever: drop entries older than ~14 days
    const cutoff = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
    Object.keys(seen).forEach((k) => {
      const d = (k.split(":")[1] || "");
      if (d && d < cutoff) delete seen[k];
    });
    await window.dmicoKvSet("hub_last_seen", { seen });
  }

  function setTabCount(n) {
    document.title = n > 0 ? `(${n}) DMICO` : "DMICO";
  }

  // Called by the shell on login and after a domain opens.
  window.dmicoRenderNudge = async function () {
    injectStyles();
    const app = document.getElementById("app-view");
    if (!app) return;
    const items = await unseen();
    setTabCount(items.length);

    const existing = document.getElementById("nudge-banner");
    if (existing) existing.remove();
    if (!items.length) return;

    const bar = document.createElement("div");
    bar.id = "nudge-banner";
    bar.className = "nudge-banner";
    const links = items
      .map((it) => `<button class="nudge-link" data-sig="${it.sig}">${it.label}</button>`)
      .join(" · ");
    bar.innerHTML =
      `<span>🔔 <strong>New since you last looked:</strong></span>` +
      `<span class="nudge-links">${links}</span>` +
      `<button class="nudge-x" title="Dismiss" aria-label="Dismiss">✕</button>`;

    // insert at the very top of the stage
    const stage = document.querySelector(".stage") || app;
    const body = document.getElementById("stage-body");
    if (body && body.parentElement) body.parentElement.insertBefore(bar, body);
    else stage.insertBefore(bar, stage.firstChild);

    bar.querySelectorAll(".nudge-link").forEach((b) =>
      b.addEventListener("click", async () => {
        if (window.__openModule) window.__openModule("curators");
        await markSeen([b.dataset.sig]);
        window.dmicoRenderNudge();
      })
    );
    bar.querySelector(".nudge-x").addEventListener("click", async () => {
      await markSeen(items.map((it) => it.sig));
      bar.remove();
      setTabCount(0);
    });
  };
})();
