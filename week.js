/* ─────────────────────────────────────────────────────────────
   dmico life os — Week
   A full-size view of your resolved Google Calendar week (from the bot's
   kv 'week_calendar' snapshot), now editable: add and delete blocks here
   and the bot applies them to Google Calendar within ~a minute. Discord
   can still edit too.
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
      #week .wk-tog{font:inherit;font-size:0.74rem;font-weight:600;padding:4px 10px;border-radius:7px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;cursor:pointer;opacity:0.75;}
      #week .wk-tog.on{background:rgba(91,141,239,0.2);border-color:transparent;opacity:1;}
      #week .wk-add{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px;border-radius:12px;background:rgba(127,127,127,0.06);}
      #week .wk-add input,#week .wk-add select{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;}
      #week .wk-add input#wk-t{flex:1;min-width:150px;}
      #week .wk-add button{font:inherit;font-weight:600;padding:6px 14px;border-radius:8px;border:none;background:#5b8def;color:#fff;cursor:pointer;}
      #week .wk-add button:disabled{opacity:0.5;cursor:default;}
      #week .wk-msg{font-size:0.78rem;opacity:0.8;margin:0;}
      #week .wk-grid{display:grid;grid-template-columns:repeat(7,minmax(130px,1fr));gap:10px;overflow-x:auto;padding-bottom:6px;}
      #week .wk-col{border-radius:12px;background:rgba(127,127,127,0.06);padding:10px 8px;min-height:180px;display:flex;flex-direction:column;}
      #week .wk-col--today{background:rgba(91,141,239,0.12);outline:1px solid rgba(91,141,239,0.35);}
      #week .wk-dh{font-weight:600;font-size:0.85rem;display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;opacity:0.85;}
      #week .wk-dh .num{opacity:0.55;font-size:0.95rem;}
      #week .wk-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;}
      #week .wk-ev{position:relative;font-size:0.76rem;line-height:1.3;padding:5px 8px;border-radius:6px;background:rgba(127,127,127,0.09);border-left:3px solid #8a8f98;}
      #week .wk-ev .t{display:block;font-variant-numeric:tabular-nums;opacity:0.65;font-size:0.7rem;}
      #week .wk-ev .ttl{font-weight:500;}
      #week .wk-del{position:absolute;top:3px;right:4px;border:none;background:transparent;color:inherit;opacity:0.35;cursor:pointer;font-size:0.8rem;line-height:1;padding:2px;}
      #week .wk-del:hover{opacity:0.9;}
      #week .wk-ev[data-removing="1"]{opacity:0.4;}
      #week .wk-empty{font-size:0.74rem;opacity:0.3;text-align:center;margin-top:8px;}
      #week .wk-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:0.74rem;opacity:0.8;}
      #week .wk-key{display:inline-flex;align-items:center;gap:5px;}
      #week .wk-key i{width:10px;height:10px;border-radius:2px;display:inline-block;}
      #week .wk-blank{opacity:0.5;font-size:0.9rem;padding:30px 0;text-align:center;}
    </style>
    <div id="week">
      <div class="wk-top">
        <span class="wk-range" id="wk-range">Your week</span>
        <span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <button class="wk-tog on" data-src="week_calendar">This week</button>
          <button class="wk-tog" data-src="week_calendar_next">Next week</button>
          <span class="wk-updated" id="wk-updated"></span>
        </span>
      </div>
      <div class="wk-add">
        <input id="wk-t" placeholder="New block title" maxlength="80" />
        <select id="wk-cat" aria-label="Category">
          <option value="focus">🎯 Focus</option>
          <option value="study">📚 Study</option>
          <option value="play">🎮 Play</option>
          <option value="personal" selected>📌 Personal</option>
        </select>
        <select id="wk-d" aria-label="Day"></select>
        <input id="wk-s" type="time" value="20:00" aria-label="Start" />
        <input id="wk-e" type="time" value="21:00" aria-label="End" />
        <select id="wk-rec" aria-label="Repeat">
          <option value="once" selected>One-time</option>
          <option value="weekly">Weekly</option>
        </select>
        <button id="wk-addbtn">Add block</button>
      </div>
      <p class="wk-msg" id="wk-msg" hidden></p>
      <details class="wk-ripple-wrap" style="margin:2px 0"><summary style="cursor:pointer;font-size:0.85rem;font-weight:600;opacity:0.85">🌀 Ripple my day (a sudden plan came up)</summary><div id="wk-ripple" style="margin-top:10px"></div></details>
      <div id="wk-body"><p class="wk-blank">Loading your week…</p></div>
      <div class="wk-legend" id="wk-legend"></div>
    </div>`;

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const msgEl = document.getElementById("wk-msg");
  const showMsg = (text) => { if (msgEl) { msgEl.textContent = text; msgEl.hidden = false; } };

  let weekMonday = todayISO;
  let sourceKey = "week_calendar";

  async function draw() {
    const res = await sb.from("kv_store").select("value").eq("key", sourceKey).limit(1);
    const wc = res?.data?.[0]?.value ?? null;
    const body = document.getElementById("wk-body");
    if (!wc || !Array.isArray(wc.events)) {
      if (body) body.innerHTML = `<p class="wk-blank">No week snapshot yet. The bot writes one on boot and after any calendar change.</p>`;
      return;
    }
    const base = new Date((wc.week_monday || todayISO) + "T00:00:00");
    weekMonday = wc.week_monday || todayISO;
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

    // Populate the day picker with this week's seven dates.
    const daySel = document.getElementById("wk-d");
    if (daySel && !daySel.dataset.filled) {
      for (let i = 0; i < 7; i++) {
        const d = new Date(base); d.setDate(base.getDate() + i);
        const o = document.createElement("option");
        o.value = iso(d);
        o.textContent = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
        if (iso(d) === todayISO) o.selected = true;
        daySel.appendChild(o);
      }
      daySel.dataset.filled = "1";
    }

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
          const del = ev.id ? `<button class="wk-del" data-gid="${esc(ev.id)}" title="Delete">✕</button>` : "";
          return `<li class="wk-ev" style="border-left-color:${c}">
              <span class="t">${time}</span><span class="ttl">${esc(ev.title || "")}</span>${del}
            </li>`;
        }).join("");
      return `<div class="wk-col${isToday ? " wk-col--today" : ""}">
          <div class="wk-dh"><span>${d.toLocaleDateString(undefined, { weekday: "short" })}</span><span class="num">${d.getDate()}</span></div>
          <ul class="wk-list">${items || `<li class="wk-empty">nothing</li>`}</ul>
        </div>`;
    }).join("");
    if (body) body.innerHTML = `<div class="wk-grid">${cols}</div>`;

    // Wire delete buttons.
    body.querySelectorAll(".wk-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const gid = btn.dataset.gid;
        btn.closest(".wk-ev").dataset.removing = "1";
        const ok = await window.dmicoEnqueue({ type: "calendar_delete", gid });
        showMsg(ok ? "Deleting… it'll clear here within a minute." : "Couldn't queue the delete. Try again.");
        if (ok) setTimeout(draw, 35000);
      });
    });

    const legendEl = document.getElementById("wk-legend");
    if (legendEl) {
      legendEl.innerHTML = Object.keys(TYPE_LABEL).map((t) =>
        `<span class="wk-key"><i style="background:${TYPE_COLOR[t]}"></i>${TYPE_LABEL[t]}</span>`
      ).join("");
    }
  }

  // Add-block handler.
  const addBtn = document.getElementById("wk-addbtn");
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const title = document.getElementById("wk-t").value.trim();
      const date = document.getElementById("wk-d").value;
      const start = document.getElementById("wk-s").value;
      const end = document.getElementById("wk-e").value;
      if (!title || !date || !start || !end) { showMsg("Fill in a title, day, start and end."); return; }
      if (end <= start) { showMsg("End time must be after the start."); return; }
      const category = document.getElementById("wk-cat").value;
      const recurring = document.getElementById("wk-rec").value === "weekly";
      addBtn.disabled = true;
      const ok = await window.dmicoEnqueue({ type: "calendar_add", title, date, start, end, category, recurring });
      addBtn.disabled = false;
      if (ok) {
        document.getElementById("wk-t").value = "";
        showMsg(`Added${recurring ? " (weekly)" : ""}. It'll appear here within a minute as the bot applies it.`);
        setTimeout(draw, 35000);
      } else {
        showMsg("Couldn't queue that. Try again.");
      }
    });
  }

  await draw();

  container.querySelectorAll(".wk-tog").forEach((btn) =>
    btn.addEventListener("click", async () => {
      sourceKey = btn.dataset.src;
      container.querySelectorAll(".wk-tog").forEach((b) => b.classList.toggle("on", b === btn));
      await draw();
    })
  );

  if (window.dmicoRippleWidget) {
    try { await window.dmicoRippleWidget(document.getElementById("wk-ripple"), sb); }
    catch (e) { console.error("ripple widget failed", e); }
  }
};
