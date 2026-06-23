/* ─────────────────────────────────────────────────────────────
   dmico life os — Entertainment
   The leisure counterpart to the routine. Two halves:
     · This week's planned sessions (from kv 'week_calendar', type=entertainment)
     · Your library (from kv 'entertainment_library'), games + movies with art.
   Both kv keys are written by the bot; the frontend only reads them.
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
      #ent .ent-lib{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:14px;}
      #ent .ent-card{border-radius:12px;overflow:hidden;background:rgba(127,127,127,0.07);display:flex;flex-direction:column;}
      #ent .ent-art{aspect-ratio:2/3;background:rgba(127,127,127,0.15);background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;font-size:1.8rem;}
      #ent .ent-meta{padding:8px 10px;}
      #ent .ent-title{font-size:0.8rem;font-weight:600;line-height:1.2;}
      #ent .ent-yr{font-size:0.72rem;opacity:0.55;}
      #ent .ent-kind{font-size:0.66rem;opacity:0.6;text-transform:uppercase;letter-spacing:0.04em;}
    </style>
    <div id="ent">
      <div>
        <p class="ent-sec-head">🎮 This week's sessions</p>
        <p class="ent-sub">Planned downtime, earned and bounded. Placed before wind-down.</p>
        <div class="ent-sessions" id="ent-sessions"><p class="ent-empty">Loading…</p></div>
      </div>
      <div>
        <p class="ent-sec-head">🍿 Your library</p>
        <p class="ent-sub">Add with <code>!play &lt;game&gt;</code> or <code>!watch &lt;movie&gt;</code> in Discord.</p>
        <div class="ent-lib" id="ent-lib"><p class="ent-empty">Loading…</p></div>
      </div>
    </div>`;

  const [weekRes, libRes] = await Promise.all([
    sb.from("kv_store").select("value").eq("key", "week_calendar").limit(1),
    sb.from("kv_store").select("value").eq("key", "entertainment_library").limit(1),
  ]);

  // ── Sessions ────────────────────────────────────────────────
  const wc = weekRes?.data?.[0]?.value ?? null;
  const sessions = (wc && Array.isArray(wc.events) ? wc.events : [])
    .filter((e) => e.type === "entertainment")
    .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));
  const sesEl = document.getElementById("ent-sessions");
  if (sesEl) {
    if (sessions.length) {
      sesEl.innerHTML = sessions.map((s) => {
        const past = s.date < todayISO;
        const when = s.allDay ? "all day" : `${esc(s.start || "")}–${esc(s.end || "")}`;
        return `<div class="ent-ses" style="${past ? "opacity:0.5" : ""}">
            <span class="when">${esc(fmtDay(s.date))} · ${when}</span>
            <span class="what">${esc(s.title || "Entertainment")}</span>
          </div>`;
      }).join("");
    } else {
      sesEl.innerHTML = `<p class="ent-empty">No sessions yet. The bot places them with the weekly plan, or run <code>!funweek</code>.</p>`;
    }
  }

  // ── Library ─────────────────────────────────────────────────
  const lib = libRes?.data?.[0]?.value ?? null;
  const items = (lib && Array.isArray(lib.items)) ? lib.items : [];
  const backlog = items.filter((i) => i.status === "backlog");
  const libEl = document.getElementById("ent-lib");
  if (libEl) {
    if (backlog.length) {
      libEl.innerHTML = backlog.map((i) => {
        const icon = i.kind === "game" ? "🎮" : "🎬";
        const art = i.cover_url
          ? `<div class="ent-art" style="background-image:url('${encodeURI(i.cover_url)}')"></div>`
          : `<div class="ent-art">${icon}</div>`;
        return `<div class="ent-card">
            ${art}
            <div class="ent-meta">
              <div class="ent-kind">${icon} ${i.kind === "game" ? "Game" : "Movie"}</div>
              <div class="ent-title">${esc(i.title)}</div>
              ${i.year ? `<div class="ent-yr">${esc(i.year)}</div>` : ""}
            </div>
          </div>`;
      }).join("");
    } else {
      libEl.innerHTML = `<p class="ent-empty">Library's empty. Add something to play or watch from Discord.</p>`;
    }
  }
};
