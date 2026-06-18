/* ─────────────────────────────────────────────────────────────
   dmico life os — Game Dev module
   Three tabs:
     Projects — JadeFrog Studio project tracker with status chips.
     DevLog   — chronological dev diary linked to projects.
     Ideas    — Kanban scratch-pad (Seed / Exploring / Shelved).
   ───────────────────────────────────────────────────────────── */

(function () {
  let SB = null;
  let root = null;

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const el = (id) => document.getElementById(id);

  // ── date helpers ───────────────────────────────────────────
  function relativeDate(iso) {
    if (!iso) return null;
    const d = new Date(iso + "T00:00:00");
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const days = Math.round((now - d) / 86400000);
    if (days === 0) return "started today";
    if (days === 1) return "started yesterday";
    if (days < 30) return `started ${days} days ago`;
    const months = Math.round(days / 30);
    if (months < 12) return `started ${months} month${months > 1 ? "s" : ""} ago`;
    const years = Math.round(days / 365);
    return `started ${years} year${years > 1 ? "s" : ""} ago`;
  }

  function logRelative(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.round((now - d) / 86400000);
    if (diff === 0) return "today";
    if (diff === 1) return "yesterday";
    if (diff < 7) return `${diff} days ago`;
    if (diff < 30) return `${Math.round(diff / 7)} weeks ago`;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // ── status helpers ─────────────────────────────────────────
  const STATUS_LABELS  = { active: "Active", on_hold: "On hold", shipped: "Shipped" };
  const IDEA_LABELS    = { seed: "Seed", exploring: "Exploring", shelved: "Shelved" };
  const IDEA_NEXT      = { seed: "exploring", exploring: "shelved", shelved: "seed" };
  const IDEA_PREV      = { seed: "shelved", exploring: "seed", shelved: "exploring" };
  const IDEA_ORDER     = ["seed", "exploring", "shelved"];

  // ── layout ─────────────────────────────────────────────────
  function render(container, sb) {
    SB = sb;
    root = container;
    root.innerHTML = `
      <div class="r-tabs" role="tablist">
        <button class="r-tab current" data-tab="projects">Projects</button>
        <button class="r-tab" data-tab="devlog">DevLog</button>
        <button class="r-tab" data-tab="ideas">Ideas</button>
      </div>
      <div id="gd-panel"></div>`;
    root.querySelectorAll(".r-tab").forEach((t) =>
      t.addEventListener("click", () => {
        root.querySelectorAll(".r-tab").forEach((x) => x.classList.toggle("current", x === t));
        const tab = t.dataset.tab;
        if (tab === "projects") renderProjects();
        else if (tab === "devlog") renderDevLog();
        else renderIdeas();
      })
    );
    renderProjects();
  }

  // ════════════════════════════════════════════════════════════
  //  PROJECTS TAB
  // ════════════════════════════════════════════════════════════

  async function renderProjects() {
    const panel = el("gd-panel");
    panel.innerHTML = `
      <div class="r-form gd-addform">
        <div class="r-field"><label>Project name</label><input id="gp-name" type="text" placeholder="e.g. Retro Museum VR" /></div>
        <div class="r-field"><label>One-line pitch</label><input id="gp-pitch" type="text" placeholder="What is this game about?" /></div>
        <div class="r-row2">
          <div class="r-field">
            <label>Status</label>
            <select id="gp-status">
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="shipped">Shipped</option>
            </select>
          </div>
          <div class="r-field"><label>Start date</label><input id="gp-start" type="date" /></div>
        </div>
        <div class="r-row2">
          <div class="r-field"><label>Engine</label><input id="gp-engine" type="text" placeholder="e.g. Unity" /></div>
          <div class="r-field"><label>Platform</label><input id="gp-platform" type="text" placeholder="e.g. PC, Mobile" /></div>
        </div>
        <div class="r-field"><label>Notes</label><input id="gp-notes" type="text" placeholder="optional" /></div>
        <button id="gp-save" class="btn-primary r-btn">Add project</button>
        <p id="gp-status-msg" class="r-status"></p>
      </div>
      <div id="gd-projects" class="r-list"></div>`;
    el("gp-save").addEventListener("click", addProject);
    await drawProjects();
  }

  async function addProject() {
    const msg = el("gp-status-msg");
    const name = el("gp-name").value.trim();
    if (!name) { msg.textContent = "Name the project first."; return; }
    const row = {
      name,
      pitch:      el("gp-pitch").value.trim() || null,
      status:     el("gp-status").value,
      start_date: el("gp-start").value || null,
      engine:     el("gp-engine").value.trim() || null,
      platform:   el("gp-platform").value.trim() || null,
      notes:      el("gp-notes").value.trim() || null,
      added_via:  "web",
    };
    msg.textContent = "Adding…";
    const { error } = await SB.from("gamedev_projects").insert(row);
    if (error) { console.error(error); msg.textContent = "Couldn't add it. Try again."; return; }
    ["gp-name", "gp-pitch", "gp-start", "gp-engine", "gp-platform", "gp-notes"].forEach((id) => (el(id).value = ""));
    el("gp-status").value = "active";
    msg.textContent = "";
    await drawProjects();
  }

  async function drawProjects() {
    const list = el("gd-projects");
    const { data, error } = await SB.from("gamedev_projects").select("*").order("created_at", { ascending: false });
    if (error) { console.error(error); list.innerHTML = `<p class="r-status">Couldn't load projects.</p>`; return; }
    const projects = data || [];
    if (!projects.length) {
      list.innerHTML = `<div class="empty"><h2>No projects yet</h2><p>Add a JadeFrog project above. Every entry you make in DevLog can link back here.</p></div>`;
      return;
    }

    // Fetch total spending per project from Finance in one query.
    // Gracefully skipped if the project_id column hasn't been added yet.
    const budgetMap = {};
    const ids = projects.map((p) => p.id);
    const { data: expenses } = await SB
      .from("finance_expenses")
      .select("project_id, amount")
      .in("project_id", ids);
    (expenses || []).forEach((e) => {
      if (e.project_id) {
        budgetMap[e.project_id] = (budgetMap[e.project_id] || 0) + Number(e.amount);
      }
    });

    list.innerHTML = "";
    projects.forEach((p) => buildProjectCard(p, list, budgetMap[p.id] || 0));
  }

  function buildProjectCard(p, container, budgetSpent) {
    const card = document.createElement("div");
    card.className = "r-card gd-project-card";
    card.dataset.projectId = p.id;

    const statusClass = `gd-status-${p.status || "active"}`;
    const statusLabel = STATUS_LABELS[p.status] || p.status;
    const rel = relativeDate(p.start_date);

    const metaParts = [];
    if (p.engine)   metaParts.push(esc(p.engine));
    if (p.platform) metaParts.push(esc(p.platform));
    if (p.start_date) metaParts.push(esc(p.start_date));

    card.innerHTML = `
      <div class="gd-proj-header">
        <div class="gd-proj-title-block">
          <h3 class="r-title">${esc(p.name)}</h3>
          ${p.pitch ? `<p class="gd-pitch">${esc(p.pitch)}</p>` : ""}
        </div>
        <span class="r-chip gd-status ${statusClass}">${statusLabel}</span>
      </div>
      ${metaParts.length ? `<div class="r-meta">${metaParts.join("  &middot;  ")}</div>` : ""}
      ${rel ? `<div class="gd-relative">${esc(rel)}</div>` : ""}
      ${p.notes ? `<p class="r-abstract">${esc(p.notes)}</p>` : ""}
      <div class="gd-budget">
        ${budgetSpent > 0
          ? `RM ${Number(budgetSpent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent`
          : "No expenses linked yet"}
      </div>
      <div class="r-actions">
        <select class="gd-status-select r-mini-select" data-id="${esc(p.id)}">
          <option value="active"  ${p.status === "active"  ? "selected" : ""}>Active</option>
          <option value="on_hold" ${p.status === "on_hold" ? "selected" : ""}>On hold</option>
          <option value="shipped" ${p.status === "shipped" ? "selected" : ""}>Shipped</option>
        </select>
        <button class="r-mini gd-quick-log-btn">Log</button>
        <button class="r-mini gd-ms-toggle-btn">Milestones</button>
        <button class="r-mini r-del">Remove</button>
      </div>
      <div class="gd-quick-log-form" hidden></div>
      <div class="gd-ms-area" hidden></div>`;

    card.querySelector(".gd-quick-log-btn").addEventListener("click", () => toggleQuickLog(p, card));
    card.querySelector(".gd-ms-toggle-btn").addEventListener("click", () => toggleMilestones(p, card));

    card.querySelector(".gd-status-select").addEventListener("change", async (e) => {
      const newStatus = e.target.value;
      const { error } = await SB.from("gamedev_projects").update({ status: newStatus }).eq("id", p.id);
      if (error) { console.error(error); return; }
      const chip = card.querySelector(".gd-status");
      chip.textContent = STATUS_LABELS[newStatus] || newStatus;
      chip.className = `r-chip gd-status gd-status-${newStatus}`;
      p.status = newStatus;
    });

    card.querySelector(".r-del").addEventListener("click", async () => {
      if (!window.confirm(`Remove "${p.name}"? DevLog entries linked to it will keep their project name but lose the link.`)) return;
      const { error } = await SB.from("gamedev_projects").delete().eq("id", p.id);
      if (error) { console.error(error); alert("Couldn't remove it."); return; }
      drawProjects();
    });

    container.appendChild(card);
  }

  // ── Quick log (inline form on project card) ────────────────
  function toggleQuickLog(p, card) {
    const formEl = card.querySelector(".gd-quick-log-form");
    if (!formEl.hidden) { formEl.hidden = true; formEl.innerHTML = ""; return; }
    formEl.innerHTML = `
      <textarea class="gd-log-ta" rows="3" placeholder="What did you work on?"></textarea>
      <div class="gd-log-actions">
        <button class="btn-primary r-btn gd-log-save-btn">Save</button>
        <button class="btn-ghost r-btn gd-log-cancel-btn">Cancel</button>
        <span class="gd-log-status r-status"></span>
      </div>`;
    formEl.hidden = false;
    formEl.querySelector(".gd-log-ta").focus();
    formEl.querySelector(".gd-log-cancel-btn").addEventListener("click", () => {
      formEl.hidden = true; formEl.innerHTML = "";
    });
    formEl.querySelector(".gd-log-save-btn").addEventListener("click", () => submitQuickLog(p, formEl));
  }

  async function submitQuickLog(p, formEl) {
    const ta     = formEl.querySelector(".gd-log-ta");
    const status = formEl.querySelector(".gd-log-status");
    const content = ta.value.trim();
    if (!content) { status.textContent = "Write something first."; return; }
    const saveBtn = formEl.querySelector(".gd-log-save-btn");
    saveBtn.disabled = true;
    status.textContent = "Logging…";
    const { error } = await SB.from("gamedev_logs").insert({
      content,
      project_id:   p.id,
      project_name: p.name,
      logged_at:    new Date().toISOString(),
      added_via:    "web",
    });
    if (error) {
      console.error(error);
      saveBtn.disabled = false;
      status.textContent = "Couldn't save. Try again.";
      return;
    }
    formEl.hidden = true;
    formEl.innerHTML = "";
  }

  // ════════════════════════════════════════════════════════════
  //  DEVLOG TAB
  // ════════════════════════════════════════════════════════════

  async function renderDevLog() {
    const panel = el("gd-panel");
    panel.innerHTML = `<div class="gd-addform r-form" id="gd-log-form-area"></div><div id="gd-logs" class="r-list"></div>`;
    await buildLogForm();
    await drawLogs();
  }

  async function buildLogForm() {
    const formArea = el("gd-log-form-area");
    // Fetch projects for the dropdown.
    const { data: projects } = await SB.from("gamedev_projects").select("id, name").order("name", { ascending: true });
    const opts = (projects || []).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");

    formArea.innerHTML = `
      <div class="r-field">
        <label>Project</label>
        <select id="gl-project">
          <option value="">— no project / general —</option>
          ${opts}
        </select>
      </div>
      <div class="r-field"><label>What did you do?</label><textarea id="gl-content" rows="3" placeholder="Finished the jump animation, fixed the wall-collision bug…"></textarea></div>
      <div class="r-field"><label>Date</label><input id="gl-date" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
      <button id="gl-save" class="btn-primary r-btn">Log it</button>
      <p id="gl-status" class="r-status"></p>`;
    el("gl-save").addEventListener("click", addLog.bind(null, projects || []));
  }

  async function addLog(projects) {
    const msg = el("gl-status");
    const content = el("gl-content").value.trim();
    if (!content) { msg.textContent = "Write something first."; return; }
    const projectId = el("gl-project").value || null;
    const projectName = projectId
      ? (projects.find((p) => p.id === projectId) || {}).name || null
      : null;
    const dateVal = el("gl-date").value;

    const row = {
      content,
      project_id:   projectId,
      project_name: projectName,
      logged_at:    dateVal ? new Date(dateVal + "T12:00:00").toISOString() : new Date().toISOString(),
      added_via:    "web",
    };
    msg.textContent = "Logging…";
    const { error } = await SB.from("gamedev_logs").insert(row);
    if (error) { console.error(error); msg.textContent = "Couldn't save. Try again."; return; }
    el("gl-content").value = "";
    el("gl-project").value = "";
    el("gl-date").value = new Date().toISOString().slice(0, 10);
    msg.textContent = "";
    await drawLogs();
  }

  async function drawLogs() {
    const list = el("gd-logs");
    const { data, error } = await SB.from("gamedev_logs").select("*").order("logged_at", { ascending: false });
    if (error) { console.error(error); list.innerHTML = `<p class="r-status">Couldn't load the log.</p>`; return; }
    const logs = data || [];
    if (!logs.length) {
      list.innerHTML = `<div class="empty"><h2>No log entries yet</h2><p>Write your first one above. This is your build diary.</p></div>`;
      return;
    }
    list.innerHTML = "";
    logs.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "r-card gd-log-entry";
      row.innerHTML = `
        <div class="gd-log-header">
          ${entry.project_name ? `<span class="r-chip gd-log-proj">${esc(entry.project_name)}</span>` : ""}
          <span class="gd-log-date">${logRelative(entry.logged_at)}</span>
        </div>
        <p class="gd-log-content">${esc(entry.content)}</p>
        <div class="r-actions">
          <button class="r-mini r-del" data-id="${esc(entry.id)}">Remove</button>
        </div>`;
      row.querySelector(".r-del").addEventListener("click", async () => {
        if (!window.confirm("Remove this log entry?")) return;
        const { error } = await SB.from("gamedev_logs").delete().eq("id", entry.id);
        if (error) { console.error(error); return; }
        drawLogs();
      });
      list.appendChild(row);
    });
  }

  // ════════════════════════════════════════════════════════════
  //  IDEAS TAB — Kanban
  // ════════════════════════════════════════════════════════════

  async function renderIdeas() {
    const panel = el("gd-panel");
    panel.innerHTML = `
      <div class="r-form gd-addform">
        <div class="r-field"><label>Idea title</label><input id="gi-title" type="text" placeholder="e.g. Haunted Toybox" /></div>
        <div class="r-row2">
          <div class="r-field"><label>Genre / type</label><input id="gi-genre" type="text" placeholder="e.g. puzzle platformer" /></div>
          <div class="r-field">
            <label>Start in column</label>
            <select id="gi-status">
              <option value="seed">Seed</option>
              <option value="exploring">Exploring</option>
              <option value="shelved">Shelved</option>
            </select>
          </div>
        </div>
        <div class="r-field"><label>One-line hook</label><input id="gi-hook" type="text" placeholder="What makes this interesting?" /></div>
        <div class="r-field"><label>Notes</label><input id="gi-notes" type="text" placeholder="optional" /></div>
        <button id="gi-save" class="btn-primary r-btn">Add idea</button>
        <p id="gi-status-msg" class="r-status"></p>
      </div>
      <div id="gd-kanban" class="gd-kanban"></div>`;
    el("gi-save").addEventListener("click", addIdea);
    await drawKanban();
  }

  async function addIdea() {
    const msg = el("gi-status-msg");
    const title = el("gi-title").value.trim();
    if (!title) { msg.textContent = "Give the idea a name."; return; }
    const row = {
      title,
      genre:    el("gi-genre").value.trim() || null,
      status:   el("gi-status").value,
      hook:     el("gi-hook").value.trim() || null,
      notes:    el("gi-notes").value.trim() || null,
      added_via: "web",
    };
    msg.textContent = "Adding…";
    const { error } = await SB.from("gamedev_ideas").insert(row);
    if (error) { console.error(error); msg.textContent = "Couldn't add it. Try again."; return; }
    ["gi-title", "gi-genre", "gi-hook", "gi-notes"].forEach((id) => (el(id).value = ""));
    el("gi-status").value = "seed";
    msg.textContent = "";
    await drawKanban();
  }

  async function drawKanban() {
    const board = el("gd-kanban");
    const { data, error } = await SB.from("gamedev_ideas").select("*").order("created_at", { ascending: false });
    if (error) { console.error(error); board.innerHTML = `<p class="r-status">Couldn't load ideas.</p>`; return; }
    const ideas = data || [];

    board.innerHTML = "";
    IDEA_ORDER.forEach((col) => {
      const colEl = document.createElement("div");
      colEl.className = "gd-col";
      colEl.dataset.col = col;

      const colIdeas = ideas.filter((i) => i.status === col);
      colEl.innerHTML = `
        <div class="gd-col-header">
          <span class="gd-col-label gd-col-${col}">${IDEA_LABELS[col]}</span>
          <span class="gd-col-count">${colIdeas.length}</span>
        </div>
        <div class="gd-col-cards" data-col="${col}"></div>`;

      const cardArea = colEl.querySelector(".gd-col-cards");
      colIdeas.forEach((idea) => buildIdeaCard(idea, cardArea));
      board.appendChild(colEl);
    });
  }

  function buildIdeaCard(idea, container) {
    const card = document.createElement("div");
    card.className = "gd-idea-card";
    card.dataset.ideaId = idea.id;

    const colIndex = IDEA_ORDER.indexOf(idea.status);
    const canLeft  = colIndex > 0;
    const canRight = colIndex < IDEA_ORDER.length - 1;

    card.innerHTML = `
      <div class="gd-idea-title">${esc(idea.title)}</div>
      ${idea.genre ? `<span class="r-chip gd-idea-genre">${esc(idea.genre)}</span>` : ""}
      ${idea.hook  ? `<p class="gd-idea-hook">${esc(idea.hook)}</p>` : ""}
      ${idea.notes ? `<p class="gd-idea-notes">${esc(idea.notes)}</p>` : ""}
      <div class="gd-idea-actions">
        <button class="gd-move-btn gd-move-left r-mini" ${canLeft ? "" : "disabled"} title="Move left">←</button>
        <button class="gd-move-btn gd-move-right r-mini" ${canRight ? "" : "disabled"} title="Move right">→</button>
        <button class="r-mini r-del gd-del-idea" style="margin-left:auto">Remove</button>
      </div>`;

    card.querySelector(".gd-move-left").addEventListener("click", () => moveIdea(idea, IDEA_PREV[idea.status]));
    card.querySelector(".gd-move-right").addEventListener("click", () => moveIdea(idea, IDEA_NEXT[idea.status]));
    card.querySelector(".gd-del-idea").addEventListener("click", async () => {
      if (!window.confirm(`Shelve this idea permanently? ("${idea.title}")`)) return;
      const { error } = await SB.from("gamedev_ideas").delete().eq("id", idea.id);
      if (error) { console.error(error); return; }
      drawKanban();
    });

    container.appendChild(card);
  }

  async function moveIdea(idea, newStatus) {
    const { error } = await SB.from("gamedev_ideas").update({ status: newStatus }).eq("id", idea.id);
    if (error) { console.error(error); return; }
    drawKanban();
  }

  // ════════════════════════════════════════════════════════════
  //  MILESTONES (inline in project cards)
  // ════════════════════════════════════════════════════════════

  async function toggleMilestones(p, card) {
    const area = card.querySelector(".gd-ms-area");
    if (!area.hidden) { area.hidden = true; area.innerHTML = ""; return; }
    area.hidden = false;
    await drawMilestones(p, area);
  }

  async function drawMilestones(p, area) {
    area.innerHTML = `<p class="r-status">Loading…</p>`;
    const { data, error } = await SB
      .from("gamedev_milestones")
      .select("*")
      .eq("project_id", p.id)
      .order("created_at", { ascending: true });
    if (error) { console.error(error); area.innerHTML = `<p class="r-status">Couldn't load milestones.</p>`; return; }
    const milestones = data || [];

    const openOnes = milestones.filter((m) => m.status === "open");
    const doneOnes = milestones.filter((m) => m.status === "done");
    const sorted   = [...openOnes, ...doneOnes];

    const today = new Date().toISOString().slice(0, 10);

    const rows = sorted.map((m) => {
      const isDone    = m.status === "done";
      const isOverdue = m.due_date && m.due_date < today && !isDone;
      return `
        <div class="gd-ms-item${isDone ? " gd-ms-item-done" : ""}" data-ms-id="${esc(m.id)}">
          <label class="gd-ms-check-label">
            <input type="checkbox" class="gd-ms-check" data-ms-id="${esc(m.id)}" ${isDone ? "checked" : ""} />
          </label>
          <span class="gd-ms-title">${esc(m.title)}</span>
          ${m.due_date ? `<span class="gd-ms-due${isOverdue ? " gd-ms-due-over" : ""}">${esc(m.due_date)}</span>` : ""}
          <button class="r-mini gd-ms-del" data-ms-id="${esc(m.id)}" title="Remove">×</button>
        </div>`;
    }).join("");

    area.innerHTML = `
      <div class="gd-ms-list">${rows || '<p class="r-status gd-ms-empty">No milestones yet.</p>'}</div>
      <div class="gd-ms-add-row">
        <input type="text" class="gd-ms-title-input" placeholder="New milestone…" />
        <input type="date" class="gd-ms-due-input" />
        <button class="r-mini gd-ms-add-btn">Add</button>
      </div>`;

    // Tick / untick
    area.querySelectorAll(".gd-ms-check").forEach((cb) => {
      cb.addEventListener("change", async () => {
        const newStatus = cb.checked ? "done" : "open";
        const { error: err } = await SB
          .from("gamedev_milestones")
          .update({ status: newStatus })
          .eq("id", cb.dataset.msId);
        if (err) { console.error(err); return; }
        const item = area.querySelector(`.gd-ms-item[data-ms-id="${cb.dataset.msId}"]`);
        if (item) item.classList.toggle("gd-ms-item-done", cb.checked);
      });
    });

    // Delete
    area.querySelectorAll(".gd-ms-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const { error: err } = await SB
          .from("gamedev_milestones")
          .delete()
          .eq("id", btn.dataset.msId);
        if (err) { console.error(err); return; }
        drawMilestones(p, area);
      });
    });

    // Add new
    area.querySelector(".gd-ms-add-btn").addEventListener("click", async () => {
      const titleInput = area.querySelector(".gd-ms-title-input");
      const dueInput   = area.querySelector(".gd-ms-due-input");
      const title = titleInput.value.trim();
      if (!title) { titleInput.focus(); return; }
      const { error: err } = await SB.from("gamedev_milestones").insert({
        project_id: p.id,
        title,
        due_date:   dueInput.value || null,
        status:     "open",
        added_via:  "web",
      });
      if (err) { console.error(err); return; }
      titleInput.value = "";
      dueInput.value   = "";
      drawMilestones(p, area);
    });

    // Allow Enter key in the title input to submit.
    area.querySelector(".gd-ms-title-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") area.querySelector(".gd-ms-add-btn").click();
    });
  }

  window.renderGameDev = render;
})();
