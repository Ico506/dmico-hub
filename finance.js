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
      <div class="r-tabs" role="tablist">
        <button class="r-tab current" data-tab="overview">Overview</button>
        <button class="r-tab" data-tab="expenses">Expenses</button>
        <button class="r-tab" data-tab="goals">Goals</button>
      </div>
      <div id="fin-panel"></div>`;
    root.querySelectorAll(".r-tab").forEach((t) =>
      t.addEventListener("click", () => {
        root.querySelectorAll(".r-tab").forEach((x) =>
          x.classList.toggle("current", x === t)
        );
        if (t.dataset.tab === "overview") renderOverview();
        else if (t.dataset.tab === "expenses") renderExpenses();
        else renderGoals();
      })
    );
    renderOverview();
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
    const [settings, thisMonthIncomeRes, allIncomeRes, expenseRes, goalsRes] = await Promise.all([
      loadSettings(),
      SB.from("finance_income").select("*").eq("year", thisYear).eq("month", thisMonth).limit(1),
      SB.from("finance_income").select("*")
        .or(`year.gt.${windowMonths[0].year},and(year.eq.${windowMonths[0].year},month.gte.${windowMonths[0].month})`)
        .order("year").order("month"),
      SB.from("finance_expenses").select("amount, logged_at")
        .gte("logged_at", windowStart).lt("logged_at", windowEnd),
      SB.from("finance_goals").select("*"),
    ]);

    const thisMonthIncome = thisMonthIncomeRes.data?.[0] ?? null;
    const allIncome       = allIncomeRes.data || [];
    const allExpenses     = expenseRes.data   || [];
    const goals           = goalsRes.data     || [];

    // Per-month net savings across the 6-month window.
    const monthlySavings = windowMonths.map(({ year, month }) => {
      const inc = allIncome.find((r) => r.year === year && r.month === month);
      const exp = allExpenses
        .filter((e) => {
          const d = new Date(e.logged_at);
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .reduce((s, e) => s + Number(e.amount), 0);
      return {
        year, month,
        income:   inc ? Number(inc.amount) : 0,
        expenses: exp,
        net:      inc ? Number(inc.amount) - exp : null, // null = income not logged
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
    const income       = thisMonthIncome ? Number(thisMonthIncome.amount) : 0;
    const thisMonthExp = monthlySavings.find(
      (m) => m.year === thisYear && m.month === thisMonth
    )?.expenses ?? 0;
    const savings = income - thisMonthExp;
    const budget  = getBudget();

    // Render shell.
    panel.innerHTML = `
      <div id="fin-ov-income-section" class="fin-ov-section"></div>

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
    draw503020(el("fin-ov-rule-section"), income, thisMonthExp, savings);
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

  // ── 50/30/20 panel ─────────────────────────────────────────
  function draw503020(section, income, spent, savings) {
    const noIncome    = income <= 0;
    const needsTarget = income * 0.50;
    const wantsTarget = income * 0.30;
    const saveTarget  = income * 0.20;
    const spendBudget = income * 0.80;

    const spendPct  = spendBudget > 0 ? Math.min(120, Math.round((spent  / spendBudget) * 100)) : 0;
    const savePct   = saveTarget  > 0 ? Math.min(120, Math.round((savings / saveTarget)  * 100)) : 0;
    const spendOver = spent    > spendBudget;
    const saveNeg   = savings  < 0;
    const saveMet   = !saveNeg && savePct >= 100;

    section.innerHTML = `
      <div class="fin-ov-section-head">
        <span class="fin-ov-section-label">50 / 30 / 20 Budget Rule</span>
        ${noIncome ? `<span class="fin-ov-section-note">Log allowance above to see targets</span>` : ""}
      </div>
      ${noIncome ? `<p class="fin-ov-rule-empty">Targets will appear once you log this month's allowance.</p>` : `
      <div class="fin-ov-rule-grid">

        <div class="fin-ov-rule-targets">
          <div class="fin-ov-rule-target-item">
            <span class="fin-ov-rule-bucket">Needs</span>
            <span class="fin-ov-rule-bucket-pct">50%</span>
            <span class="fin-ov-rule-bucket-amt">${fmtRM(needsTarget)}</span>
          </div>
          <div class="fin-ov-rule-target-item">
            <span class="fin-ov-rule-bucket">Wants</span>
            <span class="fin-ov-rule-bucket-pct">30%</span>
            <span class="fin-ov-rule-bucket-amt">${fmtRM(wantsTarget)}</span>
          </div>
          <p class="fin-ov-rule-note">Tag expense categories as needs/wants for a full split — for now, total spending is shown against the 80% limit.</p>
        </div>

        <div class="fin-ov-rule-bar-block">
          <div class="fin-ov-rule-bar-head">
            <span>Total spending vs 80% limit (${fmtRM(spendBudget)})</span>
            <span class="${spendOver ? "fin-ov-over-text" : ""}">${fmtRM(spent)}</span>
          </div>
          <div class="fin-ov-bar-track">
            <div class="fin-ov-bar-fill ${spendOver ? "fin-ov-bar-over" : "fin-ov-bar-spend"}"
                 style="width:${Math.min(100, spendPct)}%"></div>
          </div>
          <div class="fin-ov-bar-meta">
            ${spendOver
              ? `<span class="fin-ov-over-text">Over by ${fmtRM(spent - spendBudget)}</span>`
              : `<span>${fmtRM(spendBudget - spent)} remaining</span>`}
          </div>
        </div>

        <div class="fin-ov-rule-bar-block fin-ov-rule-save-block">
          <div class="fin-ov-rule-bar-head">
            <span>Save / Invest — 20% target (${fmtRM(saveTarget)})</span>
            <span class="${saveNeg ? "fin-ov-over-text" : saveMet ? "fin-ov-saved-text" : ""}">
              ${saveNeg ? `−${fmtRM(Math.abs(savings))} deficit` : fmtRM(savings)}
            </span>
          </div>
          <div class="fin-ov-bar-track">
            <div class="fin-ov-bar-fill ${saveNeg ? "fin-ov-bar-over" : saveMet ? "fin-ov-bar-saved" : "fin-ov-bar-save"}"
                 style="width:${saveNeg ? 0 : Math.min(100, savePct)}%"></div>
          </div>
          <div class="fin-ov-bar-meta">
            ${saveNeg
              ? `<span class="fin-ov-over-text">Overspent this month</span>`
              : saveMet
              ? `<span class="fin-ov-saved-text">Target met!</span>`
              : `<span>${fmtRM(saveTarget - savings)} short of target</span>`}
          </div>
        </div>

      </div>`}`;
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
        ${!g.done ? `<button class="r-mini fin-update-btn">Update progress</button>` : ""}
        <button class="r-mini r-del fin-del-goal">Remove</button>
      </div>`;
    if (!g.done) {
      card.querySelector(".fin-update-btn").addEventListener("click", () => updateGoal(g, card));
    }
    card.querySelector(".fin-del-goal").addEventListener("click", async () => {
      const lbl = g.done ? `Remove "${g.label}" from the board?` : `Remove "${g.label}"? Progress will be lost.`;
      if (!window.confirm(lbl)) return;
      const { error } = await SB.from("finance_goals").delete().eq("id", g.id);
      if (!error) drawGoals();
    });
    container.appendChild(card);
  }

  async function updateGoal(goal, card) {
    const raw = window.prompt(
      `"${goal.label}" — enter new total saved (RM):\nCurrently at ${fmtRM(goal.current)} of ${fmtRM(goal.target)}.`
    );
    if (raw === null) return;
    const n = parseFloat(raw);
    if (isNaN(n) || n < 0) { alert("Enter a valid amount."); return; }
    const { error } = await SB.from("finance_goals")
      .update({ current: n, updated_at: new Date().toISOString() }).eq("id", goal.id);
    if (!error) drawGoals();
  }

  window.renderFinance = render;
})();
