// sidepanel/sidepanel.js
import { MSG, REC_STATE } from "../shared/constants.js";
import { getSettings, saveSettings } from "../shared/storage.js";
import { buildFilename } from "../shared/filename-template.js";

// ===========================================================================
// I18N
// ===========================================================================
const I18N = {
  vi: {
    appName: "Screen Productivity",
    tabRecord: "Quay", tabCapture: "Chụp", tabOcr: "OCR", tabSettings: "Cài đặt",
    recSource: "Chế độ quay",
    srcTab: "Tab hiện tại", srcTabDesc: "Chỉ quay tab đang mở",
    srcWindow: "Cửa sổ", srcWindowDesc: "Một ứng dụng",
    srcScreen: "Toàn màn hình", srcScreenDesc: "Cả màn hình",
    srcRegion: "Vùng chọn", srcRegionDesc: "Khung chữ nhật",
    preflight: "Kiểm tra thiết bị",
    mic: "Micro", camera: "Camera",
    systemAudio: "Âm thanh hệ thống", cursorHl: "Highlight con trỏ chuột",
    btnRecord: "Bắt đầu quay", btnPause: "Tạm dừng", btnResume: "Tiếp tục",
    btnStop: "Dừng & lưu", btnCancel: "Huỷ",
    recording: "Đang quay", paused: "Tạm dừng", processing: "Đang xử lý…",
    capVisible: "Chụp màn hình hiện tại", capVisibleDesc: "Phần trang đang hiển thị",
    capRegion: "Chụp vùng chọn", capRegionDesc: "Kéo chuột chọn khung",
    capFull: "Chụp toàn bộ trang", capFullDesc: "Tự cuộn và ghép ảnh dài",
    ocrScan: "Quét vùng chữ", ocrLang: "Ngôn ngữ nhận diện",
    ocrResultPh: "Kết quả nhận diện sẽ hiện ở đây…", ocrCopy: "Sao chép văn bản",
    ocrCopied: "Đã sao chép vào clipboard", ocrEmpty: "Không nhận ra chữ nào.",
    setProject: "Tên dự án", setFilename: "Mẫu đặt tên file",
    tokenHint: "Token: [project] [YYYY] [MM] [DD] [HH] [mm] [ss] [timestamp]",
    setFolders: "Thư mục lưu (trong Downloads)",
    videoFolder: "Video", screenshotFolder: "Ảnh chụp", ocrFolder: "OCR",
    setImage: "Định dạng ảnh", imgQuality: "Chất lượng JPEG",
    save: "Lưu cài đặt", saved: "Đã lưu cài đặt",
    previewTitle: "Ảnh vừa chụp", copyImg: "Sao chép", saveImg: "Lưu file",
    imgCopied: "Đã sao chép ảnh vào clipboard",
    imgCopyFail: "Chưa copy được — bấm nút Sao chép.",
    setUi: "Giao diện mở",
    uiPopup: "Popup", uiPopupDesc: "Cửa sổ nhỏ trên icon",
    uiPanel: "Side panel", uiPanelDesc: "Cố định cạnh màn hình",
    uiChanged: "Đã đổi. Bấm lại icon extension để thấy thay đổi.",
    needPerm: "Cần cấp quyền thiết bị — đang mở trang cấp quyền…",
    // Camera overlay
    camPos: "Vị trí", camSize: "Kích thước", camShape: "Hình dạng",
    camSm: "Nhỏ", camMd: "Vừa", camLg: "Lớn",
    camRect: "Chữ nhật", camCircle: "Tròn", camMirror: "Lật gương camera",
    // Theme
    setTheme: "Giao diện màu",
    themeSystem: "Hệ thống", themeLight: "Sáng", themeDark: "Tối",
    // Video format
    setVideo: "Định dạng video",
    vfMp4: "MP4 (mở được mọi trình phát)", vfWebm: "WebM (nhẹ hơn)",
    videoFmtHint: "MP4 khuyến nghị để xem được trên Windows Media Player, điện thoại…",
    // Capture edit / clear
    editImg: "✎ Vẽ / Sửa", clearImg: "Đóng / Xoá ảnh", imgCleared: "Đã xoá ảnh.",
    ocrClear: "Xoá", ocrCleared: "Đã xoá kết quả.",
    // Annotator
    annoUndo: "Hoàn tác", annoClear: "Xoá hết", annoCancel: "Huỷ", annoDone: "Xong",
    imgEdited: "Đã lưu chỉnh sửa.",
    // Cách lưu file
    setSaveMode: "Cách lưu file",
    askSave: "Hỏi nơi lưu & tên file mỗi lần tải",
    askSaveHint: "Tắt: tự lưu vào thư mục và tên đặt sẵn bên dưới. Bật: mỗi lần tải sẽ hiện hộp thoại chọn nơi lưu.",
  },
  en: {
    appName: "Screen Productivity",
    tabRecord: "Record", tabCapture: "Capture", tabOcr: "OCR", tabSettings: "Settings",
    recSource: "Recording mode",
    srcTab: "Current tab", srcTabDesc: "Record the open tab only",
    srcWindow: "Window", srcWindowDesc: "One application",
    srcScreen: "Entire screen", srcScreenDesc: "The whole display",
    srcRegion: "Region", srcRegionDesc: "Rectangular area",
    preflight: "Device check",
    mic: "Microphone", camera: "Camera",
    systemAudio: "System audio", cursorHl: "Highlight cursor",
    btnRecord: "Start recording", btnPause: "Pause", btnResume: "Resume",
    btnStop: "Stop & save", btnCancel: "Cancel",
    recording: "Recording", paused: "Paused", processing: "Processing…",
    capVisible: "Capture visible area", capVisibleDesc: "The part currently on screen",
    capRegion: "Capture region", capRegionDesc: "Drag to select an area",
    capFull: "Capture full page", capFullDesc: "Auto-scroll and stitch",
    ocrScan: "Scan text region", ocrLang: "Recognition language",
    ocrResultPh: "Recognized text will appear here…", ocrCopy: "Copy text",
    ocrCopied: "Copied to clipboard", ocrEmpty: "No text detected.",
    setProject: "Project name", setFilename: "Filename template",
    tokenHint: "Tokens: [project] [YYYY] [MM] [DD] [HH] [mm] [ss] [timestamp]",
    setFolders: "Save folders (inside Downloads)",
    videoFolder: "Video", screenshotFolder: "Screenshots", ocrFolder: "OCR",
    setImage: "Image format", imgQuality: "JPEG quality",
    save: "Save settings", saved: "Settings saved",
    previewTitle: "Latest capture", copyImg: "Copy", saveImg: "Save file",
    imgCopied: "Image copied to clipboard",
    imgCopyFail: "Couldn't auto-copy — press Copy.",
    setUi: "Open as",
    uiPopup: "Popup", uiPopupDesc: "Small window on the icon",
    uiPanel: "Side panel", uiPanelDesc: "Docked to the side",
    uiChanged: "Changed. Click the extension icon again to see it.",
    needPerm: "Device permission needed — opening the grant page…",
    camPos: "Position", camSize: "Size", camShape: "Shape",
    camSm: "Small", camMd: "Medium", camLg: "Large",
    camRect: "Rectangle", camCircle: "Circle", camMirror: "Mirror camera",
    setTheme: "Appearance",
    themeSystem: "System", themeLight: "Light", themeDark: "Dark",
    setVideo: "Video format",
    vfMp4: "MP4 (plays everywhere)", vfWebm: "WebM (smaller)",
    videoFmtHint: "MP4 recommended so it plays on Windows Media Player, phones…",
    editImg: "✎ Draw / Edit", clearImg: "Close / Clear image", imgCleared: "Image cleared.",
    ocrClear: "Clear", ocrCleared: "Result cleared.",
    annoUndo: "Undo", annoClear: "Clear all", annoCancel: "Cancel", annoDone: "Done",
    imgEdited: "Edits saved.",
    setSaveMode: "How to save",
    askSave: "Ask where to save & filename each time",
    askSaveHint: "Off: save straight to the folder and name below. On: a Save-as dialog appears each time.",
  },
};

