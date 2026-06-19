/* ─────────────────────────────────────────────────────────────
   dmico life os — Dashboard photo album (framed pictures rail)
   Right-hand rail on Home. Upload image files to the PRIVATE Supabase
   Storage bucket 'dashboard-photos'; the dashboard_photos table holds the
   object path. Rendered via short-lived signed URLs so nothing is public.
   Exposes window.renderDashboardPhotos(container, sb).
   ───────────────────────────────────────────────────────────── */

(function () {
  const BUCKET = "dashboard-photos";
  const MAX_BYTES = 5 * 1024 * 1024;     // 5 MB upload cap
  const SIGN_TTL = 3600;                 // signed-url lifetime (seconds)

  let SB = null;
  let ROOT = null;

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function extOf(name) {
    const m = /\.([a-zA-Z0-9]+)$/.exec(name || "");
    return m ? m[1].toLowerCase() : "jpg";
  }

  async function render(container, sb) {
    if (!container) return;
    SB = sb;
    ROOT = container;
    container.innerHTML = `
      <div class="photo-head">
        <h3 class="photo-title">Pictures</h3>
        <label class="photo-add" title="Add a photo">
          + Add
          <input id="photo-file" type="file" accept="image/*" hidden />
        </label>
      </div>
      <p id="photo-status" class="r-status"></p>
      <div id="photo-list" class="photo-list"></div>`;

    const input = container.querySelector("#photo-file");
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (file) uploadPhoto(file);
      input.value = ""; // allow re-selecting the same file later
    });

    await drawPhotos();
  }

  async function drawPhotos() {
    const list = ROOT.querySelector("#photo-list");
    const { data, error } = await SB
      .from("dashboard_photos")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      list.innerHTML = `<p class="r-status">Couldn't load photos.</p>`;
      return;
    }

    const rows = data || [];
    if (!rows.length) {
      list.innerHTML = `<div class="photo-empty">No pictures yet. Hit <b>+ Add</b> to frame one.</div>`;
      return;
    }

    // Resolve signed URLs for all paths in one call.
    const paths = rows.map((r) => r.storage_path);
    const urlByPath = {};
    try {
      const { data: signed, error: sErr } =
        await SB.storage.from(BUCKET).createSignedUrls(paths, SIGN_TTL);
      if (sErr) console.error(sErr);
      (signed || []).forEach((s) => {
        if (s && s.path && s.signedUrl) urlByPath[s.path] = s.signedUrl;
      });
    } catch (e) {
      console.error("signed url error", e);
    }

    list.innerHTML = "";
    rows.forEach((row) => {
      const url = urlByPath[row.storage_path] || "";
      const card = document.createElement("div");
      card.className = "photo-frame";
      card.innerHTML = `
        <button class="photo-del" title="Remove">&times;</button>
        <img class="photo-img" src="${esc(url)}" alt="${esc(row.caption || "photo")}"
             onerror="this.style.display='none'" />
        ${row.caption ? `<div class="photo-caption">${esc(row.caption)}</div>` : ""}`;
      card.querySelector(".photo-del").addEventListener("click", () =>
        deletePhoto(row.id, row.storage_path)
      );
      list.appendChild(card);
    });
  }

  async function uploadPhoto(file) {
    const status = ROOT.querySelector("#photo-status");
    if (!file.type || !file.type.startsWith("image/")) {
      status.textContent = "That's not an image file.";
      return;
    }
    if (file.size > MAX_BYTES) {
      status.textContent = "Image is over 5 MB. Pick a smaller one.";
      return;
    }

    status.textContent = "Uploading…";
    const path = `${crypto.randomUUID()}.${extOf(file.name)}`;

    const { error: upErr } = await SB.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (upErr) {
      console.error(upErr);
      status.textContent = "Upload failed. Try again.";
      return;
    }

    const { error: insErr } = await SB
      .from("dashboard_photos")
      .insert({ storage_path: path, added_via: "web" });
    if (insErr) {
      console.error(insErr);
      // Roll back the orphaned object so storage and table stay consistent.
      await SB.storage.from(BUCKET).remove([path]);
      status.textContent = "Couldn't save it. Try again.";
      return;
    }

    status.textContent = "";
    await drawPhotos();
  }

  async function deletePhoto(id, path) {
    if (!window.confirm("Remove this picture?")) return;
    const { error } = await SB.from("dashboard_photos").delete().eq("id", id);
    if (error) { console.error(error); alert("Couldn't remove it."); return; }
    if (path) await SB.storage.from(BUCKET).remove([path]);
    await drawPhotos();
  }

  window.renderDashboardPhotos = render;
})();
