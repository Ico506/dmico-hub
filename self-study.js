/* ─────────────────────────────────────────────────────────────
   dmico life os — Self-study module (v3)
   Two halves:
     Plan  — track upcoming exams with a live countdown, plus a
             Gemini-powered spaced-repetition study-plan generator.
             Sessions in a generated plan can be ticked off as done.
     Focus — a work/break countdown timer with ratio presets + custom.
   ───────────────────────────────────────────────────────────── */

(function () {
  let SB = null;
  let root = null;

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const el = (id) => document.getElementById(id);

  // ── countdown helpers ──────────────────────────────────────
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + "T00:00:00");
    return Math.round((d - today) / 86400000);
  }
  function countdownLabel(dateStr) {
    const n = daysUntil(dateStr);
    if (n === null) return "no date set";
    if (n > 1) return `in ${n} days`;
    if (n === 1) return "tomorrow";
    if (n === 0) return "today";
    return `${-n} day${n === -1 ? "" : "s"} ago`;
  }

  // ── layout ─────────────────────────────────────────────────
  function render(container, sb) {
    SB = sb;
    root = container;
    root.innerHTML = `
      <div class="r-tabs" role="tablist">
        <button class="r-tab current" data-tab="plan">Plan</button>
        <button class="r-tab" data-tab="focus">Focus</button>
      </div>
      <div id="s-panel"></div>`;
    root.querySelectorAll(".r-tab").forEach((t) =>
      t.addEventListener("click", () => {
        root.querySelectorAll(".r-tab").forEach((x) => x.classList.toggle("current", x === t));
        t.dataset.tab === "plan" ? renderPlan() : renderFocus();
      })
    );
    renderPlan();
  }

  // ── Plan tab ───────────────────────────────────────────────
  async function renderPlan() {
    const panel = el("s-panel");
    panel.innerHTML = `
      <div class="r-form s-addexam">
        <div class="r-field"><label>What's the exam or deadline?</label><input id="e-title" type="text" placeholder="e.g. Research Methods midterm" /></div>
        <div class="r-row2">
          <div class="r-field"><label>Date</label><input id="e-date" type="date" /></div>
          <div class="r-field"><label>Study hours you can give per day</label><input id="e-hours" type="number" min="0" step="0.5" placeholder="2" /></div>
        </div>
        <div class="r-field">
          <label>Topics to cover <span class="r-label-optional">(comma-separated — each becomes a study session)</span></label>
          <input id="e-topics" type="text" placeholder="Chapter 1, Chapter 2, Chapter 3, validity, thematic analysis" />
        </div>
        <button id="e-save" class="btn-primary r-btn">Add exam</button>
        <p id="e-status" class="r-status"></p>
      </div>
      <div id="s-exams" class="r-list"></div>`;

    el("e-save").addEventListener("click", addExam);
    await drawExams();
  }

  async function addExam() {
    const status = el("e-status");
    const title = el("e-title").value.trim();
    if (!title) { status.textContent = "Give it a name first."; return; }
    const row = {
      title,
      exam_date:     el("e-date").value || null,
      hours_per_day: parseFloat(el("e-hours").value) || null,
      topics:        el("e-topics").value.trim() || null,
      added_via:     "web",
    };
    status.textContent = "Adding…";
    const { error } = await SB.from("study_exams").insert(row);
    if (error) { console.error(error); status.textContent = "Couldn't add it. Try again."; return; }
    ["e-title", "e-date", "e-hours", "e-topics"].forEach((id) => (el(id).value = ""));
    status.textContent = "";
    await drawExams();
  }

  async function drawExams() {
    const list = el("s-exams");
    const { data, error } = await SB.from("study_exams").select("*").order("exam_date", { ascending: true });
    if (error) { console.error(error); list.innerHTML = `<p class="r-status">Couldn't load your exams.</p>`; return; }
    const exams = data || [];
    if (!exams.length) {
      list.innerHTML = `<div class="empty"><h2>No exams yet</h2><p>Add one above and it shows up here with a live countdown. Hit "Generate plan" to get a spaced-repetition schedule. Enter topics comma-separated so each one becomes its own study session.</p></div>`;
      return;
    }
    list.innerHTML = "";
    exams.forEach((x) => buildExamCard(x, list));
  }

  function buildExamCard(x, container) {
    const n = daysUntil(x.exam_date);
    const urgency = n === null ? "" : n < 0 ? "past" : n <= 7 ? "soon" : "ok";
    const hasPlan = x.plan && x.plan.sessions && x.plan.sessions.length > 0;

    const card = document.createElement("div");
    card.className = "r-card";
    card.dataset.examId = x.id;

    card.innerHTML = `
      <div class="s-exam-top">
        <h3 class="r-title">${esc(x.title)}</h3>
        <span class="s-count ${urgency}">${countdownLabel(x.exam_date)}</span>
      </div>
      <div class="r-meta">${x.exam_date ? esc(x.exam_date) : "no date"}${x.hours_per_day ? `  &middot;  ${x.hours_per_day}h/day` : ""}</div>
      ${x.topics ? `<p class="r-abstract">${esc(x.topics)}</p>` : ""}
      <div class="s-plan-area">${hasPlan ? renderPlanHTML(x.plan) : ""}</div>
      <div class="r-actions">
        <button class="r-mini s-gen-btn">${hasPlan ? "Regenerate plan" : "Generate plan"}</button>
        <button class="r-mini r-del">Remove</button>
      </div>`;

    if (hasPlan) {
      attachSessionListeners(card.querySelector(".s-plan-area"), x.id, x.plan);
    }

    card.querySelector(".s-gen-btn").addEventListener("click", () => generatePlan(x, card));
    card.querySelector(".r-del").addEventListener("click", async () => {
      if (!window.confirm(`Remove "${x.title}"?`)) return;
      const { error } = await SB.from("study_exams").delete().eq("id", x.id);
      if (error) { console.error(error); alert("Couldn't remove it."); return; }
      drawExams();
    });

    container.appendChild(card);
  }

  // ── Study plan generation ──────────────────────────────────
  async function generatePlan(exam, card) {
    const btn  = card.querySelector(".s-gen-btn");
    const area = card.querySelector(".s-plan-area");

    btn.disabled = true;
    btn.textContent = "Generating…";
    area.innerHTML = `<p class="r-status s-plan-thinking">Asking Gemini to map out your schedule…</p>`;

    const { data, error } = await SB.functions.invoke("study-plan", {
      body: {
        title:         exam.title,
        exam_date:     exam.exam_date,
        hours_per_day: exam.hours_per_day,
        topics:        exam.topics,
      },
    });

    if (error || (data && data.error)) {
      const msg = (data && data.error) ? data.error : String(error);
      console.error("study-plan error:", msg);
      area.innerHTML = `<p class="r-status" style="color:var(--clay)">Plan generation failed. ${esc(msg)}</p>`;
      btn.disabled = false;
      btn.textContent = "Try again";
      return;
    }

    // Persist to Supabase.
    const { error: writeErr } = await SB.from("study_exams")
      .update({ plan: data })
      .eq("id", exam.id);
    if (writeErr) console.warn("Couldn't save plan to Supabase:", writeErr);

    // Update local reference so session listeners can write back.
    exam.plan = data;

    area.innerHTML = renderPlanHTML(data);
    attachSessionListeners(area, exam.id, data);
    btn.disabled = false;
    btn.textContent = "Regenerate plan";
  }

  // ── Plan HTML renderer ─────────────────────────────────────
  function renderPlanHTML(plan) {
    if (!plan) return "";
    const sessions = Array.isArray(plan.sessions) ? plan.sessions : [];
    if (!sessions.length) return "";

    const rows = sessions.map((s, i) => {
      const typeClass = `s-type-${esc(s.type || "learn")}`;
      const done = !!s.done;
      return `
        <div class="s-session${done ? " s-session-done" : ""}" data-idx="${i}">
          <label class="s-session-check-label" title="${done ? "Mark undone" : "Mark done"}">
            <input type="checkbox" class="s-session-check" data-idx="${i}" ${done ? "checked" : ""} />
          </label>
          <span class="s-session-label">${esc(s.label || "")}</span>
          <div class="s-session-body">
            <strong>${esc(s.topic || "")}</strong>${s.task ? ` &mdash; ${esc(s.task)}` : ""}
          </div>
          <span class="r-chip s-session-type ${typeClass}">${esc(s.type || "learn")}</span>
          <span class="s-session-hrs">${s.hours != null ? `${s.hours}h` : ""}</span>
        </div>`;
    }).join("");

    const doneSessions = sessions.filter((s) => s.done).length;
    const total = sessions.length;
    const allDone = doneSessions === total;

    const genDate = plan.generated_at
      ? new Date(plan.generated_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : null;
    const model = plan.generated_model || null;

    return `
      <div class="s-plan">
        ${plan.summary ? `<p class="s-plan-summary">${esc(plan.summary)}</p>` : ""}
        <div class="s-plan-progress">
          <div class="s-plan-progress-fill" style="width:${total > 0 ? Math.round((doneSessions / total) * 100) : 0}%"></div>
        </div>
        <p class="s-plan-prog-label">${doneSessions} of ${total} session${total === 1 ? "" : "s"} done${allDone ? " — ready!" : ""}</p>
        <div class="s-plan-sessions">${rows}</div>
        ${genDate ? `<p class="s-plan-meta">Generated ${genDate}${model ? ` via ${esc(model)}` : ""}</p>` : ""}
      </div>`;
  }

  // ── Session tick listeners ─────────────────────────────────
  function attachSessionListeners(area, examId, plan) {
    area.querySelectorAll(".s-session-check").forEach((cb) => {
      cb.addEventListener("change", async () => {
        const idx = parseInt(cb.dataset.idx, 10);
        if (!plan.sessions || !plan.sessions[idx]) return;
        plan.sessions[idx].done = cb.checked;

        // Update visual state of the session row.
        const row = cb.closest(".s-session");
        if (row) row.classList.toggle("s-session-done", cb.checked);

        // Update progress bar and label.
        const planEl = area.querySelector(".s-plan");
        if (planEl) {
          const total = plan.sessions.length;
          const done  = plan.sessions.filter((s) => s.done).length;
          const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
          const fill  = planEl.querySelector(".s-plan-progress-fill");
          const label = planEl.querySelector(".s-plan-prog-label");
          if (fill)  fill.style.width = `${pct}%`;
          if (label) label.textContent = `${done} of ${total} session${total === 1 ? "" : "s"} done${done === total ? " — ready!" : ""}`;
        }

        // Write back to Supabase.
        const { error } = await SB.from("study_exams").update({ plan }).eq("id", examId);
        if (error) console.warn("Couldn't save session state:", error);
      });
    });
  }

  // ── Focus tab ──────────────────────────────────────────────
  const PRESETS = [
    { label: "Classic 25 / 5",  work: 25, brk: 5  },
    { label: "Deep 50 / 10",    work: 50, brk: 10 },
    { label: "Long 90 / 20",    work: 90, brk: 20 },
  ];
  let timer = { work: 25, brk: 5, phase: "focus", remaining: 25 * 60, running: false, id: null, sessions: 0 };

  function fmt(s) {
    const m = Math.floor(s / 60), ss = s % 60;
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  function beep() {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      const o = a.createOscillator(), g = a.createGain();
      o.connect(g); g.connect(a.destination);
      o.frequency.value = 660; g.gain.value = 0.08;
      o.start(); setTimeout(() => { o.stop(); a.close(); }, 250);
    } catch (e) { /* audio blocked, no problem */ }
  }

  function paintTimer() {
    const disp = el("s-time");
    if (!disp) return;
    disp.textContent = fmt(timer.remaining);
    el("s-phase").textContent = timer.phase === "focus" ? "Focus" : "Break";
    el("s-phase").className = "s-phase " + timer.phase;
    el("s-start").textContent = timer.running ? "Pause" : "Start";
    el("s-sessions").textContent = `${timer.sessions} focus block${timer.sessions === 1 ? "" : "s"} done`;
  }

  function tick() {
    timer.remaining -= 1;
    if (timer.remaining < 0) {
      beep();
      if (timer.phase === "focus") { timer.sessions += 1; timer.phase = "break"; timer.remaining = timer.brk * 60; }
      else { timer.phase = "focus"; timer.remaining = timer.work * 60; }
    }
    paintTimer();
  }
  function startPause() {
    timer.running = !timer.running;
    if (timer.running) { timer.id = setInterval(tick, 1000); }
    else { clearInterval(timer.id); timer.id = null; }
    paintTimer();
  }
  function reset() {
    clearInterval(timer.id); timer.id = null; timer.running = false;
    timer.phase = "focus"; timer.remaining = timer.work * 60;
    paintTimer();
  }
  function applyRatio(work, brk) {
    clearInterval(timer.id); timer.id = null; timer.running = false;
    timer.work = work; timer.brk = brk; timer.phase = "focus"; timer.remaining = work * 60;
    paintTimer();
  }

  function renderFocus() {
    const panel = el("s-panel");
    panel.innerHTML = `
      <div class="s-presets">
        ${PRESETS.map((p, i) => `<button class="r-chip s-preset" data-i="${i}">${p.label}</button>`).join("")}
      </div>
      <div class="s-custom">
        <span>Custom</span>
        <input id="s-cw" type="number" min="1" value="${timer.work}" /> <span>min work</span>
        <input id="s-cb" type="number" min="1" value="${timer.brk}" /> <span>min break</span>
        <button id="s-apply" class="r-mini">Apply</button>
      </div>
      <div class="s-clock">
        <div id="s-phase" class="s-phase ${timer.phase}">${timer.phase === "focus" ? "Focus" : "Break"}</div>
        <div id="s-time" class="s-time">${fmt(timer.remaining)}</div>
        <div class="s-controls">
          <button id="s-start" class="btn-primary r-btn">${timer.running ? "Pause" : "Start"}</button>
          <button id="s-reset" class="btn-ghost r-btn">Reset</button>
        </div>
        <p id="s-sessions" class="r-status">${timer.sessions} focus block${timer.sessions === 1 ? "" : "s"} done</p>
      </div>`;

    panel.querySelectorAll(".s-preset").forEach((b) =>
      b.addEventListener("click", () => { const p = PRESETS[+b.dataset.i]; applyRatio(p.work, p.brk); }));
    el("s-apply").addEventListener("click", () => {
      const w = Math.max(1, parseInt(el("s-cw").value, 10) || 25);
      const b = Math.max(1, parseInt(el("s-cb").value, 10) || 5);
      applyRatio(w, b);
    });
    el("s-start").addEventListener("click", startPause);
    el("s-reset").addEventListener("click", reset);
    paintTimer();
  }

  window.renderSelfStudy = render;
})();