let lang = "vi";
const t = (key) => I18N[lang][key] || key;

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.documentElement.lang = lang;
  updatePauseLabel();
}

// ===========================================================================
// TIỆN ÍCH
// ===========================================================================
const $ = (id) => document.getElementById(id);
const send = (type, extra = {}) =>
  chrome.runtime.sendMessage({ type, ...extra }).catch(() => {});

let toastTimer = null;
function showToast(message, kind = "info") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 2600);
}

// ===========================================================================
// TABS
// ===========================================================================
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((el) =>
    el.classList.toggle("is-active", el.dataset.tab === name)
  );
  document.querySelectorAll(".panel").forEach((p) =>
    p.classList.toggle("is-active", p.dataset.panel === name)
  );
}

// ===========================================================================
// SOURCE CARDS
// ===========================================================================
$("sourceGrid").addEventListener("change", () => {
  document.querySelectorAll(".source-card").forEach((card) => {
    const input = card.querySelector("input");
    card.classList.toggle("is-selected", input.checked);
  });
});
const getSource = () =>
  document.querySelector('input[name="source"]:checked')?.value || "tab";

// ===========================================================================
// THIẾT BỊ: MIC METER + CAMERA
// ===========================================================================
let micStream = null, audioCtx = null, analyser = null, meterRAF = null;
let camStream = null;

