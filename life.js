/* ─────────────────────────────────────────────────────────────
   dmico life os - Life
   Mood (emoji + a healthy, actionable suggestion + trend), and one Writing
   surface that works two ways: rotating prompts, or a blank page.

   There used to be two writing surfaces. The Journal (manifestation-leaning
   prompts, never nudged) took 2 entries in its entire life while Reflections
   (plain questions, nudged at 21:00 by jade_events.check_reflection_missing)
   took 33. Same mechanism, 16x the use, and the only differences were the
   nudge and the weight of the asking. The bot worked this out first: see the
   disabled block at bot.py:178, "kv journal_data went cold, and the daily
   reflection covers the same need."

   So the Journal form is retired behind SHOW_JOURNAL_FORM and its history
   stays visible, because the Discord "journal: ..." capture command still
   writes to journal_data and orphaning those would be a regression.

   CRITICAL: reflections_data keeps its exact shape. Five bot files read it
   (jade_events, analyze_service, profile_service, schedule_proposal_service,
   reflection_storage). Free writing is therefore stored as an ordinary answer
   with a sentinel prompt, so every consumer keeps working untouched and a
   blank-page day satisfies the 21:00 nudge exactly like a prompted one.
   ───────────────────────────────────────────────────────────── */

window.renderLife = async function (container, sb) {
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const monthKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const _mon = new Date(now); _mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const thisWeekMonday = `${_mon.getFullYear()}-${pad(_mon.getMonth() + 1)}-${pad(_mon.getDate())}`;
  const botTimestamp = () => {
    let h = now.getHours(); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return `${pad(now.getDate())} ${MON[now.getMonth()]} ${now.getFullYear()}, ${pad(h)}:${pad(now.getMinutes())} ${ap}`;
  };
  const dayLabel = `${WD[now.getDay()]}, ${pad(now.getDate())} ${MON[now.getMonth()]}`;
  const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

  const MOODS = [
    ["😞", 1, "Rough"], ["😕", 2, "Low"], ["😐", 3, "Okay"], ["🙂", 4, "Good"], ["😄", 5, "Great"],
  ];
  const SUGGESTIONS = {
    1: ["Be gentle with yourself. One small thing: water, and five minutes outside.",
        "You don't have to fix it all now. A planned break or a message to a friend can help.",
        "Step away from the screen for a bit — a short walk shifts more than it seems."],
    2: ["A short walk or your workout block could lift this a notch.",
        "Pick one tiny win to bank — even tidying your desk counts.",
        "Put on something you like and ease off the pressure for a while."],
    3: ["Steady baseline. Maybe protect a deep-work block while you're level.",
        "A small intentional break could tip this upward.",
        "Bank one win today and let a little momentum build."],
    4: ["Ride it — point this energy at something you care about.",
        "Good day to push your craft or research forward.",
        "Note what made today good so you can repeat it."],
    5: ["Love this. Pour it into your vision while the energy's high.",
        "Great day — capture what's working in your journal.",
        "Channel it: a focus block right now will feel effortless."],
  };
  // Retired, not deleted. Flip to true to bring the old weekly journal form back.
  const SHOW_JOURNAL_FORM = false;

  // Morning pool. Drawn from the old journal prompts with the heaviest
  // manifestation ones dropped: "write as if your ideal future already arrived"
  // is a performance, not a question, and it collected two answers in a quarter.
  const INTENTION_PROMPTS = [
    "What do you want today to be about?",
    "What is the one thing that would make today feel worth it?",
    "What are you carrying into today that you could put down?",
    "Where do you want your energy to go today?",
    "What would you like to be able to say about today, tonight?",
    "What is worth protecting in today's plan?",
    "What did you leave unfinished yesterday that deserves a decision?",
    "What would make today a good day for the work you care about?",
  ];
  const JOURNAL_PROMPTS = [
    "Write today as if your ideal future already arrived — what did “future you” do today?",
    "What are you calling into your life right now? Write it in present tense, as if it's already here.",
    "What evidence showed up today that you're moving toward what you want?",
    "What went well today, and what does it say about who you're becoming?",
    "What's taking up space in your head? Get it out, then reframe it toward what you want.",
    "Name three things you're grateful for, as proof your vision is already in motion.",
    "What did the game designer / researcher you're becoming do today?",
    "What did you create or contribute today, and how does it serve the bigger vision?",
  ];
  const REFLECT_QUESTIONS = [
    "How aligned did today feel with the life you're building, and why?",
    "One win, however small, you can bank as evidence today?",
    "Where did your energy actually go vs where you wanted it to go?",
    "What did you do today that “future you” will thank you for?",
    "State one intention for tomorrow in present tense, as if it's already done.",
    "What are you grateful for right now?",
    "What belief helped you today, and which one held you back?",
    "How did you move your craft or research forward today?",
    "What would make tomorrow a 9/10?",
    "What drained you, and what will you protect tomorrow?",
  ];

  container.innerHTML = `
    <style>
      #life{display:flex;flex-direction:column;gap:28px;max-width:780px;}
      #life section{display:flex;flex-direction:column;gap:10px;}
      #life .sub{font-size:0.78rem;color:var(--ink-soft);margin:-4px 0 2px;}
      #life .msg{font-size:0.78rem;color:var(--ink-soft);margin:2px 0 0;}
      #life .moods{display:flex;gap:8px;flex-wrap:wrap;}
      #life .mood{font-size:1.5rem;line-height:1;padding:8px 12px;border-radius:var(--radius);background:var(--surface-2);border:1px solid var(--line);cursor:pointer;}
      #life .mood.on{background:var(--accent);border-color:var(--accent);}
      #life input[type=text],#life textarea{font:inherit;width:100%;padding:9px 12px;border-radius:var(--radius);border:1px solid var(--line);background:var(--surface-2);color:var(--ink);box-sizing:border-box;}
      #life input[type=text]:focus-visible,#life textarea:focus-visible{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-wash);}
      #life textarea{min-height:54px;resize:vertical;}
      #life .suggestion{font-size:0.86rem;color:var(--ink-soft);padding:2px 0 0;}
      #life .trend{display:flex;gap:4px;flex-wrap:wrap;font-size:1.1rem;}
      #life .wmode{display:flex;gap:6px;margin:-2px 0 8px;}
      #life .wmode button{font:inherit;font-size:0.78rem;padding:5px 11px;border-radius:var(--radius-pill,999px);
        border:1px solid var(--line);background:var(--surface-2);color:var(--ink-soft);cursor:pointer;}
      #life .wmode button.on{background:var(--accent);border-color:var(--accent);color:var(--surface);font-weight:600;}
      #life .blank textarea{min-height:190px;line-height:1.6;}
      #life .q{display:flex;flex-direction:column;gap:5px;margin-bottom:10px;}
      #life .q label{font-size:0.85rem;font-weight:500;color:var(--ink);}
      #life .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
      #life .reopen{font-size:0.76rem;color:var(--ink-faint);margin-top:4px;}
      #life .life-hist-d summary{cursor:pointer;font-size:0.85rem;font-weight:700;color:var(--ink-soft);}
      #life .life-hist-d[open] summary{margin-bottom:8px;}
    </style>
    <div id="life">
      <div class="r-well" id="life-state">
        <div class="r-well-cell"><span class="r-micro">Mood</span><div class="r-well-val" id="life-state-mood">—</div></div>
        <div class="r-well-cell"><span class="r-micro">Written today</span><div class="r-well-val" id="life-state-journal">—</div></div>
        <div class="r-well-cell"><span class="r-micro">Writing</span><div class="r-well-val" id="life-state-reflect">—</div></div>
      </div>

      <section>
        <span class="r-eyebrow">Mood</span>
        <div id="life-mood"></div>
        <p class="sub" style="margin-top:6px">Recent trend</p>
        <div class="trend" id="life-trend"><span class="r-status">No entries yet.</span></div>
      </section>

      <section id="life-journal-section">
        <span class="r-eyebrow">Journal</span>
        <div id="life-journal-top"></div>
      </section>

      <section>
        <span class="r-eyebrow" id="life-write-eyebrow">Writing</span>
        <div id="life-reflect-top"></div>
      </section>

      <section>
        <span class="r-eyebrow">History</span>
        <details class="life-hist-d"><summary>Past journal (retired surface)</summary>
          <div class="r-row-list" id="life-j-hist" style="margin-top:8px"><span class="r-status">Loading…</span></div></details>
        <details class="life-hist-d"><summary>Past reflections</summary>
          <div class="r-row-list" id="life-r-hist" style="margin-top:8px"><span class="r-status">Loading…</span></div></details>
      </section>
    </div>`;

  // Load everything first so each section knows whether it's already logged.
  const [moodData, journalData, reflectData] = await Promise.all([
    window.dmicoKvGet("mood_data"),
    window.dmicoKvGet("journal_data"),
    window.dmicoKvGet("reflections_data"),
  ]);
  const moodEntries = (moodData && Array.isArray(moodData.entries)) ? moodData.entries : [];
  const journalEntries = (journalData && Array.isArray(journalData.entries)) ? journalData.entries : [];
  const moodToday = moodEntries.find((e) => e.date === todayISO);
  const reflectDoneToday = !!(reflectData && reflectData.daily && reflectData.daily[todayISO] && reflectData.daily[todayISO].completed);
  const journaledThisWeek = journalEntries.some((e) => e.week === thisWeekMonday);

  const stateMoodEl = document.getElementById("life-state-mood");
  if (stateMoodEl) {
    const m = moodToday ? (MOODS.find((x) => x[1] === moodToday.rating) || ["•", 0, ""]) : null;
    stateMoodEl.textContent = m ? `${m[0]} ${m[2]}` : "Not yet";
  }
  const todayAnswerCount = Object.keys(
    ((reflectData && reflectData.daily && reflectData.daily[todayISO]) || {}).answers || {}
  ).length;
  const stateJournalEl = document.getElementById("life-state-journal");
  if (stateJournalEl) stateJournalEl.textContent = todayAnswerCount ? String(todayAnswerCount) : "0";
  const stateReflectEl = document.getElementById("life-state-reflect");
  if (stateReflectEl) stateReflectEl.textContent = reflectDoneToday ? "Done" : "Open";

  function renderTrend(entries) {
    const last = (entries || []).slice(-14);
    const tEl = document.getElementById("life-trend");
    tEl.innerHTML = last.length
      ? last.map((e) => `<span title="${esc(e.date)}${e.word ? " · " + esc(e.word) : ""}">${(MOODS.find((m) => m[1] === e.rating) || ["•"])[0]}</span>`).join("")
      : `<span class="r-status">No entries yet.</span>`;
  }
  renderTrend(moodEntries);

  // ── Mood ────────────────────────────────────────────────────
  const moodHost = document.getElementById("life-mood");
  if (moodToday) {
    const m = MOODS.find((x) => x[1] === moodToday.rating) || ["•", 0, ""];
    moodHost.innerHTML = `<p class="r-status">✓ Mood logged today: ${m[0]} ${esc(m[2])}${moodToday.word ? ` — “${esc(moodToday.word)}”` : ""}
      <span class="reopen">Opens again tomorrow.</span></p>`;
  } else {
    moodHost.innerHTML = `
      <p class="sub">How are you, right now? Tap one, add a note if you want, then save.</p>
      <div class="moods" id="life-moods"></div>
      <div class="row"><input type="text" id="life-mood-note" placeholder="one word or short note (optional)" maxlength="60" /><button id="life-mood-save" class="btn-primary r-btn">Save</button></div>
      <div class="suggestion" id="life-suggestion" hidden></div>
      <p class="msg" id="life-mood-msg" hidden></p>`;
    const moodsEl = document.getElementById("life-moods");
    const sugEl = document.getElementById("life-suggestion");
    const moodMsg = document.getElementById("life-mood-msg");
    let chosenMood = null;
    moodsEl.innerHTML = MOODS.map(([e, r, lbl]) => `<button class="mood" data-r="${r}" title="${lbl}">${e}</button>`).join("");
    async function saveMood(rating) {
      const note = document.getElementById("life-mood-note").value.trim();
      const data = (await window.dmicoKvGet("mood_data")) || {};
      data.entries = Array.isArray(data.entries) ? data.entries : [];
      let entry = data.entries.find((x) => x.date === todayISO);
      if (entry) { entry.rating = rating; if (note) entry.word = note; entry.timestamp = botTimestamp(); }
      else data.entries.push({ date: todayISO, month: monthKey, rating, word: note || null, timestamp: botTimestamp() });
      data.pending_message_id = null;
      const ok = await window.dmicoKvSet("mood_data", data);
      moodMsg.hidden = false; moodMsg.textContent = ok ? "Mood saved. It closes for today now." : "Couldn't save — try again.";
      renderTrend(data.entries);
      return data.entries;
    }
    function showSuggestion(rating, entries) {
      const pool = SUGGESTIONS[rating] || SUGGESTIONS[3];
      let line = pool[Math.floor(Math.random() * pool.length)];
      const recent = (entries || []).slice(-3);
      if (recent.length === 3 && recent.every((e) => (e.rating || 3) <= 2)) {
        line += " You've had a few low days in a row — it might help to talk to someone you trust. 💛";
      }
      sugEl.hidden = false; sugEl.textContent = line;
    }
    const lockAfter = (rating, note) => {
      const mm = MOODS.find((x) => x[1] === rating) || ["•", 0, ""];
      const n = (note || "").trim();
      moodHost.innerHTML = `<p class="r-status">✓ Mood logged today: ${mm[0]} ${esc(mm[2])}${n ? ` · “${esc(n)}”` : ""}
        <span class="reopen">Opens again tomorrow.</span></p>${sugEl.outerHTML}`;
    };
    moodsEl.querySelectorAll(".mood").forEach((btn) =>
      btn.addEventListener("click", () => {
        chosenMood = +btn.dataset.r;
        moodsEl.querySelectorAll(".mood").forEach((b) => b.classList.toggle("on", b === btn));
        moodMsg.hidden = true;
        // The suggestion is read-only and immediate, so tapping still feels responsive
        // without committing anything. Trend data is only needed for the low-streak
        // line, and moodEntries is already loaded.
        showSuggestion(chosenMood, moodEntries);
      })
    );
    document.getElementById("life-mood-save").addEventListener("click", async () => {
      const data = (await window.dmicoKvGet("mood_data")) || { entries: [] };
      const te = (data.entries || []).find((x) => x.date === todayISO);
      const rating = chosenMood || (te && te.rating);
      if (!rating) { moodMsg.hidden = false; moodMsg.textContent = "Tap how you're feeling first, then save."; return; }
      const note = document.getElementById("life-mood-note").value;
      await saveMood(rating);
      lockAfter(rating, note);
    });
  }

  // ── Journal ─────────────────────────────────────────────────
  const jTop = document.getElementById("life-journal-top");
  function renderJournalHistory(entries) {
    const h = document.getElementById("life-j-hist");
    const list = (entries || []).slice().reverse().slice(0, 10);
    h.innerHTML = list.length
      ? list.map((e) => `<div class="r-row"><div class="r-row-main"><div class="r-micro">${esc(e.day || e.timestamp || "")}</div><div class="r-row-content">${esc(e.content || "").replace(/\n/g, "<br>")}</div></div></div>`).join("")
      : `<span class="r-status">No entries yet — your first one's a tap away.</span>`;
  }
  renderJournalHistory(journalEntries);
  if (!SHOW_JOURNAL_FORM) {
    // Retired surface. The section is hidden; its history stays under History below so
    // Discord "journal: ..." captures are not orphaned. Form code kept, not deleted.
    // .remove(), not .hidden: `#life section{display:flex}` beats the [hidden]
    // attribute's display:none, so hiding it left an orphaned "Journal" heading
    // with dead space under it. Caught by looking at it, not by the test.
    const jSec = document.getElementById("life-journal-section");
    if (jSec) jSec.remove();
  } else if (journaledThisWeek) {
    jTop.innerHTML = `<p class="r-status">✓ You've journaled this week. <span class="reopen">Opens again next week.</span></p>`;
  } else {
    let jPrompts = shuffle(JOURNAL_PROMPTS).slice(0, 3);
    jTop.innerHTML = `
      <p class="sub">Answer what speaks to you. Leave the rest blank. <button class="r-mini" id="life-j-shuffle">↻ New prompts</button></p>
      <div id="life-journal"></div>
      <div class="row"><button id="life-j-save" class="btn-primary r-btn">Save entry</button></div>
      <p class="msg" id="life-j-msg" hidden></p>`;
    const jEl = document.getElementById("life-journal");
    const renderJournal = () => { jEl.innerHTML = jPrompts.map((p, i) => `<div class="q"><label>${esc(p)}</label><textarea data-i="${i}"></textarea></div>`).join(""); };
    renderJournal();
    document.getElementById("life-j-shuffle").addEventListener("click", () => { jPrompts = shuffle(JOURNAL_PROMPTS).slice(0, 3); renderJournal(); });
    document.getElementById("life-j-save").addEventListener("click", async () => {
      const items = [];
      jEl.querySelectorAll("textarea").forEach((t) => { const a = t.value.trim(); if (a) items.push({ prompt: jPrompts[+t.dataset.i], answer: a }); });
      const jMsg = document.getElementById("life-j-msg");
      if (!items.length) { jMsg.hidden = false; jMsg.textContent = "Write at least one answer first."; return; }
      const content = items.map((it) => `${it.prompt}\n${it.answer}`).join("\n\n");
      const data = (await window.dmicoKvGet("journal_data")) || {};
      data.entries = Array.isArray(data.entries) ? data.entries : [];
      data.entries.push({ content, items, author: "Damico (hub)", timestamp: botTimestamp(), month: monthKey, day: dayLabel, week: thisWeekMonday });
      const ok = await window.dmicoKvSet("journal_data", data);
      if (ok) {
        renderJournalHistory(data.entries);
        jTop.innerHTML = `<p class="r-status">✓ Journal entry saved. <span class="reopen">Opens again next week.</span></p>`;
      } else { jMsg.hidden = false; jMsg.textContent = "Couldn't save — try again."; }
    });
  }

  // ── Reflection ──────────────────────────────────────────────
  const rTop = document.getElementById("life-reflect-top");
  function renderReflectHistory(daily) {
    const h = document.getElementById("life-r-hist");
    const dates = Object.keys(daily || {}).sort().reverse().slice(0, 7);
    h.innerHTML = dates.length
      ? dates.map((d) => {
          const ans = daily[d].answers || {};
          const body = Object.values(ans).map((a) => `<div><em>${esc(a.prompt)}</em><br>${esc(a.answer)}</div>`).join("<br>");
          return `<div class="r-row"><div class="r-row-main"><div class="r-micro">${esc(d)}</div><div class="r-row-content">${body || "<span class='r-status'>(no answers)</span>"}</div></div></div>`;
        }).join("")
      : `<span class="r-status">No reflections yet.</span>`;
  }
  renderReflectHistory(reflectData && reflectData.daily ? reflectData.daily : {});

  // ── The writing surface ─────────────────────────────────────
  // Two modes (prompts / blank page) and two directions (morning intentions /
  // evening reflection). Direction only defaults by the clock; he can flip it,
  // because wanting to set intentions at 9pm is not a bug.
  const WRITE_MODE_KEY = "dmico-write-mode";
  let wMode = "prompts";
  try { const m = localStorage.getItem(WRITE_MODE_KEY); if (m === "blank" || m === "prompts") wMode = m; } catch (_) {}
  let wDir = now.getHours() < 12 ? "intent" : "reflect";
  let wQs = [];

  const wEyebrow = document.getElementById("life-write-eyebrow");
  const setEyebrow = () => {
    if (wEyebrow) wEyebrow.textContent = wDir === "intent" ? "Writing · intentions" : "Writing · reflection";
  };
  const poolFor = () => (wDir === "intent" ? INTENTION_PROMPTS : REFLECT_QUESTIONS);
  const reshuffle = () => { wQs = shuffle(poolFor()).slice(0, wDir === "intent" ? 3 : 4); };
  reshuffle();

  function paintWriter() {
    setEyebrow();
    const promptsUI = wQs.map((q, i) => `<div class="q"><label>${esc(q)}</label><textarea data-i="${i}"></textarea></div>`).join("");
    const blankUI = `<div class="q blank"><textarea id="life-w-blank" placeholder="${
      wDir === "intent" ? "What do you want today to be about?" : "How was today?"}"></textarea></div>`;
    rTop.innerHTML = `
      <div class="wmode">
        <button data-m="prompts" class="${wMode === "prompts" ? "on" : ""}">Prompts</button>
        <button data-m="blank" class="${wMode === "blank" ? "on" : ""}">Blank page</button>
      </div>
      ${wMode === "prompts"
        ? `<p class="sub">Answer what speaks to you, leave the rest blank.
             <button class="r-mini" id="life-w-shuffle">↻ Different questions</button>
             <button class="r-mini" id="life-w-dir">${wDir === "intent" ? "Reflect on today instead" : "Set intentions instead"}</button></p>`
        : `<p class="sub">No questions. Just write.
             <button class="r-mini" id="life-w-dir">${wDir === "intent" ? "File as reflection instead" : "File as intentions instead"}</button></p>`}
      <div id="life-write">${wMode === "prompts" ? promptsUI : blankUI}</div>
      <div class="row"><button id="life-w-save" class="btn-primary r-btn">Save</button></div>
      <p class="msg" id="life-w-msg" hidden></p>`;

    rTop.querySelectorAll(".wmode button").forEach((b) => b.addEventListener("click", () => {
      wMode = b.dataset.m;
      try { localStorage.setItem(WRITE_MODE_KEY, wMode); } catch (_) {}
      paintWriter();
    }));
    const shuf = document.getElementById("life-w-shuffle");
    if (shuf) shuf.addEventListener("click", () => { reshuffle(); paintWriter(); });
    document.getElementById("life-w-dir").addEventListener("click", () => {
      wDir = wDir === "intent" ? "reflect" : "intent";
      reshuffle(); paintWriter();
    });
    document.getElementById("life-w-save").addEventListener("click", saveWriting);
  }

  async function saveWriting() {
    const wMsg = document.getElementById("life-w-msg");
    const fresh = [];
    if (wMode === "blank") {
      const t = (document.getElementById("life-w-blank").value || "").trim();
      // Sentinel prompt, so every bot consumer that expects {prompt, answer} keeps
      // working and this reads sensibly in a Gemma summary.
      if (t) fresh.push({ prompt: wDir === "intent" ? "(intentions)" : "(free writing)", answer: t });
    } else {
      document.querySelectorAll("#life-write textarea").forEach((t) => {
        const a = (t.value || "").trim();
        if (a) fresh.push({ prompt: wQs[+t.dataset.i], answer: a });
      });
    }
    if (!fresh.length) {
      wMsg.hidden = false;
      wMsg.textContent = wMode === "blank" ? "Write something first." : "Answer at least one question first.";
      return;
    }

    const data = (await window.dmicoKvGet("reflections_data")) || {};
    data.daily = data.daily && typeof data.daily === "object" ? data.daily : {};
    // MERGE, never replace. A morning entry and an evening one share a day, and the
    // old code overwrote daily[today] outright, which would have silently eaten the
    // morning's intentions the moment he reflected at night.
    const prev = data.daily[todayISO] || {};
    const answers = (prev.answers && typeof prev.answers === "object") ? { ...prev.answers } : {};
    let idx = Object.keys(answers).length;
    fresh.forEach((f) => {
      answers[String(idx++)] = { prompt: f.prompt, answer: f.answer, timestamp: new Date().toISOString() };
    });
    data.daily[todayISO] = { ...prev, completed: true, answers, completed_at: new Date().toISOString() };

    const ok = await window.dmicoKvSet("reflections_data", data);
    if (!ok) { wMsg.hidden = false; wMsg.textContent = "Couldn't save, try again."; return; }
    renderReflectHistory(data.daily);
    showSaved(Object.keys(answers).length);
  }

  function showSaved(total) {
    setEyebrow();
    rTop.innerHTML = `<p class="r-status">✓ Saved. ${total} ${total === 1 ? "entry" : "entries"} today.
      <button class="r-mini" id="life-w-again">Write again</button></p>`;
    document.getElementById("life-w-again").addEventListener("click", paintWriter);
  }

  // Already written today? Show it as saved, but never lock the page. A writing
  // surface that refuses a second thought is a worse writing surface.
  if (reflectDoneToday) {
    const a = ((reflectData.daily[todayISO] || {}).answers) || {};
    showSaved(Object.keys(a).length);
  } else {
    paintWriter();
  }
};
