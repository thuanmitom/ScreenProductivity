// sidepanel/annotator.js
// Trình chỉnh sửa / vẽ lên ảnh vừa chụp (kiểu Lightshot): bút, mũi tên, khung
// chữ nhật, elip, bút dạ quang, chữ. Có màu, độ dày, hoàn tác, xoá.
//
// openAnnotator(dataUrl, labels) -> Promise<string|null>
//   Trả về dataURL ảnh đã chỉnh sửa, hoặc null nếu người dùng huỷ.

const TOOLS = [
  { id: "pen", ico: "✏️" },
  { id: "line", ico: "／" },
  { id: "arrow", ico: "➤" },
  { id: "rect", ico: "▭" },
  { id: "ellipse", ico: "◯" },
  { id: "highlight", ico: "🖍️" },
  { id: "text", ico: "T" },
];
const COLORS = ["#ff3b30", "#ffcc00", "#34c759", "#2f6bff", "#ffffff", "#111111"];

export function openAnnotator(dataUrl, L = {}) {
  const t = (k, fb) => L[k] || fb;

  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "anno-root";
    root.innerHTML = `
      <div class="anno-bar">
        <div class="anno-tools"></div>
        <div class="anno-colors"></div>
        <div class="anno-width">
          <input type="range" id="annoWidth" min="1" max="18" value="4" />
        </div>
        <div class="anno-ops">
          <button class="anno-btn" data-op="undo" title="${t("undo", "Hoàn tác")}">↶</button>
          <button class="anno-btn" data-op="clear" title="${t("clear", "Xoá hết")}">🗑</button>
          <button class="anno-btn anno-cancel" data-op="cancel">${t("cancel", "Huỷ")}</button>
          <button class="anno-btn anno-done" data-op="done">${t("done", "Xong")}</button>
        </div>
      </div>
      <div class="anno-stage">
        <canvas class="anno-canvas"></canvas>
      </div>
    `;
    document.body.appendChild(root);

    const canvas = root.querySelector(".anno-canvas");
    const ctx = canvas.getContext("2d");
    const stage = root.querySelector(".anno-stage");

    // ---- Trạng thái ----
    let tool = "pen";
    let color = COLORS[0];
    let width = 4;
    let drawing = false;
    let startX = 0, startY = 0;
    let baseSnap = null; // ImageData để xem trước hình
    const undoStack = [];

    // ---- Dựng thanh công cụ ----
    const toolsWrap = root.querySelector(".anno-tools");
    TOOLS.forEach((tl) => {
      const b = document.createElement("button");
      b.className = "anno-btn anno-tool" + (tl.id === tool ? " is-active" : "");
      b.dataset.tool = tl.id;
      b.textContent = tl.ico;
      b.title = t("tool_" + tl.id, tl.id);
      toolsWrap.appendChild(b);
    });
    toolsWrap.addEventListener("click", (e) => {
      const b = e.target.closest(".anno-tool");
      if (!b) return;
      tool = b.dataset.tool;
      toolsWrap.querySelectorAll(".anno-tool").forEach((x) =>
        x.classList.toggle("is-active", x === b)
      );
    });

    const colorsWrap = root.querySelector(".anno-colors");
    COLORS.forEach((c) => {
      const b = document.createElement("button");
      b.className = "anno-swatch" + (c === color ? " is-active" : "");
      b.dataset.color = c;
      b.style.background = c;
      colorsWrap.appendChild(b);
    });
    colorsWrap.addEventListener("click", (e) => {
      const b = e.target.closest(".anno-swatch");
      if (!b) return;
      color = b.dataset.color;
      colorsWrap.querySelectorAll(".anno-swatch").forEach((x) =>
        x.classList.toggle("is-active", x === b)
      );
    });

    root.querySelector("#annoWidth").addEventListener("input", (e) => {
      width = parseInt(e.target.value, 10);
    });

    // ---- Nạp ảnh ----
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      pushUndo();
    };
    img.src = dataUrl;

    // ---- Toạ độ chuột -> pixel ảnh ----
    function pt(e) {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height),
        scale: canvas.width / r.width,
      };
    }
    function lw(scale) {
      // Giữ độ dày nét trông giống như trên màn hình dù ảnh phân giải cao.
      return Math.max(1, width * scale);
    }

    function pushUndo() {
      try {
        undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (undoStack.length > 40) undoStack.shift();
      } catch (_) {}
    }
    function undo() {
      if (undoStack.length <= 1) return;
      undoStack.pop();
      ctx.putImageData(undoStack[undoStack.length - 1], 0, 0);
    }

    function strokeStyle(scale, highlight) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      if (highlight) {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = lw(scale) * 3;
      } else {
        ctx.globalAlpha = 1;
        ctx.lineWidth = lw(scale);
      }
    }

    function drawArrow(x1, y1, x2, y2, scale) {
      const head = Math.max(10, lw(scale) * 3.2);
      const ang = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - head * Math.cos(ang - Math.PI / 6),
        y2 - head * Math.sin(ang - Math.PI / 6)
      );
      ctx.lineTo(
        x2 - head * Math.cos(ang + Math.PI / 6),
        y2 - head * Math.sin(ang + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
    }

    // ---- Vẽ ----
    function onDown(e) {
      if (e.button !== 0) return;
      const p = pt(e);

      if (tool === "text") {
        placeText(p, e);
        return;
      }

      drawing = true;
      startX = p.x;
      startY = p.y;
      baseSnap = ctx.getImageData(0, 0, canvas.width, canvas.height);

      if (tool === "pen" || tool === "highlight") {
        strokeStyle(p.scale, tool === "highlight");
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      }
    }

    function onMove(e) {
      if (!drawing) return;
      const p = pt(e);

      if (tool === "pen" || tool === "highlight") {
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        return;
      }

      // Hình có xem trước: khôi phục nền rồi vẽ lại.
      ctx.putImageData(baseSnap, 0, 0);
      strokeStyle(p.scale, false);
      if (tool === "line") {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else if (tool === "arrow") {
        drawArrow(startX, startY, p.x, p.y, p.scale);
      } else if (tool === "rect") {
        ctx.strokeRect(
          Math.min(startX, p.x),
          Math.min(startY, p.y),
          Math.abs(p.x - startX),
          Math.abs(p.y - startY)
        );
      } else if (tool === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(
          (startX + p.x) / 2,
          (startY + p.y) / 2,
          Math.abs(p.x - startX) / 2,
          Math.abs(p.y - startY) / 2,
          0, 0, Math.PI * 2
        );
        ctx.stroke();
      }
    }

    function onUp() {
      if (!drawing) return;
      drawing = false;
      ctx.globalAlpha = 1;
      baseSnap = null;
      pushUndo();
    }

    function placeText(p, e) {
      const input = document.createElement("input");
      input.className = "anno-text-input";
      input.style.left = e.clientX + "px";
      input.style.top = e.clientY + "px";
      input.style.color = color;
      input.style.font = `${Math.max(14, width * 5)}px system-ui, sans-serif`;
      document.body.appendChild(input);
      input.focus();

      const commit = () => {
        const val = input.value.trim();
        input.remove();
        if (!val) return;
        const size = Math.max(14, width * 5) * p.scale;
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.font = `${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        ctx.textBaseline = "top";
        val.split("\n").forEach((line, i) => {
          ctx.fillText(line, p.x, p.y + i * size * 1.2);
        });
        pushUndo();
      };
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
        if (ev.key === "Escape") { input.value = ""; input.blur(); }
      });
      input.addEventListener("blur", commit, { once: true });
    }

    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    // ---- Nút thao tác ----
    function close(result) {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
      root.remove();
      resolve(result);
    }
    root.querySelector(".anno-ops").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const op = b.dataset.op;
      if (op === "undo") undo();
      else if (op === "clear") { while (undoStack.length > 1) undoStack.pop(); ctx.putImageData(undoStack[0], 0, 0); }
      else if (op === "cancel") close(null);
      else if (op === "done") {
        const isJpeg = dataUrl.startsWith("data:image/jpeg");
        close(canvas.toDataURL(isJpeg ? "image/jpeg" : "image/png", 0.95));
      }
    });
    const onKey = (e) => {
      if (e.key === "Escape") close(null);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", onKey);

    // Cuộn stage khi ảnh cao hơn khung.
    stage.scrollTop = 0;
  });
}
