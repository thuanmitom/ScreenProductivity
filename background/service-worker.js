// background/service-worker.js
// "Bộ não" của extension: nhận lệnh từ UI (popup hoặc side panel), xin quyền
// capture, điều khiển content script + offscreen document, và lưu file.

import { MSG, REC_STATE, DEFAULTS } from "../shared/constants.js";
import { getSettings } from "../shared/storage.js";
import { buildFilename, joinDownloadPath } from "../shared/filename-template.js";

const OFFSCREEN_PATH = "offscreen/offscreen.html";

const IDLE_STATE = {
  status: REC_STATE.IDLE,
  source: null, // tab | window | screen | region
  tabId: null,
  startedAt: 0,
};

let state = { ...IDLE_STATE };

// QUAN TRỌNG: service worker của MV3 bị Chrome tắt sau ~30 giây không có sự
// kiện. Trong lúc quay, mọi việc do offscreen document làm nên service worker
// nằm im -> bị tắt -> biến `state` trong RAM mất sạch và quay về IDLE. Khi đó
// bấm "Dừng" sẽ rơi vào nhánh `status !== RECORDING` và KHÔNG làm gì cả: thanh
// công cụ treo trên màn hình mãi, phiên quay không bao giờ kết thúc.
// => Lưu trạng thái xuống storage.session để sống sót qua các lần worker khởi
//    động lại.
let stateLoaded = false;

async function loadState() {
  if (stateLoaded) return state;
  try {
    const { recState } = await chrome.storage.session.get("recState");
    if (recState && recState.status) state = recState;
  } catch (_) {}
  stateLoaded = true;
  return state;
}

function saveState() {
  chrome.storage.session.set({ recState: state }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Khởi tạo + chế độ giao diện (popup / side panel)
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(null);
  const toSet = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (current[k] === undefined) toSet[k] = v;
  }
  if (Object.keys(toSet).length) await chrome.storage.sync.set(toSet);
  // Nạp lại extension -> offscreen document bị huỷ, mọi phiên quay cũ không còn
  // giá trị. Xoá trạng thái cũ để không kẹt ở RECORDING.
  await chrome.storage.session.remove("recState").catch(() => {});
  applyUiMode();
});
chrome.runtime.onStartup.addListener(applyUiMode);

async function applyUiMode() {
  const { uiMode } = await getSettings();
  if (uiMode === "sidepanel") {
    await chrome.action.setPopup({ popup: "" });
    await chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => {});
  } else {
    // Mặc định: popup nhỏ gọn ngay trên icon extension.
    await chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: false })
      .catch(() => {});
    await chrome.action.setPopup({
      popup: "sidepanel/sidepanel.html?mode=popup",
    });
  }
}

// Đổi cài đặt uiMode -> áp dụng ngay.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.uiMode) applyUiMode();
});

// Khi uiMode = sidepanel, click action sẽ mở panel (Chrome xử lý qua panelBehavior).
chrome.action.onClicked.addListener(async (tab) => {
  const { uiMode } = await getSettings();
  if (uiMode === "sidepanel") {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isRestrictedUrl(url = "") {
  return (
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("https://chrome.google.com/webstore") ||
    url.startsWith("https://chromewebstore.google.com")
  );
}

function broadcastState(extra = {}) {
  saveState(); // giữ trạng thái qua các lần service worker bị tắt/khởi động lại
  chrome.runtime
    .sendMessage({ type: MSG.STATE_UPDATE, state: { ...state, ...extra } })
    .catch(() => {});
}

function toast(message, kind = "info") {
  chrome.runtime.sendMessage({ type: MSG.TOAST, message, kind }).catch(() => {});
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content-scripts/overlay.css"],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-scripts/overlay.js"],
    });
  } catch (e) {
    console.debug("ensureContentScript:", e?.message);
  }
}

