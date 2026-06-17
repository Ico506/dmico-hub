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
      </div>
      <div id="h-panel"></div>`;
    root.querySelectorAll(".r-tab").forEach((t) =>
      t.addEventListener("click", () => {
        root.querySelectorAll(".r-tab").forEach((x) => x.classList.toggle("current", x === t));
        t.dataset.tab === "chores" ? renderChores() : renderSupplies();
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
      list.innerHTML = `<div class="empty"><h2>No chores yet</h2><p>Add one above and it shows up here with a timer. Hit "Mark done" after you do it.</p></div>`;
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
        <button class="r-mini h-done-btn">Mark done</button>
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
      btn.textContent = "Mark done";
      return;
    }
    // Update card in-place rather than full redraw.
    const sinceEl = card.querySelector(".h-since");
    if (sinceEl) { sinceEl.textContent = "done today"; sinceEl.className = "h-since ok"; }
    btn.disabled = false;
    btn.textContent = "Mark done";
  }

  // ════════════════════════════════════════════════════════════
  //  SUPPLIES TAB
  // ════════════════════════════════════════════════════════════

  async function renderSupplies() {
    const panel = el("h-panel");
    panel.innerHTML = `
      <div class="r-form h-addform">
        <div class="r-field"><label>Product name</label><input id="hp-name" type="text" placeholder="e.g. Shampoo" /></div>
        <div class="r-row2">
          <div class="r-field"><label>Category</label><input id="hp-cat" type="text" placeholder="e.g. Hair" /></div>
          <div class="r-field"><label>Unit</label><input id="hp-unit" type="text" placeholder="e.g. bottles" /></div>
        </div>
        <div class="r-row2">
          <div class="r-field"><label>Starting quantity</label><input id="hp-qty" type="number" min="0" step="0.5" placeholder="2" /></div>
          <div class="r-field"><label>Low threshold</label><input id="hp-low" type="number" min="0" step="0.5" placeholder="1" /></div>
        </div>
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
    const qty = parseFloat(el("hp-qty").value) || 0;
    const low = parseFloat(el("hp-low").value) || null;
    const computedStatus = qty <= 0 ? "out" : (low !== null && qty <= low ? "low" : "ok");
    const row = {
      name,
      category:      el("hp-cat").value.trim() || null,
      unit:          el("hp-unit").value.trim() || null,
      quantity:      qty,
      low_threshold: low,
      status:        computedStatus,
      notes:         el("hp-notes").value.trim() || null,
      added_via:     "web",
    };
    status.textContent = "Adding…";
    const { error } = await SB.from("hygiene_products").insert(row);
    if (error) { console.error(error); status.textContent = "Couldn't add it. Try again."; return; }
    ["hp-name", "hp-cat", "hp-unit", "hp-qty", "hp-low", "hp-notes"].forEach((id) => (el(id).value = ""));
    status.textContent = "";
    await drawProducts();
  }

  async function drawProducts() {
    const list = el("h-products");
    const { data, error } = await SB.from("hygiene_products").select("*").order("name", { ascending: true });
    if (error) { console.error(error); list.innerHTML = `<p class="r-status">Couldn't load products.</p>`; return; }
    const items = data || [];
    if (!items.length) {
      list.innerHTML = `<div class="empty"><h2>No products yet</h2><p>Track your shampoo, soap, and supplies here. Use — to decrement; flip to "out" when empty. The bot pings you when something runs low.</p></div>`;
      return;
    }
    list.innerHTML = "";
    items.forEach((item) => buildProductCard(item, list));
  }

  function buildProductCard(item, container) {
    const card = document.createElement("div");
    card.className = "r-card";
    card.dataset.productId = item.id;

    const st = item.status || "ok";
    const qtyLabel = item.quantity != null
      ? `${item.quantity}${item.unit ? " " + esc(item.unit) : ""}`
      : "quantity not set";
    const categoryText = item.category ? `<span class="r-chip h-cat">${esc(item.category)}</span>` : "";

    card.innerHTML = `
      <div class="h-product-top">
        <div class="h-product-left">
          <h3 class="r-title">${esc(item.name)}</h3>
          <div class="r-meta">${qtyLabel}${item.low_threshold != null ? `  &middot;  low at ${item.low_threshold}${item.unit ? " " + esc(item.unit) : ""}` : ""}${item.notes ? `  &middot;  ${esc(item.notes)}` : ""}</div>
        </div>
        <div class="h-product-right">
          ${categoryText}
          <span class="h-status h-status-${esc(st)}">${esc(st)}</span>
        </div>
      </div>
      <div class="r-actions">
        <button class="r-mini h-use-btn">Use one</button>
        <button class="r-mini h-restock-btn">Restock</button>
        <button class="r-mini r-del">Remove</button>
      </div>`;

    card.querySelector(".h-use-btn").addEventListener("click", () => useProduct(item, card));
    card.querySelector(".h-restock-btn").addEventListener("click", () => restockProduct(item, card));
    card.querySelector(".r-del").addEventListener("click", async () => {
      if (!window.confirm(`Remove "${item.name}"?`)) return;
      const { error } = await SB.from("hygiene_products").delete().eq("id", item.id);
      if (error) { console.error(error); alert("Couldn't remove it."); return; }
      drawProducts();
    });

    container.appendChild(card);
  }

  async function useProduct(item, card) {
    const newQty = Math.max(0, (item.quantity || 0) - 1);
    const newStatus = newQty <= 0 ? "out"
      : (item.low_threshold != null && newQty <= item.low_threshold ? "low" : "ok");
    const { error } = await SB.from("hygiene_products")
      .update({ quantity: newQty, status: newStatus })
      .eq("id", item.id);
    if (error) { console.error(error); return; }
    // Update local object and repaint card in-place.
    item.quantity = newQty; item.status = newStatus;
    refreshProductCard(item, card);
  }

  async function restockProduct(item, card) {
    const raw = window.prompt(`Restock "${item.name}" — enter new quantity${item.unit ? " (" + item.unit + ")" : ""}:`);
    if (raw === null) return; // cancelled
    const newQty = parseFloat(raw);
    if (isNaN(newQty) || newQty < 0) { alert("Enter a valid number."); return; }
    const newStatus = newQty <= 0 ? "out"
      : (item.low_threshold != null && newQty <= item.low_threshold ? "low" : "ok");
    const { error } = await SB.from("hygiene_products")
      .update({ quantity: newQty, status: newStatus })
      .eq("id", item.id);
    if (error) { console.error(error); return; }
    item.quantity = newQty; item.status = newStatus;
    refreshProductCard(item, card);
  }

  function refreshProductCard(item, card) {
    const st = item.status || "ok";
    const qtyLabel = item.quantity != null
      ? `${item.quantity}${item.unit ? " " + esc(item.unit) : ""}`
      : "quantity not set";
    const metaEl = card.querySelector(".r-meta");
    if (metaEl) {
      metaEl.textContent = `${qtyLabel}${item.low_threshold != null ? `  ·  low at ${item.low_threshold}${item.unit ? " " + item.unit : ""}` : ""}${item.notes ? `  ·  ${item.notes}` : ""}`;
    }
    const stEl = card.querySelector(".h-status");
    if (stEl) { stEl.textContent = st; stEl.className = `h-status h-status-${st}`; }
  }

  window.renderHygiene = render;
})();