async function listDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    fillSelect($("micDevice"), devices.filter((d) => d.kind === "audioinput"), "Micro");
    fillSelect($("camDevice"), devices.filter((d) => d.kind === "videoinput"), "Camera");
  } catch (e) {
    console.warn(e);
  }
}
function fillSelect(sel, devices, fallback) {
  const prev = sel.value;
  sel.innerHTML = "";
  devices.forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label || `${fallback} ${i + 1}`;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

function openPermissionPage() {
  showToast(t("needPerm"), "info");
  chrome.tabs.create({
    url: chrome.runtime.getURL("sidepanel/permissions.html"),
  });
}

async function startMic() {
  stopMic();
  const deviceId = $("micDevice").value;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
  } catch (e) {
    $("micToggle").checked = false;
    $("micDevice").disabled = true;
    if (e.name === "NotAllowedError" || e.name === "SecurityError") {
      openPermissionPage();
    } else {
      showToast("Không mở được micro: " + e.message, "error");
    }
    return;
  }
  $("micDevice").disabled = false;
  await listDevices();

  audioCtx = new AudioContext();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  audioCtx.createMediaStreamSource(micStream).connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const fill = $("micMeterFill");
  const loop = () => {
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    fill.style.width = Math.min(100, Math.round(peak * 140)) + "%";
    meterRAF = requestAnimationFrame(loop);
  };
  loop();
}
function stopMic() {
  if (meterRAF) cancelAnimationFrame(meterRAF);
  meterRAF = null;
  if (audioCtx && audioCtx.state !== "closed") audioCtx.close().catch(() => {});
  audioCtx = null;
  analyser = null;
  if (micStream) micStream.getTracks().forEach((tr) => tr.stop());
  micStream = null;
  $("micMeterFill").style.width = "0%";
}

async function startCam() {
  stopCam();
  const deviceId = $("camDevice").value;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
  } catch (e) {
    $("camToggle").checked = false;
    $("camDevice").disabled = true;
    if (e.name === "NotAllowedError" || e.name === "SecurityError") {
      openPermissionPage();
    } else {
      showToast("Không mở được camera: " + e.message, "error");
    }
    return;
  }
  $("camDevice").disabled = false;
  await listDevices();
  const v = $("camPreview");
  v.srcObject = camStream;
  v.classList.add("is-on");
  await v.play().catch(() => {});
}
function stopCam() {
  if (camStream) camStream.getTracks().forEach((tr) => tr.stop());
  camStream = null;
  const v = $("camPreview");
  v.srcObject = null;
  v.classList.remove("is-on");
}

