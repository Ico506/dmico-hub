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

  // Five categories, five swatches drawn from the existing token palette (no new
  // hues introduced). This is a bounded, explicitly-keyed legend (see .wk-legend),
  // not ambient chrome, so spending the accent/lantern/amber colours here is
  // safe: a reader learns the key once and reads the calendar by position, not
  // by hunting for meaning in colour. The two highest-frequency categories
  // (anchor, event) stay on the calm ink scale so most of the week reads quiet;
  // deliberate blocks (focus, crunch, play) get the three that carry meaning.
  const TYPE_COLOR = {
    anchor: "var(--ink-faint)", focus: "var(--accent)", crunch: "var(--amber)",
    entertainment: "var(--lantern)", event: "var(--ink)",
  };
  const TYPE_LABEL = {
    anchor: "Anchor", focus: "Focus", crunch: "Study",
    entertainment: "Play", event: "Event",
  };

  container.innerHTML = `
    <style>
      #week{display:flex;flex-direction:column;gap:16px;}
      #week .wk-top{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;}
      #week .wk-range{font-family:var(--display);font-size:1.1rem;font-weight:700;color:var(--ink);}
      #week .wk-updated{font-size:0.74rem;color:var(--ink-faint);}
      #week .wk-add{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
      #week .wk-add input,#week .wk-add select{font:inherit;padding:8px 10px;border-radius:var(--radius);border:1px solid var(--line);background:var(--surface-2);color:var(--ink);}
      #week .wk-add input:focus-visible,#week .wk-add select:focus-visible{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-wash);}
      #week .wk-add input#wk-t{flex:1;min-width:150px;}
      #week .wk-msg{font-size:0.78rem;color:var(--ink-soft);margin:0;}
      #week .wk-grid{display:grid;grid-template-columns:repeat(7,minmax(130px,1fr));gap:10px;overflow-x:auto;padding-bottom:6px;}
      #week .wk-col{border-radius:var(--radius);background:var(--paper-deep);border:1px solid var(--line);padding:10px 8px;min-height:180px;display:flex;flex-direction:column;}
      #week .wk-col--today{background:var(--surface);border-color:var(--lantern);}
      #week .wk-dh{font-weight:700;font-size:0.85rem;display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;color:var(--ink-soft);}
      #week .wk-dh .num{color:var(--ink-faint);font-size:0.95rem;}
      #week .wk-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;}
      #week .wk-ev{position:relative;font-size:0.76rem;line-height:1.3;padding:5px 8px;border-radius:6px;background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--ink-faint);}
      #week .wk-ev .t{display:block;font-variant-numeric:tabular-nums;color:var(--ink-faint);font-size:0.7rem;}
      #week .wk-ev .ttl{font-weight:500;color:var(--ink);}
      #week .wk-del{position:absolute;top:3px;right:4px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--ink-faint);cursor:pointer;font-size:0.8rem;line-height:1;padding:0;border-radius:6px;transition:background .16s ease,color .16s ease;}
      #week .wk-del:hover{background:rgba(138, 63, 30, 0.12);color:var(--clay);}
      #week .wk-ev[data-removing="1"]{opacity:0.4;}
      #week .wk-empty{font-size:0.74rem;color:var(--ink-faint);text-align:center;margin-top:8px;}
      #week .wk-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:0.74rem;color:var(--ink-soft);}
      #week .wk-key{display:inline-flex;align-items:center;gap:5px;}
      #week .wk-key i{width:10px;height:10px;border-radius:2px;display:inline-block;}
      #week .wk-blank{color:var(--ink-faint);font-size:0.9rem;padding:30px 0;text-align:center;}
    </style>
    <div id="week">
      <div class="wk-top">
        <span class="wk-range" id="wk-range">Your week</span>
        <span class="r-chips" style="margin-bottom:0;align-items:center">
          <button class="r-chip on" data-src="week_calendar">This week</button>
          <button class="r-chip" data-src="week_calendar_next">Next week</button>
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
        <button id="wk-addbtn" class="btn-primary r-btn">Add block</button>
      </div>
      <p class="wk-msg" id="wk-msg" hidden></p>
      <details class="wk-ripple-wrap" style="margin:2px 0"><summary style="cursor:pointer;font-size:0.85rem;font-weight:700;color:var(--ink-soft)">Ripple my day (a sudden plan came up)</summary><div id="wk-ripple" style="margin-top:10px"></div></details>
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

  container.querySelectorAll("[data-src]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      sourceKey = btn.dataset.src;
      container.querySelectorAll("[data-src]").forEach((b) => b.classList.toggle("on", b === btn));
      await draw();
    })
  );

  if (window.dmicoRippleWidget) {
    try { await window.dmicoRippleWidget(document.getElementById("wk-ripple"), sb); }
    catch (e) { console.error("ripple widget failed", e); }
  }
};
