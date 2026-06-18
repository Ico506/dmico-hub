/* ─────────────────────────────────────────────────────────────
   dmico life os — Finance module
   Two tabs:
     Expenses — month picker, category breakdown summary, entry list.
     Goals    — savings leaderboard sorted by % complete. Completed
                goals sit at the top with a Done badge for that
                satisfying wall-of-achievement feel.
   Currency: RM throughout.
   ───────────────────────────────────────────────────────────── */

(function () {
  let SB   = null;
  let root = null;

  // Active month state for the Expenses tab (year + 0-indexed month).
  let activeYear  = new Date().getFullYear();
  let activeMonth = new Date().getMonth();

  // Cached list of game dev projects for the expense project dropdown.
  let gdProjects = [];

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const el = (id) => document.getElementById(id);

  const MONTH_NAMES = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];

  function fmtRM(n) {
    return "RM " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── Monthly budget cap (localStorage, no schema change) ────
  const BUDGET_KEY = "dmico-hub-monthly-budget";

  function getBudget() {
    const v = localStorage.getItem(BUDGET_KEY);
    return v ? parseFloat(v) : null;
  }
  function setBudget(n) {
    if (n && n > 0) localStorage.setItem(BUDGET_KEY, String(n));
    else localStorage.removeItem(BUDGET_KEY);
  }

  // ── layout ─────────────────────────────────────────────────
  function render(container, sb) {
    SB   = sb;
    root = container;
    root.innerHTML = `
      <div class="r-tabs" role="tablist">
        <button class="r-tab current" data-tab="expenses">Expenses</button>
        <button class="r-tab" data-tab="goals">Goals</button>
      </div>
      <div id="fin-panel"></div>`;
    root.querySelectorAll(".r-tab").forEach((t) =>
      t.addEventListener("click", () => {
        root.querySelectorAll(".r-tab").forEach((x) => x.classList.toggle("current", x === t));
        t.dataset.tab === "expenses" ? renderExpenses() : renderGoals();
      })
    );
    renderExpenses();
  }

  // ════════════════════════════════════════════════════════════
  //  EXPENSES TAB
  // ════════════════════════════════════════════════════════════

  async function renderExpenses() {
    const panel = el("fin-panel");
    panel.innerHTML = `
      <div class="r-form fin-addform">
        <div class="r-row2">
          <div class="r-field"><label>Amount (RM)</label><input id="fe-amount" type="number" min="0" step="0.01" placeholder="0.00" /></div>
          <div class="r-field"><label>Category</label><input id="fe-cat" type="text" placeholder="e.g. Food, Transport" /></div>
        </div>
        <div class="r-row2">
          <div class="r-field"><label>Note</label><input id="fe-note" type="text" placeholder="optional detail" /></div>
          <div class="r-field"><label>Date</label><input id="fe-date" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
        </div>
        <div class="r-field">
          <label>Link to project <span class="r-label-optional">(optional)</span></label>
          <select id="fe-project">
            <option value="">— no project —</option>
          </select>
        </div>
        <div class="r-field fin-rec-toggle-row">
          <label class="fin-rec-check-label">
            <input type="checkbox" id="fe-recurring" />
            Recurring expense
          </label>
          <input id="fe-rec-label" type="text" placeholder="Label (e.g. Spotify, Rent)" class="fin-rec-name" hidden />
        </div>
        <button id="fe-save" class="btn-primary r-btn">Log expense</button>
        <p id="fe-status" class="r-status"></p>
      </div>

      <div id="fin-recurring-section" class="fin-rec-section"></div>

      <div class="fin-month-nav">
        <button id="fin-prev" class="r-mini fin-nav-btn">&#8592;</button>
        <span id="fin-month-label" class="fin-month-label"></span>
        <button id="fin-next" class="r-mini fin-nav-btn">&#8594;</button>
      </div>

      <div id="fin-chart-wrap" class="fin-chart-wrap"></div>
      <div id="fin-summary" class="fin-summary"></div>
      <div id="fin-entries" class="r-list"></div>`;

    el("fe-save").addEventListener("click", addExpense);
    el("fin-prev").addEventListener("click", () => shiftMonth(-1));
    el("fin-next").addEventListener("click", () => shiftMonth(1));

    // Show/hide recurring label input when checkbox is toggled.
    el("fe-recurring").addEventListener("change", () => {
      const recLabel = el("fe-rec-label");
      recLabel.hidden = !el("fe-recurring").checked;
      if (!recLabel.hidden) recLabel.focus();
    });

    // Populate project dropdown (non-blocking — form is usable while this loads).
    SB.from("gamedev_projects")
      .select("id, name")
      .neq("status", "shelved")
      .order("name", { ascending: true })
      .then(({ data }) => {
        gdProjects = data || [];
        const sel = el("fe-project");
        if (!sel || !gdProjects.length) return;
        gdProjects.forEach((p) => {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.name;
          sel.appendChild(opt);
        });
      });

    await refreshExpenses();
  }

  // ── Recurring expenses section ─────────────────────────────
  async function drawRecurring() {
    const section = el("fin-recurring-section");
    if (!section) return;

    const { data, error } = await SB
      .from("finance_expenses")
      .select("*")
      .eq("is_recurring", true)
      .order("logged_at", { ascending: false });
    if (error || !data || !data.length) { section.innerHTML = ""; return; }

    // Deduplicate by recur_label (keep most recent per label).
    const seen = new Set();
    const templates = [];
    data.forEach((e) => {
      const key = e.recur_label || `${e.category}|${e.note}|${e.amount}`;
      if (!seen.has(key)) { seen.add(key); templates.push({ ...e, _key: key }); }
    });

    // Check which ones already have an entry this month.
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const { data: thisMonth } = await SB
      .from("finance_expenses")
      .select("recur_label, category, note, amount")
      .eq("is_recurring", true)
      .gte("logged_at", monthStart)
      .lt("logged_at", monthEnd);
    const loggedThisMonth = new Set((thisMonth || []).map((e) => e.recur_label || `${e.category}|${e.note}|${e.amount}`));

    const rows = templates.map((t) => {
      const alreadyLogged = loggedThisMonth.has(t._key);
      return `
        <div class="fin-rec-item">
          <div class="fin-rec-item-info">
            <span class="fin-rec-item-label">${esc(t.recur_label || t.category || "Recurring")}</span>
            <span class="fin-rec-item-amount">${fmtRM(t.amount)}</span>
            ${t.category ? `<span class="fin-rec-item-cat">${esc(t.category)}</span>` : ""}
          </div>
          ${alreadyLogged
            ? `<span class="fin-rec-logged">Logged this month</span>`
            : `<button class="r-mini fin-rec-log-btn"
                data-amount="${esc(String(t.amount))}"
                data-cat="${esc(t.category || "")}"
                data-note="${esc(t.note || "")}"
                data-recur-label="${esc(t.recur_label || "")}"
                data-project="${esc(t.project_id || "")}">Log this month</button>`}
        </div>`;
    }).join("");

    section.innerHTML = `
      <div class="fin-rec-header">
        <span class="fin-rec-title">Recurring</span>
        <span class="fin-rec-count">${templates.length} item${templates.length === 1 ? "" : "s"}</span>
      </div>
      <div class="fin-rec-list">${rows}</div>`;

    section.querySelectorAll(".fin-rec-log-btn").forEach((btn) => {
      btn.addEventListener("click", () => logRecurringThisMonth(btn));
    });
  }

  async function logRecurringThisMonth(btn) {
    btn.disabled = true;
    btn.textContent = "Logging…";
    const row = {
      amount:       parseFloat(btn.dataset.amount),
      category:     btn.dataset.cat || null,
      note:         btn.dataset.note || null,
      recur_label:  btn.dataset.recurLabel || null,
      is_recurring: true,
      logged_at:    new Date().toISOString(),
      added_via:    "web",
    };
    if (btn.dataset.project) row.project_id = btn.dataset.project;
    const { error } = await SB.from("finance_expenses").insert(row);
    if (error) { console.error(error); btn.disabled = false; btn.textContent = "Log this month"; return; }
    // Replace button with "Logged" badge without full redraw.
    const logged = document.createElement("span");
    logged.className = "fin-rec-logged";
    logged.textContent = "Logged this month";
    btn.replaceWith(logged);
    // Also refresh the month view if we're viewing the current month.
    const now = new Date();
    if (activeMonth === now.getMonth() && activeYear === now.getFullYear()) {
      await refreshExpenses();
    }
  }

  function shiftMonth(dir) {
    activeMonth += dir;
    if (activeMonth < 0)  { activeMonth = 11; activeYear--; }
    if (activeMonth > 11) { activeMonth = 0;  activeYear++; }
    refreshExpenses();
  }

  async function addExpense() {
    const msg = el("fe-status");
    const amount = parseFloat(el("fe-amount").value);
    if (!amount || amount <= 0) { msg.textContent = "Enter a valid amount."; return; }
    const dateVal    = el("fe-date").value;
    const isRecur    = el("fe-recurring")?.checked || false;
    const recurLabel = isRecur ? (el("fe-rec-label")?.value.trim() || null) : null;
    const row = {
      amount,
      category:     el("fe-cat").value.trim() || null,
      note:         el("fe-note").value.trim() || null,
      logged_at:    dateVal ? new Date(dateVal + "T12:00:00").toISOString() : new Date().toISOString(),
      added_via:    "web",
      is_recurring: isRecur,
      recur_label:  recurLabel,
    };
    const selectedProject = el("fe-project")?.value;
    if (selectedProject) row.project_id = selectedProject;
    msg.textContent = "Logging…";
    const { error } = await SB.from("finance_expenses").insert(row);
    if (error) { console.error(error); msg.textContent = "Couldn't save. Try again."; return; }
    el("fe-amount").value = "";
    el("fe-cat").value    = "";
    el("fe-note").value   = "";
    el("fe-date").value   = new Date().toISOString().slice(0, 10);
    if (el("fe-project"))   el("fe-project").value   = "";
    if (el("fe-recurring")) { el("fe-recurring").checked = false; el("fe-rec-label").hidden = true; el("fe-rec-label").value = ""; }
    msg.textContent = "";
    const entryMonth = new Date(row.logged_at).getMonth();
    const entryYear  = new Date(row.logged_at).getFullYear();
    if (entryMonth === activeMonth && entryYear === activeYear) {
      await refreshExpenses();
    }
  }

  async function refreshExpenses() {
    // Recurring section (load in parallel with month data).
    drawRecurring();

    // Update month label.
    const labelEl = el("fin-month-label");
    if (labelEl) labelEl.textContent = `${MONTH_NAMES[activeMonth]} ${activeYear}`;

    // Block future-month navigation.
    const now = new Date();
    const nextBtn = el("fin-next");
    if (nextBtn) {
      const isFuture = activeYear > now.getFullYear() ||
        (activeYear === now.getFullYear() && activeMonth >= now.getMonth());
      nextBtn.disabled = isFuture;
    }

    // Date range for the selected month.
    const start = new Date(activeYear, activeMonth, 1).toISOString();
    const end   = new Date(activeYear, activeMonth + 1, 1).toISOString();

    const summaryEl = el("fin-summary");
    const listEl    = el("fin-entries");
    if (!summaryEl || !listEl) return;

    summaryEl.innerHTML = `<p class="r-status">Loading…</p>`;
    listEl.innerHTML    = "";

    const { data, error } = await SB
      .from("finance_expenses")
      .select("*")
      .gte("logged_at", start)
      .lt("logged_at", end)
      .order("logged_at", { ascending: false });

    if (error) {
      console.error(error);
      summaryEl.innerHTML = `<p class="r-status">Couldn't load expenses.</p>`;
      return;
    }

    const entries = data || [];
    buildSummary(entries, summaryEl);
    buildEntryList(entries, listEl);
    await drawChart();
  }

  // ── 6-month trend chart (SVG, no dependencies) ─────────────
  async function drawChart() {
    const wrap = el("fin-chart-wrap");
    if (!wrap) return;

    // Build the 6-month window ending at the active month.
    const months = [];
    for (let i = 5; i >= 0; i--) {
      let m = activeMonth - i;
      let y = activeYear;
      while (m < 0) { m += 12; y--; }
      months.push({ year: y, month: m });
    }

    const rangeStart = new Date(months[0].year, months[0].month, 1).toISOString();
    const rangeEnd   = new Date(activeYear, activeMonth + 1, 1).toISOString();

    const { data } = await SB
      .from("finance_expenses")
      .select("amount, logged_at")
      .gte("logged_at", rangeStart)
      .lt("logged_at", rangeEnd);

    // Total per month.
    const totals = months.map(({ year, month }) => {
      const sum = (data || [])
        .filter((e) => {
          const d = new Date(e.logged_at);
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .reduce((s, e) => s + Number(e.amount), 0);
      return { year, month, total: sum };
    });

    const maxTotal = Math.max(...totals.map((t) => t.total), 1);
    const W = 500, H = 140;
    const padTop = 22, padBot = 28, padL = 10, padR = 10;
    const plotH = H - padTop - padBot;
    const slotW = (W - padL - padR) / 6;
    const barW  = Math.floor(slotW * 0.52);

    const barEls = totals.map((t, i) => {
      const isActive = t.month === activeMonth && t.year === activeYear;
      const barH = t.total > 0 ? Math.max(6, Math.round(plotH * t.total / maxTotal)) : 4;
      const x    = padL + i * slotW + (slotW - barW) / 2;
      const y    = padTop + plotH - barH;
      const fill = isActive ? "#C4661F" : "#5F6F52";
      const opacity = isActive ? "1" : "0.55";
      const monthLabel = MONTH_NAMES[t.month].slice(0, 3);
      const amtLabel = t.total > 0
        ? (t.total >= 1000 ? `${(t.total / 1000).toFixed(1)}k` : Math.round(t.total).toString())
        : "";

      return `<g class="fin-cbar" data-year="${t.year}" data-month="${t.month}">
        <rect x="${x - 6}" y="0" width="${barW + 12}" height="${H}" fill="transparent" style="cursor:pointer"/>
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4"
              fill="${fill}" opacity="${opacity}"/>
        ${amtLabel ? `<text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle"
              font-size="9" fill="${fill}" font-family="var(--body)" opacity="${opacity}">${amtLabel}</text>` : ""}
        <text x="${x + barW / 2}" y="${H - 5}" text-anchor="middle"
              font-size="10" fill="${isActive ? "#45301E" : "#7C6A4F"}"
              font-weight="${isActive ? "700" : "400"}"
              font-family="var(--body)">${monthLabel}</text>
      </g>`;
    }).join("");

    wrap.innerHTML = `
      <svg class="fin-chart-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line x1="${padL}" y1="${padTop + plotH}" x2="${W - padR}" y2="${padTop + plotH}"
              stroke="var(--line)" stroke-width="1.5"/>
        ${barEls}
      </svg>`;

    wrap.querySelectorAll(".fin-cbar").forEach((g) => {
      g.addEventListener("click", () => {
        activeYear  = parseInt(g.dataset.year,  10);
        activeMonth = parseInt(g.dataset.month, 10);
        refreshExpenses();
      });
    });
  }

  function buildSummary(entries, container) {
    const total = entries.reduce((s, e) => s + Number(e.amount || 0), 0);
    const budget = getBudget();

    // Budget section HTML.
    let budgetHTML = "";
    if (budget) {
      const pct = Math.min(100, Math.round((total / budget) * 100));
      const over = total > budget;
      const warn = !over && total / budget >= 0.8;
      const fillClass = over ? "fin-budget-fill fin-budget-over"
        : warn ? "fin-budget-fill fin-budget-warn"
        : "fin-budget-fill";
      const statusText = over
        ? `Over by ${fmtRM(total - budget)}`
        : warn
        ? `${fmtRM(budget - total)} left — close to limit`
        : `${fmtRM(budget - total)} remaining`;
      budgetHTML = `
        <div class="fin-budget-row">
          <span class="fin-budget-label">Limit ${fmtRM(budget)}</span>
          <span class="fin-budget-status${over ? " fin-budget-status-over" : warn ? " fin-budget-status-warn" : ""}">${statusText}</span>
          <button class="r-mini fin-set-budget-btn">Edit</button>
        </div>
        <div class="fin-budget-track">
          <div class="${fillClass}" style="width:${pct}%"></div>
        </div>`;
    }

    if (!entries.length) {
      container.innerHTML = `
        <div class="fin-summary-card">
          <div class="fin-summary-top">
            <span class="fin-total">RM 0.00</span>
            <span class="fin-total-label">spent this month</span>
            ${!budget ? `<button class="r-mini fin-set-budget-btn fin-set-budget-new">Set limit</button>` : ""}
          </div>
          ${budgetHTML}
        </div>`;
      container.querySelectorAll(".fin-set-budget-btn").forEach((b) => b.addEventListener("click", promptBudget));
      return;
    }

    // Category breakdown.
    const cats = {};
    entries.forEach((e) => {
      const cat = e.category || "Uncategorised";
      cats[cat] = (cats[cat] || 0) + Number(e.amount || 0);
    });
    const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);

    const bars = sorted.map(([cat, amt]) => {
      const pct = Math.round((amt / total) * 100);
      return `
        <div class="fin-cat-row">
          <span class="fin-cat-name">${esc(cat)}</span>
          <div class="fin-bar-track">
            <div class="fin-bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="fin-cat-amt">${fmtRM(amt)}</span>
        </div>`;
    }).join("");

    const over = budget && total > budget;
    container.innerHTML = `
      <div class="fin-summary-card">
        <div class="fin-summary-top">
          <span class="fin-total${over ? " fin-total-over" : ""}">${fmtRM(total)}</span>
          <span class="fin-total-label">spent &middot; ${entries.length} entr${entries.length === 1 ? "y" : "ies"}</span>
          ${!budget ? `<button class="r-mini fin-set-budget-btn fin-set-budget-new">Set limit</button>` : ""}
        </div>
        ${budgetHTML}
        <div class="fin-cats">${bars}</div>
      </div>`;

    container.querySelectorAll(".fin-set-budget-btn").forEach((b) => b.addEventListener("click", promptBudget));
  }

  function promptBudget() {
    const current = getBudget();
    const raw = window.prompt(
      current
        ? `Monthly spending limit (RM):\nCurrently set to ${fmtRM(current)}. Leave blank to remove.`
        : "Set a monthly spending limit (RM):"
    );
    if (raw === null) return; // cancelled
    if (raw.trim() === "") { setBudget(null); refreshExpenses(); return; }
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) { alert("Enter a valid amount."); return; }
    setBudget(n);
    refreshExpenses();
  }

  function buildEntryList(entries, container) {
    if (!entries.length) {
      container.innerHTML = `<div class="empty"><h2>Nothing logged yet</h2><p>Add your first expense for this month above.</p></div>`;
      return;
    }
    container.innerHTML = "";
    entries.forEach((e) => {
      const row = document.createElement("div");
      row.className = "r-card fin-expense-row";
      const d = new Date(e.logged_at);
      const dateStr = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
      row.innerHTML = `
        <div class="fin-exp-left">
          <span class="fin-exp-amount">${fmtRM(e.amount)}</span>
          <div class="fin-exp-detail">
            ${e.category ? `<span class="r-chip fin-exp-cat">${esc(e.category)}</span>` : ""}
            ${e.project_id ? (() => {
              const proj = gdProjects.find((p) => p.id === e.project_id);
              return proj ? `<span class="r-chip fin-exp-project">${esc(proj.name)}</span>` : "";
            })() : ""}
            ${e.note ? `<span class="fin-exp-note">${esc(e.note)}</span>` : ""}
          </div>
        </div>
        <div class="fin-exp-right">
          <span class="fin-exp-date">${dateStr}</span>
          <button class="r-mini r-del fin-del-exp" data-id="${esc(e.id)}">×</button>
        </div>`;
      row.querySelector(".fin-del-exp").addEventListener("click", async () => {
        if (!window.confirm("Remove this expense?")) return;
        const { error } = await SB.from("finance_expenses").delete().eq("id", e.id);
        if (error) { console.error(error); return; }
        refreshExpenses();
      });
      container.appendChild(row);
    });
  }

  // ════════════════════════════════════════════════════════════
  //  GOALS TAB — savings leaderboard
  // ════════════════════════════════════════════════════════════

  async function renderGoals() {
    const panel = el("fin-panel");
    panel.innerHTML = `
      <div class="r-form fin-addform">
        <div class="r-field"><label>Goal label</label><input id="fg-label" type="text" placeholder="e.g. RTX 5080, Japan trip" /></div>
        <div class="r-field"><label>Target amount (RM)</label><input id="fg-target" type="number" min="1" step="0.01" placeholder="0.00" /></div>
        <div class="r-field"><label>Starting amount saved (RM)</label><input id="fg-current" type="number" min="0" step="0.01" placeholder="0.00" /></div>
        <button id="fg-save" class="btn-primary r-btn">Add goal</button>
        <p id="fg-status" class="r-status"></p>
      </div>
      <div id="fin-goals" class="fin-goals-list"></div>`;
    el("fg-save").addEventListener("click", addGoal);
    await drawGoals();
  }

  async function addGoal() {
    const msg = el("fg-status");
    const label  = el("fg-label").value.trim();
    const target = parseFloat(el("fg-target").value);
    const current = parseFloat(el("fg-current").value) || 0;
    if (!label)         { msg.textContent = "Name the goal."; return; }
    if (!target || target <= 0) { msg.textContent = "Enter a target amount."; return; }
    const row = { label, target, current, added_via: "web" };
    msg.textContent = "Adding…";
    const { error } = await SB.from("finance_goals").insert(row);
    if (error) { console.error(error); msg.textContent = "Couldn't add it. Try again."; return; }
    ["fg-label", "fg-target", "fg-current"].forEach((id) => (el(id).value = ""));
    msg.textContent = "";
    await drawGoals();
  }

  async function drawGoals() {
    const list = el("fin-goals");
    const { data, error } = await SB.from("finance_goals").select("*").order("created_at", { ascending: true });
    if (error) { console.error(error); list.innerHTML = `<p class="r-status">Couldn't load goals.</p>`; return; }
    const goals = data || [];

    if (!goals.length) {
      list.innerHTML = `<div class="empty"><h2>No goals yet</h2><p>Add a savings goal above. Finished goals stay here so you can enjoy the view.</p></div>`;
      return;
    }

    // Sort: completed (pct >= 100) first, then by pct descending.
    const withPct = goals.map((g) => ({
      ...g,
      pct: g.target > 0 ? Math.min(100, Math.round((Number(g.current) / Number(g.target)) * 100)) : 0,
      done: Number(g.current) >= Number(g.target),
    }));
    withPct.sort((a, b) => {
      if (a.done !== b.done) return a.done ? -1 : 1;
      return b.pct - a.pct;
    });

    list.innerHTML = "";
    withPct.forEach((g, i) => buildGoalCard(g, i + 1, list));
  }

  function buildGoalCard(g, rank, container) {
    const card = document.createElement("div");
    card.className = `r-card fin-goal-card${g.done ? " fin-goal-done" : ""}`;
    card.dataset.goalId = g.id;

    const remaining = Math.max(0, Number(g.target) - Number(g.current));
    const updatedStr = g.updated_at
      ? new Date(g.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
      : "";

    card.innerHTML = `
      <div class="fin-goal-header">
        <span class="fin-goal-rank">#${rank}</span>
        <div class="fin-goal-title-block">
          <span class="fin-goal-label">${esc(g.label)}</span>
          ${g.done ? `<span class="fin-done-badge">Done</span>` : ""}
        </div>
        <span class="fin-goal-pct${g.done ? " fin-pct-done" : ""}">${g.pct}%</span>
      </div>
      <div class="fin-progress-track">
        <div class="fin-progress-fill${g.done ? " fin-fill-done" : ""}" style="width:${g.pct}%"></div>
      </div>
      <div class="fin-goal-meta">
        <span class="fin-goal-numbers">${fmtRM(g.current)} saved of ${fmtRM(g.target)}</span>
        ${!g.done ? `<span class="fin-goal-left">${fmtRM(remaining)} to go</span>` : `<span class="fin-goal-left fin-left-done">Target reached!</span>`}
      </div>
      ${updatedStr ? `<div class="fin-goal-updated">Last updated ${updatedStr}</div>` : ""}
      <div class="r-actions">
        ${!g.done ? `<button class="r-mini fin-update-btn">Update progress</button>` : ""}
        <button class="r-mini r-del fin-del-goal">Remove</button>
      </div>`;

    if (!g.done) {
      card.querySelector(".fin-update-btn").addEventListener("click", () => updateGoal(g, card));
    }
    card.querySelector(".fin-del-goal").addEventListener("click", async () => {
      const label = g.done ? `Remove "${g.label}" from the board?` : `Remove "${g.label}"? Progress will be lost.`;
      if (!window.confirm(label)) return;
      const { error } = await SB.from("finance_goals").delete().eq("id", g.id);
      if (error) { console.error(error); return; }
      drawGoals();
    });

    container.appendChild(card);
  }

  async function updateGoal(goal, card) {
    const raw = window.prompt(
      `"${goal.label}" — enter new total saved (RM):\nCurrently at ${fmtRM(goal.current)} of ${fmtRM(goal.target)}.`
    );
    if (raw === null) return;
    const newCurrent = parseFloat(raw);
    if (isNaN(newCurrent) || newCurrent < 0) { alert("Enter a valid amount."); return; }
    const { error } = await SB.from("finance_goals")
      .update({ current: newCurrent, updated_at: new Date().toISOString() })
      .eq("id", goal.id);
    if (error) { console.error(error); return; }
    // Full redraw so leaderboard re-sorts if this goal just hit 100%.
    drawGoals();
  }

  window.renderFinance = render;
})();
