/* ─────────────────────────────────────────────────────────────
   dmico life os — dashboard
   Home panel. One signal per module, all fetched in parallel.
   Clicking a card navigates to that module via window.__openModule.
   ───────────────────────────────────────────────────────────── */

window.renderDashboard = async function (container, sb) {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-MY", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // Show skeletons while data loads
  container.innerHTML = `
    <div class="dash-header">
      <p class="dash-date">${dateStr}</p>
      <p class="dash-sub">Here's where everything stands.</p>
    </div>
    <div class="dash-board" id="dash-board">
      <div id="dash-focus"></div>
      <div id="dash-week"></div>
      <div class="dash-grid" id="dash-grid">
        ${Array.from({ length: 7 }).map(() => `
          <div class="dash-card dash-card--loading">
            <div class="dash-skel"></div>
            <div class="dash-skel dash-skel--short"></div>
            <div class="dash-skel dash-skel--short"></div>
          </div>`).join("")}
      </div>
    </div>`;

  // Pinned, draggable photo board (independent fetch; never blocks the signal cards).
  if (window.renderDashboardPhotos) {
    try { window.renderDashboardPhotos(document.getElementById("dash-board"), sb); }
    catch (e) { console.error("photo board failed", e); }
  }

  // Fetch all signals in parallel
  const todayISO = today.toISOString().split("T")[0];

  const [research, exams, chores, supplies, projects, devlog, expenses, goals, thesisChapters, thisMonthIncome, thisMonthSurplus, proposalRes, weightLogs, exerciseProfile, weekCalRes] =
    await Promise.all([
      sb.from("research_papers")
        .select("title, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(1),
      sb.from("study_exams")
        .select("title, exam_date")
        .gte("exam_date", todayISO)
        .order("exam_date", { ascending: true })
        .limit(1),
      sb.from("hygiene_items").select("name, last_done, interval_days"),
      sb.from("hygiene_products").select("name, status"),
      sb.from("gamedev_projects")
        .select("id", { count: "exact" })
        .eq("status", "active"),
      sb.from("gamedev_logs")
        .select("logged_at")
        .order("logged_at", { ascending: false })
        .limit(1),
      sb.from("finance_expenses").select("amount, logged_at"),
      sb.from("finance_goals").select("label, target, current"),
      sb.from("thesis_chapters").select("title, target_words, current_words, status"),
      sb.from("finance_income")
        .select("amount")
        .eq("year", today.getFullYear())
        .eq("month", today.getMonth())
        .limit(1),
      sb.from("finance_surplus")
        .select("amount")
        .gte("logged_at", new Date(today.getFullYear(), today.getMonth(), 1).toISOString())
        .lt("logged_at", new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString()),
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
    ]);

  // ── Research ───────────────────────────────────────────────
  const paperCount = research.count ?? research.data?.length ?? 0;
  const latestPaper = research.data?.[0]?.title ?? null;

  // ── Self-study ─────────────────────────────────────────────
  const nextExam = exams.data?.[0] ?? null;
  const daysToExam = nextExam
    ? Math.ceil((new Date(nextExam.exam_date) - today) / 86400000)
    : null;

  // ── Hygiene ────────────────────────────────────────────────
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
  const lowSupplies = (supplies.data ?? []).filter((s) => {
    const st = String(s.status || "").toLowerCase();
    return st === "low" || st === "empty" || st === "out";
  }).length;

  // ── Game Dev ───────────────────────────────────────────────
  const activeCount = projects.count ?? projects.data?.length ?? 0;
  const lastLogAt = devlog.data?.[0]?.logged_at ?? null;
  const daysAgoLog = lastLogAt
    ? Math.floor((now - new Date(lastLogAt).getTime()) / 86400000)
    : null;

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

  // ── Thesis ─────────────────────────────────────────────────
  const chapters = thesisChapters.data ?? [];
  const totalTarget  = chapters.reduce((s, c) => s + (c.target_words || 0), 0);
  const totalCurrent = chapters.reduce((s, c) => s + (c.current_words || 0), 0);
  const thesisPct    = totalTarget > 0 ? Math.round((totalCurrent / totalTarget) * 100) : 0;
  const doneChapters = chapters.filter((c) => c.status === "done").length;

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
  const nearBudget  = budgetLimit != null && !overBudget && monthSpend / budgetLimit >= 0.8;
  const fmtRM = (n) => "RM " + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Savings rate from this month's income + any surplus (if logged).
  const incomeAmt     = thisMonthIncome?.data?.[0] ? Number(thisMonthIncome.data[0].amount) : null;
  const surplusAmt    = (thisMonthSurplus?.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const totalIncomeAmt = incomeAmt !== null ? incomeAmt + surplusAmt : (surplusAmt > 0 ? surplusAmt : null);
  const netSavings    = totalIncomeAmt !== null ? totalIncomeAmt - monthSpend : null;
  const savingsPct    = totalIncomeAmt ? Math.round((netSavings / totalIncomeAmt) * 100) : null;

  // ── Build cards ────────────────────────────────────────────
  const cards = [
    {
      id: "research",
      icon: "📚",
      label: "Research",
      primary: `${paperCount} ${paperCount === 1 ? "paper" : "papers"}`,
      secondary: latestPaper
        ? `Latest: ${clip(latestPaper, 42)}`
        : "No papers saved yet",
      tone: paperCount > 0 ? "green" : "dim",
    },
    {
      id: "selfstudy",
      icon: "📖",
      label: "Self-study",
      primary: nextExam ? clip(nextExam.title, 30) : "No exams tracked",
      secondary: nextExam
        ? daysToExam <= 0
          ? "Exam day!"
          : daysToExam === 1
          ? "Tomorrow"
          : `${daysToExam} days away`
        : "Add an exam to start the countdown",
      tone:
        daysToExam !== null && daysToExam <= 7
          ? "orange"
          : nextExam
          ? "green"
          : "dim",
    },
    {
      id: "hygiene",
      icon: "🧹",
      label: "Hygiene",
      primary: worstChore ? clip(worstChore.name, 30) : "All caught up",
      secondary: worstChore
        ? `${worstChore.daysOver}d overdue${
            lowSupplies > 0 ? ` · ${lowSupplies} supply low` : ""
          }`
        : lowSupplies > 0
        ? `${lowSupplies} supply running low`
        : "Nothing needs attention",
      tone: worstChore
        ? worstChore.daysOver > 3
          ? "orange"
          : "yellow"
        : "green",
    },
    {
      id: "gamedev",
      icon: "🎮",
      label: "Game Dev",
      primary: `${activeCount} active ${
        activeCount === 1 ? "project" : "projects"
      }`,
      secondary:
        daysAgoLog === null
          ? "No devlog entries yet"
          : daysAgoLog === 0
          ? "Logged today"
          : daysAgoLog === 1
          ? "Last log: yesterday"
          : `Last log: ${daysAgoLog}d ago`,
      tone:
        daysAgoLog !== null && daysAgoLog <= 3
          ? "green"
          : daysAgoLog !== null
          ? "yellow"
          : "dim",
    },
    {
      id: "finance",
      icon: "💰",
      label: "Finance",
      primary: budgetLimit
        ? `${fmtRM(monthSpend)} of ${fmtRM(budgetLimit)}`
        : `RM ${monthSpend.toFixed(2)} this month`,
      secondary: netSavings !== null
        ? netSavings >= 0
          ? `Saved ${fmtRM(netSavings)} · ${savingsPct}% this month`
          : `Deficit ${fmtRM(Math.abs(netSavings))} — over income`
        : overBudget
        ? `Over limit by ${fmtRM(monthSpend - budgetLimit)}`
        : nearBudget
        ? `${fmtRM(budgetLimit - monthSpend)} left — running close`
        : topGoal
        ? `${clip(topGoal.label, 24)}: ${topGoal.pct}% funded`
        : budgetLimit
        ? `${fmtRM(budgetLimit - monthSpend)} remaining`
        : "Log allowance in Overview to track savings",
      tone: netSavings !== null
        ? netSavings < 0 ? "orange" : savingsPct >= 20 ? "green" : "yellow"
        : overBudget ? "orange" : nearBudget ? "yellow" : topGoal?.pct >= 100 ? "green" : topGoal ? "default" : "dim",
    },
    {
      id: "thesis",
      icon: "📝",
      label: "Thesis",
      primary: chapters.length === 0
        ? "No chapters yet"
        : `${totalCurrent.toLocaleString()} / ${totalTarget.toLocaleString()} words`,
      secondary: chapters.length === 0
        ? "Add your first chapter to get started"
        : `${thesisPct}% complete · ${doneChapters} of ${chapters.length} chapter${chapters.length === 1 ? "" : "s"} done`,
      tone: chapters.length === 0
        ? "dim"
        : thesisPct >= 100
        ? "green"
        : thesisPct >= 50
        ? "yellow"
        : "default",
    },
    {
      id: "exercise",
      icon: "🏃",
      label: "Exercise",
      primary: latestW != null ? kgFmt(latestW) : "No weigh-ins",
      secondary: latestW == null
        ? "Log your weight to start a trend"
        : exGoal == null
        ? (exTrend != null
            ? `${exTrend < 0 ? "▼" : exTrend > 0 ? "▲" : "→"} ${kgFmt(Math.abs(exTrend))} over ${wlogs.length} logs`
            : "First weigh-in logged · set a goal")
        : exReached
        ? `Goal weight reached 🎉`
        : `${kgFmt(exRemaining)} to your ${kgFmt(exGoal)} goal`,
      tone: latestW == null
        ? "dim"
        : exGoal == null
        ? "green"
        : exReached
        ? "green"
        : "yellow",
    },
  ];

  document.getElementById("dash-grid").innerHTML = cards
    .map(
      (c, i) => `
    <button class="dash-card dash-card--${c.tone}" data-module="${c.id}" style="animation-delay:${i * 55}ms">
      <span class="dash-card-icon">${c.icon}</span>
      <span class="dash-card-label">${c.label}</span>
      <span class="dash-card-primary">${c.primary}</span>
      <span class="dash-card-secondary">${c.secondary}</span>
    </button>`
    )
    .join("");

  animateCounts(document.getElementById("dash-grid"));

  document.getElementById("dash-grid").querySelectorAll(".dash-card").forEach((btn) => {
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

function clip(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len - 1) + "…" : str;
}

/* Count the first number in each card's primary line up from zero on load.
   Preserves prefixes/suffixes ("RM 1,200 saved" animates the 1,200). Skips
   entirely under reduced-motion. */
function animateCounts(scope) {
  if (!scope) return;
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  scope.querySelectorAll(".dash-card-primary").forEach((node) => {
    const full = node.textContent;
    const m = full.match(/[\d][\d,]*(\.\d+)?/);
    if (!m) return;
    const target = parseFloat(m[0].replace(/,/g, ""));
    if (!isFinite(target) || target <= 0) return;
    const hasComma = m[0].indexOf(",") !== -1;
    const decimals = m[0].indexOf(".") !== -1 ? (m[0].split(".")[1] || "").length : 0;
    const fmt = (n) => {
      let s = decimals ? n.toFixed(decimals) : String(Math.round(n));
      return hasComma ? Number(s).toLocaleString() : s;
    };
    const start = performance.now(), dur = 750;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = full.replace(m[0], fmt(target * eased));
      if (t < 1) requestAnimationFrame(tick);
      else node.textContent = full;
    };
    requestAnimationFrame(tick);
  });
}
