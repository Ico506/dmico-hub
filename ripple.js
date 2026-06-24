/* ─────────────────────────────────────────────────────────────
   dmico life os — Ripple widget (shared by Week + Control)
   Absorb a sudden event by pushing today's movable blocks forward.
   Preview is computed INSTANTLY here in JS (a faithful mirror of the bot's
   schedule_core.cascade_day) so a disruption is handled fast; on confirm it
   sends the resolved plan as a `ripple_apply` action the bot executes.
   ───────────────────────────────────────────────────────────── */

// Pure cascade mirror (minutes-of-day). Mirrors schedule_core.cascade_day.
window.dmicoCascade = function (events, iStart, iEnd, ceiling) {
  const affected = events.filter((e) => e.movable && e.start >= iStart).sort((a, b) => a.start - b.start);
  const busy = [[iStart, iEnd]];
  events.forEach((e) => { if (!e.movable && e.end > iStart) busy.push([e.start, e.end]); });
  const moves = [], overflow = [];
  const ofw = (e) => overflow.push({ id: e.id, title: e.title, type: e.type, duration_min: e.end - e.start });
  const work = [];
  affected.forEach((e) => (e.type === "entertainment" ? ofw(e) : work.push(e)));
  const firstFit = (winStart, winEnd, busyList, dur) => {
    const clipped = busyList.map((b) => [Math.max(b[0], winStart), Math.min(b[1], winEnd)])
      .filter((b) => b[1] > b[0]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    clipped.forEach((iv) => {
      if (merged.length && iv[0] <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
      else merged.push([iv[0], iv[1]]);
    });
    let c = winStart;
    for (const b of merged) { if (b[0] - c >= dur) return [c, c + dur]; c = Math.max(c, b[1]); }
    if (winEnd - c >= dur) return [c, c + dur];
    return null;
  };
  let cursor = iEnd;
  for (const e of work) {
    const dur = e.end - e.start;
    const slot = firstFit(Math.max(cursor, iEnd), ceiling, busy, dur);
    if (slot) { busy.push(slot); cursor = slot[1]; if (slot[0] !== e.start) moves.push({ id: e.id, title: e.title, type: e.type, start: slot[0], end: slot[1] }); }
    else ofw(e);
  }
  return { moves, overflow };
};

window.dmicoRippleWidget = async function (host, sb) {
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const toMin = (hhmm) => { const [h, m] = (hhmm || "0:0").split(":").map(Number); return h * 60 + m; };
  const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const toISO = (min) => `${todayISO}T${toHHMM(min)}:00`;

  host.innerHTML = `
    <style>
      .rip{display:flex;flex-direction:column;gap:10px;max-width:560px;}
      .rip .rip-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
      .rip input,.rip select{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;}
      .rip input.rip-title{flex:1;min-width:140px;}
      .rip button{font:inherit;font-weight:600;padding:7px 14px;border-radius:8px;border:none;background:#d98a2b;color:#fff;cursor:pointer;}
      .rip button.ghost{background:transparent;border:1px solid rgba(127,127,127,0.35);color:inherit;}
      .rip .rip-prev{font-size:0.82rem;padding:10px 12px;border-radius:10px;background:rgba(217,138,43,0.10);}
      .rip .rip-prev .h{font-weight:600;margin:6px 0 3px;}
      .rip .rip-msg{font-size:0.78rem;opacity:0.85;}
      .rip .note{font-size:0.74rem;opacity:0.55;}
    </style>
    <div class="rip">
      <div class="rip-row">
        <input class="rip-title" type="text" placeholder="Sudden plan (e.g. Outing)" maxlength="60" />
        <input class="rip-s" type="time" />
        <input class="rip-e" type="time" />
        <select class="rip-mode">
          <option value="returns">Overflow → returns pool</option>
          <option value="tomorrow">Overflow → tomorrow</option>
        </select>
        <button class="rip-preview">Preview</button>
      </div>
      <div class="rip-prev" hidden></div>
      <div class="rip-row" hidden data-apply-row><button class="rip-apply">Apply ripple</button><button class="ghost rip-cancel">Cancel</button></div>
      <p class="rip-msg" hidden></p>
    </div>`;

  const q = (sel) => host.querySelector(sel);
  const prevEl = q(".rip-prev");
  const applyRow = q("[data-apply-row]");
  const msgEl = q(".rip-msg");
  let currentPlan = null;

  const [wc, anchorsData] = await Promise.all([
    window.dmicoKvGet("week_calendar"),
    window.dmicoKvGet("routine_anchors"),
  ]);
  const anchors = (anchorsData && Array.isArray(anchorsData.anchors)) ? anchorsData.anchors : [];
  const anchorById = {};
  anchors.forEach((a) => { anchorById[a.id] = a; });
  const wd = anchors.find((a) => (a.title || "").toLowerCase().includes("wind") || a.id === "winddown");
  const ceiling = toMin(wd ? wd.start : "23:00");

  function todaysEvents() {
    const evs = (wc && Array.isArray(wc.events) ? wc.events : []).filter((e) => e.date === todayISO && !e.allDay);
    return evs.map((e) => {
      let movable;
      if (e.type === "anchor") {
        const t = (e.title || "").toLowerCase();
        if (t.includes("wind") || t.includes("sleep")) movable = false;
        else movable = anchorById[e.anchorId] ? anchorById[e.anchorId].movable !== false : true;
      } else if (e.type === "event") movable = false;       // hub_manual / external = pinned
      else movable = true;                                   // focus / crunch / entertainment
      return { id: e.id, title: e.title, type: e.type, movable, start: toMin(e.start), end: toMin(e.end) };
    });
  }

  q(".rip-preview").addEventListener("click", () => {
    const title = q(".rip-title").value.trim() || "Sudden plan";
    const s = q(".rip-s").value, e = q(".rip-e").value;
    if (!s || !e || toMin(e) <= toMin(s)) { msgEl.hidden = false; msgEl.textContent = "Set a start and a later end."; return; }
    const mode = q(".rip-mode").value;
    const res = window.dmicoCascade(todaysEvents(), toMin(s), toMin(e), ceiling);
    currentPlan = {
      intrusion: { title, date: todayISO, start: s, end: e },
      moves: res.moves.map((m) => ({ id: m.id, title: m.title, type: m.type, start: toISO(m.start), end: toISO(m.end) })),
      overflow: res.overflow.map((o) => ({ id: o.id, title: o.title, type: o.type, duration_min: o.duration_min })),
      mode,
    };
    const lines = [`<div class="h">Adding ${esc(title)} ${esc(s)}–${esc(e)}</div>`];
    if (res.moves.length) {
      lines.push(`<div class="h">Shifts</div>` + res.moves.map((m) => `${esc(m.title)} → ${toHHMM(m.start)}–${toHHMM(m.end)}`).join("<br>"));
    } else lines.push(`<div>Nothing needs to shift.</div>`);
    if (res.overflow.length) {
      lines.push(`<div class="h">Doesn't fit today → ${mode === "tomorrow" ? "tomorrow" : "returns pool"}</div>`
        + res.overflow.map((o) => `${esc(o.title)} (${o.duration_min}m)`).join("<br>"));
    }
    prevEl.hidden = false; prevEl.innerHTML = lines.join("");
    applyRow.hidden = false;
    msgEl.hidden = true;
  });

  q(".rip-apply").addEventListener("click", async () => {
    if (!currentPlan) return;
    q(".rip-apply").disabled = true;
    const ok = await window.dmicoEnqueue({ type: "ripple_apply", plan: currentPlan });
    q(".rip-apply").disabled = false;
    msgEl.hidden = false;
    msgEl.textContent = ok ? "Ripple sent. Your day reshuffles within a minute." : "Couldn't send — try again.";
    if (ok) { prevEl.hidden = true; applyRow.hidden = true; currentPlan = null; }
  });
  q(".rip-cancel").addEventListener("click", () => { prevEl.hidden = true; applyRow.hidden = true; currentPlan = null; });
};
