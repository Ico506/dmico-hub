/* ─────────────────────────────────────────────────────────────
   dmico life os — Dashboard photo album (draggable pinned pictures)
   Photos are framed and pinned anywhere on the dashboard board. Drag to
   reposition; position persists as a percentage of the board so it survives
   different screen sizes. Files live in the PRIVATE Storage bucket
   'dashboard-photos'; the dashboard_photos table holds the object path plus
   pos_x / pos_y (% of board) and z_index (stacking order). Rendered via
   short-lived signed URLs, so nothing is public.
   Exposes window.renderDashboardPhotos(boardEl, sb).
   ───────────────────────────────────────────────────────────── */

(function () {
  const BUCKET = "dashboard-photos";
  const MAX_BYTES = 5 * 1024 * 1024;  // 5 MB upload cap
  const SIGN_TTL = 3600;              // signed-url lifetime (seconds)
  const FRAME_W = 150;                // frame width in px
  const NARROW = 560;                 // below this board width, stack instead of pin

  let SB = null;
  let BOARD = null;
  let topZ = 0;
  let drag = null; // active drag state

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function extOf(name) {
    const m = /\.([a-zA-Z0-9]+)$/.exec(name || "");
    return m ? m[1].toLowerCase() : "jpg";
  }

  async function render(board, sb) {
    if (!board) return;
    SB = sb;
    BOARD = board;

    // Add-photo control, pinned to the top-right of the board.
    let addWrap = board.querySelector(".photo-add-wrap");
    if (!addWrap) {
      addWrap = document.createElement("div");
      addWrap.className = "photo-add-wrap";
      addWrap.innerHTML = `
        <label class="photo-add" title="Add a photo">
          + Add photo
          <input id="photo-file" type="file" accept="image/*" hidden />
        </label>
        <span id="photo-status" class="photo-status"></span>`;
      board.appendChild(addWrap);
      const input = addWrap.querySelector("#photo-file");
      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (file) uploadPhoto(file);
        input.value = "";
      });
    }

    await drawPhotos();
  }

  function clearFrames() {
    BOARD.querySelectorAll(".photo-frame, .photo-stack").forEach((n) => n.remove());
  }

  async function drawPhotos() {
    clearFrames();
    const { data, error } = await SB
      .from("dashboard_photos")
      .select("*")
      .order("z_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) { console.error(error); return; }
    const rows = data || [];
    topZ = rows.reduce((m, r) => Math.max(m, Number(r.z_index) || 0), 0);

    if (!rows.length) return;

    // Resolve signed URLs in one call.
    const paths = rows.map((r) => r.storage_path);
    const urlByPath = {};
    try {
      const { data: signed } = await SB.storage.from(BUCKET).createSignedUrls(paths, SIGN_TTL);
      (signed || []).forEach((s) => { if (s && s.path && s.signedUrl) urlByPath[s.path] = s.signedUrl; });
    } catch (e) { console.error("signed url error", e); }

    const narrow = (BOARD.clientWidth || window.innerWidth) < NARROW;

    if (narrow) {
      // Stacked fallback: no absolute pinning, no drag.
      const stack = document.createElement("div");
      stack.className = "photo-stack";
      rows.forEach((row) => stack.appendChild(buildFrame(row, urlByPath[row.storage_path], false)));
      BOARD.appendChild(stack);
      return;
    }

    rows.forEach((row, i) => {
      const frame = buildFrame(row, urlByPath[row.storage_path], true, i, rows.length);
      BOARD.appendChild(frame);
    });
  }

  function buildFrame(row, url, pinnable, index, total) {
    const frame = document.createElement("div");
    frame.className = "photo-frame";
    frame.dataset.id = row.id;
    frame.innerHTML = `
      <button class="photo-del" title="Remove">&times;</button>
      <img class="photo-img" src="${esc(url || "")}" alt="${esc(row.caption || "photo")}"
           draggable="false" onerror="this.style.display='none'" />
      ${row.caption ? `<div class="photo-caption">${esc(row.caption)}</div>` : ""}`;

    frame.querySelector(".photo-del").addEventListener("click", (e) => {
      e.stopPropagation();
      deletePhoto(row.id, row.storage_path);
    });

    if (!pinnable) return frame; // stacked fallback

    frame.style.width = FRAME_W + "px";
    frame.style.zIndex = String(Number(row.z_index) || 0);

    // Pinned position, or a tidy cascade in open space if not yet placed.
    let xPct, yPct;
    if (row.pos_x != null && row.pos_y != null) {
      xPct = Number(row.pos_x);
      yPct = Number(row.pos_y);
    } else {
      xPct = 66 + ((index * 3) % 18);
      yPct = Math.min(80, 4 + index * 14);
    }
    frame.style.left = xPct + "%";
    frame.style.top = yPct + "%";

    attachDrag(frame, row);
    return frame;
  }

  function attachDrag(frame, row) {
    frame.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".photo-del")) return;
      e.preventDefault();
      const boardRect = BOARD.getBoundingClientRect();
      const fRect = frame.getBoundingClientRect();
      drag = {
        id: row.id,
        offsetX: e.clientX - fRect.left,
        offsetY: e.clientY - fRect.top,
        boardRect,
      };
      bringToFront(frame, row);
      frame.classList.add("photo-dragging");
      try { frame.setPointerCapture(e.pointerId); } catch (_) {}
    });

    frame.addEventListener("pointermove", (e) => {
      if (!drag || drag.id !== row.id) return;
      const { boardRect, offsetX, offsetY } = drag;
      let leftPx = e.clientX - boardRect.left - offsetX;
      let topPx  = e.clientY - boardRect.top - offsetY;
      leftPx = Math.max(0, Math.min(leftPx, boardRect.width  - frame.offsetWidth));
      topPx  = Math.max(0, Math.min(topPx,  boardRect.height - frame.offsetHeight));
      frame.style.left = leftPx + "px";
      frame.style.top  = topPx + "px";
    });

    const finish = async (e) => {
      if (!drag || drag.id !== row.id) return;
      const { boardRect } = drag;
      const leftPx = parseFloat(frame.style.left) || 0;
      const topPx  = parseFloat(frame.style.top)  || 0;
      const xPct = boardRect.width  > 0 ? (leftPx / boardRect.width)  * 100 : 0;
      const yPct = boardRect.height > 0 ? (topPx  / boardRect.height) * 100 : 0;
      frame.style.left = xPct + "%";
      frame.style.top  = yPct + "%";
      frame.classList.remove("photo-dragging");
      drag = null;
      try { frame.releasePointerCapture(e.pointerId); } catch (_) {}
      row.pos_x = xPct; row.pos_y = yPct;
      await persistPosition(row.id, xPct, yPct, row.z_index);
    };
    frame.addEventListener("pointerup", finish);
    frame.addEventListener("pointercancel", finish);
  }

  function bringToFront(frame, row) {
    topZ += 1;
    row.z_index = topZ;
    frame.style.zIndex = String(topZ);
  }

  async function persistPosition(id, xPct, yPct, z) {
    const { error } = await SB.from("dashboard_photos")
      .update({ pos_x: xPct, pos_y: yPct, z_index: z })
      .eq("id", id);
    if (error) console.error("persist position failed", error);
  }

  async function uploadPhoto(file) {
    const status = BOARD.querySelector("#photo-status");
    if (!file.type || !file.type.startsWith("image/")) { status.textContent = "That's not an image file."; return; }
    if (file.size > MAX_BYTES) { status.textContent = "Image is over 5 MB. Pick a smaller one."; return; }

    status.textContent = "Uploading…";
    const path = `${crypto.randomUUID()}.${extOf(file.name)}`;

    const { error: upErr } = await SB.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (upErr) { console.error(upErr); status.textContent = "Upload failed. Try again."; return; }

    // New photo lands on top of the stack.
    const { error: insErr } = await SB
      .from("dashboard_photos")
      .insert({ storage_path: path, added_via: "web", z_index: topZ + 1 });
    if (insErr) {
      console.error(insErr);
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
