/* ─────────────────────────────────────────────────────────────
   dmico life os — Exercise module
   Two tabs:
     Log   — weigh-ins with an SVG trend chart and recent list.
     Goal  — stats + goal, with a Mifflin-St Jeor calorie estimate built
             around a SUSTAINABLE rate and a healthy calorie floor. Framed
             as encouragement, and labelled as an estimate, not medical advice.
   Tables: weight_logs, exercise_profile
   ───────────────────────────────────────────────────────────── */

(function () {
  let SB = null;
  let root = null;

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const el = (id) => document.getElementById(id);
  const kg = (n) => `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
  const kcal = (n) => `${Math.round(n).toLocaleString()} kcal`;

  // Mifflin-St Jeor + sustainable-rate constants.
  const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  const ACTIVITY_LABEL = {
    sedentary: "Sedentary (little exercise)", light: "Light (1-3 days/week)",
    moderate: "Moderate (3-5 days/week)", active: "Active (6-7 days/week)",
    very_active: "Very active (hard daily / physical job)",
  };
  const KCAL_PER_KG = 7700;
  const RATE_LOSE = 0.5;   // kg/week, a sustainable cut
  const RATE_GAIN = 0.25;  // kg/week, lean gain
  const FLOOR = { male: 1500, female: 1200, other: 1400 };

  let profile = null;
  let logs = [];

  function render(container, sb) {
    SB = sb;
    root = container;
    root.innerHTML = `
      <div class="r-tabs" role="tablist">
        <button class="r-tab current" data-tab="log">Log</button>
        <button class="r-tab" data-tab="goal">Goal</button>
      </div>
      <div id="ex-panel"></div>`;
    root.querySelectorAll(".r-tab").forEach((t) =>
      t.addEventListener("click", () => {
        root.querySelectorAll(".r-tab").forEach((x) => x.classList.toggle("current", x === t));
        t.dataset.tab === "log" ? renderLog() : renderGoal();
      })
    );
    renderLog();
  }

  async function loadLogs() {
    const { data, error } = await SB.from("weight_logs").select("*").order("logged_at", { ascending: true });
    if (error) { console.error(error); logs = []; return; }
    logs = data || [];
  }
  async function loadProfile() {
    const { data } = await SB.from("exercise_profile").select("*").limit(1);
    profile = (data && data[0]) || null;
  }
  const latestWeight = () => (logs.length ? Number(logs[logs.length - 1].weight_kg) : null);

  // ════════════════════════════════════════════════════════════
  //  LOG TAB
  // ════════════════════════════════════════════════════════════

  async function renderLog() {
    const panel = el("ex-panel");
    panel.innerHTML = `
      <div class="r-form ex-addform">
        <div class="r-row2">
          <div class="r-field"><label>Weight (kg)</label><input id="ex-weight" type="number" min="0" step="0.1" placeholder="e.g. 68.5" /></div>
          <div class="r-field"><label>Time of day</label><select id="ex-period"><option value="AM">Morning (AM)</option><option value="PM">Night (PM)</option></select></div>
        </div>
        <div class="r-field"><label>Note <span class="r-label-optional">(optional)</span></label><input id="ex-note" type="text" placeholder="e.g. after gym" /></div>
        <button id="ex-save" class="btn-primary r-btn">Log weight</button>
        <p id="ex-status" class="r-status"></p>
      </div>
      <div id="ex-today"></div>
      <div id="ex-metab"></div>
      <div id="ex-chart"></div>
      <div id="ex-list"></div>`;
    if (el("ex-period")) el("ex-period").value = new Date().getHours() < 14 ? "AM" : "PM";
    el("ex-save").addEventListener("click", addWeight);
    await Promise.all([loadLogs(), loadProfile()]);
    drawTodayAMPM();
    drawMetabolism(latestWeight());
    drawChart();
    drawList();
  }

  function _todayStr() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function drawTodayAMPM() {
    const wrap = el("ex-today");
    if (!wrap) return;
    const today = _todayStr();
    const todays = logs.filter((l) => (l.logged_at || "").slice(0, 10) === today);
    const am = todays.filter((l) => l.period === "AM").slice(-1)[0];
    const pm = todays.filter((l) => l.period === "PM").slice(-1)[0];
    if (!am && !pm) { wrap.innerHTML = ""; return; }
    const delta = (am && pm) ? Number(pm.weight_kg) - Number(am.weight_kg) : null;
    wrap.innerHTML = `
      <div class="r-well">
        <div class="r-well-cell">
          <span class="r-micro">AM today</span>
          <div class="r-well-val">${am ? kg(am.weight_kg) : "—"}</div>
        </div>
        <div class="r-well-cell">
          <span class="r-micro">PM today</span>
          <div class="r-well-val">${pm ? kg(pm.weight_kg) : "—"}</div>
        </div>
        <div class="r-well-cell">
          <span class="r-micro">Shift</span>
          <div class="r-well-val">${delta === null ? "—" : (delta >= 0 ? "+" : "") + delta.toFixed(1) + " kg"}</div>
        </div>
      </div>
      ${delta !== null ? `<div class="r-hero-note">Normal daily water shift.</div>` : ""}`;
  }
  function drawMetabolism(current) {
    const wrap = el("ex-metab");
    if (!wrap) return;
    const plan = (current != null) ? computePlan(profile, current) : null;
    if (!plan) {
      wrap.innerHTML = `<p class="r-status">Add your height, age, sex and activity in the <b>Goal</b> tab to see your estimated metabolism.</p>`;
      return;
    }
    wrap.innerHTML = `
      <div class="r-well" style="grid-template-columns:repeat(2,1fr)">
        <div class="r-well-cell">
          <span class="r-micro">BMR at rest</span>
          <div class="r-well-val">${kcal(plan.bmr)}</div>
        </div>
        <div class="r-well-cell">
          <span class="r-micro">Metabolism (TDEE)</span>
          <div class="r-well-val">${kcal(plan.tdee)}</div>
        </div>
      </div>
      <div class="r-hero-note">An estimate from your stats (Mifflin-St Jeor). Your weight trend is the real check: holding steady means you're eating near this, drifting means above or below. Awareness, not a number to obsess over.</div>`;
  }

  async function addWeight() {
    const status = el("ex-status");
    const w = parseFloat(el("ex-weight").value);
    if (!w || w <= 0) { status.textContent = "Enter a valid weight."; return; }
    status.textContent = "Saving…";
    const period = el("ex-period") ? el("ex-period").value : null;
    const { error } = await SB.from("weight_logs").insert({ weight_kg: w, note: el("ex-note").value.trim() || null, period });
    if (error) { console.error(error); status.textContent = "Couldn't save. Try again."; return; }
    el("ex-weight").value = ""; el("ex-note").value = "";
    status.textContent = "";
    await loadLogs();
    drawTodayAMPM();
    drawMetabolism(latestWeight());
    drawChart();
    drawList();
    celebrateIfGoalReached(w);
  }

  // Fire a confetti burst when this weigh-in first reaches the goal weight.
  async function celebrateIfGoalReached(justLogged) {
    try {
      if (!window.dmicoCelebrate) return;
      if (!profile) await loadProfile();
      const goal = profile && profile.goal_weight_kg != null ? Number(profile.goal_weight_kg) : null;
      if (goal == null) return;
      const type = profile.goal_type || "lose";
      const reached = (v) =>
        type === "gain" ? v >= goal : type === "maintain" ? Math.abs(v - goal) <= 0.5 : v <= goal;
      const prev = logs.length >= 2 ? Number(logs[logs.length - 2].weight_kg) : null;
      if (reached(justLogged) && (prev == null || !reached(prev))) {
        window.dmicoCelebrate(el("ex-chart") || el("ex-save"));
      }
    } catch (e) { /* never let celebration break logging */ }
  }

  function drawChart() {
    const wrap = el("ex-chart");
    if (!logs.length) { wrap.innerHTML = ""; return; }
    const recent = logs.slice(-12);
    const vals = recent.map((l) => Number(l.weight_kg));
    const min = Math.min(...vals), max = Math.max(...vals);
    const pad = (max - min) * 0.15 || 1;
    const lo = min - pad, hi = max + pad;
    const W = 600, H = 180, padL = 40, padR = 16, padT = 16, padB = 28;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const x = (i) => padL + (recent.length === 1 ? plotW / 2 : (i / (recent.length - 1)) * plotW);
    const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * plotH;
    const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    const dots = vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="var(--accent-deep)"/>`).join("");
    const first = vals[0], last = vals[vals.length - 1];
    const trend = last < first ? "down" : last > first ? "up" : "flat";
    wrap.innerHTML = `
      <div class="ex-chart-head">
        <span class="ex-chart-now">${kg(last)}</span>
        <span class="ex-chart-trend ex-trend-${trend}">${trend === "down" ? "▼" : trend === "up" ? "▲" : "→"} ${kg(Math.abs(last - first))} over ${recent.length} logs</span>
      </div>
      <svg class="fin-chart-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        <text x="${padL - 6}" y="${y(hi) + 4}" font-size="9" fill="var(--ink-faint)" text-anchor="end">${hi.toFixed(1)}</text>
        <text x="${padL - 6}" y="${y(lo) + 4}" font-size="9" fill="var(--ink-faint)" text-anchor="end">${lo.toFixed(1)}</text>
        <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
      </svg>`;
  }

  const ICON_SCALE = `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18.5l5.5-6.5 4 3 6.5-8.5"></path><path d="M4 20.5h16"></path></svg>`;
  const DEL_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7.5h14"></path><path d="M9 7.5V5.4h6V7.5"></path><path d="M6.6 7.5 7.4 19h9.2l.8-11.5"></path></svg>`;

  function drawList() {
    const list = el("ex-list");
    if (!logs.length) {
      list.innerHTML = `
        <div class="r-empty2">
          <div class="r-empty2-icon">${ICON_SCALE}</div>
          <div class="r-empty2-title">No weigh-ins yet</div>
          <div class="r-empty2-body">Log your weight above. A trend line builds up as you go, and the Goal tab turns it into a calorie target.</div>
          <div class="r-empty2-actions"><button class="btn-primary r-btn" id="ex-empty-cta">Log your first weigh-in</button></div>
        </div>`;
      const cta = el("ex-empty-cta");
      if (cta) cta.addEventListener("click", () => { const w = el("ex-weight"); if (w) w.focus(); });
      return;
    }
    const recent = [...logs].reverse().slice(0, 14);
    const rows = recent.map((l) => {
      const d = new Date(l.logged_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      return `
        <div class="r-row" data-id="${esc(l.id)}">
          <div class="r-row-main">
            <div class="r-micro">${l.period ? esc(l.period) : "—"}</div>
            <div class="r-row-content">${l.note ? esc(l.note) : "—"}</div>
          </div>
          <div class="r-row-side">
            <div class="r-row-amt">${kg(l.weight_kg)}</div>
            <div class="r-row-date">${esc(d)}</div>
          </div>
          <button class="r-row-del ex-del" title="Remove" aria-label="Remove this weigh-in">${DEL_ICON_SVG}</button>
        </div>`;
    }).join("");
    list.innerHTML = `<div class="r-row-list">${rows}</div>`;
    list.querySelectorAll(".ex-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest(".r-row");
        if (!row || !window.confirm("Remove this weigh-in?")) return;
        const { error } = await SB.from("weight_logs").delete().eq("id", row.dataset.id);
        if (error) { console.error(error); return; }
        await loadLogs(); drawChart(); drawList();
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  //  GOAL TAB
  // ════════════════════════════════════════════════════════════

  function computePlan(p, current) {
    if (!p || !current || !p.height_cm || !p.age || !p.sex || !p.goal_weight_kg) return null;
    const act = ACTIVITY[p.activity] || 1.2;
    const s = p.sex === "male" ? 5 : p.sex === "female" ? -161 : -78;
    const bmr = 10 * current + 6.25 * Number(p.height_cm) - 5 * Number(p.age) + s;
    const tdee = bmr * act;
    const delta = Number(p.goal_weight_kg) - current; // negative = lose
    const goalType = p.goal_type || (delta < -0.1 ? "lose" : delta > 0.1 ? "gain" : "maintain");

    let target = tdee, weeks = 0, dailyDelta = 0, direction = "maintain";
    if (goalType === "lose" && delta < -0.1) {
      dailyDelta = -(RATE_LOSE * KCAL_PER_KG / 7);
      target = tdee + dailyDelta;
      weeks = Math.ceil(Math.abs(delta) / RATE_LOSE);
      direction = "lose";
    } else if (goalType === "gain" && delta > 0.1) {
      dailyDelta = (RATE_GAIN * KCAL_PER_KG / 7);
      target = tdee + dailyDelta;
      weeks = Math.ceil(delta / RATE_GAIN);
      direction = "gain";
    }

    const floor = FLOOR[p.sex] || FLOOR.other;
    let floored = false;
    if (target < floor) { target = floor; floored = true; }

    const finish = weeks > 0 ? new Date(Date.now() + weeks * 7 * 86400000) : null;
    return { bmr, tdee, target, weeks, delta, direction, floored, floor, finish, rate: direction === "lose" ? RATE_LOSE : direction === "gain" ? RATE_GAIN : 0 };
  }

  async function renderGoal() {
    const panel = el("ex-panel");
    panel.innerHTML = `<p class="r-status">Loading…</p>`;
    await Promise.all([loadProfile(), loadLogs()]);
    const p = profile || {};
    const current = latestWeight();
    const opt = (v, cur, label) => `<option value="${v}" ${v === cur ? "selected" : ""}>${label}</option>`;

    panel.innerHTML = `
      <div class="r-form ex-goalform">
        <div class="r-row2">
          <div class="r-field"><label>Height (cm)</label><input id="g-height" type="number" min="0" step="0.5" value="${p.height_cm ?? ""}" placeholder="e.g. 172" /></div>
          <div class="r-field"><label>Age</label><input id="g-age" type="number" min="0" value="${p.age ?? ""}" placeholder="e.g. 23" /></div>
        </div>
        <div class="r-row2">
          <div class="r-field"><label>Sex</label><select id="g-sex">
            ${opt("male", p.sex, "Male")}${opt("female", p.sex, "Female")}${opt("other", p.sex, "Prefer not to say")}
          </select></div>
          <div class="r-field"><label>Activity</label><select id="g-activity">
            ${Object.keys(ACTIVITY).map((k) => opt(k, p.activity, ACTIVITY_LABEL[k])).join("")}
          </select></div>
        </div>
        <div class="r-row2">
          <div class="r-field"><label>Goal weight (kg)</label><input id="g-goal" type="number" min="0" step="0.1" value="${p.goal_weight_kg ?? ""}" placeholder="e.g. 65" /></div>
          <div class="r-field"><label>Goal</label><select id="g-type">
            ${opt("lose", p.goal_type, "Lose fat")}${opt("maintain", p.goal_type, "Maintain")}${opt("gain", p.goal_type, "Gain (lean)")}
          </select></div>
        </div>
        <button id="g-save" class="btn-primary r-btn">Save goal</button>
        <p id="g-status" class="r-status"></p>
      </div>
      <div id="ex-plan"></div>`;
    el("g-save").addEventListener("click", saveProfile);
    drawPlan(current);
  }

  function drawPlan(current) {
    const wrap = el("ex-plan");
    if (current == null) {
      wrap.innerHTML = `<div class="ex-plan-note">Log a weight in the Log tab first, then your calorie plan appears here.</div>`;
      return;
    }
    const plan = computePlan(profile, current);
    if (!plan) {
      wrap.innerHTML = `<div class="ex-plan-note">Fill in your height, age, sex, and goal weight above to see a calorie estimate.</div>`;
      return;
    }
    const dirWord = plan.direction === "lose" ? "lose" : plan.direction === "gain" ? "gain" : "maintain";
    const headline = plan.direction === "maintain"
      ? `You're at maintenance. Eat around <strong>${kcal(plan.target)}</strong> a day to hold steady.`
      : `To ${dirWord} toward <strong>${kg(profile.goal_weight_kg)}</strong> at a sustainable ${plan.rate} kg/week, aim for about <strong>${kcal(plan.target)}</strong> a day.`;
    const eta = plan.finish
      ? `Realistic target: around <strong>${plan.finish.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</strong> (~${plan.weeks} weeks).`
      : "";
    wrap.innerHTML = `
      <div class="ex-plan-card">
        <p class="ex-plan-headline">${headline}</p>
        ${eta ? `<p class="ex-plan-eta">${eta}</p>` : ""}
        <div class="ex-plan-stats">
          <div><span class="ex-plan-k">Maintenance</span><span class="ex-plan-v">${kcal(plan.tdee)}/day</span></div>
          <div><span class="ex-plan-k">Daily target</span><span class="ex-plan-v">${kcal(plan.target)}</span></div>
          <div><span class="ex-plan-k">Now → goal</span><span class="ex-plan-v">${kg(current)} → ${kg(profile.goal_weight_kg)}</span></div>
        </div>
        ${plan.floored ? `<p class="ex-plan-floor">Kept at a safe minimum of ${kcal(plan.floor)}/day, so this will be a gentler, slower pace than a steeper cut. That is the healthy call.</p>` : ""}
        <p class="ex-plan-disclaimer">A friendly estimate to guide you, not medical advice. Go at a pace that feels sustainable, and check with a professional for anything bigger.</p>
      </div>`;
  }

  async function saveProfile() {
    const status = el("g-status");
    const patch = {
      height_cm: parseFloat(el("g-height").value) || null,
      age: parseInt(el("g-age").value, 10) || null,
      sex: el("g-sex").value,
      activity: el("g-activity").value,
      goal_weight_kg: parseFloat(el("g-goal").value) || null,
      goal_type: el("g-type").value,
      updated_at: new Date().toISOString(),
    };
    status.textContent = "Saving…";
    let error;
    if (profile && profile.id) {
      ({ error } = await SB.from("exercise_profile").update(patch).eq("id", profile.id));
    } else {
      const res = await SB.from("exercise_profile").insert(patch).select().limit(1);
      error = res.error;
      if (res.data && res.data[0]) profile = res.data[0];
    }
    if (error) { console.error(error); status.textContent = "Couldn't save. Try again."; return; }
    profile = { ...(profile || {}), ...patch };
    status.textContent = "";
    drawPlan(latestWeight());
  }

  window.renderExercise = render;
})();
