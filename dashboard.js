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
    <div class="dash-grid" id="dash-grid">
      ${Array.from({ length: 5 }).map(() => `
        <div class="dash-card dash-card--loading">
          <div class="dash-skel"></div>
          <div class="dash-skel dash-skel--short"></div>
          <div class="dash-skel dash-skel--short"></div>
        </div>`).join("")}
    </div>`;

  // Fetch all signals in parallel
  const todayISO = today.toISOString().split("T")[0];

  const [research, exams, chores, supplies, projects, devlog, expenses, goals] =
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
      sb.from("hygiene_products").select("name, quantity, min_quantity"),
      sb.from("gamedev_projects")
        .select("id", { count: "exact" })
        .eq("status", "active"),
      sb.from("gamedev_logs")
        .select("logged_at")
        .order("logged_at", { ascending: false })
        .limit(1),
      sb.from("finance_expenses").select("amount, logged_at"),
      sb.from("finance_goals").select("label, target, current"),
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
  const lowSupplies = (supplies.data ?? []).filter(
    (s) => s.min_quantity != null && Number(s.quantity) <= Number(s.min_quantity)
  ).length;

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
      primary: `RM ${monthSpend.toFixed(2)} this month`,
      secondary: topGoal
        ? `${clip(topGoal.label, 24)}: ${topGoal.pct}% funded`
        : "No goals set yet",
      tone: topGoal?.pct >= 100 ? "green" : topGoal ? "default" : "dim",
    },
  ];

  document.getElementById("dash-grid").innerHTML = cards
    .map(
      (c) => `
    <button class="dash-card dash-card--${c.tone}" data-module="${c.id}">
      <span class="dash-card-icon">${c.icon}</span>
      <span class="dash-card-label">${c.label}</span>
      <span class="dash-card-primary">${c.primary}</span>
      <span class="dash-card-secondary">${c.secondary}</span>
    </button>`
    )
    .join("");

  document.getElementById("dash-grid").querySelectorAll(".dash-card").forEach((btn) => {
    btn.addEventListener("click", () => window.__openModule?.(btn.dataset.module));
  });
};

function clip(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len - 1) + "…" : str;
}
