/* ─────────────────────────────────────────────────────────────
   dmico life os — Thesis module
   Two tabs:
     Chapters    — CRUD for thesis chapters with word-count progress
                   bars and inline "log words" quick-entry.
     Writing Log — chronological log of writing sessions across all
                   chapters.
   Tables: thesis_chapters, thesis_writing_logs
   ───────────────────────────────────────────────────────────── */

(function () {
  let SB   = null;
  let root = null;

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const el = (id) => document.getElementById(id);

  const STATUS_LABELS = { drafting: "Drafting", reviewing: "Reviewing", done: "Done" };

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((new Date(dateStr + "T00:00:00") - today) / 86400000);
  }

  function dueLabel(dateStr) {
    const n = daysUntil(dateStr);
    if (n === null) return null;
    if (n < 0)  return `${-n}d overdue`;
    if (n === 0) return "due today";
    if (n === 1) return "due tomorrow";
    return `due in ${n}d`;
  }

  function logRelative(iso) {
    if (!iso) return "";
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
    if (diff === 0) return "today";
    if (diff === 1) return "yesterday";
    if (diff < 7)  return `${diff}d ago`;
    if (diff < 30) return `${Math.round(diff / 7)}w ago`;
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  // ── layout ─────────────────────────────────────────────────
  function render(container, sb) {
    SB   = sb;
    root = container;
    root.innerHTML = `
      <div class="r-tabs" role="tablist">
        <button class="r-tab current" data-tab="chapters">Chapters</button>
        <button class="r-tab" data-tab="log">Writing Log</button>
      </div>
      <div id="th-panel"></div>`;
    root.querySelectorAll(".r-tab").forEach((t) =>
      t.addEventListener("click", () => {
        root.querySelectorAll(".r-tab").forEach((x) => x.classList.toggle("current", x === t));
        t.dataset.tab === "chapters" ? renderChapters() : renderWritingLog();
      })
    );
    renderChapters();
  }

  // ════════════════════════════════════════════════════════════
  //  CHAPTERS TAB
  // ════════════════════════════════════════════════════════════

  async function renderChapters() {
    const panel = el("th-panel");
    panel.innerHTML = `
      <div class="r-form th-addform">
        <div class="r-field"><label>Chapter title</label><input id="tc-title" type="text" placeholder="e.g. Chapter 2: Literature Review" /></div>
        <div class="r-row2">
          <div class="r-field"><label>Target words</label><input id="tc-target" type="number" min="0" placeholder="5000" /></div>
          <div class="r-field"><label>Due date</label><input id="tc-due" type="date" /></div>
        </div>
        <div class="r-row2">
          <div class="r-field">
            <label>Status</label>
            <select id="tc-status">
              <option value="drafting">Drafting</option>
              <option value="reviewing">Reviewing</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div class="r-field"><label>Notes <span class="r-label-optional">(optional)</span></label><input id="tc-notes" type="text" placeholder="e.g. waiting for supervisor feedback" /></div>
        </div>
        <button id="tc-save" class="btn-primary r-btn">Add chapter</button>
        <p id="tc-status-msg" class="r-status"></p>
      </div>
      <div id="th-overview" class="th-overview"></div>
      <div id="th-chapters" class="r-list"></div>`;

    el("tc-save").addEventListener("click", addChapter);
    await drawChapters();
  }

  async function addChapter() {
    const msg   = el("tc-status-msg");
    const title = el("tc-title").value.trim();
    if (!title) { msg.textContent = "Give the chapter a name."; return; }
    const row = {
      title,
      target_words:  parseInt(el("tc-target").value, 10) || 0,
      current_words: 0,
      status:        el("tc-status").value,
      due_date:      el("tc-due").value || null,
      notes:         el("tc-notes").value.trim() || null,
    };
    msg.textContent = "Adding…";
    const { error } = await SB.from("thesis_chapters").insert(row);
    if (error) { console.error(error); msg.textContent = "Couldn't add it. Try again."; return; }
    ["tc-title", "tc-target", "tc-due", "tc-notes"].forEach((id) => (el(id).value = ""));
    el("tc-status").value = "drafting";
    msg.textContent = "";
    await drawChapters();
  }

  async function drawChapters() {
    const list     = el("th-chapters");
    const overview = el("th-overview");
    const { data, error } = await SB
      .from("thesis_chapters")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) { console.error(error); list.innerHTML = `<p class="r-status">Couldn't load chapters.</p>`; return; }
    const chapters = data || [];

    // ── Overview strip ─────────────────────────────────────
    if (chapters.length) {
      const totalTarget  = chapters.reduce((s, c) => s + (c.target_words || 0), 0);
      const totalCurrent = chapters.reduce((s, c) => s + (c.current_words || 0), 0);
      const pct = totalTarget > 0 ? Math.min(100, Math.round((totalCurrent / totalTarget) * 100)) : 0;
      const doneCount = chapters.filter((c) => c.status === "done").length;
      overview.innerHTML = `
        <div class="th-overview-stats">
          <span class="th-ov-words">${totalCurrent.toLocaleString()} / ${totalTarget.toLocaleString()} words</span>
          <span class="th-ov-pct">${pct}%</span>
          <span class="th-ov-chapters">${doneCount} of ${chapters.length} chapters done</span>
        </div>
        <div class="th-ov-track"><div class="th-ov-fill" style="width:${pct}%"></div></div>`;
    } else {
      overview.innerHTML = "";
    }

    if (!chapters.length) {
      list.innerHTML = `<div class="empty"><h2>No chapters yet</h2><p>Add your first chapter above. Track word count progress and log writing sessions per chapter.</p></div>`;
      return;
    }
    list.innerHTML = "";
    chapters.forEach((c) => buildChapterCard(c, list));
  }

  function buildChapterCard(c, container) {
    const pct = c.target_words > 0
      ? Math.min(100, Math.round((c.current_words / c.target_words) * 100))
      : null;
    const statusClass = `th-status-${c.status || "drafting"}`;
    const statusLabel = STATUS_LABELS[c.status] || c.status;
    const due         = dueLabel(c.due_date);
    const dueUrgent   = due && (due.includes("overdue") || due.includes("today") || due.includes("tomorrow"));

    const card = document.createElement("div");
    card.className = `r-card th-chapter-card${c.status === "done" ? " th-chapter-done" : ""}`;
    card.dataset.chapterId = c.id;

    card.innerHTML = `
      <div class="th-chapter-header">
        <div class="th-chapter-title-block">
          <h3 class="r-title">${esc(c.title)}</h3>
          ${c.notes ? `<p class="r-abstract">${esc(c.notes)}</p>` : ""}
        </div>
        <span class="r-chip th-status ${statusClass}">${statusLabel}</span>
      </div>
      ${pct !== null ? `
        <div class="th-word-track">
          <div class="th-word-fill${pct >= 100 ? " th-word-fill-done" : ""}" style="width:${pct}%"></div>
        </div>
        <div class="th-word-stats">
          <span>${(c.current_words || 0).toLocaleString()} words written</span>
          <span>${pct}% of ${(c.target_words || 0).toLocaleString()}</span>
        </div>` : ""}
      ${due ? `<div class="th-due${dueUrgent ? " th-due-urgent" : ""}">${esc(due)}</div>` : ""}
      <div class="r-actions">
        <select class="th-status-select r-mini-select" data-id="${esc(c.id)}">
          <option value="drafting"  ${c.status === "drafting"  ? "selected" : ""}>Drafting</option>
          <option value="reviewing" ${c.status === "reviewing" ? "selected" : ""}>Reviewing</option>
          <option value="done"      ${c.status === "done"      ? "selected" : ""}>Done</option>
        </select>
        <button class="r-mini th-log-words-btn">Log words</button>
        <button class="r-mini r-del th-del-chapter">Remove</button>
      </div>
      <div class="th-log-quick-form" hidden></div>`;

    card.querySelector(".th-status-select").addEventListener("change", async (e) => {
      const newStatus = e.target.value;
      const { error } = await SB.from("thesis_chapters").update({ status: newStatus }).eq("id", c.id);
      if (error) { console.error(error); return; }
      const chip = card.querySelector(".th-status");
      chip.textContent = STATUS_LABELS[newStatus] || newStatus;
      chip.className = `r-chip th-status th-status-${newStatus}`;
      card.classList.toggle("th-chapter-done", newStatus === "done");
      c.status = newStatus;
    });

    card.querySelector(".th-log-words-btn").addEventListener("click", () => toggleWordLog(c, card));

    card.querySelector(".th-del-chapter").addEventListener("click", async () => {
      if (!window.confirm(`Remove "${c.title}"? Writing logs linked to it will be kept but lose the chapter link.`)) return;
      const { error } = await SB.from("thesis_chapters").delete().eq("id", c.id);
      if (error) { console.error(error); return; }
      drawChapters();
    });

    container.appendChild(card);
  }

  function toggleWordLog(c, card) {
    const formEl = card.querySelector(".th-log-quick-form");
    if (!formEl.hidden) { formEl.hidden = true; formEl.innerHTML = ""; return; }
    formEl.innerHTML = `
      <div class="th-log-quick-inner">
        <div class="r-row2">
          <div class="r-field"><label>Words written</label><input type="number" min="0" class="th-lq-words" placeholder="500" /></div>
          <div class="r-field"><label>Minutes spent</label><input type="number" min="0" class="th-lq-mins" placeholder="45" /></div>
        </div>
        <div class="r-field"><label>Note <span class="r-label-optional">(optional)</span></label><input type="text" class="th-lq-note" placeholder="what did you write about?" /></div>
        <div class="gd-log-actions">
          <button class="btn-primary r-btn th-lq-save">Save</button>
          <button class="btn-ghost r-btn th-lq-cancel">Cancel</button>
          <span class="th-lq-status r-status"></span>
        </div>
      </div>`;
    formEl.hidden = false;
    formEl.querySelector(".th-lq-words").focus();
    formEl.querySelector(".th-lq-cancel").addEventListener("click", () => { formEl.hidden = true; formEl.innerHTML = ""; });
    formEl.querySelector(".th-lq-save").addEventListener("click", () => submitWordLog(c, card, formEl));
  }

  async function submitWordLog(c, card, formEl) {
    const wordsInput = formEl.querySelector(".th-lq-words");
    const minsInput  = formEl.querySelector(".th-lq-mins");
    const noteInput  = formEl.querySelector(".th-lq-note");
    const statusEl   = formEl.querySelector(".th-lq-status");
    const saveBtn    = formEl.querySelector(".th-lq-save");

    const words = parseInt(wordsInput.value, 10);
    if (!words || words <= 0) { statusEl.textContent = "Enter a word count."; return; }

    saveBtn.disabled = true;
    statusEl.textContent = "Saving…";

    // Insert writing log entry.
    const { error: logErr } = await SB.from("thesis_writing_logs").insert({
      chapter_id:    c.id,
      words_written: words,
      duration_mins: parseInt(minsInput.value, 10) || null,
      notes:         noteInput.value.trim() || null,
    });
    if (logErr) {
      console.error(logErr);
      saveBtn.disabled = false;
      statusEl.textContent = "Couldn't save log. Try again.";
      return;
    }

    // Update chapter word count.
    const newTotal = (c.current_words || 0) + words;
    const { error: updateErr } = await SB
      .from("thesis_chapters")
      .update({ current_words: newTotal })
      .eq("id", c.id);
    if (updateErr) console.warn("Couldn't update word count:", updateErr);
    else c.current_words = newTotal;

    formEl.hidden = true;
    formEl.innerHTML = "";

    // Refresh this card's word stats in-place.
    const pct = c.target_words > 0
      ? Math.min(100, Math.round((c.current_words / c.target_words) * 100))
      : null;
    if (pct !== null) {
      const fill  = card.querySelector(".th-word-fill");
      const stats = card.querySelector(".th-word-stats");
      if (fill)  { fill.style.width = `${pct}%`; fill.classList.toggle("th-word-fill-done", pct >= 100); }
      if (stats) stats.innerHTML = `<span>${c.current_words.toLocaleString()} words written</span><span>${pct}% of ${c.target_words.toLocaleString()}</span>`;
    }

    // Refresh overview totals.
    const overviewPct  = document.querySelector(".th-ov-fill");
    const overviewText = document.querySelector(".th-ov-words");
    const overviewPctEl = document.querySelector(".th-ov-pct");
    if (overviewPct && overviewText) {
      // Recalculate from all visible chapter cards.
      const allCards = document.querySelectorAll(".th-chapter-card");
      let sumTarget = 0, sumCurrent = 0;
      allCards.forEach((ca) => {
        const wStats = ca.querySelector(".th-word-stats");
        if (!wStats) return;
        // Extract current and total from the stats spans.
        const spans = wStats.querySelectorAll("span");
        if (spans[0]) sumCurrent += parseInt(spans[0].textContent.replace(/,/g, ""), 10) || 0;
        if (spans[1]) {
          const m = spans[1].textContent.match(/of ([\d,]+)/);
          if (m) sumTarget += parseInt(m[1].replace(/,/g, ""), 10) || 0;
        }
      });
      const newPct = sumTarget > 0 ? Math.min(100, Math.round((sumCurrent / sumTarget) * 100)) : 0;
      overviewPct.style.width = `${newPct}%`;
      if (overviewText) overviewText.textContent = `${sumCurrent.toLocaleString()} / ${sumTarget.toLocaleString()} words`;
      if (overviewPctEl) overviewPctEl.textContent = `${newPct}%`;
    }
  }

  // ════════════════════════════════════════════════════════════
  //  WRITING LOG TAB
  // ════════════════════════════════════════════════════════════

  async function renderWritingLog() {
    const panel = el("th-panel");

    // Fetch chapters for the dropdown.
    const { data: chapters } = await SB
      .from("thesis_chapters")
      .select("id, title")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    const chapterMap = {};
    (chapters || []).forEach((c) => { chapterMap[c.id] = c.title; });

    const opts = (chapters || [])
      .map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`)
      .join("");

    panel.innerHTML = `
      <div class="r-form th-addform">
        <div class="r-field">
          <label>Chapter</label>
          <select id="tl-chapter">
            <option value="">— general / no chapter —</option>
            ${opts}
          </select>
        </div>
        <div class="r-row2">
          <div class="r-field"><label>Words written</label><input id="tl-words" type="number" min="0" placeholder="500" /></div>
          <div class="r-field"><label>Minutes spent</label><input id="tl-mins" type="number" min="0" placeholder="45" /></div>
        </div>
        <div class="r-field"><label>Note <span class="r-label-optional">(optional)</span></label><input id="tl-note" type="text" placeholder="what did you write about?" /></div>
        <button id="tl-save" class="btn-primary r-btn">Log session</button>
        <p id="tl-status" class="r-status"></p>
      </div>
      <div id="th-log-list" class="r-list"></div>`;

    el("tl-save").addEventListener("click", () => addWritingLog(chapters || [], chapterMap));
    await drawWritingLog(chapterMap);
  }

  async function addWritingLog(chapters, chapterMap) {
    const msg   = el("tl-status");
    const words = parseInt(el("tl-words").value, 10);
    if (!words || words <= 0) { msg.textContent = "Enter how many words you wrote."; return; }

    const chapterId = el("tl-chapter").value || null;
    const row = {
      chapter_id:    chapterId,
      words_written: words,
      duration_mins: parseInt(el("tl-mins").value, 10) || null,
      notes:         el("tl-note").value.trim() || null,
    };
    msg.textContent = "Logging…";
    const { error: logErr } = await SB.from("thesis_writing_logs").insert(row);
    if (logErr) { console.error(logErr); msg.textContent = "Couldn't save. Try again."; return; }

    // Also update chapter current_words if a chapter was selected.
    if (chapterId) {
      const chapter = chapters.find((c) => c.id === chapterId);
      if (chapter) {
        const { data: latest } = await SB.from("thesis_chapters").select("current_words").eq("id", chapterId).single();
        const newTotal = ((latest && latest.current_words) || 0) + words;
        await SB.from("thesis_chapters").update({ current_words: newTotal }).eq("id", chapterId);
      }
    }

    el("tl-words").value = "";
    el("tl-mins").value  = "";
    el("tl-note").value  = "";
    msg.textContent = "";
    await drawWritingLog(chapterMap);
  }

  async function drawWritingLog(chapterMap) {
    const list = el("th-log-list");
    const { data, error } = await SB
      .from("thesis_writing_logs")
      .select("*")
      .order("logged_at", { ascending: false })
      .limit(50);
    if (error) { console.error(error); list.innerHTML = `<p class="r-status">Couldn't load the log.</p>`; return; }
    const logs = data || [];
    if (!logs.length) {
      list.innerHTML = `<div class="empty"><h2>No writing sessions yet</h2><p>Log your first session above, or use the "Log words" button on a chapter card.</p></div>`;
      return;
    }

    // Group by date for a cleaner view.
    const groups = {};
    logs.forEach((entry) => {
      const dateKey = new Date(entry.logged_at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(entry);
    });

    list.innerHTML = Object.entries(groups).map(([date, entries]) => {
      const totalWords = entries.reduce((s, e) => s + (e.words_written || 0), 0);
      const rows = entries.map((entry) => {
        const chapterTitle = entry.chapter_id ? (chapterMap[entry.chapter_id] || "Unknown chapter") : null;
        return `
          <div class="th-log-entry" data-id="${esc(entry.id)}">
            <div class="th-log-meta">
              ${chapterTitle ? `<span class="r-chip th-log-chapter">${esc(chapterTitle)}</span>` : ""}
              <span class="th-log-words">${(entry.words_written || 0).toLocaleString()} words</span>
              ${entry.duration_mins ? `<span class="th-log-dur">${entry.duration_mins}min</span>` : ""}
            </div>
            ${entry.notes ? `<p class="th-log-note">${esc(entry.notes)}</p>` : ""}
            <div class="r-actions">
              <button class="r-mini r-del th-del-log" data-id="${esc(entry.id)}">Remove</button>
            </div>
          </div>`;
      }).join("");

      return `
        <div class="th-log-group">
          <div class="th-log-date-header">
            <span class="th-log-date">${esc(date)}</span>
            <span class="th-log-day-total">${totalWords.toLocaleString()} words</span>
          </div>
          ${rows}
        </div>`;
    }).join("");

    list.querySelectorAll(".th-del-log").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!window.confirm("Remove this log entry?")) return;
        const { error } = await SB.from("thesis_writing_logs").delete().eq("id", btn.dataset.id);
        if (error) { console.error(error); return; }
        drawWritingLog(chapterMap);
      });
    });
  }

  window.renderThesis = render;
})();
