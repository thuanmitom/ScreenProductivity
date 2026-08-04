// editor/editor.js
// Trang chỉnh sửa ảnh chạy trong TAB RIÊNG (không gian rộng, dễ vẽ hơn popup).
// Nhận ảnh vừa chụp qua chrome.storage.session, mở trình vẽ (annotator) toàn
// màn hình. Khi bấm "Xong": tự lưu file + sao chép clipboard.

import { openAnnotator } from "../sidepanel/annotator.js";
import { MSG } from "../shared/constants.js";

const L18N = {
  vi: {
    undo: "Hoàn tác", clear: "Xoá hết", cancel: "Huỷ", done: "Xong",
    doneTitle: "Đã chỉnh sửa xong",
    doneDesc: "Chọn “Lưu (clipboard)” để sao chép, hoặc “Tải file về” để tải xuống máy.",
    cancelledTitle: "Đã thoát chỉnh sửa",
    cancelledDesc: "Ảnh gốc được giữ nguyên.",
    saveClip: "📋 Lưu (clipboard)", downloadFile: "⬇ Tải file về",
    editMore: "✎ Sửa tiếp", close: "Đóng tab",
    noImage: "Không có ảnh để chỉnh sửa",
    noImageDesc: "Hãy chụp ảnh trong extension rồi bấm “Vẽ / Sửa”.",
    copied: "Đã sao chép ảnh vào clipboard.",
    copyFail: "Không sao chép được clipboard.",
    downloading: "Đang tải file về…",
  },
  en: {
    undo: "Undo", clear: "Clear all", cancel: "Cancel", done: "Done",
    doneTitle: "Editing finished",
    doneDesc: "Choose “Save (clipboard)” to copy, or “Download file” to save it to disk.",
    cancelledTitle: "Editing closed",
    cancelledDesc: "The original image is unchanged.",
    saveClip: "📋 Save (clipboard)", downloadFile: "⬇ Download file",
    editMore: "✎ Keep editing", close: "Close tab",
    noImage: "No image to edit",
    noImageDesc: "Capture an image in the extension, then click “Draw / Edit”.",
    copied: "Image copied to clipboard.",
    copyFail: "Couldn't copy to clipboard.",
    downloading: "Downloading…",
  },
};

const msgEl = () => document.getElementById("editorMsg");

let toastTimer = null;
function toast(text, kind = "info") {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 2400);
}

function applyTheme(theme) {
  if (theme === "light" || theme === "dark")
    document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
}

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/data:([^;]+)/)[1];
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function copyImageToClipboard(dataUrl) {
  let blob = dataUrlToBlob(dataUrl);
  if (blob.type !== "image/png") {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    blob = await new Promise((res) => c.toBlob(res, "image/png"));
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

// Bảng lựa chọn sau khi vẽ xong. KHÔNG tự tải file — người dùng chủ động chọn
// "Lưu (clipboard)" hoặc "Tải file về".
function showDonePanel(L, editedUrl, onAgain) {
  const el = msgEl();
  el.classList.remove("is-hidden");
  el.innerHTML = "";
  const h = document.createElement("h2");
  const p = document.createElement("p");
  h.textContent = L.doneTitle;
  p.textContent = L.doneDesc;

  const row = document.createElement("div");
  row.className = "row";

  const save = document.createElement("button");
  save.className = "btn btn-primary";
  save.textContent = L.saveClip;
  save.addEventListener("click", async () => {
    try { await copyImageToClipboard(editedUrl); toast(L.copied, "success"); }
    catch (_) { toast(L.copyFail, "error"); }
  });

  const dl = document.createElement("button");
  dl.className = "btn btn-ghost";
  dl.textContent = L.downloadFile;
  dl.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: MSG.SAVE_IMAGE, dataUrl: editedUrl }).catch(() => {});
    toast(L.downloading, "info");
  });

  const again = document.createElement("button");
  again.className = "btn btn-ghost";
  again.textContent = L.editMore;
  again.addEventListener("click", () => { el.classList.add("is-hidden"); el.innerHTML = ""; onAgain(); });

  const close = document.createElement("button");
  close.className = "btn btn-ghost";
  close.textContent = L.close;
  close.addEventListener("click", () => window.close());

  row.append(save, dl, again, close);
  el.append(h, p, row);
}

function showCancelledPanel(L, onAgain) {
  const el = msgEl();
  el.classList.remove("is-hidden");
  el.innerHTML = "";
  const h = document.createElement("h2");
  h.textContent = L.cancelledTitle;
  const p = document.createElement("p");
  p.textContent = L.cancelledDesc;
  const row = document.createElement("div");
  row.className = "row";
  const again = document.createElement("button");
  again.className = "btn btn-primary";
  again.textContent = L.editMore;
  again.addEventListener("click", () => { el.classList.add("is-hidden"); el.innerHTML = ""; onAgain(); });
  const close = document.createElement("button");
  close.className = "btn btn-ghost";
  close.textContent = L.close;
  close.addEventListener("click", () => window.close());
  row.append(again, close);
  el.append(h, p, row);
}

async function runEditor(dataUrl, L) {
  const edited = await openAnnotator(dataUrl, L);
  if (edited) {
    // Chỉ ghi nhớ bản đã sửa để popup thấy — KHÔNG tự tải, KHÔNG tự copy.
    chrome.storage.session
      .set({ lastCapture: { dataUrl: edited, kind: "edited", at: Date.now() } })
      .catch(() => {});
    showDonePanel(L, edited, () => runEditor(edited, L));
  } else {
    showCancelledPanel(L, () => runEditor(dataUrl, L));
  }
}

async function main() {
  const [{ editImage }, cfg] = await Promise.all([
    chrome.storage.session.get("editImage"),
    chrome.storage.sync.get({ theme: "system", language: "vi" }),
  ]);
  applyTheme(cfg.theme);
  const L = L18N[cfg.language] || L18N.vi;
  document.documentElement.lang = cfg.language || "vi";

  if (!editImage || !editImage.dataUrl) {
    const el = msgEl();
    el.classList.remove("is-hidden");
    el.innerHTML = `<h2>${L.noImage}</h2><p>${L.noImageDesc}</p>`;
    return;
  }
  runEditor(editImage.dataUrl, L);
}

main();