$("micToggle").addEventListener("change", (e) => {
  saveSettings({ micEnabled: e.target.checked });
  if (e.target.checked) startMic();
  else { stopMic(); $("micDevice").disabled = true; }
});
$("micDevice").addEventListener("change", (e) => {
  saveSettings({ micDeviceId: e.target.value });
  if ($("micToggle").checked) startMic();
});
function toggleCamOptions(on) {
  $("camOptions").classList.toggle("is-hidden", !on);
}

$("camToggle").addEventListener("change", (e) => {
  saveSettings({ cameraEnabled: e.target.checked });
  toggleCamOptions(e.target.checked);
  if (e.target.checked) startCam();
  else { stopCam(); $("camDevice").disabled = true; }
});
$("camDevice").addEventListener("change", (e) => {
  saveSettings({ cameraDeviceId: e.target.value });
  if ($("camToggle").checked) startCam();
});

// ---- Tuỳ chọn camera overlay (vị trí / kích thước / hình dạng / lật gương) ----
function markCamPos(pos) {
  document.querySelectorAll("#camPosGrid .pos-cell").forEach((c) =>
    c.classList.toggle("is-active", c.dataset.pos === pos)
  );
}
$("camPosGrid").addEventListener("click", (e) => {
  const cell = e.target.closest(".pos-cell");
  if (!cell) return;
  markCamPos(cell.dataset.pos);
  saveSettings({ camPosition: cell.dataset.pos });
});
$("camSize").addEventListener("change", (e) =>
  saveSettings({ camSize: e.target.value })
);
$("camShape").addEventListener("change", (e) =>
  saveSettings({ camShape: e.target.value })
);
$("camMirrorToggle").addEventListener("change", (e) =>
  saveSettings({ camMirror: e.target.checked })
);
$("sysAudioToggle").addEventListener("change", (e) =>
  saveSettings({ systemAudioEnabled: e.target.checked })
);
$("cursorHlToggle").addEventListener("change", (e) =>
  saveSettings({ cursorHighlight: e.target.checked })
);

// ===========================================================================
// QUAY
// ===========================================================================
let settings = null;

$("btnRecord").addEventListener("click", async () => {
  settings = await getSettings();
  send(MSG.START_RECORDING, {
    options: {
      source: getSource(),
      mic: $("micToggle").checked,
      micDeviceId: $("micDevice").value || "",
      systemAudio: $("sysAudioToggle").checked,
      cursorHighlight: $("cursorHlToggle").checked,
      videoFormat: settings.videoFormat,
      camera: $("camToggle").checked
        ? {
            enabled: true,
            deviceId: $("camDevice").value || "",
            position: settings.camPosition,
            size: settings.camSize,
            shape: settings.camShape,
            mirror: settings.camMirror,
          }
        : null,
    },
  });
});
$("btnStop").addEventListener("click", () => send(MSG.STOP_RECORDING));
$("btnCancel").addEventListener("click", () => send(MSG.CANCEL_RECORDING));
$("btnPause").addEventListener("click", () => {
  if (currentStatus === REC_STATE.PAUSED) send(MSG.RESUME_RECORDING);
  else send(MSG.PAUSE_RECORDING);
});

// ---- Trạng thái & đồng hồ ----
let currentStatus = REC_STATE.IDLE;
let timerInt = null;
let startedAt = 0;