async function sendToTab(tabId, payload) {
  return chrome.tabs.sendMessage(tabId, payload).catch((e) => {
    console.debug("sendToTab:", e?.message);
    return null;
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Offscreen document
// ---------------------------------------------------------------------------
async function hasOffscreen() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    return contexts.length > 0;
  }
  return false;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["USER_MEDIA", "DISPLAY_MEDIA", "BLOBS", "WORKERS"],
    justification:
      "Ghi màn hình (MediaRecorder), xử lý ảnh (canvas) và OCR (Tesseract) cần môi trường DOM.",
  });
}

async function callOffscreen(payload) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ ...payload, target: "offscreen" });
}

// ---------------------------------------------------------------------------
// Lưu file
// ---------------------------------------------------------------------------
async function download(dataUrl, folder, ext) {
  const settings = await getSettings();
  const name = buildFilename(settings.filenameTemplate, {
    projectName: settings.projectName,
    ext,
  });
  const filename = joinDownloadPath(folder, name);
  // askWhereToSave = true -> Chrome hiện hộp thoại "Save as" (chọn thư mục và
  // sửa tên); filename ở trên trở thành tên gợi ý sẵn trong hộp thoại.
  await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: !!settings.askWhereToSave,
  });
  return filename;
}

// Gửi ảnh về UI để preview + copy clipboard. Nếu không UI nào đang mở
// (popup đã đóng), fallback: tự tải file như trước để không mất ảnh.
async function deliverImage(dataUrl, kind) {
  // Lưu ảnh gần nhất để popup mở lại vẫn thấy.
  await chrome.storage.session
    .set({ lastCapture: { dataUrl, kind, at: Date.now() } })
    .catch(() => {});
  try {
    await chrome.runtime.sendMessage({ type: MSG.IMAGE_READY, dataUrl, kind });
  } catch (_) {
    // Không có UI nhận -> tự lưu file.
    const s = await getSettings();
    const ext = dataUrl.startsWith("data:image/jpeg") ? "jpg" : "png";
    await download(dataUrl, s.screenshotFolder, ext).catch(() => {});
  }
}

