/* ─────────────────────────────────────────────────────────────
   dmico life os — dashboard
   Home panel. One signal per module, all fetched in parallel.
   Clicking a card navigates to that module via window.__openModule.
   ───────────────────────────────────────────────────────────── */

window.renderDashboard = async function (container, sb) {
  const today = new Date();

  // The four modules that get a Home stat card. Used to size the loading skeleton so it
  // does not flash cards that are about to be filtered out as archived.
  const MODSTAT_IDS = ["week", "control", "finance", "exercise"];
  const skeletonCount = MODSTAT_IDS.filter(
    (id) => !(window.dmicoIsArchived && window.dmicoIsArchived(id))
  ).length || MODSTAT_IDS.length;

  // Show skeletons while data loads
  container.innerHTML = `
    <div id="dash-now"></div>
    <div class="dash-board" id="dash-board">
      <div id="dash-focus"></div>
      <div id="dash-week"></div>
      <div class="dash-modstats">
        <div class="dash-modstats-eyebrow">(modules)</div>
        <div class="dash-modstat-grid" id="dash-grid">
          ${Array.from({ length: skeletonCount }).map(() => `
            <div class="dash-modstat dash-modstat--loading">
              <div class="dash-skel dash-skel--short"></div>
              <div class="dash-skel"></div>
              <div class="dash-skel dash-skel--short"></div>
            </div>`).join("")}
        </div>
      </div>
    </div>`;

  // The "right now" state block. Fetched independently so it lands as fast as
  // possible; it is the reason to open the hub, so it must not wait on the cards.
  if (window.renderNowBlock) {
    window.dmicoInvalidateState && window.dmicoInvalidateState();
    window.renderNowBlock(document.getElementById("dash-now"), sb)
      .then(() => window.dmicoRefreshRail && window.dmicoRefreshRail(sb))
      .catch((e) => console.error("now block failed", e));
  }

  // Pinned, draggable photo board (independent fetch; never blocks the signal cards).
  if (window.renderDashboardPhotos) {
    try { window.renderDashboardPhotos(document.getElementById("dash-board"), sb); }
    catch (e) { console.error("photo board failed", e); }
  }

  // Fetch all signals in parallel
  const todayISO = today.toISOString().split("T")[0];

  const [exams, chores, expenses, goals, proposalRes, weightLogs, exerciseProfile, weekCalRes, anchRes, adhRes] =
    await Promise.all([
      sb.from("study_exams")
        .select("title, exam_date")
        .gte("exam_date", todayISO)
        .order("exam_date", { ascending: true })
        .limit(1),
      sb.from("hygiene_items").select("name, last_done, interval_days"),
      sb.from("finance_expenses").select("amount, logged_at"),
      sb.from("finance_goals").select("label, target, current"),
      sb.from("kv_store").select("value").eq("key", "pending_proposal").limit(1),
      sb.from("weight_logs")
        .select("weight_kg, logged_at")
        .order("logged_at", { ascending: true }),
      sb.from("exercise_profile")
        .select("goal_weight_kg, goal_type")
        .limit(1),
      // Calendar vNext Item 3: the bot's resolved week (anchors + focus +
      // entertainment), snapshotted into kv since the frontend has no GCal creds.
      sb.from("kv_store").select("value").eq("key", "week_calendar").limit(1),
      // Control's routine anchors + today's check-in history, for the "anchors held" stat.
      sb.from("kv_store").select("value").eq("key", "routine_anchors").limit(1),
      sb.from("kv_store").select("value").eq("key", "routine_adherence").limit(1),
    ]);

  // ── Self-study (feeds the focus card's "today" priority line) ───────────
  const nextExam = exams.data?.[0] ?? null;
  const daysToExam = nextExam
    ? Math.ceil((new Date(nextExam.exam_date) - today) / 86400000)
    : null;

  // ── Hygiene (feeds the focus card's "today" priority line) ──────────────
  const now = Date.now();
  const overdueChores = (chores.data ?? [])
    .filter((c) => c.last_done && c.interval_days)
    .map((c) => ({
      name: c.name,
      daysOver: Math.floor(
        (now - (new Date(c.last_done).getTime() + c.interval_days * 86400000)) /
        86400000
      ),
    }))
    .filter((c) => c.daysOver > 0)
    .sort((a, b) => b.daysOver - a.daysOver);
  const worstChore = overdueChores[0] ?? null;

  // ── Finance ────────────────────────────────────────────────
  const yr = today.getFullYear();
  const mo = today.getMonth();
  const monthSpend = (expenses.data ?? [])
    .filter((e) => {
      const d = new Date(e.logged_at);
      return d.getFullYear() === yr && d.getMonth() === mo;
    })
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const topGoal = (goals.data ?? [])
    .map((g) => ({
      ...g,
      pct: g.target > 0 ? Math.round((g.current / g.target) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct)[0] ?? null;

  // ── Exercise ───────────────────────────────────────────────
  const wlogs   = weightLogs.data ?? [];
  const latestW = wlogs.length ? Number(wlogs[wlogs.length - 1].weight_kg) : null;
  const firstW  = wlogs.length ? Number(wlogs[0].weight_kg) : null;
  const exProf  = exerciseProfile?.data?.[0] ?? null;
  const exGoal  = exProf && exProf.goal_weight_kg != null ? Number(exProf.goal_weight_kg) : null;
  const exType  = exProf?.goal_type || "lose";
  const exReached = (latestW != null && exGoal != null) && (
    exType === "gain" ? latestW >= exGoal
    : exType === "maintain" ? Math.abs(latestW - exGoal) <= 0.5
    : latestW <= exGoal
  );
  const exRemaining = (latestW != null && exGoal != null) ? Math.abs(+(exGoal - latestW).toFixed(1)) : null;
  const exTrend = (latestW != null && firstW != null && wlogs.length > 1)
    ? +(latestW - firstW).toFixed(1) : null;
  const kgFmt = (n) => `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;

  // Read monthly budget limit from localStorage (set in Finance module).
  const budgetRaw   = localStorage.getItem("dmico-hub-monthly-budget");
  const budgetLimit = budgetRaw ? parseFloat(budgetRaw) : null;
  const overBudget  = budgetLimit != null && monthSpend > budgetLimit;
  const fmtRMShort = (n) => "RM " + Math.round(Number(n)).toLocaleString();

  // ── Week signal (from the kv snapshot) ───────────────────────
  const wcal = weekCalRes?.data?.[0]?.value ?? null;
  const wcEvents = (wcal && Array.isArray(wcal.events)) ? wcal.events : [];
  const todaysBlocks = wcEvents.filter((e) => e.date === todayISO);

  // ── Control signal: today's routine anchors + check-in state ────────────
  const MANUAL_CHECKIN_IDS = ["water", "screens"];
  const ctlAnchors = anchRes?.data?.[0]?.value?.anchors;
  const pyWeekday = (today.getDay() + 6) % 7; // JS Sun=0 -> Control's Mon=0
  const scheduledAnchorIds = (Array.isArray(ctlAnchors) ? ctlAnchors : [])
    .filter((a) => (a.days || []).includes(pyWeekday))
    .map((a) => a.id)
    .concat(MANUAL_CHECKIN_IDS);
  const doneToday = adhRes?.data?.[0]?.value?.history?.[todayISO] || {};
  const anchorsHeld = scheduledAnchorIds.filter((id) => doneToday[id] === true).length;
  const anchorsScheduled = scheduledAnchorIds.length;

  // ── Build the module strip ───────────────────────────────────────────────
  // Four stats only (Week, Control, Finance, Exercise): Life and Curators already
  // live in the "right now" state block above, and the rest are archived. Every
  // number here is real and derivable today; nothing is invented to fill the grid.
  const modStats = [
    {
      id: "week",
      label: "Week",
      num: String(todaysBlocks.length),
      unit: "",
      sub: wcEvents.length ? `today · ${wcEvents.length} this week` : "no blocks scheduled",
      over: false,
    },
    {
      id: "control",
      label: "Control",
      num: String(anchorsHeld),
      unit: anchorsScheduled ? ` / ${anchorsScheduled}` : "",
      sub: anchorsScheduled ? "anchors held today" : "no anchors set today",
      over: false,
    },
    {
      id: "finance",
      label: overBudget ? "Finance · over" : "Finance",
      num: fmtRMShort(monthSpend),
      unit: "",
      sub: budgetLimit ? `of ${fmtRMShort(budgetLimit)} limit` : "no limit set",
      over: overBudget,
    },
    {
      id: "exercise",
      label: "Exercise",
      num: latestW != null ? kgFmt(latestW) : "—",
      unit: "",
      sub: latestW == null
        ? "no weigh-ins yet"
        : exGoal == null
        ? (exTrend != null
            ? `${exTrend < 0 ? "▼" : exTrend > 0 ? "▲" : "→"} ${kgFmt(Math.abs(exTrend))} vs first log`
            : "first weigh-in logged")
        : exReached
        ? "goal weight reached"
        : `${kgFmt(exRemaining)} to goal`,
      over: false,
    },
  ];

  // Archived modules lose their Home stat too, so the rail and the dashboard always
  // agree. app.js owns the archived flag; we just ask it.
  const visibleStats = modStats.filter(
    (c) => !(window.dmicoIsArchived && window.dmicoIsArchived(c.id))
  );

  document.getElementById("dash-grid").innerHTML = visibleStats
    .map(
      (c, i) => `
    <button class="dash-modstat${c.over ? " over" : ""}" data-module="${c.id}" style="animation-delay:${i * 55}ms">
      <span class="dash-modstat-label">${c.label}</span>
      <span class="dash-modstat-num">${c.num}${c.unit ? `<small>${c.unit}</small>` : ""}</span>
      <span class="dash-modstat-sub">${c.sub}</span>
    </button>`
    )
    .join("");

  document.getElementById("dash-grid").querySelectorAll(".dash-modstat").forEach((btn) => {
    btn.addEventListener("click", () => window.__openModule?.(btn.dataset.module));
  });

  // ── This-week focus card: the bot's weekly FOCUS + today's priority + blocks ──
  const escH = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const fmtDay = (iso) => {
    try { return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric" }); }
    catch (_) { return iso; }
  };

  let priority = "All caught up for today.";
  if (nextExam && daysToExam != null && daysToExam <= 14) {
    priority = `${nextExam.title} ${daysToExam === 0 ? "is today" : daysToExam === 1 ? "is tomorrow" : "in " + daysToExam + " days"}`;
  } else if (worstChore) {
    priority = `${worstChore.name} is ${worstChore.daysOver}d overdue`;
  } else if (topGoal && topGoal.pct < 100) {
    priority = `${topGoal.label} at ${topGoal.pct}%`;
  }

  const proposal = proposalRes?.data?.[0]?.value ?? null;
  const focusEl = document.getElementById("dash-focus");
  if (focusEl) {
    const events = (proposal && Array.isArray(proposal.events)) ? proposal.events : [];
    const upcoming = events
      .filter((ev) => ev && ev.date && ev.date >= todayISO)
      .sort((a, b) => (a.date + (a.start || "")).localeCompare(b.date + (b.start || "")));
    const blocks = upcoming.slice(0, 6).map((ev) =>
      `<li><span class="dash-focus-day">${escH(fmtDay(ev.date))}</span><span class="dash-focus-time">${escH(ev.start || "")}</span><span class="dash-focus-title">${escH(ev.title || "")}</span></li>`
    ).join("");

    if (proposal && (proposal.focus || events.length)) {
      focusEl.innerHTML = `
        <div class="dash-focus-card">
          <div class="dash-focus-head">
            <span class="dash-focus-tag">This week</span>
            ${proposal.week_label ? `<span class="dash-focus-week">${escH(proposal.week_label)}</span>` : ""}
          </div>
          ${proposal.focus ? `<p class="dash-focus-line">${escH(proposal.focus)}</p>` : ""}
          <p class="dash-focus-priority"><span class="dash-focus-star">⭐</span> Today: ${escH(priority)}</p>
          ${blocks ? `<ul class="dash-focus-blocks">${blocks}</ul>` : `<p class="dash-focus-empty">No upcoming blocks left in this week's plan.</p>`}
        </div>`;
    } else {
      focusEl.innerHTML = `
        <div class="dash-focus-card dash-focus-card--bare">
          <p class="dash-focus-priority"><span class="dash-focus-star">⭐</span> Today: ${escH(priority)}</p>
          <p class="dash-focus-empty">No week plan yet. The bot posts one each Sunday (or run !crunch).</p>
        </div>`;
    }
  }

  // ── Your-week card: the bot's resolved Google Calendar week (Item 3) ────────
  // Read from kv 'week_calendar', snapshotted by the bot (the frontend has no
  // Google credentials). Anchors + focus + entertainment, colour-coded.
  const weekCal = weekCalRes?.data?.[0]?.value ?? null;
  const weekEl = document.getElementById("dash-week");
  if (weekEl && weekCal && Array.isArray(weekCal.events)) {
    const TYPE_COLOR = {
      anchor: "#5b8def", focus: "#3aa675", crunch: "#d98a2b",
      entertainment: "#9b6dd6", event: "#8a8f98",
    };
    const TYPE_LABEL = {
      anchor: "Anchor", focus: "Focus", crunch: "Study",
      entertainment: "Play", event: "Event",
    };
    const base = new Date((weekCal.week_monday || todayISO) + "T00:00:00");
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const byDate = {};
    weekCal.events.forEach((ev) => { (byDate[ev.date] = byDate[ev.date] || []).push(ev); });

    const cols = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i);
      const key = iso(d);
      const isToday = key === todayISO;
      const items = (byDate[key] || []).map((ev) => {
        const c = TYPE_COLOR[ev.type] || TYPE_COLOR.event;
        const time = ev.allDay ? "all day" : escH(ev.start || "");
        return `<li class="dweek-ev" style="border-left:3px solid ${c}"><span class="dweek-t">${time}</span> ${escH(ev.title || "")}</li>`;
      }).join("");
      return `<div class="dweek-col${isToday ? " dweek-col--today" : ""}">
          <div class="dweek-day">${d.toLocaleDateString(undefined, { weekday: "short" })}<span class="dweek-num">${d.getDate()}</span></div>
          <ul class="dweek-list">${items || `<li class="dweek-empty">—</li>`}</ul>
        </div>`;
    }).join("");

    const legend = Object.keys(TYPE_LABEL).map((t) =>
      `<span class="dweek-key"><i style="background:${TYPE_COLOR[t]}"></i>${TYPE_LABEL[t]}</span>`
    ).join("");

    weekEl.innerHTML = `
      <style>
        #dash-week .dweek-grid{display:grid;grid-template-columns:repeat(7,minmax(96px,1fr));gap:8px;overflow-x:auto;padding-bottom:4px;}
        #dash-week .dweek-col{border-radius:10px;padding:8px 6px;background:rgba(127,127,127,0.06);min-height:64px;}
        #dash-week .dweek-col--today{background:rgba(91,141,239,0.12);outline:1px solid rgba(91,141,239,0.35);}
        #dash-week .dweek-day{font-weight:600;font-size:0.8rem;opacity:0.8;display:flex;justify-content:space-between;margin-bottom:6px;}
        #dash-week .dweek-num{opacity:0.6;}
        #dash-week .dweek-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;}
        #dash-week .dweek-ev{font-size:0.72rem;line-height:1.25;padding:2px 6px;border-radius:4px;background:rgba(127,127,127,0.08);}
        #dash-week .dweek-t{font-variant-numeric:tabular-nums;opacity:0.7;margin-right:3px;}
        #dash-week .dweek-empty{font-size:0.72rem;opacity:0.35;text-align:center;}
        #dash-week .dweek-legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;font-size:0.72rem;opacity:0.8;}
        #dash-week .dweek-key{display:inline-flex;align-items:center;gap:4px;}
        #dash-week .dweek-key i{width:9px;height:9px;border-radius:2px;display:inline-block;}
      </style>
      <div class="dash-focus-card dweek-card">
        <div class="dash-focus-head"><span class="dash-focus-tag">Your week</span></div>
        <div class="dweek-grid">${cols}</div>
        <div class="dweek-legend">${legend}</div>
      </div>`;
  }
};