function renderState(state) {
  currentStatus = state.status;
  const active = state.status !== REC_STATE.IDLE;
  $("recIdle").classList.toggle("is-hidden", active);
  $("recActive").classList.toggle("is-hidden", !active);

  const label = $("recStateLabel");
  if (state.status === REC_STATE.RECORDING) label.textContent = t("recording");
  else if (state.status === REC_STATE.PAUSED) label.textContent = t("paused");
  else if (state.status === REC_STATE.PROCESSING) label.textContent = t("processing");
  else if (state.status === REC_STATE.SELECTING) label.textContent = "…";

  updatePauseLabel();

  if (state.status === REC_STATE.RECORDING) {
    startedAt = state.startedAt || Date.now();
    if (!timerInt) timerInt = setInterval(updateTimer, 500);
  } else if (state.status === REC_STATE.PAUSED) {
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
  } else {
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
    $("recTimer").textContent = "00:00";
  }
}
function updateTimer() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  $("recTimer").textContent = `${mm}:${ss}`;
}
function updatePauseLabel() {
  const btn = $("btnPause");
  if (!btn) return;
  btn.textContent =
    currentStatus === REC_STATE.PAUSED ? t("btnResume") : t("btnPause");
}

// ===========================================================================
// CHỤP
// ===========================================================================
$("capVisible").addEventListener("click", () => send(MSG.CAPTURE_VISIBLE));
$("capRegion").addEventListener("click", () => send(MSG.CAPTURE_REGION));
$("capFull").addEventListener("click", () => send(MSG.CAPTURE_FULLPAGE));

// ---- Ảnh vừa chụp: preview + clipboard + lưu ----
let lastImageDataUrl = null;

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/data:([^;]+)/)[1];
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function copyImageToClipboard(dataUrl) {
  // ClipboardItem chỉ nhận image/png -> chuyển đổi nếu cần.
  let blob = dataUrlToBlob(dataUrl);
  if (blob.type !== "image/png") {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    blob = await new Promise((res) => c.toBlob(res, "image/png"));
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

async function handleImageReady(dataUrl) {
  lastImageDataUrl = dataUrl;
  switchTab("capture");
  $("previewImg").src = dataUrl;
  $("capturePreview").classList.remove("is-hidden");
  // Tự copy vào clipboard trước — đúng flow người dùng mong đợi.
  try {
    await copyImageToClipboard(dataUrl);
    showToast(t("imgCopied"), "success");
  } catch (_) {
    // Document mất focus (vd đang chụp full-page) -> nhắc bấm nút Copy.
    showToast(t("imgCopyFail"), "warn");
  }
}

$("btnCopyImg").addEventListener("click", async () => {
  if (!lastImageDataUrl) return;
  try {
    await copyImageToClipboard(lastImageDataUrl);
    showToast(t("imgCopied"), "success");
  } catch (e) {
    showToast("Copy lỗi: " + e.message, "error");
  }
});

$("btnSaveImg").addEventListener("click", () => {
  if (!lastImageDataUrl) return;
  send(MSG.SAVE_IMAGE, { dataUrl: lastImageDataUrl });
});

// ---- Vẽ / chỉnh sửa ảnh: mở TAB RIÊNG (rộng rãi, dễ vẽ hơn popup) ----
$("btnEditImg").addEventListener("click", async () => {
  if (!lastImageDataUrl) return;
  await chrome.storage.session
    .set({ editImage: { dataUrl: lastImageDataUrl, at: Date.now() } })
    .catch(() => {});
  chrome.tabs.create({ url: chrome.runtime.getURL("editor/editor.html") });
});

// ---- Đóng / xoá ảnh vừa chụp ----
function clearCapture() {
  lastImageDataUrl = null;
  $("previewImg").src = "";
  $("capturePreview").classList.add("is-hidden");
  chrome.storage.session.remove("lastCapture").catch(() => {});
}
$("btnClearImg").addEventListener("click", () => {
  clearCapture();
  showToast(t("imgCleared"), "info");
});

// ===========================================================================
// OCR
// ===========================================================================
$("ocrScan").addEventListener("click", () => send(MSG.START_OCR));
$("ocrLang").addEventListener("change", (e) =>
  saveSettings({ ocrLang: e.target.value })
);
$("ocrCopy").addEventListener("click", async () => {
  const txt = $("ocrResult").value;
  if (!txt) return;
  try {
    await navigator.clipboard.writeText(txt);
    showToast(t("ocrCopied"), "success");
  } catch (e) {
    showToast("Không sao chép được (hãy Ctrl+C thủ công)", "warn");
  }
});
$("ocrClear").addEventListener("click", () => {
  $("ocrResult").value = "";
  chrome.storage.session.remove("lastOcr").catch(() => {});
  showToast(t("ocrCleared"), "info");
});

async function handleOcrResult(text) {
  switchTab("ocr");
  const area = $("ocrResult");
  area.value = text || t("ocrEmpty");
  if (!text) { showToast(t("ocrEmpty"), "warn"); return; }
  const s = await getSettings();
  if (s.ocrAutoCopy) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("ocrCopied"), "success");
    } catch (_) {
      showToast("Đã nhận diện xong. Bấm Sao chép để copy.", "info");
    }
  }
}

