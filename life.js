/* ─────────────────────────────────────────────────────────────
   dmico life os — Life
   Mood (emoji + a healthy, actionable suggestion + trend),
   prompt-driven Journal (manifestation-leaning questions),
   and Reflections (rotating questions so they never go stale).
   Each closes once logged: mood + reflection daily, journal weekly,
   reopening on the next day / week. Writes go straight to the same kv
   keys the bot reads (mood_data, journal_data, reflections_data).
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
      #life{display:flex;flex-direction:column;gap:26px;max-width:780px;}
      #life section{display:flex;flex-direction:column;gap:10px;}
      #life h3{margin:0;font-size:0.98rem;font-weight:700;}
      #life .sub{font-size:0.78rem;opacity:0.6;margin:-4px 0 2px;}
      #life .msg{font-size:0.78rem;opacity:0.85;margin:2px 0 0;}
      #life .moods{display:flex;gap:8px;flex-wrap:wrap;}
      #life .mood{font-size:1.6rem;line-height:1;padding:8px 10px;border-radius:12px;background:rgba(127,127,127,0.08);border:1px solid transparent;cursor:pointer;}
      #life .mood.on{background:rgba(91,141,239,0.18);border-color:rgba(91,141,239,0.4);}
      #life input[type=text],#life textarea{font:inherit;width:100%;padding:8px 10px;border-radius:8px;border:1px solid rgba(127,127,127,0.3);background:transparent;color:inherit;box-sizing:border-box;}
      #life textarea{min-height:54px;resize:vertical;}
      #life button{font:inherit;font-weight:600;padding:7px 14px;border-radius:8px;border:none;background:#5b8def;color:#fff;cursor:pointer;}
      #life button.ghost{background:transparent;border:1px solid rgba(127,127,127,0.35);color:inherit;}
      #life .suggestion{font-size:0.86rem;padding:10px 12px;border-radius:10px;background:rgba(58,166,117,0.12);}
      #life .done{font-size:0.9rem;padding:12px 14px;border-radius:10px;background:rgba(58,166,117,0.12);}
      #life .done .reopen{font-size:0.76rem;opacity:0.65;margin-top:4px;}
      #life .trend{display:flex;gap:4px;flex-wrap:wrap;font-size:1.1rem;}
      #life .q{display:flex;flex-direction:column;gap:5px;margin-bottom:10px;}
      #life .q label{font-size:0.85rem;font-weight:500;}
      #life .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
      #life .hist{display:flex;flex-direction:column;gap:8px;}
      #life .hist-item{padding:8px 12px;border-radius:10px;background:rgba(127,127,127,0.06);font-size:0.82rem;}
      #life .hist-date{font-size:0.72rem;opacity:0.55;margin-bottom:3px;}
      #life .note{font-size:0.74rem;opacity:0.5;}
      #life .life-hist-d{border-radius:10px;background:rgba(127,127,127,0.04);padding:8px 12px;}
      #life .life-hist-d summary{cursor:pointer;font-size:0.85rem;font-weight:600;opacity:0.85;}
      #life .life-hist-d[open] summary{margin-bottom:6px;}
    </style>
    <div id="life">
      <section>
        <h3>🌤️ Mood</h3>
        <div id="life-mood"></div>
        <p class="sub" style="margin-top:6px">Recent trend</p>
        <div class="trend" id="life-trend"><span class="note">No entries yet.</span></div>
      </section>

      <section>
        <h3>📓 Journal</h3>
        <div id="life-journal-top"></div>
      </section>

      <section>
        <h3>🌙 Reflection</h3>
        <div id="life-reflect-top"></div>
      </section>

      <section>
        <h3>🗂️ History</h3>
        <details class="life-hist-d"><summary>Past journal entries</summary>
          <div class="hist" id="life-j-hist" style="margin-top:8px"><span class="note">Loading…</span></div></details>
        <details class="life-hist-d"><summary>Past reflections</summary>
          <div class="hist" id="life-r-hist" style="margin-top:8px"><span class="note">Loading…</span></div></details>
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

  function renderTrend(entries) {
    const last = (entries || []).slice(-14);
    const tEl = document.getElementById("life-trend");
    tEl.innerHTML = last.length
      ? last.map((e) => `<span title="${esc(e.date)}${e.word ? " · " + esc(e.word) : ""}">${(MOODS.find((m) => m[1] === e.rating) || ["•"])[0]}</span>`).join("")
      : `<span class="note">No entries yet.</span>`;
  }
  renderTrend(moodEntries);

  // ── Mood ────────────────────────────────────────────────────
  const moodHost = document.getElementById("life-mood");
  if (moodToday) {
    const m = MOODS.find((x) => x[1] === moodToday.rating) || ["•", 0, ""];
    moodHost.innerHTML = `<div class="done">✓ Mood logged today: ${m[0]} ${esc(m[2])}${moodToday.word ? ` — “${esc(moodToday.word)}”` : ""}
      <div class="reopen">Opens again tomorrow.</div></div>`;
  } else {
    moodHost.innerHTML = `
      <p class="sub">How are you, right now? Tap one — I'll suggest one small, kind way to work with it.</p>
      <div class="moods" id="life-moods"></div>
      <div class="row"><input type="text" id="life-mood-note" placeholder="one word or short note (optional)" maxlength="60" /><button id="life-mood-save">Save</button></div>
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
    const lockAfter = (rating, entries) => {
      showSuggestion(rating, entries);
      setTimeout(() => {
        const mm = MOODS.find((x) => x[1] === rating) || ["•", 0, ""];
        const note = (document.getElementById("life-mood-note") || {}).value || "";
        moodHost.innerHTML = `<div class="done">✓ Mood logged today: ${mm[0]} ${esc(mm[2])}${note ? ` — “${esc(note.trim())}”` : ""}
          <div class="reopen">Opens again tomorrow.</div></div>${sugEl.outerHTML}`;
      }, 1200);
    };
    moodsEl.querySelectorAll(".mood").forEach((btn) =>
      btn.addEventListener("click", async () => {
        chosenMood = +btn.dataset.r;
        moodsEl.querySelectorAll(".mood").forEach((b) => b.classList.toggle("on", b === btn));
        const entries = await saveMood(chosenMood);
        lockAfter(chosenMood, entries);
      })
    );
    document.getElementById("life-mood-save").addEventListener("click", async () => {
      const data = (await window.dmicoKvGet("mood_data")) || { entries: [] };
      const te = (data.entries || []).find((x) => x.date === todayISO);
      const rating = chosenMood || (te && te.rating);
      if (!rating) { moodMsg.hidden = false; moodMsg.textContent = "Tap how you're feeling first, then save your note."; return; }
      const entries = await saveMood(rating);
      lockAfter(rating, entries);
    });
  }

  // ── Journal ─────────────────────────────────────────────────
  const jTop = document.getElementById("life-journal-top");
  function renderJournalHistory(entries) {
    const h = document.getElementById("life-j-hist");
    const list = (entries || []).slice().reverse().slice(0, 10);
    h.innerHTML = list.length
      ? list.map((e) => `<div class="hist-item"><div class="hist-date">${esc(e.day || e.timestamp || "")}</div>${esc(e.content || "").replace(/\n/g, "<br>")}</div>`).join("")
      : `<span class="note">No entries yet — your first one's a tap away.</span>`;
  }
  renderJournalHistory(journalEntries);
  if (journaledThisWeek) {
    jTop.innerHTML = `<div class="done">✓ You've journaled this week. <div class="reopen">Opens again next week.</div></div>`;
  } else {
    let jPrompts = shuffle(JOURNAL_PROMPTS).slice(0, 3);
    jTop.innerHTML = `
      <p class="sub">Answer what speaks to you. Leave the rest blank. <button class="ghost" id="life-j-shuffle" style="padding:3px 10px">↻ New prompts</button></p>
      <div id="life-journal"></div>
      <div class="row"><button id="life-j-save">Save entry</button></div>
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
        jTop.innerHTML = `<div class="done">✓ Journal entry saved. <div class="reopen">Opens again next week.</div></div>`;
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
          return `<div class="hist-item"><div class="hist-date">${esc(d)}</div>${body || "<span class='note'>(no answers)</span>"}</div>`;
        }).join("")
      : `<span class="note">No reflections yet.</span>`;
  }
  renderReflectHistory(reflectData && reflectData.daily ? reflectData.daily : {});
  if (reflectDoneToday) {
    rTop.innerHTML = `<div class="done">✓ Reflection done for today. <div class="reopen">Opens again at your next daily reflection.</div></div>`;
  } else {
    let rQs = shuffle(REFLECT_QUESTIONS).slice(0, 4);
    rTop.innerHTML = `
      <p class="sub">Today's questions (they rotate). <button class="ghost" id="life-r-shuffle" style="padding:3px 10px">↻ Different questions</button></p>
      <div id="life-reflect"></div>
      <div class="row"><button id="life-r-save">Save reflection</button></div>
      <p class="msg" id="life-r-msg" hidden></p>`;
    const rEl = document.getElementById("life-reflect");
    const renderReflect = () => { rEl.innerHTML = rQs.map((q, i) => `<div class="q"><label>${esc(q)}</label><textarea data-i="${i}"></textarea></div>`).join(""); };
    renderReflect();
    document.getElementById("life-r-shuffle").addEventListener("click", () => { rQs = shuffle(REFLECT_QUESTIONS).slice(0, 4); renderReflect(); });
    document.getElementById("life-r-save").addEventListener("click", async () => {
      const answers = {}; let n = 0;
      rEl.querySelectorAll("textarea").forEach((t, idx) => {
        const a = t.value.trim();
        if (a) { answers[String(idx)] = { prompt: rQs[+t.dataset.i], answer: a, timestamp: new Date().toISOString() }; n++; }
      });
      const rMsg = document.getElementById("life-r-msg");
      if (!n) { rMsg.hidden = false; rMsg.textContent = "Answer at least one question first."; return; }
      const data = (await window.dmicoKvGet("reflections_data")) || {};
      data.daily = data.daily && typeof data.daily === "object" ? data.daily : {};
      data.daily[todayISO] = { completed: true, answers, completed_at: new Date().toISOString() };
      const ok = await window.dmicoKvSet("reflections_data", data);
      if (ok) {
        renderReflectHistory(data.daily);
        rTop.innerHTML = `<div class="done">✓ Reflection saved. The bot will send a summary shortly. <div class="reopen">Opens again at your next daily reflection.</div></div>`;
      } else { rMsg.hidden = false; rMsg.textContent = "Couldn't save — try again."; }
    });
  }
};