// ===========================================================================
// PHÂN HỆ QUAY MÀN HÌNH
// ===========================================================================
async function startRecording(opts) {
  if (state.status !== REC_STATE.IDLE) {
    toast("Đang có phiên quay khác.", "warn");
    return;
  }
  const tab = await getActiveTab();
  if (!tab) return;

  const source = opts.source; // tab | window | screen | region
  const overlayOnPage = source === "tab" || source === "region";

  if (overlayOnPage && isRestrictedUrl(tab.url)) {
    toast(
      "Không thể quay trang hệ thống (chrome://…). Hãy mở một trang web thường rồi quay.",
      "warn"
    );
    return;
  }

  state = { status: REC_STATE.SELECTING, source, tabId: tab.id, startedAt: 0 };
  broadcastState();

  let region = null;
  if (overlayOnPage) {
    await ensureContentScript(tab.id);
    if (source === "region") {
      const res = await sendToTab(tab.id, { type: MSG.CT_SELECT_REGION });
      if (!res || res.cancelled) {
        resetState();
        return;
      }
      region = res.rect;
    }
  }

  // ---- Lấy streamId ----
  // tabCapture.getMediaStreamId trong MV3 đòi hỏi extension vừa được "invoke"
  // trên đúng tab đó nên rất hay lỗi ("Extension has not been invoked...").
  // Chiến lược: thử tabCapture trước (nếu được thì mượt, không hiện hộp thoại);
  // lỗi thì fallback sang hộp chọn desktopCapture — LUÔN hoạt động.
  let streamId = null;
  let chromeMediaSource = "desktop";

  if (source === "tab" || source === "region") {
    try {
      streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tab.id,
      });
      chromeMediaSource = "tab";
    } catch (e) {
      console.debug("tabCapture thất bại, fallback desktopCapture:", e?.message);
      toast("Hãy chọn tab này trong hộp thoại chia sẻ.", "info");
      streamId = await chooseDesktopMedia(["tab", "audio"], tab).catch(() => "");
      chromeMediaSource = "desktop";
    }
  } else {
    const sources =
      source === "screen" ? ["screen", "audio"] : ["window", "audio"];
    streamId = await chooseDesktopMedia(sources, tab).catch((e) => {
      toast("Không lấy được nguồn quay: " + (e?.message || e), "error");
      return "";
    });
  }

  if (!streamId) {
    resetState();
    return; // người dùng huỷ hộp chọn.
  }

  // Hiện thanh điều khiển nổi trên trang cho MỌI chế độ quay, để luôn có nút
  // "Dừng" ngay trên màn hình (kể cả khi mở bằng popup — popup sẽ đóng lại).
  // Với window/screen, trang hiện tại có thể là chrome:// -> tiêm sẽ tự bỏ qua.
  if (!overlayOnPage && !isRestrictedUrl(tab.url)) {
    await ensureContentScript(tab.id);
  }
  if (!isRestrictedUrl(tab.url)) {
    if (overlayOnPage && opts.cursorHighlight)
      await sendToTab(tab.id, { type: MSG.CT_CURSOR_HL, on: true });
    await sendToTab(tab.id, { type: MSG.CT_SHOW_TOOLBAR });
  }

  const resp = await callOffscreen({
    type: MSG.OFF_START_REC,
    streamId,
    chromeMediaSource,
    region,
    mic: opts.mic,
    micDeviceId: opts.micDeviceId,
    systemAudio: opts.systemAudio,
    videoFormat: opts.videoFormat,
    camera: opts.camera || null,
  });

  if (!resp || !resp.ok) {
    toast("Không khởi động được bộ ghi: " + (resp?.error || "?"), "error");
    // Thanh công cụ giờ hiện ở MỌI chế độ nên phải dọn ở mọi chế độ, nếu không
    // nó sẽ treo lại trên trang khi khởi động bộ ghi thất bại.
    await finishSession();
    return;
  }

  state.status = REC_STATE.RECORDING;
  state.startedAt = Date.now();
  broadcastState();
  syncToolbarState();

  // Nếu người dùng chọn MP4 nhưng trình duyệt không hỗ trợ ghi MP4 -> báo rõ
  // (thay vì lặng lẽ lưu WebM), để không bị bất ngờ khi mở file.
  const wantedMp4 = opts.videoFormat === "mp4";
  const gotMp4 = /mp4/i.test(resp.mimeType || "");
  if (wantedMp4 && !gotMp4) {
    toast(
      "Chrome của bạn chưa hỗ trợ ghi MP4 — sẽ lưu WebM. Hãy cập nhật Chrome để có MP4.",
      "warn"
    );
  } else {
    toast("Bắt đầu quay (" + (gotMp4 ? "MP4" : "WebM") + ").", "success");
  }
}

