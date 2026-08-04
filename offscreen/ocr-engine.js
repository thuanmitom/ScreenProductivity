// offscreen/ocr-engine.js
// Nhận diện chữ bằng Tesseract.js, chạy 100% offline từ thư mục vendor/.
// Điểm mấu chốt cho độ chính xác: ảnh chụp màn hình thường có chữ quá NHỎ
// so với mức Tesseract hoạt động tốt (~30px chiều cao chữ). Vì vậy trước khi
// nhận diện, ảnh được:
//   1. Phóng to (2–4x tuỳ kích thước gốc) với nội suy chất lượng cao.
//   2. Chuyển grayscale + tăng tương phản để nét chữ rõ hơn.

const U = (p) => chrome.runtime.getURL(p);

let workerPromise = null;
let currentLang = null;

async function getWorker(lang) {
  if (workerPromise && currentLang === lang) return workerPromise;
  if (workerPromise) {
    const old = await workerPromise;
    await old.terminate().catch(() => {});
    workerPromise = null;
  }
  currentLang = lang;
  workerPromise = (async () => {
    const worker = await window.Tesseract.createWorker(lang, 1, {
      workerPath: U("vendor/tesseract/worker.min.js"),
      workerBlobURL: false, // nạp thẳng từ URL extension, tránh chặn blob trong MV3
      corePath: U("vendor/tesseract/tesseract-core-simd-lstm.wasm.js"),
      langPath: U("vendor/tessdata/"),
      gzip: false,
      cacheMethod: "none",
      logger: () => {},
    });
    // PSM 6 = "một khối văn bản đồng nhất" — phù hợp nhất với vùng người dùng
    // khoanh chọn (đoạn văn, bảng chữ), chính xác hơn hẳn chế độ auto khi
    // vùng ảnh nhỏ.
    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
    });
    return worker;
  })();
  return workerPromise;
}

// Tiền xử lý: upscale + grayscale + contrast. Trả về dataURL PNG.
function preprocess(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Chọn hệ số phóng: chữ trên web ~14–16px, sau nhân dpr thường vẫn nhỏ.
      // Mục tiêu: cạnh dài đạt ~1600–2400px, hệ số trong khoảng [2, 4].
      const longSide = Math.max(img.width, img.height);
      let scale = Math.min(4, Math.max(2, Math.round(2000 / Math.max(1, longSide))));
      // Ảnh vốn đã rất lớn thì không phóng thêm (tránh canvas quá cỡ).
      if (longSide * scale > 8000) scale = Math.max(1, Math.floor(8000 / longSide));

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // Grayscale + tăng tương phản nhẹ giúp tách chữ khỏi nền màu.
      ctx.filter = "grayscale(1) contrast(1.35)";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Không tải được ảnh OCR."));
    img.src = dataUrl;
  });
}

// Dọn kết quả: bỏ khoảng trắng thừa Tesseract hay chèn, giữ xuống dòng.
function cleanText(raw) {
  return (raw || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function recognize({ dataUrl, lang = "vie+eng" }) {
  const prepared = await preprocess(dataUrl);
  const worker = await getWorker(lang);
  const { data } = await worker.recognize(prepared);
  return cleanText(data.text);
}
