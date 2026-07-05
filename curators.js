/* ─────────────────────────────────────────────────────────────
   dmico life os — Curators module (v2, multi-domain)
   The hub face of the bot's proactive curator agents. A small domain
   switcher at the top flips between curators; each reads/writes its own
   kv slice (curator_profiles[domain] / curator_digest[domain]), so they
   never step on each other.

   - Content Scout (Phase 1): daily, taste-filtered digest of game-dev /
     indie / design items. Sources: subreddits, HN queries, RSS, YouTube,
     arXiv.
   - Research Scout (Phase 3): daily, taste-filtered digest of fresh papers
     in the AR/VR + game-studies niche. Sources: arXiv (categories + term
     queries) and Crossref queries.

   Each domain has two tabs:
   - Digest: the latest picks (kv curator_digest[domain]), with 👍/👎 that
     teach the same taste profile the bot uses, plus a "Scout now" button
     that queues an on-demand run (kv hub_actions → the bot runs it within
     ~30s and posts to Discord).
   - Taste: edit the profile the bot curates against — topics, likes,
     dislikes, the domain's own sources, and the daily digest time. Saved
     to kv curator_profiles[domain], which the bot reads live.

   All state is kv (no schema change). The bot seeds the default profile on
   its first run; this module falls back to a sensible default per domain so
   the editor is never empty before then.
   ───────────────────────────────────────────────────────────── */

