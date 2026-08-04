// content-scripts/overlay.js
// Chạy trong ngữ cảnh trang web (isolated world). Vẽ các lớp phủ tương tác:
// vùng chọn, thanh công cụ nổi, highlight con trỏ và lớp annotation.
// Được tiêm bằng chrome.scripting nên KHÔNG dùng ES module -> khai báo hằng số inline.

(() => {
  if (window.__SP_OVERLAY_LOADED__) return; // tránh tiêm trùng
  window.__SP_OVERLAY_LOADED__ = true;

  const MSG = {
    CT_SELECT_REGION: "CT_SELECT_REGION",
    CT_SHOW_TOOLBAR: "CT_SHOW_TOOLBAR",
    CT_HIDE_TOOLBAR: "CT_HIDE_TOOLBAR",
    CT_CURSOR_HL: "CT_CURSOR_HL",
    CT_ANNOTATE: "CT_ANNOTATE",
    CT_PAGE_METRICS: "CT_PAGE_METRICS",
    CT_SCROLL_TO: "CT_SCROLL_TO",
    CT_PREP_FULLPAGE: "CT_PREP_FULLPAGE",
    CT_RESTORE_FULLPAGE: "CT_RESTORE_FULLPAGE",
    CT_STICKY: "CT_STICKY",
    CT_REC_STATE: "CT_REC_STATE",
    TOOLBAR_STOP: "TOOLBAR_STOP",
    TOOLBAR_TOGGLE_PAUSE: "TOOLBAR_TOGGLE_PAUSE",
    TOOLBAR_CANCEL: "TOOLBAR_CANCEL",
  };

  const NS = "sp-overlay";
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  // ---- Trạng thái ----
  let regionResolver = null;
  let cursorEl = null;
  let cursorMoveHandler = null;
  let toolbarEl = null;
  let paused = false;
  let annotate = {
    on: false, canvas: null, ctx: null, drawing: false,
    palette: null, tool: "pen", color: "#ff3b30", width: 4,
    startX: 0, startY: 0, snap: null, _move: null, _up: null,
    undoStack: [],
  };
  let savedStyles = null;

  // =========================================================================
  // VÙNG CHỌN (region select)
  // =========================================================================
  function startRegionSelect(isOCR) {
    return new Promise((resolve) => {
      regionResolver = resolve;

      const root = document.createElement("div");
      root.className = `${NS}-region-root`;
      root.innerHTML = `
        <div class="${NS}-mask"></div>
        <div class="${NS}-rect"></div>
        <div class="${NS}-hint">${
          isOCR ? "Kéo chuột chọn vùng chữ cần nhận diện" : "Kéo chuột để chọn vùng"
        } · Nhấn Esc để huỷ</div>
        <div class="${NS}-dim"></div>
      `;
      document.documentElement.appendChild(root);

      const rectEl = root.querySelector(`.${NS}-rect`);
      const dimEl = root.querySelector(`.${NS}-dim`);
      let sx = 0, sy = 0, dragging = false;

      const onDown = (e) => {
        if (e.button !== 0) return;
        dragging = true;
        sx = e.clientX;
        sy = e.clientY;
        rectEl.style.display = "block";
        updateRect(e);
      };
      const updateRect = (e) => {
        const x = Math.min(sx, e.clientX);
        const y = Math.min(sy, e.clientY);
        const w = Math.abs(e.clientX - sx);
        const h = Math.abs(e.clientY - sy);
        rectEl.style.left = x + "px";
        rectEl.style.top = y + "px";
        rectEl.style.width = w + "px";
        rectEl.style.height = h + "px";
        dimEl.style.left = x + "px";
        dimEl.style.top = Math.max(0, y - 26) + "px";
        dimEl.style.display = "block";
        dimEl.textContent = `${Math.round(w)} × ${Math.round(h)}`;
      };
      const onMove = (e) => dragging && updateRect(e);
      const onUp = async (e) => {
        if (!dragging) return;
        dragging = false;
        const x = Math.min(sx, e.clientX);
        const y = Math.min(sy, e.clientY);
        const w = Math.abs(e.clientX - sx);
        const h = Math.abs(e.clientY - sy);
        cleanup();
        if (w < 4 || h < 4) {
          finish({ cancelled: true });
          return;
        }
        // Đợi lớp phủ biến mất hẳn khỏi màn hình rồi mới trả về —
        // SW sẽ chụp ngay sau đó, nếu chụp sớm ảnh sẽ dính lớp tối.
        await nextFrame();
        await nextFrame();
        await new Promise((r) => setTimeout(r, 150));
        finish({ rect: { x, y, w, h, dpr: window.devicePixelRatio || 1 } });
      };
      const onKey = (e) => {
        if (e.key === "Escape") {
          cleanup();
          finish({ cancelled: true });
        }
      };
      function cleanup() {
        root.removeEventListener("mousedown", onDown);
        window.removeEventListener("mousemove", onMove, true);
        window.removeEventListener("mouseup", onUp, true);
        window.removeEventListener("keydown", onKey, true);
        root.remove();
      }
      function finish(payload) {
        if (regionResolver) {
          regionResolver(payload);
          regionResolver = null;
        }
      }

      root.addEventListener("mousedown", onDown);
      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("mouseup", onUp, true);
      window.addEventListener("keydown", onKey, true);
    });
  }

  // =========================================================================
  // HIGHLIGHT CON TRỎ CHUỘT
  // =========================================================================
  function setCursorHighlight(on) {
    if (on && !cursorEl) {
      cursorEl = document.createElement("div");
      cursorEl.className = `${NS}-cursor`;
      document.documentElement.appendChild(cursorEl);
      cursorMoveHandler = (e) => {
        cursorEl.style.left = e.clientX + "px";
        cursorEl.style.top = e.clientY + "px";
      };
      window.addEventListener("mousemove", cursorMoveHandler, true);
    } else if (!on && cursorEl) {
      window.removeEventListener("mousemove", cursorMoveHandler, true);
      cursorEl.remove();
      cursorEl = null;
      cursorMoveHandler = null;
    }
  }

  // =========================================================================
  // THANH CÔNG CỤ NỔI
  // =========================================================================
  function showToolbar() {
    if (toolbarEl) return;
    paused = false;
    toolbarEl = document.createElement("div");
    toolbarEl.className = `${NS}-toolbar`;
    toolbarEl.innerHTML = `
      <span class="${NS}-rec-dot"></span>
      <div class="${NS}-tb-group">
        <button data-act="stop" class="${NS}-btn ${NS}-btn-danger" title="Dừng & lưu">■ Dừng</button>
        <button data-act="pause" class="${NS}-btn" title="Tạm dừng">❚❚ Tạm dừng</button>
        <button data-act="annotate" class="${NS}-btn" title="Vẽ / đánh dấu">✎ Vẽ</button>
        <button data-act="cancel" class="${NS}-btn" title="Huỷ">✕ Huỷ</button>
      </div>
      <button data-act="min" class="${NS}-btn ${NS}-tb-min" title="Ẩn/Hiện thanh điều khiển">–</button>
    `;
    document.documentElement.appendChild(toolbarEl);

    makeDraggable(toolbarEl);

    toolbarEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "stop") {
        chrome.runtime.sendMessage({ type: MSG.TOOLBAR_STOP });
      } else if (act === "cancel") {
        chrome.runtime.sendMessage({ type: MSG.TOOLBAR_CANCEL });
      } else if (act === "pause") {
        // Chỉ gửi "ý định": service worker biết trạng thái thật nên nó quyết
        // định pause hay resume, rồi báo ngược lại để cập nhật nhãn nút.
        // (Trước đây nút tự giữ biến `paused` -> rất dễ lệch với trạng thái
        // thật, khiến lệnh bị service worker bỏ qua và "bấm mãi không dừng".)
        chrome.runtime.sendMessage({ type: MSG.TOOLBAR_TOGGLE_PAUSE });
      } else if (act === "annotate") {
        toggleAnnotate(!annotate.on);
        btn.classList.toggle(`${NS}-btn-active`, annotate.on);
      } else if (act === "min") {
        // Thu gọn thanh điều khiển để không che màn hình. Bấm lại để mở ra.
        const min = toolbarEl.classList.toggle(`${NS}-toolbar-min`);
        btn.textContent = min ? "▸" : "–";
        btn.title = min ? "Mở thanh điều khiển" : "Ẩn thanh điều khiển";
      }
    });
  }

  function hideToolbar() {
    if (toolbarEl) {
      toolbarEl.remove();
      toolbarEl = null;
    }
    toggleAnnotate(false);
  }

  // Nhận trạng thái thật từ service worker và vẽ lại nhãn nút tạm dừng.
  function setToolbarRecState(status) {
    paused = status === "paused";
    if (!toolbarEl) return;
    const btn = toolbarEl.querySelector('[data-act="pause"]');
    if (btn) {
      btn.textContent = paused ? "▶ Tiếp tục" : "❚❚ Tạm dừng";
      btn.title = paused ? "Tiếp tục quay" : "Tạm dừng";
    }
  }

  function makeDraggable(el) {
    let dx = 0, dy = 0, down = false;
    el.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      down = true;
      const r = el.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!down) return;
      el.style.left = e.clientX - dx + "px";
      el.style.top = e.clientY - dy + "px";
      el.style.transform = "none";
    });
    window.addEventListener("mouseup", () => (down = false));
  }

  // =========================================================================
  // ANNOTATION (vẽ lên màn hình — kiểu Lightshot: bút, mũi tên, khung, elip)
  // Lớp vẽ nằm trên trang nên được ghi vào video khi đang quay.
  // =========================================================================
  const ANNO_TOOLS = [
    { id: "pen", ico: "✏️" },
    { id: "arrow", ico: "➤" },
    { id: "rect", ico: "▭" },
    { id: "ellipse", ico: "◯" },
  ];
  const ANNO_COLORS = ["#ff3b30", "#ffcc00", "#34c759", "#2f6bff", "#ffffff"];

  function toggleAnnotate(on) {
    if (on === annotate.on) return;
    annotate.on = on;
    if (on) {
      const canvas = document.createElement("canvas");
      canvas.className = `${NS}-annotate`;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      document.documentElement.appendChild(canvas);
      annotate.canvas = canvas;
      annotate.ctx = canvas.getContext("2d");
      annotate.undoStack = [];

      buildAnnoPalette();

      const pos = (e) => ({ x: e.clientX, y: e.clientY });
      const setStroke = () => {
        const ctx = annotate.ctx;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = annotate.color;
        ctx.fillStyle = annotate.color;
        ctx.lineWidth = annotate.width;
      };

      const onDown = (e) => {
        if (e.button !== 0 || e.target.closest(`.${NS}-anno-palette`)) return;
        annotate.drawing = true;
        const p = pos(e);
        annotate.startX = p.x;
        annotate.startY = p.y;
        // Lưu trạng thái trước khi vẽ để có thể "back" (hoàn tác) từng bước.
        const before = annotate.ctx.getImageData(0, 0, canvas.width, canvas.height);
        annotate.undoStack.push(before);
        // Mỗi ảnh chụp nền chiếm ~8MB ở màn 1080p -> giới hạn để không ngốn RAM
        // (đang vừa quay video vừa mã hoá nên bộ nhớ rất quý).
        if (annotate.undoStack.length > 10) annotate.undoStack.shift();
        annotate.snap = before;
        setStroke();
        if (annotate.tool === "pen") {
          annotate.ctx.beginPath();
          annotate.ctx.moveTo(p.x, p.y);
        }
      };
      const onMove = (e) => {
        if (!annotate.drawing) return;
        const ctx = annotate.ctx;
        const p = pos(e);
        if (annotate.tool === "pen") {
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          return;
        }
        ctx.putImageData(annotate.snap, 0, 0);
        setStroke();
        const sx = annotate.startX, sy = annotate.startY;
        if (annotate.tool === "arrow") {
          drawAnnoArrow(ctx, sx, sy, p.x, p.y);
        } else if (annotate.tool === "rect") {
          ctx.strokeRect(Math.min(sx, p.x), Math.min(sy, p.y), Math.abs(p.x - sx), Math.abs(p.y - sy));
        } else if (annotate.tool === "ellipse") {
          ctx.beginPath();
          ctx.ellipse((sx + p.x) / 2, (sy + p.y) / 2, Math.abs(p.x - sx) / 2, Math.abs(p.y - sy) / 2, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      };
      const onUp = () => { annotate.drawing = false; annotate.snap = null; };

      canvas.addEventListener("mousedown", onDown);
      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("mouseup", onUp, true);
      annotate._move = onMove;
      annotate._up = onUp;
    } else if (annotate.canvas) {
      window.removeEventListener("mousemove", annotate._move, true);
      window.removeEventListener("mouseup", annotate._up, true);
      annotate.canvas.remove();
      annotate.canvas = null;
      annotate.ctx = null;
      annotate.drawing = false;
      annotate.undoStack = [];
      if (annotate.palette) { annotate.palette.remove(); annotate.palette = null; }
    }
  }

  function drawAnnoArrow(ctx, x1, y1, x2, y2) {
    const head = Math.max(10, annotate.width * 3.2);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6));
    ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  function buildAnnoPalette() {
    const pal = document.createElement("div");
    pal.className = `${NS}-anno-palette`;
    const tools = ANNO_TOOLS.map(
      (t) => `<button class="${NS}-anno-b ${NS}-anno-tool${t.id === annotate.tool ? " on" : ""}" data-tool="${t.id}">${t.ico}</button>`
    ).join("");
    const colors = ANNO_COLORS.map(
      (c) => `<button class="${NS}-anno-sw${c === annotate.color ? " on" : ""}" data-color="${c}" style="background:${c}"></button>`
    ).join("");
    pal.innerHTML = `
      ${tools}
      <span class="${NS}-anno-sep"></span>
      ${colors}
      <span class="${NS}-anno-sep"></span>
      <button class="${NS}-anno-b" data-op="undo" title="Back / Hoàn tác">↶</button>
      <button class="${NS}-anno-b" data-op="clear" title="Xoá hết">🗑</button>
    `;
    document.documentElement.appendChild(pal);
    annotate.palette = pal;
    makeDraggable(pal);

    pal.addEventListener("click", (e) => {
      const tb = e.target.closest(`.${NS}-anno-tool`);
      const sw = e.target.closest(`.${NS}-anno-sw`);
      const op = e.target.closest("[data-op]");
      if (tb) {
        annotate.tool = tb.dataset.tool;
        pal.querySelectorAll(`.${NS}-anno-tool`).forEach((x) => x.classList.toggle("on", x === tb));
      } else if (sw) {
        annotate.color = sw.dataset.color;
        pal.querySelectorAll(`.${NS}-anno-sw`).forEach((x) => x.classList.toggle("on", x === sw));
      } else if (op && op.dataset.op === "undo") {
        annoUndo();
      } else if (op && op.dataset.op === "clear") {
        // Lưu trạng thái để có thể hoàn tác cả thao tác xoá.
        annotate.undoStack.push(
          annotate.ctx.getImageData(0, 0, annotate.canvas.width, annotate.canvas.height)
        );
        annotate.ctx.clearRect(0, 0, annotate.canvas.width, annotate.canvas.height);
      }
    });
  }

  function annoUndo() {
    if (!annotate.undoStack.length) return;
    const prev = annotate.undoStack.pop();
    annotate.ctx.putImageData(prev, 0, 0);
  }

  // =========================================================================
  // HỖ TRỢ CHỤP FULL PAGE
  // =========================================================================
  function pageMetrics() {
    const d = document.documentElement;
    const b = document.body;
    return {
      scrollHeight: Math.max(
        d.scrollHeight, b ? b.scrollHeight : 0,
        d.offsetHeight, b ? b.offsetHeight : 0
      ),
      viewportHeight: window.innerHeight,
      viewportWidth: document.documentElement.clientWidth,
      dpr: window.devicePixelRatio || 1,
    };
  }

  function prepFullpage() {
    savedStyles = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body ? document.body.style.overflow : "",
      scrollBehavior: document.documentElement.style.scrollBehavior,
    };
    document.documentElement.style.scrollBehavior = "auto";
    document.documentElement.style.overflow = "hidden";
    if (document.body) document.body.style.overflow = "hidden";
  }

  function restoreFullpage() {
    if (savedStyles) {
      document.documentElement.style.overflow = savedStyles.htmlOverflow;
      document.documentElement.style.scrollBehavior = savedStyles.scrollBehavior;
      if (document.body) document.body.style.overflow = savedStyles.bodyOverflow;
      savedStyles = null;
    }
    window.scrollTo(0, 0);
  }

  // Ẩn phần tử fixed/sticky (header dính, nút chat nổi…) để chúng không bị
  // lặp lại trên mọi khung khi chụp full-page. hide=false -> khôi phục.
  let hiddenSticky = [];
  function setStickyHidden(hide) {
    if (hide) {
      if (hiddenSticky.length) return; // đã ẩn rồi.
      const all = document.querySelectorAll("body *");
      for (const el of all) {
        if (el.className && String(el.className).startsWith("sp-overlay")) continue;
        const pos = getComputedStyle(el).position;
        if (pos === "fixed" || pos === "sticky") {
          hiddenSticky.push({ el, visibility: el.style.visibility });
          el.style.visibility = "hidden";
        }
      }
    } else {
      for (const item of hiddenSticky) {
        item.el.style.visibility = item.visibility;
      }
      hiddenSticky = [];
    }
  }

  // =========================================================================
  // ROUTER MESSAGE
  // =========================================================================
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case MSG.CT_SELECT_REGION:
        startRegionSelect(!!msg.ocr).then(sendResponse);
        return true; // async

      case MSG.CT_CURSOR_HL:
        setCursorHighlight(!!msg.on);
        sendResponse({ ok: true });
        break;

      case MSG.CT_SHOW_TOOLBAR:
        showToolbar();
        sendResponse({ ok: true });
        break;

      case MSG.CT_HIDE_TOOLBAR:
        hideToolbar();
        sendResponse({ ok: true });
        break;

      case MSG.CT_REC_STATE:
        setToolbarRecState(msg.status);
        sendResponse({ ok: true });
        break;

      case MSG.CT_ANNOTATE:
        toggleAnnotate(!!msg.on);
        sendResponse({ ok: true });
        break;

      case MSG.CT_PAGE_METRICS:
        sendResponse(pageMetrics());
        break;

      case MSG.CT_SCROLL_TO:
        window.scrollTo(0, msg.y);
        sendResponse({ actualY: window.scrollY });
        break;

      case MSG.CT_PREP_FULLPAGE:
        prepFullpage();
        sendResponse({ ok: true });
        break;

      case MSG.CT_RESTORE_FULLPAGE:
        restoreFullpage();
        sendResponse({ ok: true });
        break;

      case MSG.CT_STICKY:
        setStickyHidden(!!msg.hide);
        sendResponse({ ok: true });
        break;

      default:
        return false;
    }
    return false;
  });
})();