function chooseDesktopMedia(sources, tab) {
  return new Promise((resolve, reject) => {
    try {
      chrome.desktopCapture.chooseDesktopMedia(sources, tab, (streamId) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        resolve(streamId || "");
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function stopRecording() {
  const active =
    state.status === REC_STATE.RECORDING || state.status === REC_STATE.PAUSED;

  if (!active) {
    // Lưới an toàn: không còn phiên nào nhưng người dùng vẫn bấm Dừng, nghĩa là
    // có thanh công cụ "mồ côi" còn treo trên trang -> dọn sạch cho bằng được.
    await clearOverlay();
    const tab = await getActiveTab();
    if (tab) {
      await sendToTab(tab.id, { type: MSG.CT_HIDE_TOOLBAR });
      await sendToTab(tab.id, { type: MSG.CT_CURSOR_HL, on: false });
    }
    if (await hasOffscreen()) {
      await callOffscreen({ type: MSG.OFF_STOP_REC, discard: true }).catch(() => {});
    }
    resetState();
    return;
  }

  state.status = REC_STATE.PROCESSING;
  broadcastState();
  await clearOverlay();
  await callOffscreen({ type: MSG.OFF_STOP_REC });
}

// Báo trạng thái thật xuống thanh công cụ nổi để nhãn nút luôn khớp.
function syncToolbarState() {
  if (state.tabId) {
    sendToTab(state.tabId, { type: MSG.CT_REC_STATE, status: state.status });
  }
}

async function pauseRecording() {
  if (state.status !== REC_STATE.RECORDING) return;
  await callOffscreen({ type: MSG.OFF_PAUSE_REC });
  state.status = REC_STATE.PAUSED;
  broadcastState();
  syncToolbarState();
}

async function resumeRecording() {
  if (state.status !== REC_STATE.PAUSED) return;
  await callOffscreen({ type: MSG.OFF_RESUME_REC });
  state.status = REC_STATE.RECORDING;
  broadcastState();
  syncToolbarState();
}

// Thanh công cụ chỉ gửi ý định toggle -> ở đây mới quyết định dựa trên trạng
// thái thật, nên không bao giờ bị "bấm mà không có tác dụng".
async function togglePauseRecording() {
  if (state.status === REC_STATE.RECORDING) await pauseRecording();
  else if (state.status === REC_STATE.PAUSED) await resumeRecording();
}

async function cancelRecording() {
  await clearOverlay();
  await callOffscreen({ type: MSG.OFF_STOP_REC, discard: true }).catch(() => {});
  resetState();
  toast("Đã huỷ phiên quay.", "info");
}

// Gỡ thanh công cụ nổi + highlight con trỏ khỏi trang. Gọi được nhiều lần.
async function clearOverlay() {
  if (!state.tabId) return;
  await sendToTab(state.tabId, { type: MSG.CT_HIDE_TOOLBAR });
  await sendToTab(state.tabId, { type: MSG.CT_CURSOR_HL, on: false });
}

function resetState() {
  state = { ...IDLE_STATE };
  broadcastState();
}

// Điểm kết thúc DUY NHẤT của mọi phiên quay: luôn dọn lớp phủ rồi reset, bất kể
// phiên kết thúc bằng cách nào (bấm Dừng, lỗi, hay người dùng bấm "Stop
// sharing" của Chrome khiến nguồn tự tắt).
async function finishSession() {
  await clearOverlay();
  resetState();
}

async function onRecordingData({ dataUrl, discard, mimeType }) {
  if (!discard && dataUrl) {
    try {
      // Đuôi file phải khớp mime thực tế của bản ghi (mp4/webm) để mở được.
      const mime = mimeType || dataUrl.slice(5, dataUrl.indexOf(";"));
      const ext = /mp4/i.test(mime) ? "mp4" : "webm";
      await download(dataUrl, (await getSettings()).videoFolder, ext);
      toast("Đã lưu video vào Downloads.", "success");
    } catch (e) {
      toast("Lỗi lưu video: " + e.message, "error");
    }
  }
  // Luôn dọn lớp phủ ở đây nữa — phiên có thể kết thúc mà không đi qua
  // stopRecording() (vd người dùng bấm "Stop sharing" của Chrome).
  await finishSession();
}

// ===========================================================================
// PHÂN HỆ CHỤP MÀN HÌNH
// Flow mới: chụp -> gửi ảnh về UI (preview + tự copy clipboard).
// Người dùng bấm "Lưu file" thì mới tải về.
// ===========================================================================
async function captureVisible() {
  const tab = await getActiveTab();
  if (!tab) return;
  if (isRestrictedUrl(tab.url)) {
    toast("Không thể chụp trang hệ thống này.", "warn");
    return;
  }
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
    await deliverImage(dataUrl, "visible");
  } catch (e) {
    toast("Chụp thất bại: " + e.message, "error");
  }
}

async function captureRegion() {
  const tab = await getActiveTab();
  if (!tab || isRestrictedUrl(tab.url)) {
    toast("Không thể chụp trang này.", "warn");
    return;
  }
  await ensureContentScript(tab.id);
  const res = await sendToTab(tab.id, { type: MSG.CT_SELECT_REGION });
  if (!res || res.cancelled) return;

  try {
    const full = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
    const cropped = await callOffscreen({
      type: MSG.OFF_CROP_IMAGE,
      dataUrl: full,
      rect: res.rect,
      format: "png",
      quality: 1,
    });
    if (!cropped || !cropped.dataUrl) throw new Error(cropped?.error || "crop");
    await deliverImage(cropped.dataUrl, "region");
  } catch (e) {
    toast("Chụp vùng thất bại: " + e.message, "error");
  }
}

async function captureFullPage() {
  const tab = await getActiveTab();
  if (!tab || isRestrictedUrl(tab.url)) {
    toast("Không thể chụp trang này.", "warn");
    return;
  }
  await ensureContentScript(tab.id);

  const metrics = await sendToTab(tab.id, { type: MSG.CT_PAGE_METRICS });
  if (!metrics) {
    toast("Không đọc được kích thước trang. Hãy tải lại trang rồi thử lại.", "error");
    return;
  }

  const { viewportHeight, viewportWidth, dpr } = metrics;
  // Chrome giới hạn kích thước canvas (~16384px mỗi chiều). Cắt bớt nếu trang quá dài.
  const MAX_H = Math.floor(16000 / (dpr || 1));
  const scrollHeight = Math.min(metrics.scrollHeight, MAX_H);
  if (metrics.scrollHeight > MAX_H) {
    toast("Trang quá dài — chỉ chụp được ~" + MAX_H + "px đầu.", "warn");
  }

  toast("Đang chụp toàn trang, vui lòng không thao tác…", "info");
  await sendToTab(tab.id, { type: MSG.CT_PREP_FULLPAGE });

  const shots = [];
  let y = 0;
  let lastY = -1;
  let firstShot = true;

  try {
    while (y < scrollHeight) {
      const scrollRes = await sendToTab(tab.id, { type: MSG.CT_SCROLL_TO, y });
      const actualY = scrollRes ? scrollRes.actualY : y;
      if (actualY === lastY) break; // trang không cuộn thêm được nữa.
      lastY = actualY;

      // Sau ảnh đầu tiên, ẩn các phần tử fixed/sticky (header dính, nút chat…)
      // để chúng không lặp lại ở mọi khung -> ảnh ghép liền mạch, sạch sẽ.
      if (!firstShot) {
        await sendToTab(tab.id, { type: MSG.CT_STICKY, hide: true });
      }

      // captureVisibleTab bị giới hạn ~2 lần/giây -> chờ đủ lâu, đồng thời
      // cho trang kịp render (ảnh lazy-load).
      await sleep(600);

      const shot = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: "png",
      });
      shots.push({ dataUrl: shot, y: actualY });
      firstShot = false;
      y = actualY + viewportHeight;
    }
  } catch (e) {
    toast("Chụp toàn trang lỗi: " + e.message, "error");
    await sendToTab(tab.id, { type: MSG.CT_STICKY, hide: false });
    await sendToTab(tab.id, { type: MSG.CT_RESTORE_FULLPAGE });
    return;
  }

  await sendToTab(tab.id, { type: MSG.CT_STICKY, hide: false });
  await sendToTab(tab.id, { type: MSG.CT_RESTORE_FULLPAGE });

  if (!shots.length) {
    toast("Không chụp được khung hình nào.", "error");
    return;
  }

  const stitched = await callOffscreen({
    type: MSG.OFF_STITCH_IMAGE,
    shots,
    totalHeight: Math.min(scrollHeight, lastY + viewportHeight),
    viewportWidth,
    viewportHeight,
    dpr,
    format: "png",
    quality: 1,
  });
  if (!stitched || !stitched.dataUrl) {
    toast("Ghép ảnh thất bại: " + (stitched?.error || "?"), "error");
    return;
  }
  await deliverImage(stitched.dataUrl, "fullpage");
}

// ===========================================================================
// PHÂN HỆ OCR
// ===========================================================================
async function startOCR() {
  const tab = await getActiveTab();
  if (!tab || isRestrictedUrl(tab.url)) {
    toast("Không thể quét trang này.", "warn");
    return;
  }
  await ensureContentScript(tab.id);
  const res = await sendToTab(tab.id, { type: MSG.CT_SELECT_REGION, ocr: true });
  if (!res || res.cancelled) return;

  toast("Đang nhận diện chữ…", "info");
  try {
    const full = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
    const cropped = await callOffscreen({
      type: MSG.OFF_CROP_IMAGE,
      dataUrl: full,
      rect: res.rect,
      format: "png",
      quality: 1,
    });
    if (!cropped || !cropped.dataUrl) throw new Error("crop");

    const settings = await getSettings();
    const ocr = await callOffscreen({
      type: MSG.OFF_OCR,
      dataUrl: cropped.dataUrl,
      lang: settings.ocrLang,
    });
    if (!ocr || ocr.error) throw new Error(ocr?.error || "OCR");

    await chrome.storage.session
      .set({ lastOcr: { text: ocr.text || "", at: Date.now() } })
      .catch(() => {});
    chrome.runtime
      .sendMessage({ type: MSG.OCR_RESULT, text: ocr.text || "" })
      .catch(() => {});
  } catch (e) {
    toast("OCR lỗi: " + e.message, "error");
  }
}

// ===========================================================================
// ROUTER MESSAGE
// ===========================================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target === "offscreen") return false;

  // Các lệnh liên quan tới phiên quay phải đọc lại trạng thái đã lưu trước,
  // phòng trường hợp service worker vừa bị Chrome tắt rồi bật lại.
  switch (msg.type) {
    case MSG.START_RECORDING:
      loadState().then(() => startRecording(msg.options || {}));
      break;
    case MSG.STOP_RECORDING:
      loadState().then(stopRecording);
      break;
    case MSG.PAUSE_RECORDING:
      loadState().then(pauseRecording);
      break;
    case MSG.RESUME_RECORDING:
      loadState().then(resumeRecording);
      break;
    case MSG.CANCEL_RECORDING:
      loadState().then(cancelRecording);
      break;
    case MSG.CAPTURE_VISIBLE:
      captureVisible();
      break;
    case MSG.CAPTURE_REGION:
      captureRegion();
      break;
    case MSG.CAPTURE_FULLPAGE:
      captureFullPage();
      break;
    case MSG.START_OCR:
      startOCR();
      break;
    case MSG.SAVE_IMAGE:
      (async () => {
        try {
          const s = await getSettings();
          const isJpeg = (msg.dataUrl || "").startsWith("data:image/jpeg");
          const name = await download(
            msg.dataUrl,
            s.screenshotFolder,
            isJpeg ? "jpg" : "png"
          );
          toast("Đã lưu: " + name, "success");
        } catch (e) {
          toast("Lưu thất bại: " + e.message, "error");
        }
      })();
      break;
    case MSG.GET_STATE:
      loadState().then((s) => sendResponse({ state: s }));
      return true; // trả lời bất đồng bộ

    case MSG.REC_DATA_READY:
      loadState().then(() => onRecordingData(msg));
      break;
    case MSG.REC_ERROR:
      toast("Lỗi ghi: " + msg.error, "error");
      loadState().then(() => finishSession());
      break;

    case MSG.TOOLBAR_STOP:
      loadState().then(stopRecording);
      break;
    case MSG.TOOLBAR_TOGGLE_PAUSE:
      loadState().then(togglePauseRecording);
      break;
    case MSG.TOOLBAR_PAUSE:
      loadState().then(pauseRecording);
      break;
    case MSG.TOOLBAR_RESUME:
      loadState().then(resumeRecording);
      break;
    case MSG.TOOLBAR_CANCEL:
      loadState().then(cancelRecording);
      break;
  }
  return false;
});
