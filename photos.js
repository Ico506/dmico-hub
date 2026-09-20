/* ─────────────────────────────────────────────────────────────
   dmico life os: Dashboard photo album (draggable pinned pictures)
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
  const SETTLE_MS = 200;              // drop-settle animation window
  const NARROW = 560;                 // below this board width, stack instead of pin

  let SB = null;
  let BOARD = null;
  let topZ = 0;
  let botZ = 0;   // lowest z in play, for send-to-back
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
    botZ = rows.length
      ? rows.reduce((m, r) => Math.min(m, Number(r.z_index) || 0), Infinity)
      : 0;

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
      ${row.caption ? `<div class="photo-caption">${esc(row.caption)}</div>` : ""}
      <span class="photo-resize" title="Drag to resize"></span>`;

    frame.querySelector(".photo-del").addEventListener("click", (e) => {
      e.stopPropagation();
      deletePhoto(row.id, row.storage_path);
    });

    if (!pinnable) return frame; // stacked fallback

    frame.style.width = (row.width ? Number(row.width) : FRAME_W) + "px";
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
    attachResize(frame, row);
    return frame;
  }

  // ---------------------------------------------------------------------
  // Dragging. Two rules learned the hard way, see PRD-photo-drag-fluidity.
  //
  // 1. Page coordinates, never viewport ones. The old code cached the board's
  //    getBoundingClientRect() at pointerdown and measured e.clientX against it
  //    for the whole gesture. Both are viewport-relative, so every pixel the
  //    page scrolled mid-drag pushed the photo one pixel away from the finger
  //    holding it. Measured: a 350px scroll left the cursor 390px off its grab
  //    point, which is completely off the photo. e.pageX/pageY already include
  //    scroll, so a board origin captured once in page space stays true.
  //
  // 2. No clamping DURING the drag, only on drop. Clamping live looks tidy and
  //    feels awful: the photo pins to the edge while the pointer keeps going,
  //    so the grab offset desyncs by however far you overshot and the photo
  //    then ignores you on the way back. Measured at 260px of dead travel.
  //    Softening the clamp does not fix that, it only moves where it starts,
  //    and re-anchoring the offset detaches the photo from the cursor instead.
  //    Following the pointer exactly and clamping once on release is the only
  //    version with no dead zone at all.
  // ---------------------------------------------------------------------

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

  // How much of a photo has to stay on the board once it comes to rest.
  //
  // Clamping a photo entirely inside the board sounds tidy and is actually the
  // thing that made the board feel broken. On a 759px board a 317px photo could
  // never get its left edge past (759-317)/759 = 58.2%, so the right quarter of
  // the board was unreachable, and every drop over there snapped back to the
  // same 58.2% every time. That was the "it goes back to the stuck place".
  // Letting a photo hang off the edge turns that dead strip into usable space,
  // and keeping 40% of it on the board means it is always easy to grab again.
  const KEEP_ON_BOARD = 0.4;

  // Where the frame is allowed to rest once the finger lets go.
  function restingSpot(leftPx, topPx, d, frame) {
    const w = d ? d.frameW : frame.offsetWidth;
    const h = d ? d.frameH : frame.offsetHeight;
    const bw = d ? d.boardW : BOARD.getBoundingClientRect().width;
    const bh = d ? d.boardH : BOARD.getBoundingClientRect().height;
    const keepW = w * KEEP_ON_BOARD;
    const keepH = h * KEEP_ON_BOARD;
    // Math.max on the upper bound guards a photo wider or taller than the
    // board, where the range would otherwise invert and pin it at one corner.
    return {
      left: clamp(leftPx, keepW - w, Math.max(keepW - w, bw - keepW)),
      top:  clamp(topPx,  keepH - h, Math.max(keepH - h, bh - keepH)),
      boardW: bw, boardH: bh,
    };
  }

  function attachDrag(frame, row) {
    frame.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".photo-del") || e.target.closest(".photo-resize")) return;
      e.preventDefault();
      const bRect = BOARD.getBoundingClientRect();
      const fRect = frame.getBoundingClientRect();
      drag = {
        id: row.id,
        // Grab point, in page space.
        offsetX: e.pageX - (fRect.left + window.scrollX),
        offsetY: e.pageY - (fRect.top  + window.scrollY),
        // Board origin, in page space. Valid for the whole gesture.
        originX: bRect.left + window.scrollX,
        originY: bRect.top  + window.scrollY,
        boardW: bRect.width,
        boardH: bRect.height,
        // Frame size read ONCE. Reading offsetWidth inside pointermove forces a
        // synchronous layout on every event, right after a style write.
        frameW: frame.offsetWidth,
        frameH: frame.offsetHeight,
        x: null, y: null, raf: 0,
      };
      bringToFront(frame, row);
      frame.classList.remove("photo-settling");
      frame.classList.add("photo-dragging");
      try { frame.setPointerCapture(e.pointerId); } catch (_) {}
    });

    frame.addEventListener("pointermove", (e) => {
      if (!drag || drag.id !== row.id) return;
      drag.x = e.pageX - drag.originX - drag.offsetX;
      drag.y = e.pageY - drag.originY - drag.offsetY;
      if (drag.raf) return;                 // one paint per frame, not per event
      drag.raf = requestAnimationFrame(() => {
        if (!drag || drag.id !== row.id) return;
        drag.raf = 0;
        frame.style.left = drag.x + "px";
        frame.style.top  = drag.y + "px";
      });
    });

    const finish = async (e) => {
      if (!drag || drag.id !== row.id) return;
      const d = drag;
      drag = null;
      if (d.raf) { cancelAnimationFrame(d.raf); d.raf = 0; }

      // Use the last pointer position, not the last painted one, so a drop
      // landing between frames does not lose the final few pixels.
      const rawX = d.x != null ? d.x : (parseFloat(frame.style.left) || 0);
      const rawY = d.y != null ? d.y : (parseFloat(frame.style.top)  || 0);
      const spot = restingSpot(rawX, rawY, d, frame);

      const xPct = spot.boardW > 0 ? (spot.left / spot.boardW) * 100 : 0;
      const yPct = spot.boardH > 0 ? (spot.top  / spot.boardH) * 100 : 0;

      // Ease back inside the board rather than teleporting.
      if (spot.left !== rawX || spot.top !== rawY) {
        frame.classList.add("photo-settling");
        setTimeout(() => frame.classList.remove("photo-settling"), SETTLE_MS);
      }
      frame.style.left = xPct + "%";
      frame.style.top  = yPct + "%";
      frame.classList.remove("photo-dragging");
      try { frame.releasePointerCapture(e.pointerId); } catch (_) {}
      row.pos_x = xPct; row.pos_y = yPct;
      await persistPosition(row.id, xPct, yPct, row.z_index);
    };
    frame.addEventListener("pointerup", finish);
    frame.addEventListener("pointercancel", finish);

    // Double-click drops a photo to the back. Grabbing one already raises it,
    // so this is the other half: it is how you reach the photo underneath
    // without having to shove the top one out of the way first.
    frame.addEventListener("dblclick", (e) => {
      if (e.target.closest(".photo-del") || e.target.closest(".photo-resize")) return;
      e.preventDefault();
      sendToBack(frame, row);
    });
  }

  function attachResize(frame, row) {
    const handle = frame.querySelector(".photo-resize");
    if (!handle) return;
    let rs = null;

    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation(); // don't start a drag
      rs = {
        startX: e.pageX,
        startW: frame.offsetWidth,
        boardW: BOARD.getBoundingClientRect().width,
        w: null, raf: 0,
      };
      bringToFront(frame, row);
      frame.classList.add("photo-resizing");
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    });

    handle.addEventListener("pointermove", (e) => {
      if (!rs) return;
      rs.w = clamp(rs.startW + (e.pageX - rs.startX), 90, Math.min(600, rs.boardW - 10));
      if (rs.raf) return;
      rs.raf = requestAnimationFrame(() => {
        if (!rs) return;
        rs.raf = 0;
        frame.style.width = rs.w + "px";
      });
    });

    const done = async (e) => {
      if (!rs) return;
      const r = rs;
      rs = null;
      if (r.raf) { cancelAnimationFrame(r.raf); r.raf = 0; }
      if (r.w != null) frame.style.width = r.w + "px";
      frame.classList.remove("photo-resizing");
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}

      // A wider photo can now stick out past the board edge, so re-seat it.
      const w = Math.round(frame.offsetWidth);
      row.width = w;
      const spot = restingSpot(frame.offsetLeft, frame.offsetTop, null, frame);
      const xPct = spot.boardW > 0 ? (spot.left / spot.boardW) * 100 : 0;
      const yPct = spot.boardH > 0 ? (spot.top  / spot.boardH) * 100 : 0;
      frame.style.left = xPct + "%";
      frame.style.top  = yPct + "%";
      row.pos_x = xPct; row.pos_y = yPct;
      await persistSize(row.id, w, row.z_index);
      await persistPosition(row.id, xPct, yPct, row.z_index);
    };
    handle.addEventListener("pointerup", done);
    handle.addEventListener("pointercancel", done);
  }

  function bringToFront(frame, row) {
    topZ += 1;
    row.z_index = topZ;
    frame.style.zIndex = String(topZ);
  }

  // Negative z-index would paint the frame behind the page background, because
  // .dash-board is positioned but opens no stacking context. So the floor is 1,
  // and when we run out of room underneath we spread everyone out again.
  function sendToBack(frame, row) {
    if (botZ <= 1) { rebaseZ(); }
    botZ -= 1;
    row.z_index = botZ;
    frame.style.zIndex = String(botZ);
    persistZ(row.id, botZ);
  }

  function rebaseZ() {
    const frames = [...BOARD.querySelectorAll(".photo-frame")]
      .sort((p, q) => (Number(p.style.zIndex) || 0) - (Number(q.style.zIndex) || 0));
    frames.forEach((f, i) => {
      const z = (i + 1) * 10;
      f.style.zIndex = String(z);
      if (f.dataset.id) persistZ(f.dataset.id, z);
    });
    botZ = 10;
    topZ = frames.length * 10;
  }

  async function persistPosition(id, xPct, yPct, z) {
    const { error } = await SB.from("dashboard_photos")
      .update({ pos_x: xPct, pos_y: yPct, z_index: z })
      .eq("id", id);
    if (error) console.error("persist position failed", error);
  }

  async function persistZ(id, z) {
    const { error } = await SB.from("dashboard_photos")
      .update({ z_index: z })
      .eq("id", id);
    if (error) console.error("persist z failed", error);
  }

  async function persistSize(id, width, z) {
    const { error } = await SB.from("dashboard_photos")
      .update({ width: width, z_index: z })
      .eq("id", id);
    if (error) console.error("persist size failed", error);
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