(function () {
  let SB = null;
  let root = null;
  let currentDomain = "content";
  let currentTab = "digest";

  // ── per-domain fallback profiles (mirror the *_curator.DEFAULT_PROFILEs,
  //    used only until the bot seeds the real one in kv) ──────────────────
  const FALLBACKS = {
    content: {
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
    },
    research: {
      topics: [
        "AR/VR and immersive design", "presence and embodiment",
        "player experience", "game studies and design research",
        "HCI for games", "serious and applied games", "spatial interaction",
      ],
      likes: "Empirical studies, novel interaction techniques, strong methods, and work I can cite in my thesis: AR/VR design transfer to games, presence/embodiment measures, player-experience research, game-studies framings with real design implications.",
      dislikes: "Pure hardware spec papers, unrelated ML benchmarks, non-game VR with no design transfer, predatory-venue noise, thin position papers with no study behind them.",
      liked: [], disliked: [],
      time: "07:00",
      youtube: [],
      arxiv_cats: ["cs.HC", "cs.GR"],
      arxiv_terms: [
        "virtual reality", "augmented reality", "mixed reality",
        "game", "player experience", "presence",
      ],
      crossref_queries: [
        "virtual reality game", "augmented reality interaction",
        "presence immersion game", "game studies",
        "player experience HCI", "embodiment virtual reality",
      ],
      use_arxiv: true,
      use_crossref: true,
    },
    markets: {
      topics: ["my crypto holdings", "my watchlist tickers", "macro that moves markets"],
      likes: "Concrete market-moving news on assets I track: earnings, product/regulatory events, macro (rates, inflation), clear crypto catalysts.",
      dislikes: "Hype, 'to the moon' noise, pump-and-dump chatter, thin rumor pieces, paid promotions, generic 'top 10 coins to buy' listicles.",
      liked: [], disliked: [],
      time: "07:30",
      youtube: [],
      stocks: [],
      indices: [
        { symbol: "^GSPC", name: "S&P 500" },
        { symbol: "^IXIC", name: "Nasdaq" },
        { symbol: "^KLSE", name: "KLCI" },
      ],
      news_themes: ["stock market", "cryptocurrency market", "Bursa Malaysia", "Federal Reserve interest rates"],
    },
    kitchen: {
      topics: ["Malaysian home cooking", "one-wok dinners", "quick weeknight meals"],
      likes: "Established, named dishes I can actually cook on a weeknight: Malaysian and Chinese home cooking, stir-fries, soups, noodle dishes. Budget-aware picks that rescue what's already in the fridge.",
      dislikes: "Invented fusion, precision baking, anything needing specialty equipment or ingredients I can't find in Sibu, overly fancy plating projects.",
      liked: [], disliked: [],
      time: "10:00",
      youtube: [],
    },
  };

  const META = {
    content: { label: "Content", emoji: "🛰️", scoutWord: "Scout", channelNote: "content channel" },
    research: { label: "Research", emoji: "🔬", scoutWord: "Scout", channelNote: "research channel" },
    markets: { label: "Markets", emoji: "📈", scoutWord: "Refresh", channelNote: "markets channel" },
    kitchen: { label: "Kitchen", emoji: "🍳", scoutWord: "Inspire", channelNote: "scheduler channel (Saturday 10:00)" },
  };

  const DOMAIN_ORDER = ["content", "research", "markets", "kitchen"];

  // ── helpers ────────────────────────────────────────────────
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const lines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const commas = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

  function fallback() {
    return FALLBACKS[currentDomain] || FALLBACKS.content;
  }

  async function getProfile() {
    const blob = (await window.dmicoKvGet("curator_profiles")) || {};
    const p = (blob && blob[currentDomain]) || {};
    // Merge over the per-domain fallback so every field exists.
    return Object.assign({}, fallback(), p, {
      liked: p.liked || [], disliked: p.disliked || [],
    });
  }

  async function saveProfile(prof) {
    const blob = (await window.dmicoKvGet("curator_profiles")) || {};
    blob[currentDomain] = prof;
    return window.dmicoKvSet("curator_profiles", blob);
  }

  async function getDigest() {
    const blob = (await window.dmicoKvGet("curator_digest")) || {};
    return (blob && blob[currentDomain]) || null;
  }

  // ── layout ─────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("cur-styles")) return;
    const s = document.createElement("style");
    s.id = "cur-styles";
    s.textContent = `
      .cur-domains{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.6rem;}
      .cur-domain{display:inline-flex;align-items:center;gap:.4rem;padding:.35rem .8rem;
        border-radius:1rem;border:1px solid rgba(128,128,128,.35);background:rgba(128,128,128,.06);
        color:inherit;font:inherit;font-size:.92rem;cursor:pointer;}
      .cur-domain.current{background:rgba(120,150,210,.18);border-color:rgba(120,150,210,.55);font-weight:600;}
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
      .cur-snaprows{font-size:.92rem;line-height:1.55;margin:.2rem 0 .5rem;}
    `;
    document.head.appendChild(s);
  }

  function render(container, sb) {
    SB = sb;
    root = container;
    injectStyles();

    const switcher = DOMAIN_ORDER.map((d) =>
      `<button class="cur-domain ${d === currentDomain ? "current" : ""}" data-domain="${d}">${META[d].emoji} ${esc(META[d].label)}</button>`
    ).join("");

    root.innerHTML = `
      <div class="cur-domains" role="tablist">${switcher}</div>
      <div class="r-tabs" role="tablist">
        <button class="r-tab current" data-tab="digest">Latest digest</button>
        <button class="r-tab" data-tab="taste">Taste profile</button>
      </div>
      <div id="cur-panel"></div>`;

    root.querySelectorAll(".cur-domain").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.domain === currentDomain) return;
        currentDomain = b.dataset.domain;
        render(container, sb); // re-render the whole module for the new domain
      })
    );

    root.querySelectorAll(".r-tab").forEach((t) =>
      t.addEventListener("click", () => {
        root.querySelectorAll(".r-tab").forEach((x) => x.classList.toggle("current", x === t));
        openTab(t.dataset.tab);
      })
    );

    // Preserve the active tab across a domain switch.
    root.querySelectorAll(".r-tab").forEach((x) =>
      x.classList.toggle("current", x.dataset.tab === currentTab));
    openTab(currentTab);
  }

  function openTab(tab) {
    currentTab = tab;
    const panel = document.getElementById("cur-panel");
    if (tab === "digest") return renderDigest(panel);
    if (tab === "taste") return renderTaste(panel);
  }

  // ── Digest tab ─────────────────────────────────────────────
  async function renderDigest(panel) {
    const m = META[currentDomain];
    panel.innerHTML = `
      <div class="r-searchbar">
        <button id="cur-scout" class="btn-primary r-btn">${m.emoji} ${esc(m.scoutWord)} now</button>
        <span id="cur-scout-msg" class="r-status"></span>
      </div>
      <p class="r-status">The bot posts this to your ${esc(m.channelNote)} each morning. 👍/👎 here or in Discord teaches the same profile.</p>
      <div id="cur-digest" class="r-list"></div>`;

    const btn = document.getElementById("cur-scout");
    const msg = document.getElementById("cur-scout-msg");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      msg.textContent = "Queued — the bot runs it within ~30s and posts to Discord.";
      const ok = await window.dmicoEnqueue({ type: "run_curator", domain: currentDomain });
      if (!ok) msg.textContent = "Couldn't queue the run. Check the connection and try again.";
      setTimeout(() => { btn.disabled = false; }, 4000);
    });

    const list = document.getElementById("cur-digest");
    const digest = await getDigest();
    const hasSnap = digest && digest.snapshot;
    const hasItems = digest && (digest.items || []).length;
    if (!hasSnap && !hasItems) {
      list.innerHTML = `<div class="r-card"><p class="r-abstract">No digest yet. Hit “${esc(m.scoutWord)} now”, or wait for the morning run. Quiet days mean nothing cleared the taste bar, which is fine.</p></div>`;
      return;
    }

    if (hasSnap) list.appendChild(snapshotCard(digest));

    if (hasItems) {
      const head = document.createElement("p");
      head.className = "r-status";
      head.textContent = `${digest.items.length} news pick(s) · ${digest.ts || digest.date || ""}`;
      list.appendChild(head);
      digest.items.forEach((it) => list.appendChild(digestCard(it)));
    } else if (hasSnap) {
      const note = document.createElement("p");
      note.className = "r-status";
      note.textContent = "No market news cleared the bar this run. Quiet is fine.";
      list.appendChild(note);
    }
  }

  // Markets snapshot card (portfolio numbers). Track + inform only.
  function snapshotCard(digest) {
    const s = digest.snapshot || {};
    const card = document.createElement("div");
    card.className = "r-card";
    const pct = (v) => `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`;
    const dot = (v) => (v >= 0 ? "🟢" : "🔴");
    let html = `<h3 class="r-title">📈 Portfolio snapshot</h3>
      <div class="r-meta">${esc(digest.snapshot_ts || digest.date || "")}</div>`;

    if ((s.crypto || []).length) {
      html += `<p class="cur-label">Crypto holdings</p><div class="cur-snaprows">`;
      s.crypto.forEach((c) => {
        html += `<div>• ${esc(c.coin)} · RM${Number(c.value_myr).toLocaleString()} ${dot(c.pl_pct)} ${pct(c.pl_pct)}</div>`;
      });
      if (s.crypto_total) {
        html += `<div class="r-meta">Total RM${Number(s.crypto_total.value_myr).toLocaleString()} (${pct(s.crypto_total.pl_pct)} vs RM${Number(s.crypto_total.paid_myr).toLocaleString()} paid)</div>`;
      }
      html += `</div>`;
    }
    if ((s.stocks || []).length) {
      html += `<p class="cur-label">Stocks / ETFs</p><div class="cur-snaprows">`;
      s.stocks.forEach((st) => {
        html += `<div>• ${esc(st.symbol)} ${Number(st.price).toLocaleString()} ${esc(st.currency || "")} ${dot(st.day_pct)} ${pct(st.day_pct)}</div>`;
      });
      html += `</div>`;
    }
    if ((s.indices || []).length) {
      html += `<p class="cur-label">Index context</p><div class="cur-snaprows">`;
      s.indices.forEach((ix) => {
        html += `<div>• ${esc(ix.name)} ${Number(ix.level).toLocaleString()} ${dot(ix.day_pct)} ${pct(ix.day_pct)}</div>`;
      });
      html += `</div>`;
    }
    if (s.grand_total_myr) {
      html += `<div class="r-meta" style="margin-top:.5rem;">Tracked value ≈ RM${Number(s.grand_total_myr).toLocaleString()} (crypto + any held stocks)</div>`;
    }
    html += `<p class="r-meta" style="margin-top:.5rem;font-style:italic;">Informational only, not financial advice. You decide and act.</p>`;
    card.innerHTML = html;
    return card;
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
  // Each domain's "Sources" card differs; the rest (topics/likes/dislikes,
  // schedule, learned signals, save) is shared.
  function sourcesCardHtml(p) {
    if (currentDomain === "markets") {
      const stocksText = (p.stocks || []).map((s) =>
        (typeof s === "string" ? s : (s.qty != null ? `${s.symbol} | ${s.qty}` : s.symbol))).join("\n");
      const idxText = (p.indices || []).map((i) =>
        (typeof i === "string" ? i : `${i.symbol} | ${i.name || ""}`)).join("\n");
      return `
        <div class="r-card">
          <h3 class="r-title">Watchlist</h3>
          <label class="cur-label">Stocks / ETFs <span class="r-meta">(one per line: TICKER, or "TICKER | qty" to value the holding in MYR)</span></label>
          <textarea id="cur-stocks" class="cur-area" rows="3" placeholder="NVDA&#10;VOO | 10">${esc(stocksText)}</textarea>
          <label class="cur-label">Indices <span class="r-meta">(one per line: SYMBOL | name, e.g. ^GSPC | S&P 500)</span></label>
          <textarea id="cur-indices" class="cur-area" rows="3">${esc(idxText)}</textarea>
          <label class="cur-label">News themes <span class="r-meta">(comma separated)</span></label>
          <textarea id="cur-themes" class="cur-area" rows="2">${esc((p.news_themes || []).join(", "))}</textarea>
          <p class="r-meta">Crypto is pulled live from your <code>!crypto</code> holdings, nothing to add here. Informational only, not advice.</p>
        </div>`;
    }
    if (currentDomain === "research") {
      return `
        <div class="r-card">
          <h3 class="r-title">Sources</h3>
          <label class="cur-label">arXiv categories <span class="r-meta">(comma separated, e.g. cs.HC, cs.GR)</span></label>
          <textarea id="cur-arxiv-cats" class="cur-area" rows="2">${esc((p.arxiv_cats || []).join(", "))}</textarea>
          <label class="cur-label">arXiv term queries <span class="r-meta">(comma separated free-text terms)</span></label>
          <textarea id="cur-arxiv-terms" class="cur-area" rows="2">${esc((p.arxiv_terms || []).join(", "))}</textarea>
          <label class="cur-label">Crossref queries <span class="r-meta">(comma separated)</span></label>
          <textarea id="cur-crossref" class="cur-area" rows="3">${esc((p.crossref_queries || []).join(", "))}</textarea>
          <label class="cur-check"><input type="checkbox" id="cur-use-arxiv" ${p.use_arxiv ? "checked" : ""}/> Include arXiv</label>
          <label class="cur-check"><input type="checkbox" id="cur-use-crossref" ${p.use_crossref ? "checked" : ""}/> Include Crossref</label>
        </div>`;
    }
    // content (default)
    const rssText = (p.rss || []).map((r) => `${r.url} | ${r.source || ""}`).join("\n");
    return `
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
      </div>`;
  }

  function collectSources(prof) {
    if (currentDomain === "markets") {
      prof.stocks = lines(document.getElementById("cur-stocks").value).map((ln) => {
        const [sym, qty] = ln.split("|").map((x) => x.trim());
        if (qty && !isNaN(parseFloat(qty))) return { symbol: sym.toUpperCase(), qty: parseFloat(qty) };
        return sym.toUpperCase();
      }).filter((s) => (typeof s === "string" ? s : s.symbol));
      prof.indices = lines(document.getElementById("cur-indices").value).map((ln) => {
        const [sym, name] = ln.split("|").map((x) => x.trim());
        return { symbol: sym, name: name || sym };
      }).filter((i) => i.symbol);
      prof.news_themes = commas(document.getElementById("cur-themes").value);
      prof.sources = (prof.stocks || []).map((s) => (typeof s === "string" ? s : s.symbol));
      return;
    }
    if (currentDomain === "research") {
      prof.arxiv_cats = commas(document.getElementById("cur-arxiv-cats").value);
      prof.arxiv_terms = commas(document.getElementById("cur-arxiv-terms").value);
      prof.crossref_queries = commas(document.getElementById("cur-crossref").value);
      prof.sources = prof.arxiv_cats; // keep the display field in step
      prof.use_arxiv = document.getElementById("cur-use-arxiv").checked;
      prof.use_crossref = document.getElementById("cur-use-crossref").checked;
      return;
    }
    // content
    prof.subreddits = commas(document.getElementById("cur-subs").value);
    prof.sources = prof.subreddits; // keep the display field in step
    prof.hn_queries = commas(document.getElementById("cur-hn").value);
    prof.rss = lines(document.getElementById("cur-rss").value).map((ln) => {
      const [url, source] = ln.split("|").map((x) => x.trim());
      return { url, source: source || "RSS" };
    }).filter((r) => r.url);
    prof.youtube = lines(document.getElementById("cur-yt").value);
    prof.use_arxiv = document.getElementById("cur-arxiv").checked;
  }

  async function renderTaste(panel) {
    const p = await getProfile();
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

        ${sourcesCardHtml(p)}

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
      collectSources(prof);
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
