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
      #ctl .ctl-row{display:flex;flex-direction:column;gap:7px;padding:10px;border-radius:10px;background:rgba(127,127,127,0.06);}
      #ctl .ctl-arow1{display:flex;align-items:center;gap:8px;}
      #ctl .ctl-arow1 .a-title{flex:1;min-width:120px;}
      #ctl .ctl-arow1 .a-rm{margin-left:auto;}
      #ctl .ctl-arow2{display:flex;flex-wrap:wrap;align-items:center;gap:12px;}
      #ctl .a-dash{opacity:0.45;}
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
      #ctl .ctl-checkin{display:flex;flex-wrap:wrap;gap:8px;}
      #ctl .ci{background:rgba(127,127,127,0.12);color:inherit;border:1px solid rgba(127,127,127,0.25);font-weight:600;}
      #ctl .ci.on{background:rgba(58,166,117,0.25);border-color:transparent;}
      #ctl .ctl-flabel{display:flex;flex-direction:column;gap:4px;font-size:0.8rem;opacity:0.9;}
      #ctl .ctl-flabel textarea{font:inherit;padding:7px 9px;border-radius:8px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;resize:vertical;}
      #ctl .cd-row{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;background:rgba(127,127,127,0.06);margin-bottom:6px;}
      #ctl .cd-row .cd-when{margin-left:auto;font-size:0.76rem;opacity:0.7;}
      #ctl .cd-row .cd-del{background:transparent;color:inherit;opacity:0.5;padding:3px 8px;}
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
        <h3>🌀 Ripple my day</h3>
        <p class="ctl-sub">A sudden plan came up? Drop it in and push the rest of today back.</p>
        <div id="ctl-ripple"></div>
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
        <h3>✅ Today's check-in</h3>
        <p class="ctl-sub">Tick what you did today to build your streaks. (You can also tap the bot's 20:00 Discord check-in.)</p>
        <div class="ctl-checkin" id="ctl-checkin-today"><span class="ctl-note">Loading…</span></div>
      </section>

      <section>
        <h3>🔥 Routine streaks</h3>
        <div class="ctl-streaks" id="ctl-streaks"><span class="ctl-note">Loading…</span></div>
      </section>

      <section>
        <h3>⏳ Countdowns</h3>
        <p class="ctl-sub">Deadlines and events the bot counts down to.</p>
        <div id="ctl-countdowns"><span class="ctl-note">Loading…</span></div>
        <div class="ctl-actions">
          <input type="text" id="cd-event" placeholder="Event" style="flex:1;min-width:140px" />
          <input type="date" id="cd-date" />
          <input type="time" id="cd-time" title="optional" />
          <button id="cd-add">Add</button>
        </div>
        <p class="ctl-msg" id="cd-msg" hidden></p>
      </section>

      <section>
        <h3>🪪 Profile</h3>
        <p class="ctl-sub">Who you are and what you're working toward. The weekly plan reads this.</p>
        <label class="ctl-flabel">Identity<textarea id="pf-identity" rows="2"></textarea></label>
        <label class="ctl-flabel">Focus areas<textarea id="pf-focus" rows="2"></textarea></label>
        <label class="ctl-flabel">Values<textarea id="pf-values" rows="2"></textarea></label>
        <div class="ctl-actions"><button id="pf-save">Save profile</button></div>
        <p class="ctl-msg" id="pf-msg" hidden></p>
      </section>
    </div>`;

  const [anchRes, adhRes, setRes, cdRes, pfRes] = await Promise.all([
    sb.from("kv_store").select("value").eq("key", "routine_anchors").limit(1),
    sb.from("kv_store").select("value").eq("key", "routine_adherence").limit(1),
    sb.from("kv_store").select("value").eq("key", "bot_settings").limit(1),
    sb.from("kv_store").select("value").eq("key", "countdown_data").limit(1),
    sb.from("kv_store").select("value").eq("key", "profile_data").limit(1),
  ]);

  let anchors = anchRes?.data?.[0]?.value?.anchors;
  if (!Array.isArray(anchors) || !anchors.length) anchors = DEFAULTS.slice();
  const checkinAnchors = anchors.slice();  // stable snapshot for the check-in

  const host = document.getElementById("ctl-anchors");
  function syncFromDom() {
    anchors = Array.from(host.querySelectorAll(".ctl-row")).map((r) => ({
      id: r.dataset.id,
      title: r.querySelector(".a-title").value,
      start: r.querySelector(".a-start").value,
      end: r.querySelector(".a-end").value,
      days: Array.from(r.querySelectorAll(".a-day:checked")).map((c) => +c.value),
      movable: r.querySelector(".a-movable").checked,
    }));
  }
  function renderAnchors() {
    // Keep rows in time order so each anchor sits in its slot.
    anchors.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    host.innerHTML = anchors.map((a) => `
      <div class="ctl-row" data-id="${esc(a.id || "")}">
        <div class="ctl-arow1">
          <input class="a-title" type="text" value="${esc(a.title || "")}" />
          <input class="a-start" type="time" value="${esc(a.start || "")}" />
          <span class="a-dash">–</span>
          <input class="a-end" type="time" value="${esc(a.end || "")}" />
          <button class="a-rm" title="Remove">✕</button>
        </div>
        <div class="ctl-arow2">
          <span class="a-days">${DAYS.map(([lbl, d]) =>
            `<label><input class="a-day" type="checkbox" value="${d}" ${(a.days || []).includes(d) ? "checked" : ""}/>${lbl}</label>`
          ).join("")}</span>
          <label class="a-mov" title="Can a ripple move this block?"><input class="a-movable" type="checkbox" ${a.movable !== false ? "checked" : ""}/>movable</label>
        </div>
      </div>`).join("");
    host.querySelectorAll(".a-rm").forEach((btn, i) =>
      btn.addEventListener("click", () => { syncFromDom(); anchors.splice(i, 1); renderAnchors(); })
    );
    // Re-sort live when a start/end time changes.
    host.querySelectorAll(".a-start, .a-end").forEach((inp) =>
      inp.addEventListener("change", () => { syncFromDom(); renderAnchors(); })
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

  // Today's check-in — feeds the same history/streaks as the Discord check-in.
  const hist = (adhRes?.data?.[0]?.value?.history) || {};
  const ciToday = new Date().toISOString().split("T")[0];
  const pyWd = (new Date().getDay() + 6) % 7;  // JS Sun=0 -> Python Mon=0
  const MANUAL = [["water", "💧 Water"], ["screens", "🌿 No screens (wind-down)"]];
  const todayItems = checkinAnchors
    .filter((a) => (a.days || []).includes(pyWd))
    .map((a) => [a.id, a.title])
    .concat(MANUAL);
  const ciEl = document.getElementById("ctl-checkin-today");
  function renderCheckin() {
    const done = hist[ciToday] || {};
    ciEl.innerHTML = todayItems.length
      ? todayItems.map(([id, label]) =>
          `<button class="ci ${done[id] === true ? "on" : ""}" data-id="${esc(id)}">${done[id] === true ? "✓ " : ""}${esc(label)}</button>`
        ).join("")
      : `<span class="ctl-note">No anchors scheduled today.</span>`;
    ciEl.querySelectorAll(".ci").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const now = !(hist[ciToday] && hist[ciToday][id] === true);
        (hist[ciToday] = hist[ciToday] || {})[id] = now;
        renderCheckin();
        await window.dmicoEnqueue({ type: "routine_check", item_id: id, date: ciToday, done: now });
      })
    );
  }
  renderCheckin();

  const streaks = adhRes?.data?.[0]?.value?.streaks || {};
  const titleById = {};
  anchors.forEach((a) => { titleById[a.id] = a.title; });
  const sEl = document.getElementById("ctl-streaks");
  const active = Object.entries(streaks).filter(([, v]) => (v.current || 0) > 0);
  sEl.innerHTML = active.length
    ? active.sort((a, b) => (b[1].current || 0) - (a[1].current || 0))
        .map(([id, v]) => `<span class="ctl-streak">🔥 ${esc(titleById[id] || id)}: ${v.current}d</span>`).join("")
    : `<span class="ctl-note">No active streaks yet — they start the first day you tap a check-in.</span>`;

  // ── Countdowns ──────────────────────────────────────────────
  const cdEl = document.getElementById("ctl-countdowns");
  const cdMsg = document.getElementById("cd-msg");
  const daysTo = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00"); const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.ceil((d - t) / 86400000);
  };
  function renderCountdowns(list) {
    const items = (list || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    cdEl.innerHTML = items.length ? items.map((c, i) => {
      const dd = daysTo(c.date);
      const when = dd < 0 ? `${-dd}d ago` : dd === 0 ? "today" : dd === 1 ? "tomorrow" : `${dd}d`;
      return `<div class="cd-row"><span>${esc(c.event)}</span><span class="cd-when">${esc(c.date)}${c.time ? " " + esc(c.time) : ""} · ${when}</span><button class="cd-del" data-i="${i}" title="Delete">✕</button></div>`;
    }).join("") : `<span class="ctl-note">No countdowns yet.</span>`;
    cdEl.querySelectorAll(".cd-del").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const target = items[+btn.dataset.i];
        const data = (await window.dmicoKvGet("countdown_data")) || { countdowns: [] };
        data.countdowns = (data.countdowns || []).filter((c) =>
          !(c.event === target.event && c.date === target.date && (c.time || "") === (target.time || "")));
        await window.dmicoKvSet("countdown_data", data);
        renderCountdowns(data.countdowns);
      })
    );
  }
  renderCountdowns(cdRes?.data?.[0]?.value?.countdowns || []);
  document.getElementById("cd-add").addEventListener("click", async () => {
    const event = document.getElementById("cd-event").value.trim();
    const date = document.getElementById("cd-date").value;
    const time = document.getElementById("cd-time").value;
    if (!event || !date) { cdMsg.hidden = false; cdMsg.textContent = "Need an event and a date."; return; }
    const data = (await window.dmicoKvGet("countdown_data")) || {};
    data.countdowns = Array.isArray(data.countdowns) ? data.countdowns : [];
    const entry = { event, date, added: new Date().toISOString().split("T")[0] };
    if (time) entry.time = time;
    data.countdowns.push(entry);
    const ok = await window.dmicoKvSet("countdown_data", data);
    cdMsg.hidden = false; cdMsg.textContent = ok ? "Countdown added." : "Couldn't save — try again.";
    if (ok) { document.getElementById("cd-event").value = ""; renderCountdowns(data.countdowns); }
  });

  // ── Profile ─────────────────────────────────────────────────
  const core = (pfRes?.data?.[0]?.value?.core) || {};
  document.getElementById("pf-identity").value = core.identity || "";
  document.getElementById("pf-focus").value = core.focus_areas || "";
  document.getElementById("pf-values").value = core.values || "";
  const pfMsg = document.getElementById("pf-msg");
  document.getElementById("pf-save").addEventListener("click", async () => {
    const data = (await window.dmicoKvGet("profile_data")) || {};
    data.core = data.core && typeof data.core === "object" ? data.core : {};
    data.core.identity = document.getElementById("pf-identity").value.trim();
    data.core.focus_areas = document.getElementById("pf-focus").value.trim();
    data.core.values = document.getElementById("pf-values").value.trim();
    data.setup_complete = true;
    const ok = await window.dmicoKvSet("profile_data", data);
    pfMsg.hidden = false; pfMsg.textContent = ok ? "Profile saved." : "Couldn't save — try again.";
  });

  // ── Ripple widget ───────────────────────────────────────────
  if (window.dmicoRippleWidget) {
    try { await window.dmicoRippleWidget(document.getElementById("ctl-ripple"), sb); }
    catch (e) { console.error("ripple widget failed", e); }
  }
};
