// offscreen/image.js
// Cắt vùng ảnh và ghép nhiều ảnh chụp viewport thành một ảnh dài (full page).

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không tải được ảnh."));
    img.src = dataUrl;
  });
}

function encode(canvas, format, quality) {
  const mime = format === "jpeg" ? "image/jpeg" : "image/png";
  return canvas.toDataURL(mime, quality);
}

// rect: {x,y,w,h,dpr} theo CSS px của viewport. Ảnh gốc là ảnh chụp viewport
// ở độ phân giải thiết bị (device px = css * dpr).
export async function cropImage({ dataUrl, rect, format, quality }) {
  const img = await loadImage(dataUrl);
  const dpr = rect.dpr || 1;
  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.max(1, Math.round(rect.w * dpr));
  const sh = Math.max(1, Math.round(rect.h * dpr));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return { dataUrl: encode(canvas, format, quality) };
}

// shots: [{dataUrl, y}] với y là scrollY THỰC TẾ (CSS px) khi chụp.
export async function stitchImage({
  shots,
  totalHeight,
  viewportWidth,
  dpr,
  format,
  quality,
}) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewportWidth * dpr);
  canvas.height = Math.round(totalHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  for (const shot of shots) {
    const img = await loadImage(shot.dataUrl);
    ctx.drawImage(img, 0, Math.round(shot.y * dpr));
  }
  return { dataUrl: encode(canvas, format, quality) };
}
