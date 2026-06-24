/* ─────────────────────────────────────────────────────────────
   dmico life os — Control (the cockpit)
   Everything that used to live only in Discord, now driveable here:
     · edit the routine anchors (your day's backbone)
     · trigger weekly plan / crunch / entertainment placement
     · set the bot's check-in / drift / snapshot times
     · see routine streaks
   All changes go through the kv 'hub_actions' queue; the bot applies them
   server-side within ~a minute and Discord narrates. Discord = voice.
   ───────────────────────────────────────────────────────────── */

window.renderControl = async function (container, sb) {
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const DAYS = [["Mon", 0], ["Tue", 1], ["Wed", 2], ["Thu", 3], ["Fri", 4], ["Sat", 5], ["Sun", 6]];
  const DEFAULTS = [
    { id: "wake", title: "☀️ Wake up", start: "07:00", end: "07:15", days: [0, 1, 2, 3, 4, 5, 6] },
  ];

  container.innerHTML = `
    <style>
      #ctl{display:flex;flex-direction:column;gap:26px;max-width:880px;}
      #ctl section{display:flex;flex-direction:column;gap:10px;}
      #ctl h3{margin:0;font-size:0.98rem;font-weight:700;}
      #ctl .ctl-sub{font-size:0.78rem;opacity:0.6;margin:-4px 0 4px;}
      #ctl .ctl-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:rgba(127,127,127,0.06);}
      #ctl .ctl-row input[type=text],#ctl .ctl-row .a-title{flex:1;min-width:130px;}
      #ctl input,#ctl select{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;}
      #ctl .a-days{display:flex;flex-wrap:wrap;gap:6px;font-size:0.72rem;}
      #ctl .a-days label{display:inline-flex;align-items:center;gap:3px;opacity:0.85;}
      #ctl button{font:inherit;font-weight:600;padding:7px 14px;border-radius:8px;border:none;background:#5b8def;color:#fff;cursor:pointer;}
      #ctl button.ghost{background:transparent;border:1px solid rgba(127,127,127,0.35);color:inherit;}
      #ctl button.a-rm{background:transparent;color:inherit;opacity:0.5;padding:4px 8px;}
      #ctl button:disabled{opacity:0.5;cursor:default;}
      #ctl .ctl-actions{display:flex;flex-wrap:wrap;gap:8px;}
      #ctl .ctl-triggers{display:flex;flex-wrap:wrap;gap:10px;}
      #ctl .ctl-triggers button{background:#3aa675;}
      #ctl .ctl-times{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;}
      #ctl .ctl-times label{display:flex;flex-direction:column;gap:4px;font-size:0.78rem;opacity:0.85;}
      #ctl .ctl-msg{font-size:0.78rem;opacity:0.85;margin:2px 0 0;}
      #ctl .ctl-streaks{display:flex;flex-wrap:wrap;gap:10px;font-size:0.8rem;}
      #ctl .ctl-streak{padding:6px 10px;border-radius:8px;background:rgba(58,166,117,0.12);}
      #ctl .ctl-note{font-size:0.74rem;opacity:0.55;}
    </style>
    <div id="ctl">
      <section>
        <h3>🧭 Routine anchors</h3>
        <p class="ctl-sub">The backbone of your day. Edit times and days, then Save to re-sync the recurring calendar events.</p>
        <div id="ctl-anchors"></div>
        <div class="ctl-actions">
          <button class="ghost" id="ctl-add">+ Add anchor</button>
          <button id="ctl-save">Save anchors</button>
        </div>
        <p class="ctl-msg" id="ctl-amsg" hidden></p>
      </section>

      <section>
        <h3>🗓️ Planning</h3>
        <p class="ctl-sub">Run these now; the bot applies to your calendar and posts a note in Discord.</p>
        <div class="ctl-triggers">
          <button data-run="run_plan">Plan next week</button>
          <button data-run="run_crunch">Crunch study blocks</button>
          <button data-run="run_funweek">Plan entertainment</button>
        </div>
        <p class="ctl-msg" id="ctl-rmsg" hidden></p>
      </section>

      <section>
        <h3>⏰ Bot times</h3>
        <p class="ctl-sub">When the bot runs its daily check-in, drift scan, and calendar snapshot. Applies from the next cycle.</p>
        <div class="ctl-times">
          <label>Check-in<input id="ctl-checkin" type="time" /></label>
          <label>Drift scan<input id="ctl-drift" type="time" /></label>
          <label>Snapshot<input id="ctl-snap" type="time" /></label>
          <button id="ctl-tsave">Save times</button>
        </div>
        <p class="ctl-msg" id="ctl-tmsg" hidden></p>
      </section>

      <section>
        <h3>🔥 Routine streaks</h3>
        <div class="ctl-streaks" id="ctl-streaks"><span class="ctl-note">Loading…</span></div>
      </section>
    </div>`;

  const [anchRes, adhRes, setRes] = await Promise.all([
    sb.from("kv_store").select("value").eq("key", "routine_anchors").limit(1),
    sb.from("kv_store").select("value").eq("key", "routine_adherence").limit(1),
    sb.from("kv_store").select("value").eq("key", "bot_settings").limit(1),
  ]);

  let anchors = anchRes?.data?.[0]?.value?.anchors;
  if (!Array.isArray(anchors) || !anchors.length) anchors = DEFAULTS.slice();

  const host = document.getElementById("ctl-anchors");
  function syncFromDom() {
    anchors = Array.from(host.querySelectorAll(".ctl-row")).map((r) => ({
      id: r.dataset.id,
      title: r.querySelector(".a-title").value,
      start: r.querySelector(".a-start").value,
      end: r.querySelector(".a-end").value,
      days: Array.from(r.querySelectorAll(".a-day:checked")).map((c) => +c.value),
    }));
  }
  function renderAnchors() {
    host.innerHTML = anchors.map((a) => `
      <div class="ctl-row" data-id="${esc(a.id || "")}">
        <input class="a-title" type="text" value="${esc(a.title || "")}" />
        <input class="a-start" type="time" value="${esc(a.start || "")}" />
        <input class="a-end" type="time" value="${esc(a.end || "")}" />
        <span class="a-days">${DAYS.map(([lbl, d]) =>
          `<label><input class="a-day" type="checkbox" value="${d}" ${(a.days || []).includes(d) ? "checked" : ""}/>${lbl}</label>`
        ).join("")}</span>
        <button class="a-rm" title="Remove">✕</button>
      </div>`).join("");
    host.querySelectorAll(".a-rm").forEach((btn, i) =>
      btn.addEventListener("click", () => { syncFromDom(); anchors.splice(i, 1); renderAnchors(); })
    );
  }
  renderAnchors();

  const amsg = document.getElementById("ctl-amsg");
  document.getElementById("ctl-add").addEventListener("click", () => {
    syncFromDom();
    anchors.push({ id: "", title: "New anchor", start: "09:00", end: "10:00", days: [0, 1, 2, 3, 4] });
    renderAnchors();
  });
  document.getElementById("ctl-save").addEventListener("click", async () => {
    syncFromDom();
    const bad = anchors.find((a) => !a.title || !a.start || !a.end || a.end <= a.start || !a.days.length);
    if (bad) { amsg.hidden = false; amsg.textContent = "Each anchor needs a title, end after start, and at least one day."; return; }
    const ok = await window.dmicoEnqueue({ type: "routine_save", anchors });
    amsg.hidden = false;
    amsg.textContent = ok ? "Saved. The bot re-syncs your recurring events within a minute." : "Couldn't queue that. Try again.";
  });

  const rmsg = document.getElementById("ctl-rmsg");
  document.querySelectorAll("[data-run]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const ok = await window.dmicoEnqueue({ type: btn.dataset.run });
      btn.disabled = false;
      rmsg.hidden = false;
      rmsg.textContent = ok
        ? "On it. The bot runs it and posts a note in Discord; the Week tab updates shortly."
        : "Couldn't queue that. Try again.";
    });
  });

  const settings = setRes?.data?.[0]?.value || {};
  document.getElementById("ctl-checkin").value = settings.checkin_time || "20:00";
  document.getElementById("ctl-drift").value = settings.drift_time || "21:30";
  document.getElementById("ctl-snap").value = settings.snapshot_time || "00:30";
  const tmsg = document.getElementById("ctl-tmsg");
  document.getElementById("ctl-tsave").addEventListener("click", async () => {
    const ok = await window.dmicoEnqueue({
      type: "settings_save",
      checkin_time: document.getElementById("ctl-checkin").value,
      drift_time: document.getElementById("ctl-drift").value,
      snapshot_time: document.getElementById("ctl-snap").value,
    });
    tmsg.hidden = false;
    tmsg.textContent = ok ? "Saved. New times take effect from the next cycle." : "Couldn't queue that. Try again.";
  });

  const streaks = adhRes?.data?.[0]?.value?.streaks || {};
  const titleById = {};
  anchors.forEach((a) => { titleById[a.id] = a.title; });
  const sEl = document.getElementById("ctl-streaks");
  const active = Object.entries(streaks).filter(([, v]) => (v.current || 0) > 0);
  sEl.innerHTML = active.length
    ? active.sort((a, b) => (b[1].current || 0) - (a[1].current || 0))
        .map(([id, v]) => `<span class="ctl-streak">🔥 ${esc(titleById[id] || id)}: ${v.current}d</span>`).join("")
    : `<span class="ctl-note">No active streaks yet — they start the first day you tap a check-in.</span>`;
};
