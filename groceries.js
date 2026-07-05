/* ─────────────────────────────────────────────────────────────
   dmico life os — Smart Groceries module (Phase 1)
   Two tabs:
     Inventory — what's in the kitchen, freshness badges, priority
                 stars, three tracking modes (status / count / level).
     Cookbook  — the cook log (what got cooked, from which source).
   The bot writes here too (#capture "bought ..."); this module talks
   to the same groceries_items / groceries_shelf_defaults / cook_log
   tables directly (instant personal-data writes, hygiene pattern).
   ───────────────────────────────────────────────────────────── */

(function () {
  let SB = null;
  let root = null;
  let DEFAULTS = [];   // groceries_shelf_defaults rows, loaded once per render

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const el = (id) => document.getElementById(id);

  // ── freshness helpers ──────────────────────────────────────
  function daysLeft(item) {
    if (!item.bought_on) return null;
    const bought = new Date(item.bought_on + "T00:00:00");
    const limit = new Date(bought.getTime() + (item.shelf_life_days || 7) * 86400000);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((limit - today) / 86400000);
  }
  function freshState(item) {
    const n = daysLeft(item);
    if (n === null) return "fresh";
    if (n < 0) return "past";
    const window = item.storage === "freezer" ? 14 : 2;
    return n <= window ? "soon" : "fresh";
  }
  function freshLabel(item) {
    const n = daysLeft(item);
    if (n === null) return "";
    if (n < 0) return `past date ${-n}d`;
    if (n === 0) return "use today";
    return `${n}d left`;
  }
  function isOut(item) {
    if (item.track_mode === "count") return (item.count ?? 0) <= 0;
    return item.status === "out";
  }

  // ── layout ─────────────────────────────────────────────────
  function render(container, sb) {
    SB = sb;
    root = container;
    root.innerHTML = `
      <div class="r-tabs" role="tablist">
        <button class="r-tab current" data-tab="inventory">Inventory</button>
        <button class="r-tab" data-tab="cookbook">Cookbook</button>
      </div>
      <div id="g-panel"></div>`;
    root.querySelectorAll(".r-tab").forEach((t) =>
      t.addEventListener("click", () => {
        root.querySelectorAll(".r-tab").forEach((x) => x.classList.toggle("current", x === t));
        if (t.dataset.tab === "inventory") renderInventory();
        else renderCookbook();
      })
    );
    renderInventory();
  }

  // ════════════════════════════════════════════════════════════
  //  INVENTORY TAB
  // ════════════════════════════════════════════════════════════

  async function loadDefaults() {
    if (DEFAULTS.length) return DEFAULTS;
    const { data, error } = await SB.from("groceries_shelf_defaults")
      .select("*").order("label", { ascending: true });
    if (error) { console.error(error); return []; }
    DEFAULTS = data || [];
    return DEFAULTS;
  }

  function defaultFor(category) {
    return DEFAULTS.find((d) => d.category === category) || null;
  }

  function storageAndLife(d) {
    if (!d) return { storage: "fridge", life: 7 };
    if (d.fridge_days) return { storage: "fridge", life: d.fridge_days };
    if (d.pantry_days) return { storage: "pantry", life: d.pantry_days };
    if (d.freezer_days) return { storage: "freezer", life: d.freezer_days };
    return { storage: "fridge", life: 7 };
  }

  function lifeForStorage(d, storage, fallback) {
    if (!d) return fallback;
    const map = { fridge: d.fridge_days, freezer: d.freezer_days, pantry: d.pantry_days };
    return map[storage] || fallback;
  }

  async function renderInventory() {
    const panel = el("g-panel");
    panel.innerHTML = `<p class="r-status">Loading…</p>`;
    await loadDefaults();
    const catOptions = DEFAULTS.map((d) =>
      `<option value="${esc(d.category)}">${esc(d.label)}</option>`).join("");

    panel.innerHTML = `
      <div id="g-eatfirst"></div>
      <div class="r-form g-addform">
        <div class="r-row2">
          <div class="r-field"><label>Item</label><input id="g-name" type="text" placeholder="e.g. Spinach" /></div>
          <div class="r-field"><label>Category</label><select id="g-cat">${catOptions}</select></div>
        </div>
        <div class="r-row2">
          <div class="r-field"><label>Storage</label>
            <select id="g-storage">
              <option value="fridge">Fridge</option>
              <option value="freezer">Freezer</option>
              <option value="pantry">Pantry</option>
            </select>
          </div>
          <div class="r-field"><label>Keeps for (days)</label><input id="g-life" type="number" min="1" placeholder="auto" /></div>
        </div>
        <div class="r-row2">
          <div class="r-field"><label>Count (countables only)</label><input id="g-count" type="number" min="0" placeholder="e.g. 6 eggs" /></div>
          <div class="r-field"><label>Bought on</label><input id="g-bought" type="date" /></div>
        </div>
        <div class="r-field"><label>Note</label><input id="g-note" type="text" placeholder="optional" /></div>
        <label class="g-priority-check"><input id="g-priority" type="checkbox" /> ⭐ Priority — cook this first</label>
        <div class="r-row2">
          <button id="g-save" class="btn-primary r-btn">Add item</button>
          <div class="r-field"><label>Run total (RM, optional → Finance)</label><input id="g-total" type="number" min="0" step="0.01" placeholder="logs a Groceries expense" /></div>
        </div>
        <p id="g-status" class="r-status"></p>
      </div>
      <div id="g-list" class="r-list"></div>`;

    el("g-bought").value = new Date().toISOString().slice(0, 10);
    el("g-cat").addEventListener("change", () => {
      const d = defaultFor(el("g-cat").value);
      const s = storageAndLife(d);
      el("g-storage").value = s.storage;
      el("g-life").placeholder = String(s.life);
    });
    el("g-storage").addEventListener("change", () => {
      const d = defaultFor(el("g-cat").value);
      const s = storageAndLife(d);
      el("g-life").placeholder = String(lifeForStorage(d, el("g-storage").value, s.life));
    });
    el("g-save").addEventListener("click", addItem);
    await drawInventory();
  }

  async function addItem() {
    const status = el("g-status");
    const name = el("g-name").value.trim();
    if (!name) { status.textContent = "Give the item a name first."; return; }
    const cat = el("g-cat").value;
    const d = defaultFor(cat);
    const storage = el("g-storage").value;
    const fallback = storageAndLife(d).life;
    const life = parseInt(el("g-life").value) || lifeForStorage(d, storage, fallback);
    const countRaw = el("g-count").value;
    const count = countRaw === "" ? null : Math.max(0, parseInt(countRaw) || 0);
    const mode = count !== null ? "count" : (d ? d.default_track_mode : "status");

    const row = {
      name,
      category: cat,
      priority: el("g-priority").checked,
      track_mode: mode,
      status: mode === "level" ? "full" : "have",
      count: mode === "count" ? (count ?? 1) : null,
      bought_on: el("g-bought").value || new Date().toISOString().slice(0, 10),
      shelf_life_days: life,
      storage,
      note: el("g-note").value.trim() || null,
      added_via: "web",
    };
    status.textContent = "Adding…";
    const { error } = await SB.from("groceries_items").insert(row);
    if (error) { console.error(error); status.textContent = "Couldn't add it. Try again."; return; }

    // Optional run total -> one Groceries expense.
    const total = parseFloat(el("g-total").value);
    if (!isNaN(total) && total > 0) {
      const { error: fe } = await SB.from("finance_expenses").insert({
        amount: total, category: "Groceries", note: `grocery run (${name}…)`, added_via: "web",
      });
      if (fe) console.error("expense insert failed", fe);
      el("g-total").value = "";
    }

    ["g-name", "g-note", "g-count"].forEach((id) => (el(id).value = ""));
    el("g-priority").checked = false;
    status.textContent = "";
    await drawInventory();
  }

  async function drawInventory() {
    const list = el("g-list");
    const { data, error } = await SB.from("groceries_items")
      .select("*").order("bought_on", { ascending: true });
    if (error) { console.error(error); list.innerHTML = `<p class="r-status">Couldn't load the inventory. Has groceries.sql been run?</p>`; return; }
    const items = data || [];

    // "Eat me first" strip: priority > past-date > use-soon.
    const eat = el("g-eatfirst");
    const urgent = items.filter((i) => !isOut(i) &&
      (i.priority || freshState(i) !== "fresh"));
    urgent.sort((a, b) =>
      (b.priority - a.priority) ||
      ((daysLeft(a) ?? 999) - (daysLeft(b) ?? 999)));
    eat.innerHTML = urgent.length
      ? `<div class="g-eatfirst"><span class="g-eatfirst-title">🥬 Eat me first</span> ` +
        urgent.slice(0, 8).map((i) =>
          `<span class="g-eatchip g-eat-${freshState(i)}">${i.priority ? "⭐ " : ""}${esc(i.name)}${freshLabel(i) ? ` · ${freshLabel(i)}` : ""}</span>`
        ).join(" ") + `</div>`
      : "";

    if (!items.length) {
      list.innerHTML = `<div class="empty"><h2>Nothing tracked yet</h2>
        <p>Add groceries above, or type <code>bought spinach, 6 eggs</code> in #capture on Discord.</p></div>`;
      return;
    }

    list.innerHTML = "";
    ["fridge", "freezer", "pantry"].forEach((storage) => {
      const group = items.filter((i) => i.storage === storage);
      if (!group.length) return;
      const head = document.createElement("p");
      head.className = "g-group";
      head.textContent = { fridge: "🧊 Fridge", freezer: "❄️ Freezer", pantry: "🧺 Pantry" }[storage];
      list.appendChild(head);
      group.forEach((item) => buildItemCard(item, list));
    });
  }

  function trackControls(item) {
    if (item.track_mode === "count") {
      const n = item.count ?? 0;
      return `<span class="g-count">${n} left</span>
        <button class="r-mini" data-act="dec" ${n <= 0 ? "disabled" : ""}>−1</button>
        <button class="r-mini" data-act="inc">+1</button>`;
    }
    const steps = item.track_mode === "level"
      ? ["full", "half", "low", "out"] : ["have", "low", "out"];
    return steps.map((s) =>
      `<button class="r-mini g-state ${item.status === s ? "g-state-on" : ""}" data-act="status" data-status="${s}">${s}</button>`
    ).join("");
  }

  function buildItemCard(item, container) {
    const state = freshState(item);
    const out = isOut(item);
    const card = document.createElement("div");
    card.className = "g-card" + (out ? " g-card-out" : "");
    card.innerHTML = `
      <div class="g-card-left">
        <div class="g-card-name">${item.priority ? "⭐ " : ""}${esc(item.name)}
          ${out ? `<span class="h-status h-status-out">out</span>`
                : `<span class="h-status ${state === "past" ? "h-status-out" : state === "soon" ? "h-status-low" : "h-status-ok"}">${esc(freshLabel(item) || "fresh")}</span>`}
        </div>
        <div class="g-card-meta">${esc((item.category || "other").replace(/_/g, " "))} · bought ${esc(item.bought_on || "?")} · keeps ${item.shelf_life_days}d${item.note ? " · " + esc(item.note) : ""}</div>
      </div>
      <div class="g-card-ctrls">${trackControls(item)}
        <button class="r-mini" data-act="priority" title="Toggle priority">${item.priority ? "★" : "☆"}</button>
        <button class="r-mini" data-act="life" title="Edit shelf life">⏳</button>
        <button class="r-mini g-del" data-act="del" title="Remove">✕</button>
      </div>`;

    card.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const act = btn.dataset.act;
        let patch = null;
        if (act === "dec") patch = { count: Math.max(0, (item.count ?? 0) - 1) };
        else if (act === "inc") patch = { count: (item.count ?? 0) + 1 };
        else if (act === "status") patch = { status: btn.dataset.status };
        else if (act === "priority") patch = { priority: !item.priority };
        else if (act === "life") {
          const v = prompt("Keeps for how many days?", String(item.shelf_life_days));
          const n = parseInt(v);
          if (!n || n < 1) return;
          patch = { shelf_life_days: n };
        } else if (act === "del") {
          if (!confirm(`Remove "${item.name}" from the inventory?`)) return;
          const { error } = await SB.from("groceries_items").delete().eq("id", item.id);
          if (error) { console.error(error); return; }
          await drawInventory();
          return;
        }
        if (!patch) return;
        patch.updated_at = new Date().toISOString();
        const { error } = await SB.from("groceries_items").update(patch).eq("id", item.id);
        if (error) { console.error(error); return; }
        await drawInventory();
      });
    });

    container.appendChild(card);
  }

  // ════════════════════════════════════════════════════════════
  //  COOKBOOK TAB (cook log — Phase 2 fills this automatically)
  // ════════════════════════════════════════════════════════════

  async function renderCookbook() {
    const panel = el("g-panel");
    panel.innerHTML = `
      <div class="r-form g-addform">
        <div class="r-row2">
          <div class="r-field"><label>Dish</label><input id="gc-dish" type="text" placeholder="e.g. Nasi goreng" /></div>
          <div class="r-field"><label>Source</label>
            <select id="gc-source">
              <option value="original">Damian original</option>
              <option value="internet">Internet recipe</option>
              <option value="gemma">Gemma proposal</option>
            </select>
          </div>
        </div>
        <div class="r-field"><label>Link (internet finds)</label><input id="gc-link" type="url" placeholder="optional" /></div>
        <div class="r-field"><label>Note</label><input id="gc-note" type="text" placeholder="optional — tweaks, verdict" /></div>
        <button id="gc-save" class="btn-primary r-btn">Log cooked meal</button>
        <p id="gc-status" class="r-status"></p>
      </div>
      <div id="gc-list" class="r-list"></div>`;
    el("gc-save").addEventListener("click", addCooked);
    await drawCookbook();
  }

  async function addCooked() {
    const status = el("gc-status");
    const dish = el("gc-dish").value.trim();
    if (!dish) { status.textContent = "Name the dish first."; return; }
    const row = {
      dish,
      source: el("gc-source").value,
      link: el("gc-link").value.trim() || null,
      note: el("gc-note").value.trim() || null,
      added_via: "web",
    };
    status.textContent = "Logging…";
    const { error } = await SB.from("cook_log").insert(row);
    if (error) { console.error(error); status.textContent = "Couldn't log it. Try again."; return; }
    ["gc-dish", "gc-link", "gc-note"].forEach((id) => (el(id).value = ""));
    status.textContent = "";
    await drawCookbook();
  }

  const SOURCE_LABEL = { original: "🍳 original", internet: "🌐 internet", gemma: "✨ gemma" };

  async function drawCookbook() {
    const list = el("gc-list");
    const { data, error } = await SB.from("cook_log")
      .select("*").order("cooked_on", { ascending: false }).limit(100);
    if (error) { console.error(error); list.innerHTML = `<p class="r-status">Couldn't load the cookbook. Has groceries.sql been run?</p>`; return; }
    const rows = data || [];
    if (!rows.length) {
      list.innerHTML = `<div class="empty"><h2>Empty cookbook</h2>
        <p>Log what you cook above. Once the Cook button lands (Phase 2), proposals you cook get logged automatically, and 👍 dishes come back as suggestions.</p></div>`;
      return;
    }
    list.innerHTML = "";
    rows.forEach((r) => {
      const card = document.createElement("div");
      card.className = "g-card";
      const name = r.link
        ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.dish)}</a>`
        : esc(r.dish);
      card.innerHTML = `
        <div class="g-card-left">
          <div class="g-card-name">${name}
            <span class="h-status h-status-ok">${SOURCE_LABEL[r.source] || esc(r.source)}</span>
            ${r.liked === true ? "👍" : r.liked === false ? "👎" : ""}
          </div>
          <div class="g-card-meta">${esc(r.cooked_on || "")}${r.note ? " · " + esc(r.note) : ""}</div>
        </div>
        <div class="g-card-ctrls">
          <button class="r-mini" data-act="up" title="Good — propose again">👍</button>
          <button class="r-mini" data-act="down" title="Bad — never again">👎</button>
          <button class="r-mini g-del" data-act="del" title="Delete entry">✕</button>
        </div>`;
      card.querySelectorAll("button[data-act]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const act = btn.dataset.act;
          if (act === "del") {
            if (!confirm(`Delete "${r.dish}" from the cookbook?`)) return;
            const { error } = await SB.from("cook_log").delete().eq("id", r.id);
            if (error) { console.error(error); return; }
          } else {
            const liked = act === "up";
            const { error } = await SB.from("cook_log")
              .update({ liked: r.liked === liked ? null : liked }).eq("id", r.id);
            if (error) { console.error(error); return; }
          }
          await drawCookbook();
        });
      });
      list.appendChild(card);
    });
  }

  window.renderGroceries = render;
})();