// ===========================================================================
// CÀI ĐẶT
// ===========================================================================
function updateFilenamePreview() {
  const preview = buildFilename($("filenameTemplate").value, {
    projectName: $("projectName").value,
    ext: $("videoFormat")?.value || "mp4",
  });
  $("filenamePreview").textContent = preview;
}
["filenameTemplate", "projectName"].forEach((id) =>
  $(id).addEventListener("input", updateFilenamePreview)
);
$("videoFormat").addEventListener("change", updateFilenamePreview);
$("askWhereToSave").addEventListener("change", (e) =>
  saveSettings({ askWhereToSave: e.target.checked })
);
$("imageFormat").addEventListener("change", (e) => {
  $("qualityField").style.display = e.target.value === "jpeg" ? "block" : "none";
});
$("jpegQuality").addEventListener("input", (e) => {
  $("qualityVal").textContent = e.target.value;
});
$("saveSettings").addEventListener("click", async () => {
  await saveSettings({
    projectName: $("projectName").value.trim() || "MyProject",
    filenameTemplate: $("filenameTemplate").value.trim(),
    videoFolder: $("videoFolder").value.trim(),
    screenshotFolder: $("screenshotFolder").value.trim(),
    ocrFolder: $("ocrFolder").value.trim(),
    videoFormat: $("videoFormat").value,
    imageFormat: $("imageFormat").value,
    jpegQuality: parseInt($("jpegQuality").value, 10) / 100,
    askWhereToSave: $("askWhereToSave").checked,
  });
  showToast(t("saved"), "success");
});

// ===========================================================================
// NGÔN NGỮ
// ===========================================================================
$("langToggle").addEventListener("click", async () => {
  lang = lang === "vi" ? "en" : "vi";
  applyI18n();
  await saveSettings({ language: lang });
});

// ===========================================================================
// THEME (sáng / tối / theo hệ thống)
// ===========================================================================
let theme = "system";

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function isDarkNow() {
  return theme === "dark" || (theme === "system" && systemPrefersDark());
}
function applyTheme() {
  const el = document.documentElement;
  if (theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", theme);
  // Icon nút header phản ánh trạng thái hiện tại.
  const ico = document.querySelector("#themeToggle .theme-ico");
  if (ico) ico.textContent = isDarkNow() ? "☀️" : "🌙";
  // Đồng bộ segmented trong Cài đặt.
  document.querySelectorAll("#themeSeg .seg-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.theme === theme)
  );
}
async function setTheme(next) {
  theme = next;
  applyTheme();
  await saveSettings({ theme });
}
// Nút header: đảo nhanh sáng <-> tối.
$("themeToggle").addEventListener("click", () => {
  setTheme(isDarkNow() ? "light" : "dark");
});
// Segmented trong Cài đặt.
$("themeSeg").addEventListener("click", (e) => {
  const b = e.target.closest(".seg-btn");
  if (b) setTheme(b.dataset.theme);
});
// Khi hệ thống đổi màu và đang ở chế độ "system" -> cập nhật icon.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (theme === "system") applyTheme();
});

