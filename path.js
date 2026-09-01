/* ─────────────────────────────────────────────────────────────
   dmico life os — Path
   One subject at a time, drawn as a route you can see, with a marker for
   where you are. Not a note vault: every previous capture tool went unused
   because it waited to be filled. This one arrives already drafted (Jade
   writes the route from one sentence), is visual rather than textual, and
   always has exactly one obvious next action.

   State: kv 'learning_path' = { active: {...}, archived: [ ... ] }
     node = { id, title, detail?, state:"done"|"current"|"ahead", done_at?, note?, links:[] }

   Drafting needs an LLM key the frontend does not have, so "start a path"
   enqueues a `draft_path` action and the bot fills it in within ~30s.
   ───────────────────────────────────────────────────────────── */

(function () {
  const KEY = "learning_path";
  let SB = null, root = null, openNode = null;

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const load = async () => (await window.dmicoKvGet(KEY)) || {};
  const save = (d) => window.dmicoKvSet(KEY, d);

  const daysSince = (iso) => {
    if (!iso) return null;
    const then = new Date(iso), now = new Date();
    return Math.floor((now - then) / 86400000);
  };

  function injectStyles() {
    if (document.getElementById("path-styles")) return;
    const s = document.createElement("style");
    s.id = "path-styles";
    s.textContent = `
      .pth-wrap{display:flex;flex-direction:column;gap:26px;}
      .pth-head{display:flex;align-items:baseline;gap:.7rem;flex-wrap:wrap;}
      .pth-subject{font-family:var(--display);font-size:26px;font-weight:600;color:var(--ink);margin:0;}
      .pth-map{width:100%;max-width:760px;}
      .pth-node-hit{cursor:pointer;}
      .pth-node-label{font-size:13px;fill:var(--ink);}
      .pth-node-label.ahead{fill:var(--ink-faint);}
      .pth-node-sub{font-size:11px;fill:var(--ink-faint);}
      .pth-detail{border-top:1px solid var(--line);padding-top:16px;}
      .pth-detail h3{font-family:var(--display);font-size:19px;margin:0 0 4px;color:var(--ink);}
      .pth-detail p{margin:0 0 12px;color:var(--ink-soft);font-size:14px;line-height:1.6;max-width:56ch;}
      .pth-actions{display:flex;gap:8px;flex-wrap:wrap;}
      .pth-note{width:100%;max-width:56ch;box-sizing:border-box;font:inherit;font-size:max(16px,1rem);
        padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius);
        background:var(--surface-2);color:var(--ink);resize:vertical;}
      .pth-links{list-style:none;padding:0;margin:0 0 12px;font-size:13px;}
      .pth-links a{color:var(--ink);text-underline-offset:3px;}
      .pth-start{display:flex;flex-direction:column;gap:10px;max-width:56ch;}
      .pth-start input{font:inherit;font-size:max(16px,1rem);padding:10px 12px;
        border:1px solid var(--line);border-radius:var(--radius);
        background:var(--surface-2);color:var(--ink);}
      .pth-past{margin-top:8px;}
      .pth-past summary{cursor:pointer;list-style:none;font-size:.62rem;letter-spacing:.14em;
        text-transform:uppercase;color:var(--ink-faint);font-weight:700;padding:6px 0;}
      .pth-past summary::-webkit-details-marker{display:none;}
      .pth-past summary::before{content:"▸ ";display:inline-block;transition:transform .15s;}
      .pth-past[open] summary::before{transform:rotate(90deg);}
      @media (max-width:720px){ .pth-detail p{max-width:none;} }
    `;
    document.head.appendChild(s);
  }

  /* ── the map ──────────────────────────────────────────────── */
  // A meandering vertical trail. Vertical works on both breakpoints and keeps
  // long node titles readable, which a horizontal track cannot do on a phone.
  function drawMap(path) {
    const nodes = path.nodes || [];
    const STEP = 74, PAD = 34, AMP = 26;
    const h = PAD * 2 + Math.max(0, nodes.length - 1) * STEP;
    const x = (i) => 40 + Math.sin(i * 0.9) * AMP;
    const y = (i) => PAD + i * STEP;

    let d = "";
    nodes.forEach((n, i) => {
      if (i === 0) { d += `M ${x(i)} ${y(i)}`; return; }
      const cx = (x(i - 1) + x(i)) / 2;
      d += ` C ${cx} ${y(i - 1) + STEP * 0.4}, ${cx} ${y(i) - STEP * 0.4}, ${x(i)} ${y(i)}`;
    });

    const dots = nodes.map((n, i) => {
      const st = n.state || "ahead";
      const fill = st === "done" ? "var(--accent)"
                 : st === "current" ? "var(--lantern)" : "var(--surface)";
      const stroke = st === "ahead" ? "var(--line)" : "none";
      const r = st === "current" ? 9 : 6;
      const glow = st === "current"
        ? `<circle cx="${x(i)}" cy="${y(i)}" r="15" fill="var(--lantern)" opacity="0.14"/>` : "";
      const done = st === "done"
        ? `<path d="M ${x(i) - 3} ${y(i)} l 2 2.4 l 4 -5" stroke="var(--surface)" stroke-width="1.6"
             fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : "";
      return `<g class="pth-node-hit" data-i="${i}">
          ${glow}
          <circle cx="${x(i)}" cy="${y(i)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
          ${done}
          <text class="pth-node-label ${st === "ahead" ? "ahead" : ""}" x="78" y="${y(i) + 1}"
                dominant-baseline="middle">${esc(n.title)}</text>
          ${n.state === "current" && n.detail
            ? `<text class="pth-node-sub" x="78" y="${y(i) + 17}">${esc(n.detail).slice(0, 64)}</text>` : ""}
          <rect x="0" y="${y(i) - 18}" width="100%" height="36" fill="transparent"/>
        </g>`;
    }).join("");

    return `<svg class="pth-map" viewBox="0 0 560 ${h}" height="${h}" role="img"
                 aria-label="Your route through ${esc(path.subject || "this subject")}">
        <path d="${d}" fill="none" stroke="var(--line)" stroke-width="2" stroke-linecap="round"/>
        ${dots}
      </svg>`;
  }

  /* ── views ────────────────────────────────────────────────── */

  async function render(container, sb) {
    SB = sb; root = container;
    injectStyles();
    root.innerHTML = `<p class="r-status">Loading…</p>`;
    const data = await load();
    const path = data.active;

    if (!path || !(path.nodes || []).length) return renderStart(data);
    renderPath(data, path);
  }

  function renderStart(data) {
    const drafting = data.drafting;
    root.innerHTML = `
      <div class="pth-wrap">
        <div class="r-empty2">
          <div class="r-empty2-icon">◎</div>
          <h3 class="r-empty2-title">${drafting ? "Jade is drawing your route" : "No path yet"}</h3>
          <p class="r-empty2-body">${drafting
            ? "She is turning your sentence into a set of steps. This takes under a minute; reopen this tab shortly."
            : "A path is one subject broken into a handful of steps, drawn as a route so you can see where you are. Describe what you want to learn and Jade drafts the steps. You edit them, you never start from a blank page."}</p>
          ${drafting ? "" : `
          <div class="pth-start">
            <input id="pth-subject" type="text" maxlength="120"
                   placeholder="e.g. presence and embodiment in VR" />
            <button id="pth-draft" class="btn-primary r-btn">Draft my route</button>
            <p id="pth-msg" class="r-status"></p>
          </div>`}
        </div>
        ${pastPathsHtml(data)}
      </div>`;

    if (!drafting) {
      const btn = document.getElementById("pth-draft");
      btn.addEventListener("click", async () => {
        const subject = document.getElementById("pth-subject").value.trim();
        const msg = document.getElementById("pth-msg");
        if (subject.length < 4) { msg.textContent = "Give it a few more words."; return; }
        btn.disabled = true; msg.textContent = "Sending to Jade…";
        const d = await load();
        d.drafting = { subject, at: new Date().toISOString() };
        await save(d);
        const ok = await window.dmicoEnqueue({ type: "draft_path", subject });
        msg.textContent = ok
          ? "Jade is on it. Reopen this tab in a minute."
          : "Couldn't reach Jade. Try again in a moment.";
        if (ok) setTimeout(() => render(root, SB), 1500);
        else { d.drafting = null; await save(d); btn.disabled = false; }
      });
    }
    wirePast();
  }

  function renderPath(data, path) {
    const nodes = path.nodes || [];
    const doneCount = nodes.filter((n) => n.state === "done").length;
    const current = nodes.find((n) => n.state === "current");
    const stale = current && current.since ? daysSince(current.since) : null;

    root.innerHTML = `
      <div class="pth-wrap">
        <div>
          <div class="r-eyebrow">(the path)</div>
          <div class="pth-head">
            <h2 class="pth-subject">${esc(path.subject)}</h2>
            <span class="r-status">${doneCount} of ${nodes.length} done${
              stale != null && stale >= 7 ? ` · ${stale} days on this step` : ""}</span>
          </div>
        </div>
        ${drawMap(path)}
        <div id="pth-detail" class="pth-detail"></div>
        <div class="r-actions">
          <button id="pth-archive" class="r-mini">${
            doneCount === nodes.length ? "Finish and archive" : "Archive this path"}</button>
        </div>
        ${pastPathsHtml(data)}
      </div>`;

    root.querySelectorAll(".pth-node-hit").forEach((g) =>
      g.addEventListener("click", () => { openNode = +g.dataset.i; drawDetail(data, path); })
    );
    if (openNode == null) openNode = nodes.findIndex((n) => n.state === "current");
    drawDetail(data, path);

    document.getElementById("pth-archive").addEventListener("click", async () => {
      if (!window.confirm(`Archive "${path.subject}"? It moves to Past paths, nothing is lost.`)) return;
      const d = await load();
      d.archived = Array.isArray(d.archived) ? d.archived : [];
      d.archived.unshift({ ...d.active, archived_at: new Date().toISOString() });
      d.active = null; openNode = null;
      await save(d);
      render(root, SB);
    });
    wirePast();
  }

  function drawDetail(data, path) {
    const host = document.getElementById("pth-detail");
    if (!host) return;
    const nodes = path.nodes || [];
    const i = openNode != null && nodes[openNode] ? openNode
            : nodes.findIndex((n) => n.state === "current");
    const n = nodes[i];
    if (!n) { host.innerHTML = ""; return; }

    host.innerHTML = `
      <div class="r-micro">step ${i + 1} of ${nodes.length} · ${
        n.state === "done" ? "done" : n.state === "current" ? "you are here" : "ahead"}</div>
      <h3>${esc(n.title)}</h3>
      ${n.detail ? `<p>${esc(n.detail)}</p>` : ""}
      ${(n.links || []).length ? `<ul class="pth-links">${
        n.links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title || l.url)}</a></li>`).join("")
      }</ul>` : ""}
      <textarea id="pth-note" class="pth-note" rows="2"
        placeholder="A line for future you (optional)">${esc(n.note || "")}</textarea>
      <div class="pth-actions" style="margin-top:10px">
        ${n.state !== "done" ? `<button id="pth-done" class="btn-primary r-btn">Mark done</button>` : ""}
        ${n.state === "done" ? `<button id="pth-undo" class="r-mini">Reopen</button>` : ""}
        <button id="pth-drop" class="r-mini">Drop this step</button>
      </div>`;

    const noteEl = document.getElementById("pth-note");
    noteEl.addEventListener("blur", async () => {
      const d = await load();
      if (!d.active) return;
      d.active.nodes[i].note = noteEl.value.trim() || null;
      await save(d);
    });

    const doneBtn = document.getElementById("pth-done");
    if (doneBtn) doneBtn.addEventListener("click", () => advance(i, true));
    const undoBtn = document.getElementById("pth-undo");
    if (undoBtn) undoBtn.addEventListener("click", () => advance(i, false));

    document.getElementById("pth-drop").addEventListener("click", async () => {
      if (!window.confirm(`Drop "${n.title}" from the route?`)) return;
      const d = await load();
      d.active.nodes.splice(i, 1);
      normalise(d.active);
      openNode = null;
      await save(d);
      render(root, SB);
    });
  }

  // One place decides node states, so "done" and "reopen" cannot disagree:
  // everything before the frontier is done, the frontier is current, rest ahead.
  function normalise(path) {
    const nodes = path.nodes || [];
    let frontier = nodes.findIndex((n) => n.state !== "done");
    if (frontier === -1) frontier = nodes.length;
    nodes.forEach((n, i) => {
      const was = n.state;
      n.state = i < frontier ? "done" : i === frontier ? "current" : "ahead";
      if (n.state === "current" && was !== "current") n.since = new Date().toISOString();
      if (n.state === "done" && !n.done_at) n.done_at = new Date().toISOString();
      if (n.state !== "done") delete n.done_at;
    });
  }

  async function advance(i, done) {
    const d = await load();
    if (!d.active) return;
    d.active.nodes[i].state = done ? "done" : "ahead";
    if (!done) for (let k = i; k < d.active.nodes.length; k++) d.active.nodes[k].state = "ahead";
    normalise(d.active);
    openNode = null;
    await save(d);
    render(root, SB);
  }

  /* ── past paths (quiet by default) ────────────────────────── */
  function pastPathsHtml(data) {
    const past = Array.isArray(data.archived) ? data.archived : [];
    if (!past.length) return "";
    return `<details class="pth-past" id="pth-past">
        <summary>Past paths (${past.length})</summary>
        <div>${past.map((p) => {
          const n = (p.nodes || []).length;
          const done = (p.nodes || []).filter((x) => x.state === "done").length;
          return `<div class="r-row">
              <div class="r-row-main">
                <div class="r-micro">${esc((p.archived_at || "").slice(0, 10))}</div>
                <div>${esc(p.subject)}</div>
              </div>
              <div class="r-row-right">${done}/${n}</div>
            </div>`;
        }).join("")}</div>
      </details>`;
  }
  function wirePast() {
    const el = document.getElementById("pth-past");
    if (!el) return;
    el.open = localStorage.getItem("dmico-path-past-open") === "1";
    el.addEventListener("toggle", () =>
      localStorage.setItem("dmico-path-past-open", el.open ? "1" : "0"));
  }

  window.renderPath = render;
})();
