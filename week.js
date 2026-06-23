/* ─────────────────────────────────────────────────────────────
   dmico life os — Week
   A full-size, read-only view of your resolved Google Calendar week,
   from the bot's kv 'week_calendar' snapshot (the frontend has no GCal
   credentials, so this mirrors what the bot publishes). Editing still
   happens in Discord for now.
   ───────────────────────────────────────────────────────────── */

window.renderWeek = async function (container, sb) {
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const todayISO = new Date().toISOString().split("T")[0];

  const TYPE_COLOR = {
    anchor: "#5b8def", focus: "#3aa675", crunch: "#d98a2b",
    entertainment: "#9b6dd6", event: "#8a8f98",
  };
  const TYPE_LABEL = {
    anchor: "Anchor", focus: "Focus", crunch: "Study",
    entertainment: "Play", event: "Event",
  };

  container.innerHTML = `
    <style>
      #week{display:flex;flex-direction:column;gap:14px;}
      #week .wk-top{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;}
      #week .wk-range{font-size:1.05rem;font-weight:700;}
      #week .wk-updated{font-size:0.74rem;opacity:0.55;}
      #week .wk-grid{display:grid;grid-template-columns:repeat(7,minmax(130px,1fr));gap:10px;overflow-x:auto;padding-bottom:6px;}
      #week .wk-col{border-radius:12px;background:rgba(127,127,127,0.06);padding:10px 8px;min-height:180px;display:flex;flex-direction:column;}
      #week .wk-col--today{background:rgba(91,141,239,0.12);outline:1px solid rgba(91,141,239,0.35);}
      #week .wk-dh{font-weight:600;font-size:0.85rem;display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;opacity:0.85;}
      #week .wk-dh .num{opacity:0.55;font-size:0.95rem;}
      #week .wk-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;}
      #week .wk-ev{font-size:0.76rem;line-height:1.3;padding:5px 8px;border-radius:6px;background:rgba(127,127,127,0.09);border-left:3px solid #8a8f98;}
      #week .wk-ev .t{display:block;font-variant-numeric:tabular-nums;opacity:0.65;font-size:0.7rem;}
      #week .wk-ev .ttl{font-weight:500;}
      #week .wk-empty{font-size:0.74rem;opacity:0.3;text-align:center;margin-top:8px;}
      #week .wk-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:0.74rem;opacity:0.8;}
      #week .wk-key{display:inline-flex;align-items:center;gap:5px;}
      #week .wk-key i{width:10px;height:10px;border-radius:2px;display:inline-block;}
      #week .wk-note{font-size:0.74rem;opacity:0.55;}
      #week .wk-blank{opacity:0.5;font-size:0.9rem;padding:30px 0;text-align:center;}
    </style>
    <div id="week">
      <div class="wk-top">
        <span class="wk-range" id="wk-range">Your week</span>
        <span class="wk-updated" id="wk-updated"></span>
      </div>
      <div id="wk-body"><p class="wk-blank">Loading your week…</p></div>
      <div class="wk-legend" id="wk-legend"></div>
      <p class="wk-note">Editing happens in Discord for now: use the Sunday planner, <code>!routine</code>, or <code>!crunch</code>.</p>
    </div>`;

  const res = await sb.from("kv_store").select("value").eq("key", "week_calendar").limit(1);
  const wc = res?.data?.[0]?.value ?? null;
  const body = document.getElementById("wk-body");

  if (!wc || !Array.isArray(wc.events)) {
    if (body) body.innerHTML = `<p class="wk-blank">No week snapshot yet. The bot writes one on boot and after any calendar change.</p>`;
    return;
  }

  // Header: range + last updated
  const base = new Date((wc.week_monday || todayISO) + "T00:00:00");
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const endD = new Date(base); endD.setDate(base.getDate() + 6);
  const fmtShort = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const rangeEl = document.getElementById("wk-range");
  if (rangeEl) rangeEl.textContent = `${fmtShort(base)} – ${fmtShort(endD)}`;
  const updEl = document.getElementById("wk-updated");
  if (updEl && wc.generated_at) {
    try {
      const ago = Math.round((Date.now() - new Date(wc.generated_at)) / 60000);
      updEl.textContent = ago < 60 ? `updated ${ago}m ago`
        : ago < 1440 ? `updated ${Math.round(ago / 60)}h ago`
        : `updated ${Math.round(ago / 1440)}d ago`;
    } catch (_) {}
  }

  // Group events by date
  const byDate = {};
  wc.events.forEach((ev) => { (byDate[ev.date] = byDate[ev.date] || []).push(ev); });

  const cols = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base); d.setDate(base.getDate() + i);
    const key = iso(d);
    const isToday = key === todayISO;
    const items = (byDate[key] || [])
      .sort((a, b) => (a.allDay ? "" : a.start || "").localeCompare(b.allDay ? "" : b.start || ""))
      .map((ev) => {
        const c = TYPE_COLOR[ev.type] || TYPE_COLOR.event;
        const time = ev.allDay ? "all day" : `${esc(ev.start || "")}–${esc(ev.end || "")}`;
        return `<li class="wk-ev" style="border-left-color:${c}">
            <span class="t">${time}</span><span class="ttl">${esc(ev.title || "")}</span>
          </li>`;
      }).join("");
    return `<div class="wk-col${isToday ? " wk-col--today" : ""}">
        <div class="wk-dh"><span>${d.toLocaleDateString(undefined, { weekday: "short" })}</span><span class="num">${d.getDate()}</span></div>
        <ul class="wk-list">${items || `<li class="wk-empty">nothing</li>`}</ul>
      </div>`;
  }).join("");

  if (body) body.innerHTML = `<div class="wk-grid">${cols}</div>`;

  const legendEl = document.getElementById("wk-legend");
  if (legendEl) {
    legendEl.innerHTML = Object.keys(TYPE_LABEL).map((t) =>
      `<span class="wk-key"><i style="background:${TYPE_COLOR[t]}"></i>${TYPE_LABEL[t]}</span>`
    ).join("");
  }
};
