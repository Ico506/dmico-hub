/* ─────────────────────────────────────────────────────────────
   dmico life os — Research module (v1)
   Search papers via Crossref (keyless, browser-safe), save them to
   your Supabase library, tag them, and export BibTeX for writing.
   Semantic "find related" arrives next, once we add the edge function.
   ───────────────────────────────────────────────────────────── */

(function () {
  // Optional: set to your email for Crossref's "polite pool" (slightly more
  // reliable). Left blank so your address never sits in a public repo.
  const CROSSREF_MAILTO = "";

  let SB = null;          // Supabase client, handed in by the shell
  let root = null;        // container element
  let library = [];       // cached saved papers
  let activeTag = null;   // current tag filter in the library

  // ── helpers ────────────────────────────────────────────────
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const cleanAbstract = (a) =>
    !a ? "" : String(a).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

  function mapCrossref(item) {
    return {
      title: (item.title && item.title[0]) || "Untitled",
      authors: (item.author || [])
        .map((a) => [a.given, a.family].filter(Boolean).join(" "))
        .filter(Boolean),
      year: item.published?.["date-parts"]?.[0]?.[0] ?? null,
      venue: (item["container-title"] && item["container-title"][0]) || "",
      doi: item.DOI || "",
      url: item.URL || "",
      abstract: cleanAbstract(item.abstract),
      source: "crossref",
      external_id: item.DOI || "",
    };
  }

  function bibtexFrom(p) {
    const surname = ((p.authors && p.authors[0]) || "Unknown").split(" ").pop();
    const yr = p.year || "nd";
    const word = (p.title || "ref").split(/\s+/)[0].replace(/[^A-Za-z0-9]/g, "");
    const key = `${surname}${yr}${word}`.toLowerCase();
    const lines = [`@article{${key},`, `  title={${p.title}},`];
    if (p.authors && p.authors.length) lines.push(`  author={${p.authors.join(" and ")}},`);
    if (p.year) lines.push(`  year={${p.year}},`);
    if (p.venue) lines.push(`  journal={${p.venue}},`);
    if (p.doi) lines.push(`  doi={${p.doi}},`);
    if (p.url) lines.push(`  url={${p.url}},`);
    lines.push(`}`);
    return lines.join("\n");
  }

  function meta(p) {
    const bits = [];
    if (p.authors && p.authors.length) {
      bits.push(p.authors.length > 3 ? p.authors.slice(0, 3).join(", ") + " et al." : p.authors.join(", "));
    }
    if (p.year) bits.push(p.year);
    if (p.venue) bits.push(p.venue);
    return bits.join("  ·  ");
  }

  async function copy(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      if (btn) { const t = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = t), 1400); }
    } catch { alert("Couldn't copy. Your browser blocked clipboard access."); }
  }

  // ── layout ─────────────────────────────────────────────────
  function render(container, sb) {
    SB = sb;
    root = container;
    root.innerHTML = `
      <div class="r-tabs" role="tablist">
        <button class="r-tab current" data-tab="discover">Discover</button>
        <button class="r-tab" data-tab="library">Library</button>
        <button class="r-tab" data-tab="add">Add by hand</button>
      </div>
      <div id="r-panel"></div>`;
    root.querySelectorAll(".r-tab").forEach((t) =>
      t.addEventListener("click", () => {
        root.querySelectorAll(".r-tab").forEach((x) => x.classList.toggle("current", x === t));
        openTab(t.dataset.tab);
      })
    );
    openTab("discover");
    loadLibrary(); // warm the cache so the Library tab is instant
  }

  function openTab(tab) {
    const panel = document.getElementById("r-panel");
    if (tab === "discover") return renderDiscover(panel);
    if (tab === "library") return renderLibrary(panel);
    if (tab === "add") return renderAdd(panel);
  }

  // ── Discover ───────────────────────────────────────────────
  function renderDiscover(panel) {
    panel.innerHTML = `
      <div class="r-searchbar">
        <input id="r-q" type="search" placeholder="Search papers — title, topic, author…" />
        <button id="r-go" class="btn-primary r-btn">Search</button>
      </div>
      <p id="r-status" class="r-status"></p>
      <div id="r-results" class="r-list"></div>`;
    const q = document.getElementById("r-q");
    const go = () => searchCrossref(q.value.trim());
    document.getElementById("r-go").addEventListener("click", go);
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    q.focus();
  }

  async function searchCrossref(query) {
    const status = document.getElementById("r-status");
    const list = document.getElementById("r-results");
    if (!query) { status.textContent = "Type something to search for."; return; }
    status.textContent = "Searching…";
    list.innerHTML = "";

    let url = "https://api.crossref.org/works?rows=12&select=title,author,published,container-title,DOI,URL,abstract"
      + "&query=" + encodeURIComponent(query);
    if (CROSSREF_MAILTO) url += "&mailto=" + encodeURIComponent(CROSSREF_MAILTO);

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const items = (data.message?.items || []).map(mapCrossref);
      if (!items.length) { status.textContent = "No papers matched that. Try different words."; return; }
      status.textContent = `${items.length} result${items.length > 1 ? "s" : ""}.`;
      list.innerHTML = "";
      items.forEach((p) => list.appendChild(resultCard(p)));
    } catch (e) {
      status.textContent = "Search couldn't reach Crossref just now. Give it a moment and try again.";
    }
  }

  function resultCard(p) {
    const card = document.createElement("div");
    card.className = "r-card";
    const inLib = library.some((x) => x.external_id && x.external_id === p.external_id);
    card.innerHTML = `
      <h3 class="r-title">${esc(p.title)}</h3>
      <div class="r-meta">${esc(meta(p))}</div>
      ${p.abstract ? `<p class="r-abstract">${esc(p.abstract.slice(0, 260))}${p.abstract.length > 260 ? "…" : ""}</p>` : ""}
      <div class="r-save-row">
        <input class="r-tags-in" type="text" placeholder="tags, comma separated" />
        <button class="btn-primary r-btn r-save">${inLib ? "In library" : "Save"}</button>
        ${p.url ? `<a class="r-link" href="${esc(p.url)}" target="_blank" rel="noopener">Open</a>` : ""}
      </div>`;
    const btn = card.querySelector(".r-save");
    if (inLib) btn.disabled = true;
    btn.addEventListener("click", async () => {
      const tags = card.querySelector(".r-tags-in").value.split(",").map((s) => s.trim()).filter(Boolean);
      btn.disabled = true; btn.textContent = "Saving…";
      const ok = await savePaper(p, tags);
      btn.textContent = ok ? "Saved" : "Try again";
      btn.disabled = ok;
    });
    return card;
  }

  async function savePaper(p, tags) {
    const row = {
      title: p.title, authors: p.authors, year: p.year, venue: p.venue,
      doi: p.doi, url: p.url, abstract: p.abstract, source: p.source,
      external_id: p.external_id, tags: tags && tags.length ? tags : null,
      bibtex: bibtexFrom(p), added_via: "web",
    };
    const { error } = await SB.from("research_papers").insert(row);
    if (error) { console.error(error); return false; }
    await loadLibrary();
    return true;
  }

  // ── Library ────────────────────────────────────────────────
  async function loadLibrary() {
    const { data, error } = await SB.from("research_papers")
      .select("*").order("created_at", { ascending: false });
    if (error) { console.error(error); return; }
    library = data || [];
  }

  async function renderLibrary(panel) {
    panel.innerHTML = `<p class="r-status">Loading your library…</p>`;
    await loadLibrary();

    if (!library.length) {
      panel.innerHTML = `<div class="empty">
        <h2>Your library is empty</h2>
        <p>Head to Discover, search for a paper, and save it. Everything you keep lands here, ready to tag and export.</p>
      </div>`;
      return;
    }

    const tags = [...new Set(library.flatMap((p) => p.tags || []))].sort();
    const shown = activeTag ? library.filter((p) => (p.tags || []).includes(activeTag)) : library;

    panel.innerHTML = `
      <div class="r-libbar">
        <input id="r-filter" type="search" placeholder="Filter your library…" />
        <button id="r-export" class="btn-ghost r-btn">Export .bib</button>
      </div>
      ${tags.length ? `<div class="r-chips">
        <button class="r-chip ${!activeTag ? "on" : ""}" data-tag="">all</button>
        ${tags.map((t) => `<button class="r-chip ${activeTag === t ? "on" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}
      </div>` : ""}
      <div id="r-lib" class="r-list"></div>`;

    const libEl = document.getElementById("r-lib");
    const draw = (items) => {
      libEl.innerHTML = "";
      items.forEach((p) => libEl.appendChild(libraryCard(p)));
    };
    draw(shown);

    document.getElementById("r-filter").addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase();
      const base = activeTag ? library.filter((p) => (p.tags || []).includes(activeTag)) : library;
      draw(base.filter((p) =>
        (p.title || "").toLowerCase().includes(q) ||
        (p.authors || []).join(" ").toLowerCase().includes(q) ||
        (p.venue || "").toLowerCase().includes(q)));
    });

    panel.querySelectorAll(".r-chip").forEach((c) =>
      c.addEventListener("click", () => { activeTag = c.dataset.tag || null; renderLibrary(panel); }));

    document.getElementById("r-export").addEventListener("click", () => exportBib(shown));
  }

  function libraryCard(p) {
    const card = document.createElement("div");
    card.className = "r-card";
    card.innerHTML = `
      <h3 class="r-title">${esc(p.title)}</h3>
      <div class="r-meta">${esc(meta(p))}</div>
      ${(p.tags && p.tags.length) ? `<div class="r-card-tags">${p.tags.map((t) => `<span class="r-tag">${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="r-actions">
        <button class="r-mini r-related">Find related</button>
        <button class="r-mini r-bib">Copy BibTeX</button>
        <button class="r-mini r-edit">Tags</button>
        ${p.url ? `<a class="r-mini" href="${esc(p.url)}" target="_blank" rel="noopener">Open</a>` : ""}
        <button class="r-mini r-del">Remove</button>
      </div>`;
    card.querySelector(".r-related").addEventListener("click", () => findRelated(p));
    card.querySelector(".r-bib").addEventListener("click", (e) => copy(p.bibtex || bibtexFrom(p), e.target));
    card.querySelector(".r-edit").addEventListener("click", () => editTags(p));
    card.querySelector(".r-del").addEventListener("click", () => removePaper(p));
    return card;
  }

  async function editTags(p) {
    const input = window.prompt("Tags, comma separated", (p.tags || []).join(", "));
    if (input === null) return;
    const tags = input.split(",").map((s) => s.trim()).filter(Boolean);
    const { error } = await SB.from("research_papers")
      .update({ tags: tags.length ? tags : null, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) { console.error(error); alert("Couldn't update tags. Try again."); return; }
    activeTag = null;
    renderLibrary(document.getElementById("r-panel"));
  }

  async function removePaper(p) {
    if (!window.confirm(`Remove "${p.title}" from your library?`)) return;
    const { error } = await SB.from("research_papers").delete().eq("id", p.id);
    if (error) { console.error(error); alert("Couldn't remove it. Try again."); return; }
    renderLibrary(document.getElementById("r-panel"));
  }

  function exportBib(papers) {
    if (!papers.length) { alert("Nothing to export yet."); return; }
    const text = papers.map((p) => p.bibtex || bibtexFrom(p)).join("\n\n");
    const blob = new Blob([text], { type: "application/x-bibtex" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dmico-library.bib";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Add by hand ────────────────────────────────────────────
  function renderAdd(panel) {
    panel.innerHTML = `
      <div class="r-form">
        <div class="r-field"><label>Title</label><input id="a-title" type="text" /></div>
        <div class="r-field"><label>Authors (comma separated)</label><input id="a-authors" type="text" /></div>
        <div class="r-row2">
          <div class="r-field"><label>Year</label><input id="a-year" type="number" /></div>
          <div class="r-field"><label>Venue</label><input id="a-venue" type="text" /></div>
        </div>
        <div class="r-row2">
          <div class="r-field"><label>DOI</label><input id="a-doi" type="text" /></div>
          <div class="r-field"><label>Link</label><input id="a-url" type="text" /></div>
        </div>
        <div class="r-field"><label>Tags (comma separated)</label><input id="a-tags" type="text" /></div>
        <button id="a-save" class="btn-primary r-btn">Add to library</button>
        <p id="a-status" class="r-status"></p>
      </div>`;
    document.getElementById("a-save").addEventListener("click", async () => {
      const title = document.getElementById("a-title").value.trim();
      const status = document.getElementById("a-status");
      if (!title) { status.textContent = "A title is the one thing it needs."; return; }
      const p = {
        title,
        authors: document.getElementById("a-authors").value.split(",").map((s) => s.trim()).filter(Boolean),
        year: parseInt(document.getElementById("a-year").value, 10) || null,
        venue: document.getElementById("a-venue").value.trim(),
        doi: document.getElementById("a-doi").value.trim(),
        url: document.getElementById("a-url").value.trim(),
        abstract: "",
        source: "manual",
        external_id: document.getElementById("a-doi").value.trim(),
      };
      const tags = document.getElementById("a-tags").value.split(",").map((s) => s.trim()).filter(Boolean);
      status.textContent = "Adding…";
      const ok = await savePaper(p, tags);
      status.textContent = ok ? "Added. It's in your Library now." : "Couldn't add it. Try again.";
      if (ok) ["a-title", "a-authors", "a-year", "a-venue", "a-doi", "a-url", "a-tags"].forEach((id) => (document.getElementById(id).value = ""));
    });
  }

  // ── Find related (via the related-papers edge function) ──────
  async function findRelated(seed) {
    const panel = document.getElementById("r-panel");
    panel.innerHTML = `
      <button class="r-mini r-back">← Back to library</button>
      <h3 class="r-related-head">Related to <em>${esc(seed.title)}</em></h3>
      <p id="r-status" class="r-status">Finding related papers…</p>
      <div id="r-results" class="r-list"></div>`;
    panel.querySelector(".r-back").addEventListener("click", () => renderLibrary(panel));

    const status = document.getElementById("r-status");
    const list = document.getElementById("r-results");
    const body = { doi: seed.doi || "", title: seed.title || "" };

    try {
      const { data, error } = await SB.functions.invoke("related-papers", { body });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);

      const papers = (data && data.papers) || [];
      if (!papers.length) {
        status.textContent = "Nothing came back for this one, even by title.";
        return;
      }
      status.textContent = data.via === "search"
        ? `No precomputed neighbours, so here are the closest matches by title (${papers.length}).`
        : `${papers.length} related paper${papers.length > 1 ? "s" : ""}.`;
      papers.forEach((fp) => {
        const p = {
          title: fp.title, authors: fp.authors || [], year: fp.year, venue: fp.venue || "",
          doi: fp.doi || "", url: fp.url || "", abstract: "",
          source: "openalex", external_id: fp.doi || "",
        };
        list.appendChild(resultCard(p));
      });
    } catch (e) {
      status.textContent = "Couldn't fetch related papers. " + (e.message || "Try again in a moment.");
    }
  }

  window.renderResearch = render;
})();
