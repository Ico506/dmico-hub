/* ─────────────────────────────────────────────────────────────
   dmico life os — Self-study module (v1)
   Two halves:
     Plan  — track upcoming exams with a live countdown. (The balanced
             study-plan generator gets wired in the next build.)
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
        <div class="r-field"><label>Topics to cover (comma separated)</label><input id="e-topics" type="text" placeholder="sampling, validity, thematic analysis" /></div>
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
      exam_date: el("e-date").value || null,
      hours_per_day: parseFloat(el("e-hours").value) || null,
      topics: el("e-topics").value.trim() || null,
      added_via: "web",
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
      list.innerHTML = `<div class="empty"><h2>No exams yet</h2><p>Add one above and it shows up here with a live countdown. The balanced study-plan generator arrives in the next build.</p></div>`;
      return;
    }
    list.innerHTML = "";
    exams.forEach((x) => {
      const n = daysUntil(x.exam_date);
      const urgency = n === null ? "" : n < 0 ? "past" : n <= 7 ? "soon" : "ok";
      const card = document.createElement("div");
      card.className = "r-card";
      card.innerHTML = `
        <div class="s-exam-top">
          <h3 class="r-title">${esc(x.title)}</h3>
          <span class="s-count ${urgency}">${countdownLabel(x.exam_date)}</span>
        </div>
        <div class="r-meta">${x.exam_date ? esc(x.exam_date) : "no date"}${x.hours_per_day ? `  ·  ${x.hours_per_day}h/day` : ""}</div>
        ${x.topics ? `<p class="r-abstract">${esc(x.topics)}</p>` : ""}
        <p class="s-soon">Balanced study plan: coming in the next build.</p>
        <div class="r-actions"><button class="r-mini r-del">Remove</button></div>`;
      card.querySelector(".r-del").addEventListener("click", async () => {
        if (!window.confirm(`Remove "${x.title}"?`)) return;
        const { error: e2 } = await SB.from("study_exams").delete().eq("id", x.id);
        if (e2) { console.error(e2); alert("Couldn't remove it."); return; }
        drawExams();
      });
      list.appendChild(card);
    });
  }

  // ── Focus tab ──────────────────────────────────────────────
  const PRESETS = [
    { label: "Classic 25 / 5", work: 25, brk: 5 },
    { label: "Deep 50 / 10", work: 50, brk: 10 },
    { label: "Long 90 / 20", work: 90, brk: 20 },
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
    if (!disp) return; // user switched tabs; keep counting silently
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
