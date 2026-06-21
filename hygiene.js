/* ─────────────────────────────────────────────────────────────
   dmico life os — Hygiene module
   Two tabs:
     Chores  — cleaning tasks with interval tracker and "Mark done".
     Supplies — product inventory with status badge + decrement / restock.
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
  function daysSince(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.floor((now - d) / 86400000);
  }
  function lastDoneLabel(iso) {
    const n = daysSince(iso);
    if (n === null) return "never done";
    if (n === 0) return "done today";
    if (n === 1) return "done yesterday";
    return `${n} days ago`;
  }
  function choreUrgency(item) {
    if (!item.interval_days) return "";
    const n = daysSince(item.last_done);
    if (n === null || n >= item.interval_days) return "past";
    if (n >= item.interval_days - 1) return "soon";
    return "ok";
  }

  // ── layout ─────────────────────────────────────────────────
  function render(container, sb) {
    SB = sb;
    root = container;
    root.innerHTML = `
      <div class="r-tabs" role="tablist">
        <button class="r-tab current" data-tab="chores">Chores</button>
        <button class="r-tab" data-tab="supplies">Supplies</button>
        <button class="r-tab" data-tab="routine">Routine</button>
      </div>
      <div id="h-panel"></div>`;
    root.querySelectorAll(".r-tab").forEach((t) =>
      t.addEventListener("click", () => {
        root.querySelectorAll(".r-tab").forEach((x) => x.classList.toggle("current", x === t));
        const tab = t.dataset.tab;
        if (tab === "chores") renderChores();
        else if (tab === "supplies") renderSupplies();
        else renderRoutine();
      })
    );
    renderChores();
  }

  // ════════════════════════════════════════════════════════════
  //  CHORES TAB
  // ════════════════════════════════════════════════════════════

  async function renderChores() {
    const panel = el("h-panel");
    panel.innerHTML = `
      <div class="r-form h-addform">
        <div class="r-field"><label>Chore name</label><input id="hc-name" type="text" placeholder="e.g. Wipe bathroom sink" /></div>
        <div class="r-row2">
          <div class="r-field"><label>Category</label><input id="hc-cat" type="text" placeholder="e.g. Bathroom" /></div>
          <div class="r-field"><label>Do every N days</label><input id="hc-interval" type="number" min="1" placeholder="7" /></div>
        </div>
        <div class="r-field"><label>Notes</label><input id="hc-notes" type="text" placeholder="optional" /></div>
        <button id="hc-save" class="btn-primary r-btn">Add chore</button>
        <p id="hc-status" class="r-status"></p>
      </div>
      <div id="h-chores" class="r-list"></div>`;
    el("hc-save").addEventListener("click", addChore);
    await drawChores();
  }

  async function addChore() {
    const status = el("hc-status");
    const name = el("hc-name").value.trim();
    if (!name) { status.textContent = "Give the chore a name first."; return; }
    const row = {
      name,
      category:     el("hc-cat").value.trim() || null,
      interval_days: parseInt(el("hc-interval").value) || null,
      notes:         el("hc-notes").value.trim() || null,
      added_via:     "web",
    };
    status.textContent = "Adding…";
    const { error } = await SB.from("hygiene_items").insert(row);
    if (error) { console.error(error); status.textContent = "Couldn't add it. Try again."; return; }
    ["hc-name", "hc-cat", "hc-interval", "hc-notes"].forEach((id) => (el(id).value = ""));
    status.textContent = "";
    await drawChores();
  }

  async function drawChores() {
    const list = el("h-chores");
    const { data, error } = await SB.from("hygiene_items").select("*").order("name", { ascending: true });
    if (error) { console.error(error); list.innerHTML = `<p class="r-status">Couldn't load chores.</p>`; return; }
    const items = data || [];
    if (!items.length) {
      list.innerHTML = `<div class="empty"><h2>No chores yet</h2><p>Add one above and it shows up here with a timer. Hit "Done" after you finish it.</p></div>`;
      return;
    }
    list.innerHTML = "";
    items.forEach((item) => buildChoreCard(item, list));
  }

  function buildChoreCard(item, container) {
    const urgency = choreUrgency(item);
    const card = document.createElement("div");
    card.className = "r-card";
    card.dataset.itemId = item.id;

    const intervalText = item.interval_days ? `every ${item.interval_days} days` : "no interval set";
    const categoryText = item.category ? `<span class="r-chip h-cat">${esc(item.category)}</span>` : "";

    card.innerHTML = `
      <div class="h-chore-top">
        <div class="h-chore-left">
          <h3 class="r-title">${esc(item.name)}</h3>
          <div class="r-meta">${intervalText}${item.notes ? `  &middot;  ${esc(item.notes)}` : ""}</div>
        </div>
        <div class="h-chore-right">
          ${categoryText}
          <span class="h-since ${urgency}">${lastDoneLabel(item.last_done)}</span>
        </div>
      </div>
      <div class="r-actions">
        <button class="r-mini h-done-btn">Done</button>
        <button class="r-mini r-del">Remove</button>
      </div>`;

    card.querySelector(".h-done-btn").addEventListener("click", () => markChoreDone(item.id, card));
    card.querySelector(".r-del").addEventListener("click", async () => {
      if (!window.confirm(`Remove "${item.name}"?`)) return;
      const { error } = await SB.from("hygiene_items").delete().eq("id", item.id);
      if (error) { console.error(error); alert("Couldn't remove it."); return; }
      drawChores();
    });

    container.appendChild(card);
  }

  async function markChoreDone(id, card) {
    const btn = card.querySelector(".h-done-btn");
    btn.disabled = true;
    btn.textContent = "Saving…";

    const now = new Date().toISOString();
    const { error } = await SB.from("hygiene_items").update({ last_done: now }).eq("id", id);
    if (error) {
      console.error(error);
      btn.disabled = false;
      btn.textContent = "Done";
      return;
    }
    await drawChores();
  }

  // ════════════════════════════════════════════════════════════
  //  SUPPLIES TAB
  // ════════════════════════════════════════════════════════════

  // Status model: simple manual states, no quantities.
  const SUPPLY_STATES = [
    { key: "new",   label: "New" },
    { key: "low",   label: "Going Low" },
    { key: "empty", label: "Empty" },
  ];
  // Normalise any legacy value (ok/out/null) onto the new three-state model.
  function normStatus(raw) {
    const s = String(raw || "").toLowerCase();
    if (s === "low") return "low";
    if (s === "empty" || s === "out") return "empty";
    return "new"; // covers "new", "ok", null, anything unexpected
  }
  function statusLabel(key) {
    const found = SUPPLY_STATES.find((s) => s.key === key);
    return found ? found.label : "New";
  }

  async function renderSupplies() {
    const panel = el("h-panel");
    panel.innerHTML = `
      <div class="r-form h-addform">
        <div class="r-field"><label>Product name</label><input id="hp-name" type="text" placeholder="e.g. Shampoo" /></div>
        <div class="r-field"><label>Category</label><input id="hp-cat" type="text" placeholder="e.g. Hair" /></div>
        <div class="r-field"><label>Notes</label><input id="hp-notes" type="text" placeholder="optional" /></div>
        <button id="hp-save" class="btn-primary r-btn">Add product</button>
        <p id="hp-status" class="r-status"></p>
      </div>
      <div id="h-products" class="r-list"></div>`;
    el("hp-save").addEventListener("click", addProduct);
    await drawProducts();
  }

  async function addProduct() {
    const status = el("hp-status");
    const name = el("hp-name").value.trim();
    if (!name) { status.textContent = "Give the product a name first."; return; }
    const row = {
      name,
      category:  el("hp-cat").value.trim() || null,
      status:    "new", // freshly stocked; flip it down with the buttons later
      notes:     el("hp-notes").value.trim() || null,
      added_via: "web",
    };
    status.textContent = "Adding…";
    const { error } = await SB.from("hygiene_products").insert(row);
    if (error) { console.error(error); status.textContent = "Couldn't add it. Try again."; return; }
    ["hp-name", "hp-cat", "hp-notes"].forEach((id) => (el(id).value = ""));
    status.textContent = "";
    await drawProducts();
  }

  async function drawProducts() {
    const list = el("h-products");
    const { data, error } = await SB.from("hygiene_products").select("*").order("name", { ascending: true });
    if (error) { console.error(error); list.innerHTML = `<p class="r-status">Couldn't load products.</p>`; return; }
    const items = data || [];
    if (!items.length) {
      list.innerHTML = `<div class="empty"><h2>No products yet</h2><p>Track your shampoo, soap, and supplies here. Tap New, Going Low, or Empty to set where each one's at. The bot pings you when something is low or empty.</p></div>`;
      return;
    }
    list.innerHTML = "";
    items.forEach((item) => buildProductCard(item, list));
  }

  function buildProductCard(item, container) {
    const card = document.createElement("div");
    card.className = "r-card";
    card.dataset.productId = item.id;

    const st = normStatus(item.status);
    const categoryText = item.category ? `<span class="r-chip h-cat">${esc(item.category)}</span>` : "";
    const metaText = item.notes ? esc(item.notes) : "Tap a status below to update.";

    const stateButtons = SUPPLY_STATES.map((s) =>
      `<button class="r-mini h-state-btn ${s.key === st ? "active" : ""}" data-state="${s.key}">${s.label}</button>`
    ).join("");

    card.innerHTML = `
      <div class="h-product-top">
        <div class="h-product-left">
          <h3 class="r-title">${esc(item.name)}</h3>
          <div class="r-meta">${metaText}</div>
        </div>
        <div class="h-product-right">
          ${categoryText}
          <span class="h-status h-status-${st}">${statusLabel(st)}</span>
        </div>
      </div>
      <div class="r-actions">
        ${stateButtons}
        <button class="r-mini r-del">Remove</button>
      </div>`;

    card.querySelectorAll(".h-state-btn").forEach((btn) =>
      btn.addEventListener("click", () => setProductStatus(item, card, btn.dataset.state))
    );
    card.querySelector(".r-del").addEventListener("click", async () => {
      if (!window.confirm(`Remove "${item.name}"?`)) return;
      const { error } = await SB.from("hygiene_products").delete().eq("id", item.id);
      if (error) { console.error(error); alert("Couldn't remove it."); return; }
      drawProducts();
    });

    container.appendChild(card);
  }

  async function setProductStatus(item, card, newStatus) {
    const prev = normStatus(item.status);
    const next = normStatus(newStatus);
    if (next === prev) return; // no-op, already there
    const { error } = await SB.from("hygiene_products")
      .update({ status: next })
      .eq("id", item.id);
    if (error) { console.error(error); return; }
    item.status = next;
    refreshProductCard(item, card);
  }

  function refreshProductCard(item, card) {
    const st = normStatus(item.status);
    const stEl = card.querySelector(".h-status");
    if (stEl) { stEl.textContent = statusLabel(st); stEl.className = `h-status h-status-${st}`; }
    card.querySelectorAll(".h-state-btn").forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.state === st)
    );
  }

  // ════════════════════════════════════════════════════════════
  //  ROUTINE TAB (interactive anatomy figure)
  // ════════════════════════════════════════════════════════════

  let routineData = [];
  let routineSide = "front";

  // Hotspot positions on the figure (viewBox 0 0 220 470).
  const HOTSPOTS = {
    front: {
      scalp: [110, 24], face: [110, 50], mouth: [110, 76],
      armpits: [72, 120], belly_button: [110, 180], personal: [110, 238], feet: [110, 450],
    },
    back: {
      behind_ears: [132, 50], back: [110, 150],
    },
  };

  async function renderRoutine() {
    const panel = el("h-panel");
    panel.innerHTML = `<p class="r-status">Loading routine…</p>`;
    const { data, error } = await SB.from("hygiene_routines").select("*").order("sort_order", { ascending: true });
    if (error) { console.error(error); panel.innerHTML = `<p class="r-status">Couldn't load the routine.</p>`; return; }
    routineData = data || [];
    drawRoutine(null);
  }

  const globalRow = () => routineData.find((r) => r.area_key === "__global__");
  const areaRow = (key) => routineData.find((r) => r.area_key === key);
  const areasOnSide = (side) =>
    routineData.filter((r) => r.area_key !== "__global__" && (r.side || "front") === side);

  function bodySilhouette() {
    return `
      <circle cx="110" cy="48" r="30" class="hr-body"/>
      <rect x="100" y="74" width="20" height="14" class="hr-body"/>
      <rect x="72" y="86" width="76" height="150" rx="24" class="hr-body"/>
      <rect x="44" y="92" width="20" height="120" rx="10" class="hr-body"/>
      <rect x="156" y="92" width="20" height="120" rx="10" class="hr-body"/>
      <rect x="76" y="224" width="68" height="44" rx="16" class="hr-body"/>
      <rect x="80" y="258" width="24" height="180" rx="12" class="hr-body"/>
      <rect x="116" y="258" width="24" height="180" rx="12" class="hr-body"/>
      <ellipse cx="92" cy="448" rx="16" ry="10" class="hr-body"/>
      <ellipse cx="128" cy="448" rx="16" ry="10" class="hr-body"/>`;
  }

  function figureSVG(side, activeKey) {
    const spots = HOTSPOTS[side] || {};
    const dots = Object.entries(spots).map(([key, [x, y]]) => {
      const row = areaRow(key);
      if (!row) return "";
      const active = key === activeKey ? " active" : "";
      return `<g class="hr-hotspot${active}" data-area="${esc(key)}">
        <circle cx="${x}" cy="${y}" r="11" class="hr-dot"/>
        <title>${esc(row.label)}</title>
      </g>`;
    }).join("");
    return `<svg class="hr-figure-svg" viewBox="0 0 220 470" xmlns="http://www.w3.org/2000/svg">
      ${bodySilhouette()}
      ${dots}
    </svg>`;
  }

  function stepsHTML(steps) {
    steps = Array.isArray(steps) ? steps : [];
    const stepLi = (s) =>
      `<li>${esc(s.action || "")}${s.notes ? ` <span class="hr-step-note">(${esc(s.notes)})</span>` : ""}</li>`;
    const hasPhase = steps.some((s) => s.phase);
    if (!hasPhase) return `<ol class="hr-steps">${steps.map(stepLi).join("")}</ol>`;
    const phases = {};
    const order = [];
    steps.forEach((s) => {
      const p = s.phase || "Steps";
      if (!phases[p]) { phases[p] = []; order.push(p); }
      phases[p].push(s);
    });
    return order.map((p) =>
      `<div class="hr-phase"><span class="hr-phase-label">${esc(p)}</span><ol class="hr-steps">${phases[p].map(stepLi).join("")}</ol></div>`
    ).join("");
  }

  function areaDetailHTML(row) {
    if (!row) return `<div class="hr-detail-empty">Tap a body area to see its products, routine, and reminders.</div>`;
    const products = Array.isArray(row.products) ? row.products : [];
    const steps = Array.isArray(row.steps) ? row.steps : [];
    const meta = [row.frequency, row.when_to].filter(Boolean).join("  ·  ");
    return `
      <div class="hr-detail-card">
        <div class="hr-detail-head">
          <h3 class="r-title">${esc(row.label)}</h3>
          ${meta ? `<div class="r-meta">${esc(meta)}</div>` : ""}
        </div>
        ${products.length ? `<div class="hr-block"><span class="hr-block-label">Products</span><ul class="hr-products">${products.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>` : ""}
        ${steps.length ? `<div class="hr-block"><span class="hr-block-label">Routine</span>${stepsHTML(steps)}</div>` : ""}
        ${row.reminders ? `<div class="hr-reminder">${esc(row.reminders)}</div>` : ""}
        <div class="r-actions"><button class="r-mini hr-edit-btn" data-key="${esc(row.area_key)}">Edit</button></div>
      </div>`;
  }

  function drawRoutine(activeKey) {
    const panel = el("h-panel");
    const g = globalRow();
    const chips = areasOnSide(routineSide)
      .map((r) => `<button class="r-chip hr-chip${r.area_key === activeKey ? " on" : ""}" data-area="${esc(r.area_key)}">${esc(r.label)}</button>`)
      .join("");

    panel.innerHTML = `
      <div class="hr-wrap">
        <div class="hr-figure-col">
          <div class="hr-toggle r-tabs">
            <button class="r-tab ${routineSide === "front" ? "current" : ""}" data-side="front">Front</button>
            <button class="r-tab ${routineSide === "back" ? "current" : ""}" data-side="back">Back</button>
          </div>
          <div class="hr-figure">${figureSVG(routineSide, activeKey)}</div>
          <div class="hr-chips">${chips}</div>
          ${g && g.reminders ? `<div class="hr-global"><span class="hr-global-label">${esc(g.label || "Key reminders")}</span><p>${esc(g.reminders)}</p></div>` : ""}
        </div>
        <div class="hr-detail" id="hr-detail">${areaDetailHTML(areaRow(activeKey))}</div>
      </div>`;

    panel.querySelectorAll(".hr-toggle [data-side]").forEach((b) =>
      b.addEventListener("click", () => { routineSide = b.dataset.side; drawRoutine(null); }));
    panel.querySelectorAll(".hr-hotspot, .hr-chip").forEach((h) =>
      h.addEventListener("click", () => drawRoutine(h.dataset.area)));
    const editBtn = panel.querySelector(".hr-edit-btn");
    if (editBtn) editBtn.addEventListener("click", () => drawAreaEdit(editBtn.dataset.key));
  }

  function drawAreaEdit(key) {
    const row = areaRow(key);
    if (!row) return;
    const detail = el("hr-detail");
    const products = Array.isArray(row.products) ? row.products : [];
    const steps = Array.isArray(row.steps) ? row.steps : [];
    const stepLines = steps.map((s) =>
      `${s.phase ? s.phase + ": " : ""}${s.action || ""}${s.notes ? " (" + s.notes + ")" : ""}`).join("\n");
    detail.innerHTML = `
      <div class="hr-detail-card">
        <h3 class="r-title">Edit ${esc(row.label)}</h3>
        <div class="r-field"><label>Products <span class="r-label-optional">(one per line)</span></label><textarea class="hr-ed-products" rows="4">${esc(products.join("\n"))}</textarea></div>
        <div class="r-field"><label>Routine steps <span class="r-label-optional">(one per line, optional "PHASE: action (notes)")</span></label><textarea class="hr-ed-steps" rows="6">${esc(stepLines)}</textarea></div>
        <div class="r-row2">
          <div class="r-field"><label>Frequency</label><input class="hr-ed-freq" type="text" value="${esc(row.frequency || "")}" /></div>
          <div class="r-field"><label>When</label><input class="hr-ed-when" type="text" value="${esc(row.when_to || "")}" /></div>
        </div>
        <div class="r-field"><label>Reminders</label><textarea class="hr-ed-reminders" rows="2">${esc(row.reminders || "")}</textarea></div>
        <div class="r-actions">
          <button class="btn-primary r-btn hr-save">Save</button>
          <button class="r-mini hr-cancel">Cancel</button>
          <span class="hr-ed-status r-status"></span>
        </div>
      </div>`;
    detail.querySelector(".hr-cancel").addEventListener("click", () => drawRoutine(key));
    detail.querySelector(".hr-save").addEventListener("click", () => saveAreaEdit(key, detail));
  }

  function parseStepLine(line) {
    const m = line.match(/^\s*(?:([A-Za-z][A-Za-z ]*?):\s*)?(.*?)(?:\s*\(([^)]*)\))?\s*$/);
    const step = { action: (m && m[2] ? m[2].trim() : line.trim()) };
    if (m && m[1]) step.phase = m[1].trim();
    if (m && m[3]) step.notes = m[3].trim();
    return step;
  }

  async function saveAreaEdit(key, detail) {
    const row = areaRow(key);
    if (!row) return;
    const status = detail.querySelector(".hr-ed-status");
    const products = detail.querySelector(".hr-ed-products").value.split("\n").map((s) => s.trim()).filter(Boolean);
    const steps = detail.querySelector(".hr-ed-steps").value.split("\n").map((s) => s.trim()).filter(Boolean).map(parseStepLine);
    const patch = {
      products,
      steps,
      frequency: detail.querySelector(".hr-ed-freq").value.trim() || null,
      when_to: detail.querySelector(".hr-ed-when").value.trim() || null,
      reminders: detail.querySelector(".hr-ed-reminders").value.trim() || null,
      updated_at: new Date().toISOString(),
    };
    status.textContent = "Saving…";
    const { error } = await SB.from("hygiene_routines").update(patch).eq("id", row.id);
    if (error) { console.error(error); status.textContent = "Couldn't save. Try again."; return; }
    Object.assign(row, patch); // keep local cache in sync
    drawRoutine(key);
  }

  window.renderHygiene = render;
})();
