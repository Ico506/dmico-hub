/* ─────────────────────────────────────────────────────────────
   dmico life os — Entertainment
   Two halves: this week's planned sessions (from kv 'week_calendar'),
   and your library (kv 'entertainment_library'). Now editable: add games
   and movies and move their status here; the bot does the cover-art lookup
   and applies changes within ~a minute. Discord (!play / !watch) still works.
   ───────────────────────────────────────────────────────────── */

window.renderEntertainment = async function (container, sb) {
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const todayISO = new Date().toISOString().split("T")[0];
  const fmtDay = (iso) => {
    try { return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); }
    catch (_) { return iso; }
  };

  container.innerHTML = `
    <style>
      #ent{display:flex;flex-direction:column;gap:22px;}
      #ent .ent-sec-head{font-size:0.95rem;font-weight:700;opacity:0.85;margin:0 0 10px;}
      #ent .ent-sub{font-size:0.78rem;opacity:0.6;margin:-6px 0 12px;}
      #ent .ent-sessions{display:flex;flex-direction:column;gap:8px;}
      #ent .ent-ses{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:rgba(155,109,214,0.10);border-left:3px solid #9b6dd6;}
      #ent .ent-ses .when{font-size:0.78rem;opacity:0.7;min-width:128px;font-variant-numeric:tabular-nums;}
      #ent .ent-ses .what{font-weight:600;font-size:0.9rem;}
      #ent .ent-empty{font-size:0.82rem;opacity:0.5;padding:10px 0;}
      #ent .ent-add{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px;}
      #ent .ent-add select,#ent .ent-add input{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;}
      #ent .ent-add input{flex:1;min-width:160px;}
      #ent .ent-add button{font:inherit;font-weight:600;padding:6px 14px;border-radius:8px;border:none;background:#9b6dd6;color:#fff;cursor:pointer;}
      #ent .ent-add button:disabled{opacity:0.5;cursor:default;}
      #ent .ent-msg{font-size:0.78rem;opacity:0.8;margin:0 0 12px;}
      #ent .ent-group{font-size:0.78rem;font-weight:600;opacity:0.6;margin:14px 0 8px;text-transform:uppercase;letter-spacing:0.04em;}
      #ent .ent-lib{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:14px;}
      #ent .ent-card{border-radius:12px;overflow:hidden;background:rgba(127,127,127,0.07);display:flex;flex-direction:column;}
      #ent .ent-art{aspect-ratio:2/3;background:rgba(127,127,127,0.15);background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;font-size:1.8rem;}
      #ent .ent-meta{padding:8px 10px;}
      #ent .ent-title{font-size:0.8rem;font-weight:600;line-height:1.2;}
      #ent .ent-yr{font-size:0.72rem;opacity:0.55;}
      #ent .ent-kind{font-size:0.66rem;opacity:0.6;text-transform:uppercase;letter-spacing:0.04em;}
      #ent .ent-ctrls{display:flex;flex-wrap:wrap;gap:4px;padding:0 8px 9px;}
      #ent .ent-ctrls button{font:inherit;font-size:0.66rem;padding:3px 7px;border-radius:6px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;cursor:pointer;opacity:0.8;}
      #ent .ent-ctrls button.on{background:rgba(155,109,214,0.25);border-color:transparent;opacity:1;}
      #ent .ent-ctrls button.rm{margin-left:auto;border-color:transparent;opacity:0.5;}
    </style>
    <div id="ent">
      <div>
        <p class="ent-sec-head">🎮 This week's sessions</p>
        <p class="ent-sub">Planned downtime, earned and bounded. Placed before wind-down.</p>
        <div class="ent-sessions" id="ent-sessions"><p class="ent-empty">Loading…</p></div>
      </div>
      <div>
        <p class="ent-sec-head">🍿 Your library</p>
        <div class="ent-add">
          <select id="ent-kind" aria-label="Kind">
            <option value="game">🎮 Game</option>
            <option value="movie">🎬 Movie</option>
          </select>
          <input id="ent-title" placeholder="Title to add" maxlength="100" />
          <button id="ent-addbtn">Add</button>
        </div>
        <p class="ent-msg" id="ent-msg" hidden></p>
        <div id="ent-lib"><p class="ent-empty">Loading…</p></div>
      </div>
    </div>`;

  const msgEl = document.getElementById("ent-msg");
  const showMsg = (t) => { if (msgEl) { msgEl.textContent = t; msgEl.hidden = false; } };

  const STATUSES = [["backlog", "Backlog"], ["active", "Now"], ["done", "Done"]];

  async function draw() {
    const [weekRes, libRes] = await Promise.all([
      sb.from("kv_store").select("value").eq("key", "week_calendar").limit(1),
      sb.from("kv_store").select("value").eq("key", "entertainment_library").limit(1),
    ]);

    // Sessions
    const wc = weekRes?.data?.[0]?.value ?? null;
    const sessions = (wc && Array.isArray(wc.events) ? wc.events : [])
      .filter((e) => e.type === "entertainment")
      .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));
    const sesEl = document.getElementById("ent-sessions");
    if (sesEl) {
      sesEl.innerHTML = sessions.length ? sessions.map((s) => {
        const past = s.date < todayISO;
        const when = s.allDay ? "all day" : `${esc(s.start || "")}–${esc(s.end || "")}`;
        return `<div class="ent-ses" style="${past ? "opacity:0.5" : ""}">
            <span class="when">${esc(fmtDay(s.date))} · ${when}</span>
            <span class="what">${esc(s.title || "Entertainment")}</span>
          </div>`;
      }).join("") : `<p class="ent-empty">No sessions yet. The bot places them with the weekly plan, or run <code>!funweek</code>.</p>`;
    }

    // Library, grouped by status
    const lib = libRes?.data?.[0]?.value ?? null;
    const items = (lib && Array.isArray(lib.items)) ? lib.items : [];
    const libEl = document.getElementById("ent-lib");
    if (!libEl) return;
    if (!items.length) {
      libEl.innerHTML = `<p class="ent-empty">Library's empty. Add a game or movie above.</p>`;
      return;
    }
    const groups = [["active", "Playing / watching"], ["backlog", "Backlog"], ["done", "Done"]];
    libEl.innerHTML = groups.map(([st, label]) => {
      const inGroup = items.filter((i) => (i.status || "backlog") === st);
      if (!inGroup.length) return "";
      const cards = inGroup.map((i) => {
        const icon = i.kind === "game" ? "🎮" : "🎬";
        const art = i.cover_url
          ? `<div class="ent-art" style="background-image:url('${encodeURI(i.cover_url)}')"></div>`
          : `<div class="ent-art">${icon}</div>`;
        const planOn = i.in_plan !== false;
        const planBtn = `<button data-act="plan" data-id="${esc(i.id)}" data-next="${planOn ? "0" : "1"}" class="${planOn ? "on" : ""}" title="Include in !funweek planning">📅 ${planOn ? "Planned" : "Skip"}</button>`;
        const ctrls = STATUSES.map(([sv, sl]) =>
          `<button data-act="status" data-id="${esc(i.id)}" data-status="${sv}" class="${(i.status || "backlog") === sv ? "on" : ""}">${sl}</button>`
        ).join("") + planBtn + `<button class="rm" data-act="remove" data-id="${esc(i.id)}" title="Remove">✕</button>`;
        return `<div class="ent-card">
            ${art}
            <div class="ent-meta">
              <div class="ent-kind">${icon} ${i.kind === "game" ? "Game" : "Movie"}</div>
              <div class="ent-title">${esc(i.title)}</div>
              ${i.year ? `<div class="ent-yr">${esc(i.year)}</div>` : ""}
            </div>
            <div class="ent-ctrls">${ctrls}</div>
          </div>`;
      }).join("");
      return `<p class="ent-group">${label}</p><div class="ent-lib">${cards}</div>`;
    }).join("");

    libEl.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        let ok;
        if (btn.dataset.act === "remove") {
          ok = await window.dmicoEnqueue({ type: "library_remove", item_id: id });
        } else if (btn.dataset.act === "plan") {
          ok = await window.dmicoEnqueue({ type: "library_plan", item_id: id, in_plan: btn.dataset.next === "1" });
        } else {
          ok = await window.dmicoEnqueue({ type: "library_status", item_id: id, status: btn.dataset.status });
        }
        showMsg(ok ? "Saved. Updating shortly…" : "Couldn't queue that. Try again.");
        if (ok) setTimeout(draw, 35000);
      });
    });
  }

  // Add game/movie
  const addBtn = document.getElementById("ent-addbtn");
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const kind = document.getElementById("ent-kind").value;
      const title = document.getElementById("ent-title").value.trim();
      if (!title) { showMsg("Type a title to add."); return; }
      addBtn.disabled = true;
      const ok = await window.dmicoEnqueue({ type: "library_add", kind, title });
      addBtn.disabled = false;
      if (ok) {
        document.getElementById("ent-title").value = "";
        showMsg("Added. The bot fetches the cover art and it'll appear within a minute.");
        setTimeout(draw, 35000);
      } else {
        showMsg("Couldn't queue that. Try again.");
      }
    });
  }

  await draw();
};
