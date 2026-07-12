/* ─────────────────────────────────────────────────────────────
   dmico life os — Finance module
   Three tabs:
     Overview  — income panel, 50/30/20 budget rule, 6-month
                 savings chart, goal projections.
     Expenses  — month picker, category breakdown, entry list.
     Goals     — savings leaderboard sorted by % complete.
   Currency: RM throughout.
   ───────────────────────────────────────────────────────────── */

(function () {
  let SB   = null;
  let root = null;

  // Active month for the Expenses tab (year + 0-indexed month).
  let activeYear  = new Date().getFullYear();
  let activeMonth = new Date().getMonth();

  // Cached game dev projects for the expense project dropdown.
  let gdProjects = [];

  // Cached finance_settings row (opening_balance, monthly_budget).
  let cachedSettings = null;

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
    return "RM " + Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  }

  // ── Settings helpers ────────────────────────────────────────
  // finance_settings is a single-row config table. We also keep
  // monthly_budget in localStorage as a fallback so the Expenses
  // tab budget bar still works without waiting on settings to load.
  const BUDGET_KEY = "dmico-hub-monthly-budget";

  async function loadSettings() {
    const { data } = await SB.from("finance_settings").select("*").limit(1);
    cachedSettings = (data && data[0]) || { opening_balance: 0, monthly_budget: null };
    // Migrate localStorage budget to Supabase on first load if not yet set.
    if (!cachedSettings.monthly_budget) {
      const lsVal = localStorage.getItem(BUDGET_KEY);
      if (lsVal) cachedSettings.monthly_budget = parseFloat(lsVal);
    }
    // Keep localStorage in sync so synchronous getBudget() works.
    if (cachedSettings.monthly_budget) {
      localStorage.setItem(BUDGET_KEY, String(cachedSettings.monthly_budget));
    }
    return cachedSettings;
  }

  async function saveSettings(patch) {
    const id = cachedSettings?.id;
    if (id) {
      await SB.from("finance_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
    } else {
      const { data } = await SB.from("finance_settings").insert(patch).select().limit(1);
      if (data?.[0]) cachedSettings = data[0];
    }
    cachedSettings = { ...(cachedSettings || {}), ...patch };
    if (patch.monthly_budget !== undefined) {
      if (patch.monthly_budget) localStorage.setItem(BUDGET_KEY, String(patch.monthly_budget));
      else localStorage.removeItem(BUDGET_KEY);
    }
  }

  function getBudget() {
    if (cachedSettings?.monthly_budget) return Number(cachedSettings.monthly_budget);
    const v = localStorage.getItem(BUDGET_KEY);
    return v ? parseFloat(v) : null;
  }

  function setBudget(n) {
    if (n && n > 0) localStorage.setItem(BUDGET_KEY, String(n));
    else localStorage.removeItem(BUDGET_KEY);
    if (cachedSettings) cachedSettings.monthly_budget = (n && n > 0) ? n : null;
  }

  // ── Layout ─────────────────────────────────────────────────
  function render(container, sb) {
    SB   = sb;
    root = container;
    root.innerHTML = `
      <div class="fin-layout">
        <div class="fin-main">
          <div class="r-tabs" role="tablist">
            <button class="r-tab current" data-tab="overview">Overview</button>
            <button class="r-tab" data-tab="expenses">Expenses</button>
            <button class="r-tab" data-tab="goals">Goals</button>
            <button class="r-tab" data-tab="savings">Savings</button>
            <button class="r-tab" data-tab="investments">Investments</button>
            <button class="r-tab" data-tab="subs">Subscriptions</button>
            <button class="r-tab" data-tab="review">Review</button>
          </div>
          <div id="fin-panel"></div>
        </div>
        <aside class="fin-sidebar">
          <div id="fin-wishlist"></div>
        </aside>
      </div>`;
    root.querySelectorAll(".r-tab").forEach((t) =>
      t.addEventListener("click", () => {
        root.querySelectorAll(".r-tab").forEach((x) =>
          x.classList.toggle("current", x === t)
        );
        const tab = t.dataset.tab;
        if (tab === "overview") renderOverview();
        else if (tab === "expenses") renderExpenses();
        else if (tab === "savings") renderSavings();
        else if (tab === "investments") renderInvestments();
        else if (tab === "subs") renderSubscriptions();
        else if (tab === "review") renderReview();
        else renderGoals();
      })
    );
    renderOverview();
    renderWishlist(el("fin-wishlist"));
  }

  // ════════════════════════════════════════════════════════════
  //  OVERVIEW TAB
  // ════════════════════════════════════════════════════════════

  async function renderOverview() {
    const panel = el("fin-panel");
    panel.innerHTML = `<p class="r-status">Loading…</p>`;

    const now       = new Date();
    const thisYear  = now.getFullYear();
    const thisMonth = now.getMonth(); // 0-indexed

    // Six-month window ending this month.
    const windowMonths = [];
    for (let i = 5; i >= 0; i--) {
      let m = thisMonth - i, y = thisYear;
      while (m < 0) { m += 12; y--; }
      windowMonths.push({ year: y, month: m });
    }
    const windowStart = new Date(windowMonths[0].year, windowMonths[0].month, 1).toISOString();
    const windowEnd   = new Date(thisYear, thisMonth + 1, 1).toISOString();

    // Load everything in parallel.
    const [settings, thisMonthIncomeRes, allIncomeRes, expenseRes, goalsRes, surplusRes] = await Promise.all([
      loadSettings(),
      SB.from("finance_income").select("*").eq("year", thisYear).eq("month", thisMonth).limit(1),
      SB.from("finance_income").select("*")
        .or(`year.gt.${windowMonths[0].year},and(year.eq.${windowMonths[0].year},month.gte.${windowMonths[0].month})`)
        .order("year").order("month"),
      SB.from("finance_expenses").select("amount, logged_at, category")
        .gte("logged_at", windowStart).lt("logged_at", windowEnd),
      SB.from("finance_goals").select("*"),
      SB.from("finance_surplus").select("*")
        .gte("logged_at", windowStart).lt("logged_at", windowEnd)
        .order("logged_at", { ascending: false }),
    ]);

    const thisMonthIncome = thisMonthIncomeRes.data?.[0] ?? null;
    const allIncome       = allIncomeRes.data || [];
    const allExpenses     = expenseRes.data   || [];
    const goals           = goalsRes.data     || [];
    const allSurplus      = surplusRes.data   || [];

    // This month's surplus entries.
    const thisSurplus = allSurplus.filter((s) => {
      const d = new Date(s.logged_at);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    });

    // Per-month net savings across the 6-month window.
    // net is null only when neither allowance nor surplus is logged for that month.
    const monthlySavings = windowMonths.map(({ year, month }) => {
      const inc = allIncome.find((r) => r.year === year && r.month === month);
      const surplusAmt = allSurplus
        .filter((s) => {
          const d = new Date(s.logged_at);
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .reduce((sum, s) => sum + Number(s.amount), 0);
      const exp = allExpenses
        .filter((e) => {
          const d = new Date(e.logged_at);
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .reduce((s, e) => s + Number(e.amount), 0);
      const hasAnyIncome = inc !== undefined || surplusAmt > 0;
      const totalIn = (inc ? Number(inc.amount) : 0) + surplusAmt;
      return {
        year, month,
        income:   inc ? Number(inc.amount) : 0,
        surplus:  surplusAmt,
        expenses: exp,
        net:      hasAnyIncome ? totalIn - exp : null,
      };
    });

    // Cumulative metrics.
    const openingBalance   = Number(cachedSettings?.opening_balance || 0);
    const loggedMonths     = monthlySavings.filter((m) => m.net !== null);
    const totalNetSavings  = loggedMonths.reduce((s, m) => s + m.net, 0);
    const totalSaved       = openingBalance + totalNetSavings;

    // Average over last 3 months that have income logged.
    const recent           = loggedMonths.slice(-3);
    const avgMonthlySavings = recent.length > 0
      ? recent.reduce((s, m) => s + m.net, 0) / recent.length
      : null;

    // This month figures.
    const income          = thisMonthIncome ? Number(thisMonthIncome.amount) : 0;
    const surplusThisMonth = thisSurplus.reduce((s, r) => s + Number(r.amount), 0);
    const totalIncomeThisMonth = income + surplusThisMonth;
    const thisMonthExp    = monthlySavings.find(
      (m) => m.year === thisYear && m.month === thisMonth
    )?.expenses ?? 0;
    // The 50/30/20 budget rule is based on the monthly ALLOWANCE only. Extra income
    // (surplus) is tracked in its own panel and still counts toward overall savings
    // (the 6-month chart + total saved), but must NOT inflate the budget targets or
    // the save bar — otherwise a good month of extra income makes the plan look off.
    const ruleSavings = income - thisMonthExp;
    const budget  = getBudget();

    // Render shell.
    panel.innerHTML = `
      <div id="fin-ov-income-section" class="fin-ov-section"></div>
      <div id="fin-ov-surplus-section" class="fin-ov-section"></div>

      <div class="fin-ov-section fin-ov-totals">
        <div class="fin-ov-stat-row">
          <div class="fin-ov-stat">
            <span class="fin-ov-stat-val">${fmtRM(openingBalance)}</span>
            <span class="fin-ov-stat-key">Opening balance</span>
            <button class="r-mini fin-ov-edit-opening" style="margin-top:4px">Edit</button>
          </div>
          <div class="fin-ov-stat">
            <span class="fin-ov-stat-val">${fmtRM(totalSaved)}</span>
            <span class="fin-ov-stat-key">Est. total saved</span>
          </div>
          ${avgMonthlySavings !== null ? `
          <div class="fin-ov-stat">
            <span class="fin-ov-stat-val ${avgMonthlySavings < 0 ? "fin-ov-stat-neg" : ""}">
              ${fmtRM(Math.abs(avgMonthlySavings))}
            </span>
            <span class="fin-ov-stat-key">Avg. monthly ${avgMonthlySavings < 0 ? "deficit" : "savings"}</span>
          </div>` : ""}
        </div>
      </div>

      <div id="fin-ov-rule-section" class="fin-ov-section"></div>

      <div class="fin-ov-section">
        <div class="fin-ov-section-head">
          <span class="fin-ov-section-label">6-Month Savings</span>
          <span class="fin-ov-section-note">bars below zero = overspent that month</span>
        </div>
        <div id="fin-ov-chart-wrap" class="fin-chart-wrap"></div>
      </div>

      <div id="fin-ov-projections" class="fin-ov-section"></div>

      <div class="fin-ov-section fin-ov-budget-section">
        <div class="fin-ov-section-head">
          <span class="fin-ov-section-label">Monthly spending limit</span>
        </div>
        <div class="fin-ov-budget-row">
          <span class="fin-ov-budget-val">${budget ? fmtRM(budget) : "Not set"}</span>
          <button class="r-mini" id="fin-ov-set-budget">${budget ? "Edit" : "Set"}</button>
        </div>
        <p class="fin-ov-budget-note">Used in the Expenses tab budget bar.</p>
      </div>`;

    // Opening balance edit.
    panel.querySelector(".fin-ov-edit-opening").addEventListener("click", async () => {
      const raw = window.prompt(
        `Opening balance (RM) — savings you had before tracking started:\nCurrently ${fmtRM(openingBalance)}`
      );
      if (raw === null) return;
      const n = parseFloat(raw);
      if (isNaN(n) || n < 0) { alert("Enter a valid amount (0 or more)."); return; }
      await saveSettings({ opening_balance: n });
      renderOverview();
    });

    // Spending limit edit.
    el("fin-ov-set-budget").addEventListener("click", async () => {
      const cur = getBudget();
      const raw = window.prompt(
        cur
          ? `Monthly spending limit (RM):\nCurrently ${fmtRM(cur)}. Leave blank to remove.`
          : "Set a monthly spending limit (RM):"
      );
      if (raw === null) return;
      if (raw.trim() === "") { await saveSettings({ monthly_budget: null }); setBudget(null); renderOverview(); return; }
      const n = parseFloat(raw);
      if (isNaN(n) || n <= 0) { alert("Enter a valid amount."); return; }
      await saveSettings({ monthly_budget: n });
      setBudget(n);
      renderOverview();
    });

    drawIncomePanel(el("fin-ov-income-section"), thisMonthIncome, allIncome, thisYear, thisMonth);
    drawSurplusPanel(el("fin-ov-surplus-section"), thisSurplus, allSurplus, thisYear, thisMonth);
    // Needs/wants/unsorted split of this month's spending, via the category map.
    const buckets = (cachedSettings && cachedSettings.category_buckets) || {};
    const thisMonthRows = allExpenses.filter((e) => {
      const d = new Date(e.logged_at);
      return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    });
    const split = { need: 0, want: 0, unsorted: 0 };
    thisMonthRows.forEach((e) => {
      const cat = (e.category || "").trim().toLowerCase();
      const b = buckets[cat];
      if (b === "need") split.need += Number(e.amount);
      else if (b === "want") split.want += Number(e.amount);
      else split.unsorted += Number(e.amount);
    });
    const allCats = [...new Set(allExpenses.map((e) => (e.category || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    // Subscriptions (kv) → a faint "reserve this much for subs" marker on the Needs bar.
    const subsData = (await window.dmicoKvGet("finance_subscriptions")) || {};
    const subsItems = Array.isArray(subsData.items) ? subsData.items : [];
    const subsMonthly = subsItems.reduce((s, it) => s + (it.cycle === "yearly" ? Number(it.amount || 0) / 12 : Number(it.amount || 0)), 0);

    draw503020(el("fin-ov-rule-section"), income, split, ruleSavings, allCats, buckets, activeRule(), subsMonthly);
    drawSavingsChart(el("fin-ov-chart-wrap"), monthlySavings);
    drawProjections(el("fin-ov-projections"), goals, avgMonthlySavings, totalSaved);
  }

  // ── Income panel ───────────────────────────────────────────
  function drawIncomePanel(section, thisMonthIncome, allIncome, thisYear, thisMonth) {
    const income     = thisMonthIncome ? Number(thisMonthIncome.amount) : null;
    const monthLabel = `${MONTH_NAMES[thisMonth]} ${thisYear}`;

    const historyRows = allIncome
      .filter((r) => !(r.year === thisYear && r.month === thisMonth))
      .slice(-5).reverse()
      .map((r) => `
        <div class="fin-ov-hist-row">
          <span>${MONTH_NAMES[r.month]} ${r.year}</span>
          <span>${fmtRM(r.amount)}</span>
          ${r.notes ? `<span class="fin-ov-hist-note">${esc(r.notes)}</span>` : ""}
        </div>`)
      .join("");

    if (income === null) {
      section.innerHTML = `
        <div class="fin-ov-section-head">
          <span class="fin-ov-section-label">Allowance — ${monthLabel}</span>
        </div>
        <div class="fin-ov-income-prompt">
          <p class="fin-ov-income-prompt-text">Log this month's allowance to unlock savings tracking.</p>
          <div class="fin-ov-income-form">
            <input id="fin-ov-amt" type="number" min="0" step="0.01" placeholder="Amount (RM)" class="fin-ov-income-input" />
            <input id="fin-ov-notes" type="text" placeholder="Notes (optional)" class="fin-ov-income-notes-input" />
            <button id="fin-ov-income-save" class="btn-primary r-btn">Log allowance</button>
            <p id="fin-ov-income-status" class="r-status"></p>
          </div>
          ${historyRows ? `
            <details class="fin-ov-hist">
              <summary class="fin-ov-hist-toggle">Previous months</summary>
              <div class="fin-ov-hist-list">${historyRows}</div>
            </details>` : ""}
        </div>`;

      el("fin-ov-income-save").addEventListener("click", async () => {
        const amt   = parseFloat(el("fin-ov-amt").value);
        const notes = el("fin-ov-notes").value.trim();
        const status = el("fin-ov-income-status");
        if (!amt || amt <= 0) { status.textContent = "Enter a valid amount."; return; }
        status.textContent = "Saving…";
        const { error } = await SB.from("finance_income").upsert(
          { year: thisYear, month: thisMonth, amount: amt, notes: notes || null },
          { onConflict: "year,month" }
        );
        if (error) { console.error(error); status.textContent = "Couldn't save. Try again."; return; }
        renderOverview();
      });
    } else {
      section.innerHTML = `
        <div class="fin-ov-section-head">
          <span class="fin-ov-section-label">Allowance — ${monthLabel}</span>
        </div>
        <div class="fin-ov-income-logged">
          <div class="fin-ov-income-amount-row">
            <span class="fin-ov-income-amount">${fmtRM(income)}</span>
            <button class="r-mini" id="fin-ov-income-edit">Edit</button>
          </div>
          ${historyRows ? `
            <details class="fin-ov-hist">
              <summary class="fin-ov-hist-toggle">Previous months</summary>
              <div class="fin-ov-hist-list">${historyRows}</div>
            </details>` : ""}
        </div>`;

      el("fin-ov-income-edit").addEventListener("click", async () => {
        const raw = window.prompt(`Allowance for ${monthLabel} (RM):\nCurrently ${fmtRM(income)}`);
        if (raw === null) return;
        const n = parseFloat(raw);
        if (isNaN(n) || n <= 0) { alert("Enter a valid amount."); return; }
        const { error } = await SB.from("finance_income").upsert(
          { id: thisMonthIncome.id, year: thisYear, month: thisMonth, amount: n, notes: thisMonthIncome.notes },
          { onConflict: "year,month" }
        );
        if (error) { console.error(error); return; }
        renderOverview();
      });
    }
  }

  // ── Surplus / Extra Income panel ───────────────────────────
  async function drawSurplusPanel(section, thisSurplus, allSurplus, thisYear, thisMonth) {
    if (!section) return;
    // Savings pools, so extra income can be stashed straight into one on log.
    const savData0 = (await window.dmicoKvGet("finance_savings")) || {};
    const savPools = Array.isArray(savData0.pools) ? savData0.pools : [];
    const monthLabel = `${MONTH_NAMES[thisMonth]} ${thisYear}`;
    const total = thisSurplus.reduce((s, r) => s + Number(r.amount), 0);

    // Group past months for history (exclude current).
    const pastMap = {};
    allSurplus.forEach((s) => {
      const d = new Date(s.logged_at);
      const y = d.getFullYear(), m = d.getMonth();
      if (y === thisYear && m === thisMonth) return;
      const key = `${y}-${m}`;
      if (!pastMap[key]) pastMap[key] = { year: y, month: m, total: 0 };
      pastMap[key].total += Number(s.amount);
    });
    const pastRows = Object.values(pastMap)
      .sort((a, b) => b.year - a.year || b.month - a.month)
      .slice(0, 5)
      .map((r) => `
        <div class="fin-ov-hist-row">
          <span>${MONTH_NAMES[r.month]} ${r.year}</span>
          <span>${fmtRM(r.total)}</span>
        </div>`)
      .join("");

    const entryRows = thisSurplus.map((r) => `
      <div class="fin-ov-surplus-row">
        <div class="fin-ov-surplus-row-left">
          <span class="fin-ov-surplus-amt">${fmtRM(r.amount)}</span>
          ${r.description ? `<span class="fin-ov-hist-note">${esc(r.description)}</span>` : ""}
        </div>
        <button class="r-mini r-del fin-surplus-del" data-id="${esc(r.id)}">×</button>
      </div>`).join("");

    section.innerHTML = `
      <div class="fin-ov-section-head">
        <span class="fin-ov-section-label">Extra Income — ${monthLabel}</span>
        <span class="fin-ov-section-note">gifts · freelance · windfalls</span>
      </div>
      <div class="fin-ov-surplus-form-row">
        <input id="fin-surplus-amt" type="number" min="0" step="0.01"
               placeholder="Amount (RM)" class="fin-ov-income-input" />
        <input id="fin-surplus-desc" type="text"
               placeholder="Description (optional)" class="fin-ov-income-notes-input" />
        ${savPools.length ? `<select id="fin-surplus-pool" class="fin-ov-income-input" title="Optionally stash this into a savings pool">
          <option value="">No pool</option>
          ${savPools.map((p) => `<option value="${esc(p.id)}">→ ${esc(p.name)}</option>`).join("")}
        </select>` : ""}
        <button id="fin-surplus-save" class="r-mini">+ Add extra</button>
        <p id="fin-surplus-status" class="r-status"></p>
      </div>
      ${total > 0
        ? `<div class="fin-ov-surplus-total">+ ${fmtRM(total)} extra this month</div>`
        : ""}
      <div class="fin-ov-surplus-list">
        ${entryRows || `<p class="fin-ov-surplus-empty">No extra income logged this month.</p>`}
      </div>
      ${pastRows ? `
        <details class="fin-ov-hist">
          <summary class="fin-ov-hist-toggle">Previous months</summary>
          <div class="fin-ov-hist-list">${pastRows}</div>
        </details>` : ""}`;

    section.querySelector("#fin-surplus-save").addEventListener("click", async () => {
      const amt  = parseFloat(section.querySelector("#fin-surplus-amt").value);
      const desc = section.querySelector("#fin-surplus-desc").value.trim();
      const status = section.querySelector("#fin-surplus-status");
      if (!amt || amt <= 0) { status.textContent = "Enter a valid amount."; return; }
      status.textContent = "Saving…";
      const { error } = await SB.from("finance_surplus").insert({
        amount: amt, description: desc || null,
        logged_at: new Date().toISOString(),
      });
      if (error) { console.error(error); status.textContent = "Couldn't save. Try again."; return; }
      // Optionally stash the same amount into a chosen savings pool (deposit).
      const poolSel = section.querySelector("#fin-surplus-pool");
      const poolId = poolSel ? poolSel.value : "";
      if (poolId) {
        const sd = (await window.dmicoKvGet("finance_savings")) || {};
        const ps = Array.isArray(sd.pools) ? sd.pools : [];
        const pool = ps.find((p) => String(p.id) === String(poolId));
        if (pool) {
          pool.history = Array.isArray(pool.history) ? pool.history : [];
          pool.history.push({ id: Date.now().toString(36), ts: new Date().toISOString(), type: "in", amount: amt, note: desc || "Extra income" });
          await window.dmicoKvSet("finance_savings", { pools: ps });
        }
      }
      renderOverview();
    });

    section.querySelectorAll(".fin-surplus-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!window.confirm("Remove this entry?")) return;
        const { error } = await SB.from("finance_surplus").delete().eq("id", btn.dataset.id);
        if (error) { console.error(error); return; }
        renderOverview();
      });
    });
  }

  // ── Budget rule panel ──────────────────────────────────────
  // v1: buckets stay needs/wants/savings; presets only vary the percentages.
  // A preset with wants:0 (e.g. 80/20) hides the Wants bar.
  const BUDGET_PRESETS = [
    { id: "50/30/20", needs: 50, wants: 30, savings: 20 },
    { id: "70/20/10", needs: 70, wants: 20, savings: 10 },
    { id: "80/20",    needs: 80, wants: 0,  savings: 20 },
    { id: "60/20/20", needs: 60, wants: 20, savings: 20 },
    { id: "40/40/20", needs: 40, wants: 40, savings: 20 },
  ];
  const DEFAULT_RULE = { id: "50/30/20", needs: 50, wants: 30, savings: 20 };

  function activeRule() {
    const r = cachedSettings && cachedSettings.budget_rule;
    if (r && typeof r.needs === "number") return r;
    return DEFAULT_RULE;
  }

  function draw503020(section, income, split, savings, allCats, buckets, rule, subsReserve) {
    rule = rule || DEFAULT_RULE;
    const noIncome    = income <= 0;
    const needsTarget = income * (rule.needs   || 0) / 100;
    const wantsTarget = income * (rule.wants   || 0) / 100;
    const saveTarget  = income * (rule.savings || 0) / 100;

    // A spend bar: actual vs its bucket target (over target reads as a warning).
    // Meta line shows spent / limit / remaining. An optional `marker` draws a faint
    // vertical line at that amount's position (used on Needs for the subs reserve).
    const spendBar = (label, actual, target, marker) => {
      const pct  = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
      const over = actual > target && target > 0;
      const markPct = (marker && marker > 0 && target > 0) ? Math.min(100, (marker / target) * 100) : null;
      const markEl = markPct !== null
        ? `<div class="fin-ov-bar-marker" style="left:${markPct}%" title="Reserve about ${fmtRM(marker)} here for subscriptions"></div>`
        : "";
      return `
        <div class="fin-ov-rule-bar-block">
          <div class="fin-ov-rule-bar-head">
            <span>${label}</span>
          </div>
          <div class="fin-ov-bar-track">
            <div class="fin-ov-bar-fill ${over ? "fin-ov-bar-over" : "fin-ov-bar-spend"}" style="width:${pct}%"></div>
            ${markEl}
          </div>
          <div class="fin-ov-bar-meta">
            ${over
              ? `<span>${fmtRM(actual)} of ${fmtRM(target)} <span class="fin-ov-over-text">· over by ${fmtRM(actual - target)}</span></span>`
              : `<span>${fmtRM(actual)} of ${fmtRM(target)} · ${fmtRM(target - actual)} left</span>`}
            ${markPct !== null ? `<span class="fin-ov-sub-reserve">· ${fmtRM(marker)} for subs</span>` : ""}
          </div>
        </div>`;
    };

    const savePct = saveTarget > 0 ? Math.min(120, Math.round((savings / saveTarget) * 100)) : 0;
    const saveNeg = savings < 0;
    const saveMet = !saveNeg && savePct >= 100;

    const unsorted = split.unsorted || 0;

    const presetIds = BUDGET_PRESETS.map((p) => p.id);
    const isCustom = !presetIds.includes(rule.id);
    const ruleOptions =
      BUDGET_PRESETS.map((p) => `<option value="${p.id}" ${p.id === rule.id ? "selected" : ""}>${p.id}</option>`).join("") +
      `<option value="custom" ${isCustom ? "selected" : ""}>Custom${isCustom ? ` (${rule.needs}/${rule.wants}/${rule.savings})` : ""}</option>`;

    section.innerHTML = `
      <style>
        .fin-ov-bar-track{position:relative;}
        .fin-ov-bar-marker{position:absolute;top:-3px;bottom:-3px;width:2px;background:currentColor;opacity:0.35;border-radius:1px;}
        .fin-ov-sub-reserve{opacity:0.6;margin-left:4px;}
      </style>
      <div class="fin-ov-section-head">
        <span class="fin-ov-section-label">Budget rule</span>
        <select class="r-mini-select fin-rule-select" title="Pick a budgeting rule">${ruleOptions}</select>
        <button class="r-mini fin-tag-cats-btn">Tag categories${allCats.length ? ` (${allCats.length})` : ""}</button>
      </div>
      ${noIncome ? `<p class="fin-ov-rule-empty">Targets will appear once you log this month's allowance.</p>` : `
      <div class="fin-ov-rule-grid">
        ${spendBar(`Needs · ${rule.needs}%`, split.need || 0, needsTarget, subsReserve)}
        ${rule.wants > 0 ? spendBar(`Wants · ${rule.wants}%`, split.want || 0, wantsTarget) : ""}

        <div class="fin-ov-rule-bar-block fin-ov-rule-save-block">
          <div class="fin-ov-rule-bar-head">
            <span>Save / Invest · ${rule.savings}%</span>
          </div>
          <div class="fin-ov-bar-track">
            <div class="fin-ov-bar-fill ${saveNeg ? "fin-ov-bar-over" : saveMet ? "fin-ov-bar-saved" : "fin-ov-bar-save"}"
                 style="width:${saveNeg ? 0 : Math.min(100, savePct)}%"></div>
          </div>
          <div class="fin-ov-bar-meta">
            ${saveNeg
              ? `<span class="fin-ov-over-text">−${fmtRM(Math.abs(savings))} deficit · overspent this month</span>`
              : saveMet
              ? `<span class="fin-ov-saved-text">${fmtRM(savings)} of ${fmtRM(saveTarget)} · target met</span>`
              : `<span>${fmtRM(savings)} of ${fmtRM(saveTarget)} · ${fmtRM(saveTarget - savings)} to go</span>`}
          </div>
        </div>

        ${unsorted > 0
          ? `<p class="fin-ov-rule-note">${fmtRM(unsorted)} this month is in untagged categories. Hit "Tag categories" to split it into needs and wants.</p>`
          : ""}
      </div>`}`;

    const tagBtn = section.querySelector(".fin-tag-cats-btn");
    if (tagBtn) tagBtn.addEventListener("click", () => openCategoryEditor(section, allCats, buckets));

    const ruleSel = section.querySelector(".fin-rule-select");
    if (ruleSel) ruleSel.addEventListener("change", (e) => onRuleChange(section, e.target.value, rule));
  }

  async function onRuleChange(section, value, currentRule) {
    if (value === "custom") {
      openRuleEditor(section, currentRule);
      return;
    }
    const preset = BUDGET_PRESETS.find((p) => p.id === value);
    if (!preset) return;
    await saveSettings({ budget_rule: { ...preset } });
    renderOverview();
  }

  function openRuleEditor(section, currentRule) {
    const r = currentRule || DEFAULT_RULE;
    section.innerHTML = `
      <div class="fin-ov-section-head"><span class="fin-ov-section-label">Custom budget rule</span></div>
      <div class="fin-rule-custom">
        <div class="r-row2">
          <div class="r-field"><label>Needs %</label><input id="fr-needs" type="number" min="0" max="100" step="1" value="${r.needs}" /></div>
          <div class="r-field"><label>Wants %</label><input id="fr-wants" type="number" min="0" max="100" step="1" value="${r.wants}" /></div>
        </div>
        <div class="r-field"><label>Savings %</label><input id="fr-savings" type="number" min="0" max="100" step="1" value="${r.savings}" /></div>
        <p id="fr-hint" class="r-status"></p>
      </div>
      <div class="r-actions">
        <button class="btn-primary r-btn fr-save">Save rule</button>
        <button class="r-mini fr-cancel">Cancel</button>
      </div>`;
    section.querySelector(".fr-cancel").addEventListener("click", renderOverview);
    section.querySelector(".fr-save").addEventListener("click", async () => {
      const needs   = Math.max(0, parseFloat(el("fr-needs").value)   || 0);
      const wants   = Math.max(0, parseFloat(el("fr-wants").value)   || 0);
      const savings = Math.max(0, parseFloat(el("fr-savings").value) || 0);
      const total = needs + wants + savings;
      if (total !== 100) {
        el("fr-hint").textContent = `Heads up: that adds to ${total}%, not 100%. Saving anyway.`;
      }
      await saveSettings({ budget_rule: { id: "custom", needs, wants, savings } });
      renderOverview();
    });
  }

  function openCategoryEditor(section, allCats, buckets) {
    if (!allCats.length) {
      section.innerHTML = `
        <div class="fin-ov-section-head"><span class="fin-ov-section-label">Tag categories</span></div>
        <p class="fin-ov-rule-empty">No expense categories yet. Log a few expenses first, then come back to tag each one as a need or a want.</p>
        <div class="r-actions"><button class="r-mini fin-cats-back">Back</button></div>`;
      section.querySelector(".fin-cats-back").addEventListener("click", renderOverview);
      return;
    }
    const rows = allCats.map((cat) => {
      const cur = buckets[cat.toLowerCase()] || "unsorted";
      return `
        <div class="fin-cat-row">
          <span class="fin-cat-name">${esc(cat)}</span>
          <select class="fin-cat-select r-mini-select" data-cat="${esc(cat.toLowerCase())}">
            <option value="unsorted" ${cur === "unsorted" ? "selected" : ""}>Unsorted</option>
            <option value="need" ${cur === "need" ? "selected" : ""}>Need</option>
            <option value="want" ${cur === "want" ? "selected" : ""}>Want</option>
          </select>
        </div>`;
    }).join("");
    section.innerHTML = `
      <div class="fin-ov-section-head"><span class="fin-ov-section-label">Tag categories as needs / wants</span></div>
      <div class="fin-cat-list">${rows}</div>
      <div class="r-actions">
        <button class="btn-primary r-btn fin-cats-save">Save</button>
        <button class="r-mini fin-cats-back">Cancel</button>
        <span class="fin-cats-status r-status"></span>
      </div>`;
    section.querySelector(".fin-cats-back").addEventListener("click", renderOverview);
    section.querySelector(".fin-cats-save").addEventListener("click", async () => {
      const map = {};
      section.querySelectorAll(".fin-cat-select").forEach((sel) => {
        if (sel.value === "need" || sel.value === "want") map[sel.dataset.cat] = sel.value;
      });
      section.querySelector(".fin-cats-status").textContent = "Saving…";
      await saveSettings({ category_buckets: map });
      renderOverview();
    });
  }

  // ── Savings chart (SVG, 6 months, zero-centred) ────────────
  function drawSavingsChart(wrap, monthlySavings) {
    if (!wrap) return;
    const nets   = monthlySavings.map((m) => m.net ?? 0);
    const maxAbs = Math.max(...nets.map(Math.abs), 1);

    const W = 500, H = 160;
    const padTop = 24, padBot = 28, padL = 14, padR = 10;
    const plotH  = H - padTop - padBot;
    const base   = padTop + plotH / 2; // zero line
    const halfH  = plotH / 2;
    const slotW  = (W - padL - padR) / 6;
    const barW   = Math.floor(slotW * 0.52);

    const now = new Date();
    const bars = monthlySavings.map((m, i) => {
      const isCurrent = m.month === now.getMonth() && m.year === now.getFullYear();
      const x = padL + i * slotW + (slotW - barW) / 2;
      const monthLabel = MONTH_NAMES[m.month].slice(0, 3);
      let barEl = "";

      if (m.net !== null) {
        const barH  = Math.max(4, Math.round(halfH * Math.abs(m.net) / maxAbs));
        const pos   = m.net >= 0;
        const y     = pos ? base - barH : base;
        const fill  = m.net < 0 ? "#C4661F" : "#5F6F52";
        const op    = isCurrent ? "1" : "0.62";
        const amt   = Math.abs(m.net);
        const lbl   = amt >= 1000 ? `${(amt / 1000).toFixed(1)}k` : Math.round(amt).toString();
        const lblY  = pos ? y - 4 : y + barH + 11;
        barEl = `
          <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3"
                fill="${fill}" opacity="${op}"/>
          <text x="${x + barW / 2}" y="${lblY}" text-anchor="middle"
                font-size="9" fill="${fill}" opacity="${op}" font-family="var(--body)">
            ${m.net < 0 ? "−" : ""}${lbl}
          </text>`;
      } else {
        // No income logged — dim dash at baseline.
        barEl = `<rect x="${x + barW / 4}" y="${base - 1}" width="${barW / 2}" height="2"
                       rx="1" fill="var(--line)"/>`;
      }

      return `<g>
        ${barEl}
        <text x="${x + barW / 2}" y="${H - 5}" text-anchor="middle"
              font-size="10" fill="${isCurrent ? "#45301E" : "#7C6A4F"}"
              font-weight="${isCurrent ? "700" : "400"}" font-family="var(--body)">${monthLabel}</text>
      </g>`;
    }).join("");

    wrap.innerHTML = `
      <svg class="fin-chart-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}"
              stroke="var(--line)" stroke-width="1.5" stroke-dasharray="4 3"/>
        <text x="${padL - 2}" y="${base - 4}" font-size="9"
              fill="var(--ink-faint)" font-family="var(--body)">0</text>
        ${bars}
      </svg>`;
  }

  // ── Goal projections ───────────────────────────────────────
  function drawProjections(section, goals, avgMonthlySavings, totalSaved) {
    if (!section) return;
    const active = goals
      .filter((g) => Number(g.current) < Number(g.target))
      .sort((a, b) => {
        const pa = a.target > 0 ? Number(a.current) / Number(a.target) : 0;
        const pb = b.target > 0 ? Number(b.current) / Number(b.target) : 0;
        return pb - pa;
      });

    if (!active.length) { section.innerHTML = ""; return; }

    const rows = active.map((g) => {
      const remaining = Number(g.target) - Number(g.current);
      const pct = g.target > 0 ? Math.min(100, Math.round((Number(g.current) / Number(g.target)) * 100)) : 0;
      let eta = "Log allowance to see projection";
      if (avgMonthlySavings !== null) {
        if (avgMonthlySavings <= 0) {
          eta = "Increase monthly savings to project a timeline";
        } else {
          const mo = Math.ceil(remaining / avgMonthlySavings);
          eta = `~${mo} month${mo === 1 ? "" : "s"} at current rate`;
        }
      }
      return `
        <div class="fin-ov-proj-row">
          <div class="fin-ov-proj-info">
            <span class="fin-ov-proj-label">${esc(g.label)}</span>
            <span class="fin-ov-proj-meta">${fmtRM(g.current)} of ${fmtRM(g.target)} · ${pct}%</span>
          </div>
          <span class="fin-ov-proj-eta">${eta}</span>
        </div>`;
    }).join("");

    section.innerHTML = `
      <div class="fin-ov-section-head">
        <span class="fin-ov-section-label">Goal Projections</span>
      </div>
      <div class="fin-ov-proj-list">${rows}</div>`;
  }

  // ════════════════════════════════════════════════════════════
  //  WISHLIST SIDEBAR
  // ════════════════════════════════════════════════════════════

  async function renderWishlist(container) {
    if (!container) return;
    container.innerHTML = `<p class="fin-wl-loading r-status">Loading…</p>`;

    const now = new Date();
    const thisYear = now.getFullYear(), thisMonth = now.getMonth();

    const windowMonths = [];
    for (let i = 5; i >= 0; i--) {
      let m = thisMonth - i, y = thisYear;
      while (m < 0) { m += 12; y--; }
      windowMonths.push({ year: y, month: m });
    }
    const windowStart = new Date(windowMonths[0].year, windowMonths[0].month, 1).toISOString();
    const windowEnd   = new Date(thisYear, thisMonth + 1, 1).toISOString();

    const [settingsRes, allIncomeRes, expenseRes, surplusRes, wishlistRes] = await Promise.all([
      SB.from("finance_settings").select("*").limit(1),
      SB.from("finance_income").select("*")
        .or(`year.gt.${windowMonths[0].year},and(year.eq.${windowMonths[0].year},month.gte.${windowMonths[0].month})`)
        .order("year").order("month"),
      SB.from("finance_expenses").select("amount, logged_at")
        .gte("logged_at", windowStart).lt("logged_at", windowEnd),
      SB.from("finance_surplus").select("amount, logged_at")
        .gte("logged_at", windowStart).lt("logged_at", windowEnd),
      SB.from("finance_wishlist").select("*").order("created_at"),
    ]);

    const settings   = settingsRes.data?.[0] || { opening_balance: 0 };
    const allIncome  = allIncomeRes.data || [];
    const allExp     = expenseRes.data   || [];
    const allSurplus = surplusRes.data   || [];
    const items      = wishlistRes.data  || [];

    // Compute totalSaved and avgMonthlySavings from 6-month window.
    const monthlyNets = windowMonths.map(({ year, month }) => {
      const inc = allIncome.find((r) => r.year === year && r.month === month);
      const surplusAmt = allSurplus
        .filter((s) => { const d = new Date(s.logged_at); return d.getFullYear() === year && d.getMonth() === month; })
        .reduce((s, r) => s + Number(r.amount), 0);
      const exp = allExp
        .filter((e) => { const d = new Date(e.logged_at); return d.getFullYear() === year && d.getMonth() === month; })
        .reduce((s, e) => s + Number(e.amount), 0);
      const hasIncome = inc !== undefined || surplusAmt > 0;
      return hasIncome ? (inc ? Number(inc.amount) : 0) + surplusAmt - exp : null;
    }).filter((n) => n !== null);

    const openingBalance    = Number(settings.opening_balance || 0);
    const totalSaved        = openingBalance + monthlyNets.reduce((s, n) => s + n, 0);
    const recent            = monthlyNets.slice(-3);
    const avgMonthlySavings = recent.length > 0 ? recent.reduce((s, n) => s + n, 0) / recent.length : null;

    // Sort: can-afford first, then by % funded descending.
    const sorted = [...items].sort((a, b) => {
      const pa = Math.min(1, totalSaved / Number(a.price));
      const pb = Math.min(1, totalSaved / Number(b.price));
      return pb - pa;
    });

    const itemCards = sorted.map((item) => {
      const price     = Number(item.price);
      const pct       = price > 0 ? Math.min(100, Math.round((totalSaved / price) * 100)) : 100;
      const remaining = Math.max(0, price - totalSaved);
      const canAfford = totalSaved >= price;

      let etaHtml = "";
      if (canAfford) {
        etaHtml = `<span class="fin-wl-eta fin-wl-eta-ready">Can afford now!</span>`;
      } else if (avgMonthlySavings !== null && avgMonthlySavings > 0) {
        const mo = Math.ceil(remaining / avgMonthlySavings);
        etaHtml = `<span class="fin-wl-eta">~${mo} mo${mo === 1 ? "" : "s"}</span>`;
      } else {
        etaHtml = `<span class="fin-wl-eta fin-wl-eta-dim">Log income to see timeline</span>`;
      }

      const nameHtml = item.url
        ? `<a class="fin-wl-name" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.label)}</a>`
        : `<span class="fin-wl-name">${esc(item.label)}</span>`;

      const thumbHtml = item.image_url
        ? `<img class="fin-wl-thumb" src="${esc(item.image_url)}" alt="${esc(item.label)}"
               loading="lazy" onerror="this.style.display='none'" />`
        : "";

      return `
        <div class="fin-wl-card${canAfford ? " fin-wl-card-ready" : ""}">
          <div class="fin-wl-card-top">
            ${thumbHtml}
            <div class="fin-wl-card-name-block">
              ${nameHtml}
              <span class="fin-wl-price">${fmtRM(price)}</span>
            </div>
            <button class="r-mini r-del fin-wl-del" data-id="${esc(item.id)}">×</button>
          </div>
          <div class="fin-wl-bar-track">
            <div class="fin-wl-bar-fill${canAfford ? " fin-wl-bar-ready" : ""}" style="width:${pct}%"></div>
          </div>
          <div class="fin-wl-card-foot">
            <span class="fin-wl-pct">${pct}%</span>
            ${etaHtml}
          </div>
        </div>`;
    }).join("");

    container.innerHTML = `
      <div class="fin-wl-head">
        <span class="fin-wl-title">Wishlist</span>
        <span class="fin-wl-saved-badge">${fmtRM(totalSaved)} saved</span>
      </div>
      <div class="fin-wl-add-form">
        <input id="fin-wl-label" type="text" placeholder="What do you want?" class="fin-wl-input" />
        <input id="fin-wl-price" type="number" min="0" step="0.01" placeholder="Price (RM)" class="fin-wl-input" />
        <input id="fin-wl-url" type="url" placeholder="Shopee / Lazada link (optional)" class="fin-wl-input fin-wl-url-input" />
        <input id="fin-wl-image-url" type="url" placeholder="Image URL (right-click → copy image address)" class="fin-wl-input fin-wl-url-input" />
        <button id="fin-wl-save" class="r-mini fin-wl-add-btn">+ Add</button>
        <p id="fin-wl-status" class="r-status"></p>
      </div>
      <div class="fin-wl-list">
        ${itemCards || `<p class="fin-wl-empty">Add something you're saving towards.</p>`}
      </div>`;

    el("fin-wl-save").addEventListener("click", async () => {
      const label    = el("fin-wl-label").value.trim();
      const price    = parseFloat(el("fin-wl-price").value);
      const url      = el("fin-wl-url").value.trim();
      const imageUrl = el("fin-wl-image-url").value.trim();
      const status   = el("fin-wl-status");
      if (!label)               { status.textContent = "Name it first."; return; }
      if (!price || price <= 0) { status.textContent = "Enter a price."; return; }
      status.textContent = "Adding…";
      const { error } = await SB.from("finance_wishlist").insert({
        label, price, url: url || null, image_url: imageUrl || null,
      });
      if (error) { console.error(error); status.textContent = "Couldn't save."; return; }
      ["fin-wl-label", "fin-wl-price", "fin-wl-url", "fin-wl-image-url"].forEach((id) => {
        if (el(id)) el(id).value = "";
      });
      status.textContent = "";
      renderWishlist(container);
    });

    container.querySelectorAll(".fin-wl-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!window.confirm("Remove from wishlist?")) return;
        const { error } = await SB.from("finance_wishlist").delete().eq("id", btn.dataset.id);
        if (error) { console.error(error); return; }
        renderWishlist(container);
      });
    });
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
          <select id="fe-project"><option value="">— no project —</option></select>
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
    el("fe-recurring").addEventListener("change", () => {
      const recLabel = el("fe-rec-label");
      recLabel.hidden = !el("fe-recurring").checked;
      if (!recLabel.hidden) recLabel.focus();
    });

    // Project dropdown (non-blocking).
    SB.from("gamedev_projects").select("id, name").neq("status", "shelved").order("name").then(({ data }) => {
      gdProjects = data || [];
      const sel = el("fe-project");
      if (!sel || !gdProjects.length) return;
      gdProjects.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id; opt.textContent = p.name;
        sel.appendChild(opt);
      });
    });

    await refreshExpenses();
  }

  // ── Recurring section ──────────────────────────────────────
  async function drawRecurring() {
    const section = el("fin-recurring-section");
    if (!section) return;

    const { data, error } = await SB
      .from("finance_expenses").select("*").eq("is_recurring", true)
      .order("logged_at", { ascending: false });
    if (error || !data || !data.length) { section.innerHTML = ""; return; }

    const seen = new Set();
    const templates = [];
    data.forEach((e) => {
      const key = e.recur_label || `${e.category}|${e.note}|${e.amount}`;
      if (!seen.has(key)) { seen.add(key); templates.push({ ...e, _key: key }); }
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const { data: thisMonth } = await SB
      .from("finance_expenses").select("recur_label, category, note, amount")
      .eq("is_recurring", true).gte("logged_at", monthStart).lt("logged_at", monthEnd);
    const loggedThisMonth = new Set(
      (thisMonth || []).map((e) => e.recur_label || `${e.category}|${e.note}|${e.amount}`)
    );

    const rows = templates.map((t) => {
      const logged = loggedThisMonth.has(t._key);
      return `
        <div class="fin-rec-item">
          <div class="fin-rec-item-info">
            <span class="fin-rec-item-label">${esc(t.recur_label || t.category || "Recurring")}</span>
            <span class="fin-rec-item-amount">${fmtRM(t.amount)}</span>
            ${t.category ? `<span class="fin-rec-item-cat">${esc(t.category)}</span>` : ""}
          </div>
          ${logged
            ? `<span class="fin-rec-logged">Logged this month</span>`
            : `<button class="r-mini fin-rec-log-btn"
                data-amount="${esc(String(t.amount))}" data-cat="${esc(t.category || "")}"
                data-note="${esc(t.note || "")}" data-recur-label="${esc(t.recur_label || "")}"
                data-project="${esc(t.project_id || "")}">Log this month</button>`}
        </div>`;
    }).join("");

    section.innerHTML = `
      <div class="fin-rec-header">
        <span class="fin-rec-title">Recurring</span>
        <span class="fin-rec-count">${templates.length} item${templates.length === 1 ? "" : "s"}</span>
      </div>
      <div class="fin-rec-list">${rows}</div>`;

    section.querySelectorAll(".fin-rec-log-btn").forEach((btn) =>
      btn.addEventListener("click", () => logRecurringThisMonth(btn))
    );
  }

  async function logRecurringThisMonth(btn) {
    btn.disabled = true; btn.textContent = "Logging…";
    const row = {
      amount: parseFloat(btn.dataset.amount), category: btn.dataset.cat || null,
      note: btn.dataset.note || null, recur_label: btn.dataset.recurLabel || null,
      is_recurring: true, logged_at: new Date().toISOString(), added_via: "web",
    };
    if (btn.dataset.project) row.project_id = btn.dataset.project;
    const { error } = await SB.from("finance_expenses").insert(row);
    if (error) { console.error(error); btn.disabled = false; btn.textContent = "Log this month"; return; }
    const badge = document.createElement("span");
    badge.className = "fin-rec-logged"; badge.textContent = "Logged this month";
    btn.replaceWith(badge);
    const now = new Date();
    if (activeMonth === now.getMonth() && activeYear === now.getFullYear()) await refreshExpenses();
  }

  function shiftMonth(dir) {
    activeMonth += dir;
    if (activeMonth < 0)  { activeMonth = 11; activeYear--; }
    if (activeMonth > 11) { activeMonth = 0;  activeYear++; }
    refreshExpenses();
  }

  async function addExpense() {
    const msg    = el("fe-status");
    const amount = parseFloat(el("fe-amount").value);
    if (!amount || amount <= 0) { msg.textContent = "Enter a valid amount."; return; }
    const dateVal    = el("fe-date").value;
    const isRecur    = el("fe-recurring")?.checked || false;
    const recurLabel = isRecur ? (el("fe-rec-label")?.value.trim() || null) : null;
    const row = {
      amount, category: el("fe-cat").value.trim() || null,
      note: el("fe-note").value.trim() || null,
      logged_at: dateVal ? new Date(dateVal + "T12:00:00").toISOString() : new Date().toISOString(),
      added_via: "web", is_recurring: isRecur, recur_label: recurLabel,
    };
    const selProj = el("fe-project")?.value;
    if (selProj) row.project_id = selProj;
    msg.textContent = "Logging…";
    const { error } = await SB.from("finance_expenses").insert(row);
    if (error) { console.error(error); msg.textContent = "Couldn't save. Try again."; return; }
    el("fe-amount").value = ""; el("fe-cat").value = "";
    el("fe-note").value   = ""; el("fe-date").value = new Date().toISOString().slice(0, 10);
    if (el("fe-project"))   el("fe-project").value = "";
    if (el("fe-recurring")) {
      el("fe-recurring").checked = false;
      el("fe-rec-label").hidden = true; el("fe-rec-label").value = "";
    }
    msg.textContent = "";
    const entryMonth = new Date(row.logged_at).getMonth();
    const entryYear  = new Date(row.logged_at).getFullYear();
    if (entryMonth === activeMonth && entryYear === activeYear) await refreshExpenses();
  }

  async function refreshExpenses() {
    drawRecurring();
    const labelEl = el("fin-month-label");
    if (labelEl) labelEl.textContent = `${MONTH_NAMES[activeMonth]} ${activeYear}`;
    const now     = new Date();
    const nextBtn = el("fin-next");
    if (nextBtn) {
      nextBtn.disabled = activeYear > now.getFullYear() ||
        (activeYear === now.getFullYear() && activeMonth >= now.getMonth());
    }
    const start    = new Date(activeYear, activeMonth, 1).toISOString();
    const end      = new Date(activeYear, activeMonth + 1, 1).toISOString();
    const summaryEl = el("fin-summary");
    const listEl    = el("fin-entries");
    if (!summaryEl || !listEl) return;
    summaryEl.innerHTML = `<p class="r-status">Loading…</p>`;
    listEl.innerHTML    = "";
    const { data, error } = await SB.from("finance_expenses").select("*")
      .gte("logged_at", start).lt("logged_at", end).order("logged_at", { ascending: false });
    if (error) { console.error(error); summaryEl.innerHTML = `<p class="r-status">Couldn't load expenses.</p>`; return; }
    const entries = data || [];
    buildSummary(entries, summaryEl);
    buildEntryList(entries, listEl);
    await drawExpenseChart();
  }

  // ── 6-month expense bar chart (Expenses tab) ───────────────
  async function drawExpenseChart() {
    const wrap = el("fin-chart-wrap");
    if (!wrap) return;
    const months = [];
    for (let i = 5; i >= 0; i--) {
      let m = activeMonth - i, y = activeYear;
      while (m < 0) { m += 12; y--; }
      months.push({ year: y, month: m });
    }
    const rangeStart = new Date(months[0].year, months[0].month, 1).toISOString();
    const rangeEnd   = new Date(activeYear, activeMonth + 1, 1).toISOString();
    const { data } = await SB.from("finance_expenses").select("amount, logged_at")
      .gte("logged_at", rangeStart).lt("logged_at", rangeEnd);
    const totals = months.map(({ year, month }) => ({
      year, month,
      total: (data || []).filter((e) => {
        const d = new Date(e.logged_at);
        return d.getFullYear() === year && d.getMonth() === month;
      }).reduce((s, e) => s + Number(e.amount), 0),
    }));
    const maxTotal = Math.max(...totals.map((t) => t.total), 1);
    const W = 500, H = 140, padTop = 22, padBot = 28, padL = 10, padR = 10;
    const plotH = H - padTop - padBot;
    const slotW = (W - padL - padR) / 6;
    const barW  = Math.floor(slotW * 0.52);
    const barEls = totals.map((t, i) => {
      const isActive = t.month === activeMonth && t.year === activeYear;
      const barH = t.total > 0 ? Math.max(6, Math.round(plotH * t.total / maxTotal)) : 4;
      const x = padL + i * slotW + (slotW - barW) / 2;
      const y = padTop + plotH - barH;
      const fill = isActive ? "#C4661F" : "#5F6F52";
      const op   = isActive ? "1" : "0.55";
      const lbl  = t.total > 0 ? (t.total >= 1000 ? `${(t.total/1000).toFixed(1)}k` : Math.round(t.total).toString()) : "";
      return `<g class="fin-cbar" data-year="${t.year}" data-month="${t.month}">
        <rect x="${x-6}" y="0" width="${barW+12}" height="${H}" fill="transparent" style="cursor:pointer"/>
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${fill}" opacity="${op}"/>
        ${lbl ? `<text x="${x+barW/2}" y="${y-5}" text-anchor="middle" font-size="9"
                       fill="${fill}" opacity="${op}" font-family="var(--body)">${lbl}</text>` : ""}
        <text x="${x+barW/2}" y="${H-5}" text-anchor="middle" font-size="10"
              fill="${isActive?"#45301E":"#7C6A4F"}" font-weight="${isActive?"700":"400"}"
              font-family="var(--body)">${MONTH_NAMES[t.month].slice(0,3)}</text>
      </g>`;
    }).join("");
    wrap.innerHTML = `
      <svg class="fin-chart-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <line x1="${padL}" y1="${padTop+plotH}" x2="${W-padR}" y2="${padTop+plotH}"
              stroke="var(--line)" stroke-width="1.5"/>
        ${barEls}
      </svg>`;
    wrap.querySelectorAll(".fin-cbar").forEach((g) =>
      g.addEventListener("click", () => {
        activeYear  = parseInt(g.dataset.year,  10);
        activeMonth = parseInt(g.dataset.month, 10);
        refreshExpenses();
      })
    );
  }

  function buildSummary(entries, container) {
    const total  = entries.reduce((s, e) => s + Number(e.amount || 0), 0);
    const budget = getBudget();
    let budgetHTML = "";
    if (budget) {
      const pct  = Math.min(100, Math.round((total / budget) * 100));
      const over = total > budget;
      const warn = !over && total / budget >= 0.8;
      budgetHTML = `
        <div class="fin-budget-row">
          <span class="fin-budget-label">Limit ${fmtRM(budget)}</span>
          <span class="fin-budget-status${over?" fin-budget-status-over":warn?" fin-budget-status-warn":""}">
            ${over ? `Over by ${fmtRM(total-budget)}` : warn ? `${fmtRM(budget-total)} left — close` : `${fmtRM(budget-total)} remaining`}
          </span>
          <button class="r-mini fin-set-budget-btn">Edit</button>
        </div>
        <div class="fin-budget-track">
          <div class="${over?"fin-budget-fill fin-budget-over":warn?"fin-budget-fill fin-budget-warn":"fin-budget-fill"}" style="width:${pct}%"></div>
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
    const cats   = {};
    entries.forEach((e) => { const c = e.category || "Uncategorised"; cats[c] = (cats[c]||0)+Number(e.amount||0); });
    const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const bars   = sorted.map(([cat, amt]) => {
      const pct = Math.round((amt / total) * 100);
      return `<div class="fin-cat-row">
        <span class="fin-cat-name">${esc(cat)}</span>
        <div class="fin-bar-track"><div class="fin-bar-fill" style="width:${pct}%"></div></div>
        <span class="fin-cat-amt">${fmtRM(amt)}</span>
      </div>`;
    }).join("");
    const over = budget && total > budget;
    container.innerHTML = `
      <div class="fin-summary-card">
        <div class="fin-summary-top">
          <span class="fin-total${over?" fin-total-over":""}">${fmtRM(total)}</span>
          <span class="fin-total-label">spent &middot; ${entries.length} entr${entries.length===1?"y":"ies"}</span>
          ${!budget ? `<button class="r-mini fin-set-budget-btn fin-set-budget-new">Set limit</button>` : ""}
        </div>
        ${budgetHTML}
        <div class="fin-cats">${bars}</div>
      </div>`;
    container.querySelectorAll(".fin-set-budget-btn").forEach((b) => b.addEventListener("click", promptBudget));
  }

  function promptBudget() {
    const cur = getBudget();
    const raw = window.prompt(
      cur ? `Monthly spending limit (RM):\nCurrently ${fmtRM(cur)}. Leave blank to remove.`
           : "Set a monthly spending limit (RM):"
    );
    if (raw === null) return;
    if (raw.trim() === "") { setBudget(null); refreshExpenses(); return; }
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) { alert("Enter a valid amount."); return; }
    setBudget(n);
    saveSettings({ monthly_budget: n }); // persist to Supabase too
    refreshExpenses();
  }

  function buildEntryList(entries, container) {
    if (!entries.length) {
      container.innerHTML = `<div class="empty"><h2>Nothing logged yet</h2><p>Add your first expense above.</p></div>`;
      return;
    }
    container.innerHTML = "";
    entries.forEach((e) => {
      const row  = document.createElement("div");
      row.className = "r-card fin-expense-row";
      const d    = new Date(e.logged_at);
      const dateStr = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
      row.innerHTML = `
        <div class="fin-exp-left">
          <span class="fin-exp-amount">${fmtRM(e.amount)}</span>
          <div class="fin-exp-detail">
            ${e.category ? `<span class="r-chip fin-exp-cat">${esc(e.category)}</span>` : ""}
            ${e.project_id ? (() => { const p = gdProjects.find((x) => x.id === e.project_id); return p ? `<span class="r-chip fin-exp-project">${esc(p.name)}</span>` : ""; })() : ""}
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
  //  GOALS TAB
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
    const msg    = el("fg-status");
    const label  = el("fg-label").value.trim();
    const target = parseFloat(el("fg-target").value);
    const current = parseFloat(el("fg-current").value) || 0;
    if (!label)            { msg.textContent = "Name the goal."; return; }
    if (!target || target <= 0) { msg.textContent = "Enter a target amount."; return; }
    msg.textContent = "Adding…";
    const { error } = await SB.from("finance_goals").insert({ label, target, current, added_via: "web" });
    if (error) { console.error(error); msg.textContent = "Couldn't add it. Try again."; return; }
    ["fg-label","fg-target","fg-current"].forEach((id) => (el(id).value = ""));
    msg.textContent = "";
    await drawGoals();
  }

  async function drawGoals() {
    const list = el("fin-goals");
    const { data, error } = await SB.from("finance_goals").select("*").order("created_at");
    if (error) { list.innerHTML = `<p class="r-status">Couldn't load goals.</p>`; return; }
    const goals = data || [];
    if (!goals.length) {
      list.innerHTML = `<div class="empty"><h2>No goals yet</h2><p>Add a savings goal above.</p></div>`;
      return;
    }
    const withPct = goals.map((g) => ({
      ...g,
      pct:  g.target > 0 ? Math.min(100, Math.round((Number(g.current)/Number(g.target))*100)) : 0,
      done: Number(g.current) >= Number(g.target),
    }));
    withPct.sort((a, b) => { if (a.done !== b.done) return a.done ? -1 : 1; return b.pct - a.pct; });
    list.innerHTML = "";
    withPct.forEach((g, i) => buildGoalCard(g, i + 1, list));
  }

  function buildGoalCard(g, rank, container) {
    const card = document.createElement("div");
    card.className = `r-card fin-goal-card${g.done ? " fin-goal-done" : ""}`;
    card.dataset.goalId = g.id;
    const remaining  = Math.max(0, Number(g.target) - Number(g.current));
    const updatedStr = g.updated_at
      ? new Date(g.updated_at).toLocaleDateString(undefined, { day:"numeric", month:"short", year:"numeric" })
      : "";
    card.innerHTML = `
      <div class="fin-goal-header">
        <span class="fin-goal-rank">#${rank}</span>
        <div class="fin-goal-title-block">
          <span class="fin-goal-label">${esc(g.label)}</span>
          ${g.done ? `<span class="fin-done-badge">Done</span>` : ""}
        </div>
        <span class="fin-goal-pct${g.done?" fin-pct-done":""}">${g.pct}%</span>
      </div>
      <div class="fin-progress-track">
        <div class="fin-progress-fill${g.done?" fin-fill-done":""}" style="width:${g.pct}%"></div>
      </div>
      <div class="fin-goal-meta">
        <span class="fin-goal-numbers">${fmtRM(g.current)} saved of ${fmtRM(g.target)}</span>
        ${!g.done
          ? `<span class="fin-goal-left">${fmtRM(remaining)} to go</span>`
          : `<span class="fin-goal-left fin-left-done">Target reached!</span>`}
      </div>
      ${updatedStr ? `<div class="fin-goal-updated">Last updated ${updatedStr}</div>` : ""}
      <div class="r-actions">
        ${!g.done ? `<button class="r-mini fin-add-btn">Add saved</button>` : ""}
        ${!g.done ? `<button class="r-mini fin-update-btn">Set total</button>` : ""}
        ${g.done ? `<button class="r-mini fin-charge-btn">Log as expense</button>` : ""}
        <button class="r-mini r-del fin-del-goal">Remove</button>
      </div>`;
    if (!g.done) {
      card.querySelector(".fin-add-btn").addEventListener("click", () => addToGoal(g, card));
      card.querySelector(".fin-update-btn").addEventListener("click", () => updateGoal(g, card));
    } else {
      const chargeBtn = card.querySelector(".fin-charge-btn");
      if (chargeBtn) chargeBtn.addEventListener("click", () => chargeGoal(g, card));
    }
    card.querySelector(".fin-del-goal").addEventListener("click", async () => {
      const lbl = g.done ? `Remove "${g.label}" from the board?` : `Remove "${g.label}"? Progress will be lost.`;
      if (!window.confirm(lbl)) return;
      const { error } = await SB.from("finance_goals").delete().eq("id", g.id);
      if (!error) drawGoals();
    });
    container.appendChild(card);
  }

  // Charge a REACHED goal as an expense for the current month (the actual purchase
  // finally happening). Defaults to the goal's target, then offers to clear the goal
  // off the board so it can't be charged twice.
  async function chargeGoal(goal, card) {
    const def = String(Number(goal.target || goal.current || 0));
    const raw = window.prompt(
      `Log "${goal.label}" as an expense this month.\nAmount (RM):`, def
    );
    if (raw === null) return;
    const amt = parseFloat(raw);
    if (isNaN(amt) || amt <= 0) { alert("Enter a valid amount."); return; }
    const { error } = await SB.from("finance_expenses").insert({
      amount: amt, category: goal.label, note: "Goal reached 🎉",
      logged_at: new Date().toISOString(), added_via: "goal",
    });
    if (error) { console.error(error); alert("Couldn't log the expense. Try again."); return; }
    if (window.confirm(`Logged ${fmtRM(amt)} as an expense this month.\nClear "${goal.label}" off the goals board now?`)) {
      await SB.from("finance_goals").delete().eq("id", goal.id);
    }
    await drawGoals();
  }

  // Explicit contribution: add an amount to the goal's saved total (predictable,
  // matches the Discord bot's "saved RM X towards ..." flow).
  async function addToGoal(goal, card) {
    const raw = window.prompt(
      `"${goal.label}" — how much did you just save toward it (RM)?\nCurrently at ${fmtRM(goal.current)} of ${fmtRM(goal.target)}.`
    );
    if (raw === null) return;
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) { alert("Enter a positive amount."); return; }
    const wasDone = Number(goal.current || 0) >= Number(goal.target);
    const newTotal = Number(goal.current || 0) + n;
    const { error } = await SB.from("finance_goals")
      .update({ current: newTotal, updated_at: new Date().toISOString() }).eq("id", goal.id);
    if (!error) {
      if (!wasDone && newTotal >= Number(goal.target) && window.dmicoCelebrate) window.dmicoCelebrate(card);
      drawGoals();
    }
  }

  // Manual override: set the absolute saved total directly.
  async function updateGoal(goal, card) {
    const raw = window.prompt(
      `"${goal.label}" — set the total saved (RM):\nCurrently at ${fmtRM(goal.current)} of ${fmtRM(goal.target)}.`
    );
    if (raw === null) return;
    const n = parseFloat(raw);
    if (isNaN(n) || n < 0) { alert("Enter a valid amount."); return; }
    const wasDone = Number(goal.current || 0) >= Number(goal.target);
    const { error } = await SB.from("finance_goals")
      .update({ current: n, updated_at: new Date().toISOString() }).eq("id", goal.id);
    if (!error) {
      if (!wasDone && n >= Number(goal.target) && window.dmicoCelebrate) window.dmicoCelebrate(card);
      drawGoals();
    }
  }

  // ════════════════════════════════════════════════════════════
  //  INVESTMENTS TAB
  // ════════════════════════════════════════════════════════════

  const escInv = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const INV_PALETTE = ["var(--accent)", "var(--lantern)", "#B08A2A", "var(--clay)", "var(--accent-deep)", "#6E8B7B", "#9C6B3F", "#7C6A4F"];

  async function renderInvestments() {
    const panel = el("fin-panel");
    panel.innerHTML = `
      <div class="r-form fin-addform">
        <div class="r-field"><label>Holding name</label><input id="iv-name" type="text" placeholder="e.g. ASM, Bitcoin, Maybank shares" /></div>
        <div class="r-row2">
          <div class="r-field"><label>Type</label><input id="iv-type" type="text" placeholder="e.g. Stocks, Crypto, Gold, Funds" /></div>
          <div class="r-field"><label>Amount invested (RM)</label><input id="iv-amount" type="number" min="0" step="0.01" placeholder="0.00" /></div>
        </div>
        <div class="r-row2">
          <div class="r-field"><label>Current value (RM) <span class="r-label-optional">(optional)</span></label><input id="iv-current" type="number" min="0" step="0.01" placeholder="0.00" /></div>
          <div class="r-field"><label>Notes <span class="r-label-optional">(optional)</span></label><input id="iv-notes" type="text" placeholder="optional" /></div>
        </div>
        <button id="iv-save" class="btn-primary r-btn">Add holding</button>
        <p id="iv-status" class="r-status"></p>
      </div>
      <div id="fin-inv-body"></div>`;
    el("iv-save").addEventListener("click", addInvestment);
    await drawInvestments();
  }

  async function addInvestment() {
    const msg = el("iv-status");
    const name = el("iv-name").value.trim();
    if (!name) { msg.textContent = "Name the holding."; return; }
    const currentRaw = el("iv-current").value.trim();
    const row = {
      name,
      type: el("iv-type").value.trim() || "Other",
      amount_invested: parseFloat(el("iv-amount").value) || 0,
      current_value: currentRaw === "" ? null : (parseFloat(currentRaw) || 0),
      notes: el("iv-notes").value.trim() || null,
      added_via: "web",
    };
    msg.textContent = "Adding…";
    const { error } = await SB.from("investments").insert(row);
    if (error) { console.error(error); msg.textContent = "Couldn't add it. Try again."; return; }
    ["iv-name", "iv-type", "iv-amount", "iv-current", "iv-notes"].forEach((id) => (el(id).value = ""));
    msg.textContent = "";
    await drawInvestments();
  }

  async function drawInvestments() {
    const body = el("fin-inv-body");
    const { data, error } = await SB.from("investments").select("*").order("created_at", { ascending: true });
    if (error) { console.error(error); body.innerHTML = `<p class="r-status">Couldn't load investments.</p>`; return; }
    const holdings = data || [];
    if (!holdings.length) {
      body.innerHTML = `<div class="empty"><h2>No investments yet</h2><p>Add a holding above. The donut shows where your money sits by type, and current values give you a gain/loss readout. Crypto tracked by the bot stays separate for now.</p></div>`;
      return;
    }

    const totalInvested = holdings.reduce((s, h) => s + Number(h.amount_invested || 0), 0);
    const totalCurrent  = holdings.reduce((s, h) => s + Number(h.current_value != null ? h.current_value : (h.amount_invested || 0)), 0);
    const hasAnyCurrent = holdings.some((h) => h.current_value != null);
    const gain = totalCurrent - totalInvested;
    const gainPct = totalInvested > 0 ? (gain / totalInvested) * 100 : 0;

    // Allocation by type (by amount invested).
    const byType = {};
    holdings.forEach((h) => {
      const t = (h.type || "Other").trim() || "Other";
      byType[t] = (byType[t] || 0) + Number(h.amount_invested || 0);
    });
    const slices = Object.entries(byType)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .map((s, i) => ({ ...s, color: INV_PALETTE[i % INV_PALETTE.length] }));

    const legend = slices.map((s) => {
      const pct = totalInvested > 0 ? Math.round((s.value / totalInvested) * 100) : 0;
      return `<div class="fin-inv-leg-row">
        <span class="fin-inv-swatch" style="background:${s.color}"></span>
        <span class="fin-inv-leg-label">${escInv(s.label)}</span>
        <span class="fin-inv-leg-val">${fmtRM(s.value)} · ${pct}%</span>
      </div>`;
    }).join("");

    const cards = holdings.map((h) => {
      const inv = Number(h.amount_invested || 0);
      const cur = h.current_value != null ? Number(h.current_value) : null;
      const g = cur != null ? cur - inv : null;
      const gp = (cur != null && inv > 0) ? (g / inv) * 100 : null;
      const gClass = g == null ? "" : (g > 0 ? "fin-inv-gain" : g < 0 ? "fin-inv-loss" : "");
      return `<div class="r-card fin-inv-card" data-id="${escInv(h.id)}">
        <div class="fin-inv-card-top">
          <div>
            <h3 class="r-title">${escInv(h.name)}</h3>
            <div class="r-meta">${escInv(h.type || "Other")}${h.notes ? `  ·  ${escInv(h.notes)}` : ""}</div>
          </div>
          <span class="r-chip">${fmtRM(inv)}</span>
        </div>
        <div class="fin-inv-card-figs">
          <span>Invested ${fmtRM(inv)}</span>
          ${cur != null
            ? `<span>Now ${fmtRM(cur)}</span><span class="${gClass}">${g >= 0 ? "+" : "−"}${fmtRM(Math.abs(g))}${gp != null ? ` (${gp >= 0 ? "+" : ""}${gp.toFixed(1)}%)` : ""}</span>`
            : `<span class="r-status">no current value set</span>`}
        </div>
        <div class="r-actions">
          <button class="r-mini iv-update">Update value</button>
          <button class="r-mini r-del iv-del">Remove</button>
        </div>
      </div>`;
    }).join("");

    const gainClass = gain > 0 ? "fin-inv-gain" : gain < 0 ? "fin-inv-loss" : "";
    body.innerHTML = `
      <div class="fin-inv-summary">
        <div class="fin-inv-sum-item"><span class="fin-inv-sum-label">Invested</span><span class="fin-inv-sum-val">${fmtRM(totalInvested)}</span></div>
        <div class="fin-inv-sum-item"><span class="fin-inv-sum-label">Current</span><span class="fin-inv-sum-val">${fmtRM(totalCurrent)}</span></div>
        <div class="fin-inv-sum-item"><span class="fin-inv-sum-label">Gain / Loss</span><span class="fin-inv-sum-val ${gainClass}">${hasAnyCurrent ? `${gain >= 0 ? "+" : "−"}${fmtRM(Math.abs(gain))} (${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}%)` : "—"}</span></div>
      </div>
      <div class="fin-inv-alloc">
        ${donutSVG(slices, totalInvested)}
        <div class="fin-inv-legend">${legend}</div>
      </div>
      <div class="fin-inv-list">${cards}</div>`;

    body.querySelectorAll(".iv-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".fin-inv-card");
        const id = card && card.dataset.id;
        if (!id || !window.confirm("Remove this holding?")) return;
        const { error } = await SB.from("investments").delete().eq("id", id);
        if (error) { console.error(error); return; }
        drawInvestments();
      });
    });
    body.querySelectorAll(".iv-update").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".fin-inv-card");
        const id = card && card.dataset.id;
        if (!id) return;
        const raw = window.prompt("Current value of this holding (RM):");
        if (raw === null) return;
        const n = parseFloat(raw);
        if (isNaN(n) || n < 0) { alert("Enter a valid number."); return; }
        const { error } = await SB.from("investments").update({ current_value: n }).eq("id", id);
        if (error) { console.error(error); return; }
        drawInvestments();
      });
    });
  }

  function donutSVG(slices, total) {
    const size = 168, stroke = 28, r = (size - stroke) / 2, cx = size / 2, cy = size / 2;
    const C = 2 * Math.PI * r;
    const sum = total || slices.reduce((s, x) => s + x.value, 0) || 1;
    let offset = 0;
    const segs = slices.map((s) => {
      const len = (s.value / sum) * C;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" />`;
      offset += len;
      return seg;
    }).join("");
    return `<svg class="fin-donut-svg" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}" opacity="0.35" />
      ${segs}
      <text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="10" fill="var(--ink-soft)">Total</text>
      <text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--ink)">${fmtRM(total)}</text>
    </svg>`;
  }

  // ════════════════════════════════════════════════════════════
  //  SUBSCRIPTIONS TAB (QoL Item 1) — kv finance_subscriptions
  // ════════════════════════════════════════════════════════════
  async function renderSubscriptions() {
    const panel = el("fin-panel");
    const rm = (n) => "RM " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    panel.innerHTML = `<p class="r-status">Loading…</p>`;
    const data = (await window.dmicoKvGet("finance_subscriptions")) || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const monthly = (it) => it.cycle === "yearly" ? Number(it.amount || 0) / 12 : Number(it.amount || 0);
    const committed = items.reduce((s, it) => s + monthly(it), 0);
    panel.innerHTML = `
      <style>
        .subs-head{font-size:1rem;margin:4px 0 12px;}
        .subs-head .subs-sub{font-size:0.8rem;opacity:0.6;}
        .sub-row{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:9px;background:rgba(127,127,127,0.06);margin-bottom:6px;}
        .sub-row .sub-n{flex:1;font-weight:600;}
        .sub-row .sub-a{font-variant-numeric:tabular-nums;}
        .sub-row .sub-next{font-size:0.74rem;opacity:0.6;}
        .sub-row .sub-del{background:transparent;border:none;color:inherit;opacity:0.5;cursor:pointer;}
        .subs-add{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}
        .subs-add input,.subs-add select{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;}
        .subs-add #sub-name{flex:1;min-width:130px;}
        .subs-add button{font:inherit;font-weight:600;padding:6px 14px;border-radius:8px;border:none;background:#5b8def;color:#fff;cursor:pointer;}
      </style>
      <div class="subs-head">Committed monthly: <b>${rm(committed)}</b><span class="subs-sub"> · ${rm(committed * 12)}/yr locked in</span></div>
      <div id="subs-list"></div>
      <div class="subs-add">
        <input id="sub-name" placeholder="Name (e.g. Claude)" maxlength="40" />
        <input id="sub-amt" type="number" step="0.01" placeholder="Amount" style="width:110px" />
        <select id="sub-cycle"><option value="monthly">/ month</option><option value="yearly">/ year</option></select>
        <input id="sub-next" type="date" title="Next charge (optional)" />
        <button id="sub-add">Add</button>
      </div>
      <p class="r-status" id="subs-msg" hidden></p>`;
    const listEl = el("subs-list");
    function renderList(its) {
      listEl.innerHTML = its.length ? its.map((it, i) =>
        `<div class="sub-row"><span class="sub-n">${esc(it.name)}</span><span class="sub-a">${rm(it.amount)} ${it.cycle === "yearly" ? "/yr" : "/mo"}</span>${it.next ? `<span class="sub-next">next ${esc(it.next)}</span>` : ""}<button class="sub-del" data-i="${i}" title="Remove">✕</button></div>`
      ).join("") : `<p class="r-status">No subscriptions yet. Add the recurring ones you can't touch.</p>`;
      listEl.querySelectorAll(".sub-del").forEach((b) => b.addEventListener("click", async () => {
        const d = (await window.dmicoKvGet("finance_subscriptions")) || { items: [] };
        d.items = Array.isArray(d.items) ? d.items : [];
        d.items.splice(+b.dataset.i, 1);
        await window.dmicoKvSet("finance_subscriptions", d);
        renderSubscriptions();
      }));
    }
    renderList(items);
    el("sub-add").addEventListener("click", async () => {
      const name = el("sub-name").value.trim();
      const amt = parseFloat(el("sub-amt").value);
      const msg = el("subs-msg");
      if (!name || !(amt > 0)) { msg.hidden = false; msg.textContent = "Need a name and an amount."; return; }
      const d = (await window.dmicoKvGet("finance_subscriptions")) || {};
      d.items = Array.isArray(d.items) ? d.items : [];
      d.items.push({ id: Date.now().toString(36), name, amount: amt, cycle: el("sub-cycle").value, next: el("sub-next").value || null });
      const ok = await window.dmicoKvSet("finance_subscriptions", d);
      if (ok) renderSubscriptions(); else { msg.hidden = false; msg.textContent = "Couldn't save — try again."; }
    });
  }

  // ════════════════════════════════════════════════════════════
  //  SAVINGS TAB — named savings pools, kv-backed (finance_savings).
  //  Where extra income lives as a running, drawable balance, kept
  //  separate from the month-to-month allowance budget.
  // ════════════════════════════════════════════════════════════
  async function renderSavings() {
    const panel = el("fin-panel");
    const rm = (n) => "RM " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    panel.innerHTML = `<p class="r-status">Loading…</p>`;
    const data = (await window.dmicoKvGet("finance_savings")) || {};
    const pools = Array.isArray(data.pools) ? data.pools : [];
    const bal = (p) => (p.history || []).reduce((s, h) => s + (h.type === "out" ? -Number(h.amount || 0) : Number(h.amount || 0)), 0);
    const total = pools.reduce((s, p) => s + bal(p), 0);
    const save = (next) => window.dmicoKvSet("finance_savings", { pools: next });

    panel.innerHTML = `
      <style>
        .sv-head{font-size:1rem;margin:4px 0 12px;}
        .sv-head b{font-variant-numeric:tabular-nums;}
        .sv-head .sv-sub{font-size:0.8rem;opacity:0.6;}
        .sv-pool{padding:12px 14px;border-radius:11px;background:rgba(127,127,127,0.06);margin-bottom:10px;}
        .sv-pool-top{display:flex;align-items:center;gap:10px;}
        .sv-pool-name{flex:1;font-weight:700;}
        .sv-pool-bal{font-variant-numeric:tabular-nums;font-weight:700;}
        .sv-x{background:transparent;border:none;color:inherit;opacity:0.45;cursor:pointer;font-size:1rem;}
        .sv-bar-track{height:6px;border-radius:4px;background:rgba(127,127,127,0.18);margin:8px 0 4px;overflow:hidden;}
        .sv-bar-fill{height:100%;background:#5aa36e;}
        .sv-target{font-size:0.74rem;opacity:0.65;}
        .sv-actions{display:flex;gap:6px;margin-top:8px;}
        .sv-actions button{font:inherit;font-size:0.82rem;padding:4px 10px;border-radius:7px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;cursor:pointer;}
        .sv-actions .sv-in{border-color:rgba(90,163,110,0.6);}
        .sv-hist{margin-top:8px;font-size:0.76rem;opacity:0.7;}
        .sv-hist-row{display:flex;justify-content:space-between;padding:2px 0;}
        .sv-add{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}
        .sv-add input{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;}
        .sv-add #sv-name{flex:1;min-width:140px;}
        .sv-add button{font:inherit;font-weight:600;padding:6px 14px;border-radius:8px;border:none;background:#5b8def;color:#fff;cursor:pointer;}
      </style>
      <div class="sv-head">Total saved: <b>${rm(total)}</b><span class="sv-sub"> · across ${pools.length} pool${pools.length === 1 ? "" : "s"}</span></div>
      <div id="sv-list"></div>
      <div class="sv-add">
        <input id="sv-name" placeholder="New pool (e.g. Emergency fund)" maxlength="40" />
        <input id="sv-target" type="number" step="0.01" placeholder="Target (optional)" style="width:150px" />
        <button id="sv-create">Create pool</button>
      </div>
      <p class="r-status" id="sv-msg" hidden></p>`;

    const listEl = el("sv-list");

    function draw() {
      if (!pools.length) {
        listEl.innerHTML = `<p class="r-status">No savings pools yet. Create one and feed it your extra income.</p>`;
        return;
      }
      listEl.innerHTML = pools.map((p, i) => {
        const b = bal(p);
        const tgt = Number(p.target || 0);
        const pct = tgt > 0 ? Math.min(100, Math.round((b / tgt) * 100)) : 0;
        const hist = (p.history || []).slice(-3).reverse().map((h) =>
          `<div class="sv-hist-row"><span>${h.type === "out" ? "−" : "+"}${rm(h.amount)}${h.note ? " · " + esc(h.note) : ""}</span><span>${esc((h.ts || "").slice(0, 10))}</span></div>`
        ).join("");
        return `
          <div class="sv-pool">
            <div class="sv-pool-top">
              <span class="sv-pool-name">${esc(p.name)}</span>
              <span class="sv-pool-bal">${rm(b)}</span>
              <button class="sv-x" data-del="${i}" title="Delete pool">✕</button>
            </div>
            ${tgt > 0 ? `<div class="sv-bar-track"><div class="sv-bar-fill" style="width:${pct}%"></div></div>
              <div class="sv-target">${pct}% of ${rm(tgt)}${b >= tgt ? " · reached 🎉" : " · " + rm(tgt - b) + " to go"}</div>` : ""}
            <div class="sv-actions">
              <button class="sv-in" data-in="${i}">+ Deposit</button>
              <button data-out="${i}">− Withdraw</button>
              <button data-tgt="${i}">Target</button>
            </div>
            ${hist ? `<div class="sv-hist">${hist}</div>` : ""}
          </div>`;
      }).join("");

      listEl.querySelectorAll("[data-in]").forEach((b) => b.addEventListener("click", () => move(+b.dataset.in, "in")));
      listEl.querySelectorAll("[data-out]").forEach((b) => b.addEventListener("click", () => move(+b.dataset.out, "out")));
      listEl.querySelectorAll("[data-tgt]").forEach((b) => b.addEventListener("click", () => setTarget(+b.dataset.tgt)));
      listEl.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => delPool(+b.dataset.del)));
    }

    async function move(i, type) {
      const p = pools[i];
      if (!p) return;
      const raw = window.prompt(`${type === "in" ? "Deposit to" : "Withdraw from"} "${p.name}" (RM):`);
      if (raw === null) return;
      const amt = parseFloat(raw);
      if (isNaN(amt) || amt <= 0) { alert("Enter a valid amount."); return; }
      if (type === "out" && amt > bal(p) + 1e-9 && !confirm("That's more than the pool holds. Withdraw anyway (balance goes negative)?")) return;
      const note = (window.prompt("Note (optional):") || "").trim();
      p.history = Array.isArray(p.history) ? p.history : [];
      p.history.push({ id: Date.now().toString(36), ts: new Date().toISOString(), type, amount: amt, note });
      await save(pools);
      renderSavings();
    }

    async function setTarget(i) {
      const p = pools[i];
      if (!p) return;
      const raw = window.prompt(`Target for "${p.name}" (RM, blank to clear):`, p.target || "");
      if (raw === null) return;
      if (raw.trim() === "") p.target = null;
      else { const n = parseFloat(raw); if (isNaN(n) || n < 0) { alert("Enter a valid amount."); return; } p.target = n; }
      await save(pools);
      renderSavings();
    }

    async function delPool(i) {
      const p = pools[i];
      if (!p) return;
      if (!confirm(`Delete "${p.name}"? Its ${rm(bal(p))} balance and history will be removed.`)) return;
      pools.splice(i, 1);
      await save(pools);
      renderSavings();
    }

    draw();
    el("sv-create").addEventListener("click", async () => {
      const name = el("sv-name").value.trim();
      const msg = el("sv-msg");
      if (!name) { msg.hidden = false; msg.textContent = "Give the pool a name."; return; }
      const tRaw = el("sv-target").value;
      const target = tRaw && parseFloat(tRaw) > 0 ? parseFloat(tRaw) : null;
      pools.push({ id: Date.now().toString(36), name, target, history: [] });
      const ok = await save(pools);
      if (ok) renderSavings();
      else { msg.hidden = false; msg.textContent = "Couldn't save — try again."; }
    });
  }

  // ════════════════════════════════════════════════════════════
  //  REVIEW TAB (QoL Item 2) — schedule cfg + latest review card
  // ════════════════════════════════════════════════════════════
  async function renderReview() {
    const panel = el("fin-panel");
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    panel.innerHTML = `<p class="r-status">Loading…</p>`;
    const cfg = (await window.dmicoKvGet("finance_review_cfg")) || {};
    const last = (await window.dmicoKvGet("finance_review_last")) || null;
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const recurring = cfg.mode === "recurring";
    panel.innerHTML = `
      <style>
        .fin-review h4{margin:6px 0 8px;font-size:0.95rem;}
        .fin-review label.rev-rec{display:flex;align-items:center;gap:8px;font-size:0.88rem;margin-bottom:10px;}
        .fin-review .rev-when select,.fin-review .rev-when input{font:inherit;padding:6px 8px;border-radius:8px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;}
        .fin-review .rev-actions{display:flex;gap:8px;margin-top:12px;}
        .fin-review button{font:inherit;font-weight:600;padding:7px 14px;border-radius:8px;border:none;background:#3aa675;color:#fff;cursor:pointer;}
        .fin-review button.ghost{background:transparent;border:1px solid rgba(127,127,127,0.35);color:inherit;}
        .fin-review .rev-last{font-size:0.85rem;padding:12px 14px;border-radius:10px;background:rgba(127,127,127,0.06);line-height:1.5;}
      </style>
      <div class="fin-review">
        <h4>When should the review run?</h4>
        <label class="rev-rec"><input type="checkbox" id="rev-recurring" ${recurring ? "checked" : ""}/> Recurring weekly</label>
        <div class="rev-when">
          <span id="rev-weekly" ${recurring ? "" : "hidden"}>
            <select id="rev-day">${days.map((d, i) => `<option value="${i}" ${String(cfg.day) === String(i) ? "selected" : ""}>${d}</option>`).join("")}</select>
            <input id="rev-time" type="time" value="${esc(cfg.time || "19:00")}" />
          </span>
          <span id="rev-once" ${recurring ? "hidden" : ""}>
            <input id="rev-at" type="datetime-local" value="${esc(cfg.runAt || "")}" />
          </span>
        </div>
        <div class="rev-actions"><button id="rev-save">Save schedule</button><button class="ghost" id="rev-run">Run now</button></div>
        <p class="r-status" id="rev-msg" hidden></p>
        <h4 style="margin-top:18px">Latest review</h4>
        <div class="rev-last" id="rev-last">${last && last.text ? esc(last.text).replace(/\n/g, "<br>") : `<span class="r-status">No review yet. Set a schedule or hit Run now.</span>`}</div>
      </div>`;
    const recChk = el("rev-recurring");
    recChk.addEventListener("change", () => { el("rev-weekly").hidden = !recChk.checked; el("rev-once").hidden = recChk.checked; });
    el("rev-save").addEventListener("click", async () => {
      const c = recChk.checked
        ? { mode: "recurring", enabled: true, day: +el("rev-day").value, time: el("rev-time").value }
        : { mode: "once", enabled: true, runAt: el("rev-at").value };
      const ok = await window.dmicoKvSet("finance_review_cfg", c);
      const m = el("rev-msg"); m.hidden = false; m.textContent = ok ? "Schedule saved." : "Couldn't save — try again.";
    });
    el("rev-run").addEventListener("click", async () => {
      const ok = await window.dmicoEnqueue({ type: "run_finance_review" });
      const m = el("rev-msg"); m.hidden = false;
      m.textContent = ok ? "Running… it'll post in Discord and update here within a minute." : "Couldn't queue — try again.";
    });
  }

  window.renderFinance = render;
})();
