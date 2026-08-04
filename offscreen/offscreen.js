// offscreen/offscreen.js
// Bộ điều phối bên trong offscreen document. Lắng nghe lệnh từ service worker
// (những message có target === "offscreen") và gọi module tương ứng.

import { MSG } from "../shared/constants.js";
import { Recorder } from "./recorder.js";
import { cropImage, stitchImage } from "./image.js";
import { recognize } from "./ocr-engine.js";

const recorder = new Recorder();

// Nguồn quay tự kết thúc (bấm "Stop sharing" của Chrome): tự hoàn tất phiên và
// gửi dữ liệu về service worker y như khi bấm Dừng trong extension.
recorder.onSourceEnded = async () => {
  try {
    const blob = await recorder.stop(false);
    const dataUrl = blob ? await blobToDataURL(blob) : null;
    chrome.runtime
      .sendMessage({
        type: MSG.REC_DATA_READY,
        dataUrl,
        mimeType: blob ? blob.type : "",
        discard: false,
      })
      .catch(() => {});
  } catch (e) {
    chrome.runtime
      .sendMessage({ type: MSG.REC_ERROR, error: e.message || String(e) })
      .catch(() => {});
  }
};

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== "offscreen") return false;

  (async () => {
    try {
      switch (msg.type) {
        case MSG.OFF_START_REC: {
          const res = await recorder.start(msg);
          sendResponse(res);
          break;
        }

        case MSG.OFF_PAUSE_REC:
          recorder.pause();
          sendResponse({ ok: true });
          break;

        case MSG.OFF_RESUME_REC:
          recorder.resume();
          sendResponse({ ok: true });
          break;

        case MSG.OFF_STOP_REC: {
          const blob = await recorder.stop(!!msg.discard);
          sendResponse({ ok: true });
          // Trả dữ liệu về SW qua message riêng (blob có thể mất thời gian).
          const dataUrl = blob ? await blobToDataURL(blob) : null;
          chrome.runtime
            .sendMessage({
              type: MSG.REC_DATA_READY,
              dataUrl,
              mimeType: blob ? blob.type : "",
              discard: !!msg.discard,
            })
            .catch(() => {});
          break;
        }

        case MSG.OFF_CROP_IMAGE: {
          const out = await cropImage(msg);
          sendResponse(out);
          break;
        }

        case MSG.OFF_STITCH_IMAGE: {
          const out = await stitchImage(msg);
          sendResponse(out);
          break;
        }

        case MSG.OFF_OCR: {
          const text = await recognize(msg);
          sendResponse({ text });
          break;
        }

        default:
          sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (e) {
      console.error("Offscreen lỗi:", e);
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();

  return true; // giữ kênh mở cho phản hồi bất đồng bộ.
});
