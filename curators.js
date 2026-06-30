/* ─────────────────────────────────────────────────────────────
   dmico life os — Curators module (v1)
   The hub face of the bot's proactive curator agents. Phase 1 is the
   Content Scout: a daily, taste-filtered digest of game-dev / indie /
   design items, delivered to Discord and mirrored here.

   - Digest tab: the latest picks (from kv curator_digest.content), with
     👍/👎 that teach the same taste profile the bot uses, plus a
     "Scout now" button that queues an on-demand run (kv hub_actions →
     the bot runs it within ~30s and posts to Discord).
   - Taste tab: edit the profile the bot curates against — topics, likes,
     dislikes, sources (subreddits / HN queries / RSS / YouTube channels),
     arXiv toggle, and the daily digest time. Saved to kv
     curator_profiles.content, which the bot reads live.

   All state is kv (no schema change). The bot seeds the default profile on
   its first run; this module falls back to a sensible default so the editor
   is never empty before then.
   ───────────────────────────────────────────────────────────── */

(function () {
  let SB = null;
  let root = null;
  const DOMAIN = "content";

  // Mirror of content_curator.DEFAULT_PROFILE, used only until the bot seeds
  // the real one in kv. Kept intentionally small.
  const FALLBACK_PROFILE = {
    topics: [
      "indie game design", "game feel and juice", "solo / small-team dev",
      "AR/VR and immersive design", "narrative and systems design",
      "Unity / C# techniques", "DMICO brand + audience growth",
    ],
    likes: "Concrete, craft-level posts I can learn from: design breakdowns, postmortems, clever mechanics, tools, AR/VR research with game relevance.",
    dislikes: "Pure self-promo with no insight, crypto/NFT hype, engine flame wars, low-effort memes, generic 'I want to make a game' questions.",
    liked: [], disliked: [],
    time: "08:00",
    youtube: [],
    subreddits: ["gamedev", "IndieDev", "gamedesign"],
    hn_queries: ["game development", "indie game", "game design"],
    rss: [
      { url: "https://www.gamedeveloper.com/rss.xml", source: "Game Developer" },
      { url: "https://itch.io/games/newest.xml", source: "itch.io" },
    ],
    use_arxiv: true,
  };

  // ── helpers ────────────────────────────────────────────────
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const lines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const commas = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

  async function getProfile() {
    const blob = (await window.dmicoKvGet("curator_profiles")) || {};
    const p = (blob && blob[DOMAIN]) || {};
    // Merge over the fallback so every field exists.
    return Object.assign({}, FALLBACK_PROFILE, p, {
      liked: p.liked || [], disliked: p.disliked || [],
    });
  }

  async function saveProfile(prof) {
    const blob = (await window.dmicoKvGet("curator_profiles")) || {};
    blob[DOMAIN] = prof;
    return window.dmicoKvSet("curator_profiles", blob);
  }

  async function getDigest() {
    const blob = (await window.dmicoKvGet("curator_digest")) || {};
    return (blob && blob[DOMAIN]) || null;
  }

  // ── layout ─────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("cur-styles")) return;
    const s = document.createElement("style");
    s.id = "cur-styles";
    s.textContent = `
      .cur-label{display:block;margin:.7rem 0 .3rem;font-weight:600;font-size:.92rem;}
      .cur-area,.cur-input{width:100%;box-sizing:border-box;font:inherit;
        padding:.5rem .6rem;border:1px solid rgba(128,128,128,.35);border-radius:.5rem;
        background:rgba(128,128,128,.06);color:inherit;resize:vertical;}
      .cur-input{max-width:10rem;}
      .cur-check{display:flex;align-items:center;gap:.5rem;margin-top:.7rem;font-size:.92rem;}
      .cur-check input{width:auto;}
      .cur-chips{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;margin:.4rem 0;}
      .cur-chip{display:inline-block;padding:.2rem .55rem;border-radius:1rem;font-size:.82rem;
        border:1px solid rgba(128,128,128,.35);}
      .cur-chip.up{background:rgba(70,170,110,.16);}
      .cur-chip.down{background:rgba(200,90,90,.16);}
    `;
    document.head.appendChild(s);
  }

  function render(container, sb) {
    SB = sb;
    root = container;
    injectStyles();
    root.innerHTML = `
      <div class="r-tabs" role="tablist">
        <button class="r-tab current" data-tab="digest">Latest digest</button>
        <button class="r-tab" data-tab="taste">Taste profile</button>
      </div>
      <div id="cur-panel"></div>`;
    root.querySelectorAll(".r-tab").forEach((t) =>
      t.addEventListener("click", () => {
        root.querySelectorAll(".r-tab").forEach((x) => x.classList.toggle("current", x === t));
        openTab(t.dataset.tab);
      })
    );
    openTab("digest");
  }

  function openTab(tab) {
    const panel = document.getElementById("cur-panel");
    if (tab === "digest") return renderDigest(panel);
    if (tab === "taste") return renderTaste(panel);
  }

  // ── Digest tab ─────────────────────────────────────────────
  async function renderDigest(panel) {
    panel.innerHTML = `
      <div class="r-searchbar">
        <button id="cur-scout" class="btn-primary r-btn">🛰️ Scout now</button>
        <span id="cur-scout-msg" class="r-status"></span>
      </div>
      <p class="r-status">The bot posts this to your content channel each morning. 👍/👎 here or in Discord teaches the same profile.</p>
      <div id="cur-digest" class="r-list"></div>`;

    const btn = document.getElementById("cur-scout");
    const msg = document.getElementById("cur-scout-msg");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      msg.textContent = "Queued — the bot runs it within ~30s and posts to Discord.";
      const ok = await window.dmicoEnqueue({ type: "run_curator", domain: DOMAIN });
      if (!ok) msg.textContent = "Couldn't queue the run. Check the connection and try again.";
      setTimeout(() => { btn.disabled = false; }, 4000);
    });

    const list = document.getElementById("cur-digest");
    const digest = await getDigest();
    if (!digest || !(digest.items || []).length) {
      list.innerHTML = `<div class="r-card"><p class="r-abstract">No digest yet. Hit “Scout now”, or wait for the morning run. Quiet days mean nothing cleared the taste bar, which is fine.</p></div>`;
      return;
    }

    const head = document.createElement("p");
    head.className = "r-status";
    head.textContent = `${digest.items.length} pick(s) · ${digest.ts || digest.date || ""}`;
    list.appendChild(head);

    digest.items.forEach((it) => list.appendChild(digestCard(it)));
  }

  function digestCard(it) {
    const card = document.createElement("div");
    card.className = "r-card";
    card.innerHTML = `
      <h3 class="r-title">${esc(it.title)}</h3>
      <div class="r-meta">${esc(it.source || "")}</div>
      ${it.why ? `<p class="r-abstract">${esc(it.why)}</p>` : ""}
      <div class="r-save-row">
        <button class="r-btn cur-up">👍 More like this</button>
        <button class="r-btn cur-down">👎 Less</button>
        ${it.url ? `<a class="r-link" href="${esc(it.url)}" target="_blank" rel="noopener">Open</a>` : ""}
      </div>`;
    const gist = it.gist || it.title;
    card.querySelector(".cur-up").addEventListener("click", (e) => teach(gist, true, e.target));
    card.querySelector(".cur-down").addEventListener("click", (e) => teach(gist, false, e.target));
    return card;
  }

  async function teach(gist, liked, btn) {
    if (!gist) return;
    const prof = await getProfile();
    const cap = 30;
    const drop = (arr) => (arr || []).filter((x) => x !== gist);
    if (liked) {
      prof.liked = drop(prof.liked); prof.liked.push(gist);
      if (prof.liked.length > cap) prof.liked = prof.liked.slice(-cap);
      prof.disliked = drop(prof.disliked);
    } else {
      prof.disliked = drop(prof.disliked); prof.disliked.push(gist);
      if (prof.disliked.length > cap) prof.disliked = prof.disliked.slice(-cap);
      prof.liked = drop(prof.liked);
    }
    const ok = await saveProfile(prof);
    if (btn) {
      const t = btn.textContent;
      btn.textContent = ok ? "Saved ✓" : "Failed";
      setTimeout(() => (btn.textContent = t), 1400);
    }
  }

  // ── Taste tab ──────────────────────────────────────────────
  async function renderTaste(panel) {
    const p = await getProfile();
    const rssText = (p.rss || []).map((r) => `${r.url} | ${r.source || ""}`).join("\n");
    panel.innerHTML = `
      <div class="r-list">
        <div class="r-card">
          <h3 class="r-title">What it curates for</h3>
          <label class="cur-label">Topics <span class="r-meta">(comma separated)</span></label>
          <textarea id="cur-topics" class="cur-area" rows="2">${esc((p.topics || []).join(", "))}</textarea>
          <label class="cur-label">Likes / surface more of this</label>
          <textarea id="cur-likes" class="cur-area" rows="3">${esc(p.likes || "")}</textarea>
          <label class="cur-label">Dislikes / skip this</label>
          <textarea id="cur-dislikes" class="cur-area" rows="3">${esc(p.dislikes || "")}</textarea>
        </div>

        <div class="r-card">
          <h3 class="r-title">Sources</h3>
          <label class="cur-label">Subreddits <span class="r-meta">(comma separated, no r/)</span></label>
          <textarea id="cur-subs" class="cur-area" rows="2">${esc((p.subreddits || []).join(", "))}</textarea>
          <label class="cur-label">Hacker News queries <span class="r-meta">(comma separated)</span></label>
          <textarea id="cur-hn" class="cur-area" rows="2">${esc((p.hn_queries || []).join(", "))}</textarea>
          <label class="cur-label">RSS / Atom feeds <span class="r-meta">(one per line: url | label)</span></label>
          <textarea id="cur-rss" class="cur-area" rows="3">${esc(rssText)}</textarea>
          <label class="cur-label">YouTube channel IDs <span class="r-meta">(one per line, e.g. UCxxxx — find it in a channel's page source / About)</span></label>
          <textarea id="cur-yt" class="cur-area" rows="2">${esc((p.youtube || []).join("\n"))}</textarea>
          <label class="cur-check"><input type="checkbox" id="cur-arxiv" ${p.use_arxiv ? "checked" : ""}/> Include arXiv AR/VR + games</label>
        </div>

        <div class="r-card">
          <h3 class="r-title">Schedule</h3>
          <label class="cur-label">Daily digest time <span class="r-meta">(24h, ${esc(timezoneNote())})</span></label>
          <input id="cur-time" type="time" class="cur-input" value="${esc(p.time || "08:00")}" />
        </div>

        <div class="r-card">
          <h3 class="r-title">What it has learned</h3>
          <p class="r-meta">From your 👍/👎, here and in Discord.</p>
          <div id="cur-learned"></div>
          <div class="r-save-row">
            <button id="cur-clear-learned" class="r-btn">Clear learned signals</button>
          </div>
        </div>

        <div class="r-save-row">
          <button id="cur-save" class="btn-primary r-btn">Save taste profile</button>
          <span id="cur-save-msg" class="r-status"></span>
        </div>
      </div>`;

    renderLearned(p);

    document.getElementById("cur-clear-learned").addEventListener("click", async (e) => {
      const prof = await getProfile();
      prof.liked = []; prof.disliked = [];
      await saveProfile(prof);
      renderLearned(prof);
      e.target.textContent = "Cleared ✓";
      setTimeout(() => (e.target.textContent = "Clear learned signals"), 1400);
    });

    document.getElementById("cur-save").addEventListener("click", async () => {
      const prof = await getProfile();
      prof.topics = commas(document.getElementById("cur-topics").value);
      prof.likes = document.getElementById("cur-likes").value.trim();
      prof.dislikes = document.getElementById("cur-dislikes").value.trim();
      prof.subreddits = commas(document.getElementById("cur-subs").value);
      prof.sources = prof.subreddits; // keep the display field in step
      prof.hn_queries = commas(document.getElementById("cur-hn").value);
      prof.rss = lines(document.getElementById("cur-rss").value).map((ln) => {
        const [url, source] = ln.split("|").map((x) => x.trim());
        return { url, source: source || "RSS" };
      }).filter((r) => r.url);
      prof.youtube = lines(document.getElementById("cur-yt").value);
      prof.use_arxiv = document.getElementById("cur-arxiv").checked;
      const tv = document.getElementById("cur-time").value;
      if (/^\d{2}:\d{2}$/.test(tv)) prof.time = tv;

      const ok = await saveProfile(prof);
      const msg = document.getElementById("cur-save-msg");
      msg.textContent = ok ? "Saved. The bot picks this up on its next run." : "Save failed — check the connection.";
    });
  }

  function renderLearned(p) {
    const box = document.getElementById("cur-learned");
    if (!box) return;
    const chip = (t, cls) => `<span class="cur-chip ${cls}">${esc(t)}</span>`;
    const liked = (p.liked || []).slice(-12).reverse();
    const disliked = (p.disliked || []).slice(-12).reverse();
    box.innerHTML =
      `<div class="cur-chips"><strong class="r-meta">👍</strong> ${liked.length ? liked.map((t) => chip(t, "up")).join(" ") : '<span class="r-meta">nothing yet</span>'}</div>` +
      `<div class="cur-chips"><strong class="r-meta">👎</strong> ${disliked.length ? disliked.map((t) => chip(t, "down")).join(" ") : '<span class="r-meta">nothing yet</span>'}</div>`;
  }

  function timezoneNote() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "local"; }
    catch (e) { return "local"; }
  }

  window.renderCurators = render;
})();