// ===========================================================================
// LẮNG NGHE MESSAGE
// ===========================================================================
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target === "offscreen") return;
  if (msg.type === MSG.STATE_UPDATE) renderState(msg.state);
  else if (msg.type === MSG.TOAST) showToast(msg.message, msg.kind);
  else if (msg.type === MSG.OCR_RESULT) handleOcrResult(msg.text);
  else if (msg.type === MSG.IMAGE_READY) handleImageReady(msg.dataUrl);
});

// ===========================================================================
// KHỞI TẠO
// ===========================================================================
// Chế độ popup: body hẹp cố định (mở qua action popup với ?mode=popup).
if (new URLSearchParams(location.search).get("mode") === "popup") {
  document.body.classList.add("is-popup");
}

// Tuỳ chọn giao diện mở (popup / side panel).
document.querySelectorAll('input[name="uiMode"]').forEach((radio) => {
  radio.addEventListener("change", async (e) => {
    await saveSettings({ uiMode: e.target.value });
    showToast(t("uiChanged"), "success");
  });
});

async function init() {
  const s = await getSettings();
  lang = s.language || "vi";
  applyI18n();

  theme = s.theme || "system";
  applyTheme();

  $("projectName").value = s.projectName;
  $("filenameTemplate").value = s.filenameTemplate;
  $("videoFolder").value = s.videoFolder;
  $("screenshotFolder").value = s.screenshotFolder;
  $("ocrFolder").value = s.ocrFolder;
  $("videoFormat").value = s.videoFormat || "mp4";
  $("askWhereToSave").checked = !!s.askWhereToSave;
  $("imageFormat").value = s.imageFormat;
  $("jpegQuality").value = Math.round(s.jpegQuality * 100);
  $("qualityVal").textContent = Math.round(s.jpegQuality * 100);
  $("qualityField").style.display = s.imageFormat === "jpeg" ? "block" : "none";
  $("ocrLang").value = s.ocrLang;
  updateFilenamePreview();

  const uiRadio = document.querySelector(
    `input[name="uiMode"][value="${s.uiMode || "popup"}"]`
  );
  if (uiRadio) uiRadio.checked = true;

  $("sysAudioToggle").checked = s.systemAudioEnabled;
  $("cursorHlToggle").checked = s.cursorHighlight;
  $("micToggle").checked = s.micEnabled;
  $("camToggle").checked = s.cameraEnabled;

  // Tuỳ chọn camera overlay
  markCamPos(s.camPosition || "br");
  $("camSize").value = s.camSize || "md";
  $("camShape").value = s.camShape || "rect";
  $("camMirrorToggle").checked = s.camMirror !== false;
  toggleCamOptions(s.cameraEnabled);

  await listDevices();
  if (s.micDeviceId) $("micDevice").value = s.micDeviceId;
  if (s.cameraDeviceId) $("camDevice").value = s.cameraDeviceId;
  if (s.micEnabled) startMic();
  if (s.cameraEnabled) startCam();

  // Khôi phục ảnh chụp / kết quả OCR gần nhất (popup đóng-mở vẫn còn).
  try {
    const sess = await chrome.storage.session.get(["lastCapture", "lastOcr"]);
    if (sess.lastCapture && Date.now() - sess.lastCapture.at < 30 * 60 * 1000) {
      lastImageDataUrl = sess.lastCapture.dataUrl;
      $("previewImg").src = lastImageDataUrl;
      $("capturePreview").classList.remove("is-hidden");
    }
    if (sess.lastOcr && sess.lastOcr.text) {
      $("ocrResult").value = sess.lastOcr.text;
    }
  } catch (_) {}

  const res = await chrome.runtime
    .sendMessage({ type: MSG.GET_STATE })
    .catch(() => null);
  if (res && res.state) renderState(res.state);
}

init();
