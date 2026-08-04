// shared/constants.js
// Giao thức message dùng chung cho toàn bộ extension.
// Các giá trị là chuỗi thuần để content-script (không dùng ES module) có thể
// khai báo lại y hệt mà không lệch nhau.

export const MSG = {
  // Side panel  ->  Service worker
  START_RECORDING: "START_RECORDING",
  STOP_RECORDING: "STOP_RECORDING",
  PAUSE_RECORDING: "PAUSE_RECORDING",
  RESUME_RECORDING: "RESUME_RECORDING",
  CANCEL_RECORDING: "CANCEL_RECORDING",
  CAPTURE_VISIBLE: "CAPTURE_VISIBLE",
  CAPTURE_REGION: "CAPTURE_REGION",
  CAPTURE_FULLPAGE: "CAPTURE_FULLPAGE",
  SAVE_IMAGE: "SAVE_IMAGE",
  START_OCR: "START_OCR",
  GET_STATE: "GET_STATE",

  // Service worker  ->  Offscreen document
  OFF_START_REC: "OFF_START_REC",
  OFF_STOP_REC: "OFF_STOP_REC",
  OFF_PAUSE_REC: "OFF_PAUSE_REC",
  OFF_RESUME_REC: "OFF_RESUME_REC",
  OFF_CROP_IMAGE: "OFF_CROP_IMAGE",
  OFF_STITCH_IMAGE: "OFF_STITCH_IMAGE",
  OFF_OCR: "OFF_OCR",

  // Offscreen  ->  Service worker
  REC_DATA_READY: "REC_DATA_READY",
  REC_ERROR: "REC_ERROR",
  IMAGE_READY: "IMAGE_READY",
  OCR_RESULT: "OCR_RESULT",

  // Service worker  ->  Content script (qua tabs.sendMessage)
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
  CT_REC_STATE: "CT_REC_STATE", // đồng bộ trạng thái quay xuống thanh công cụ

  // Content script  ->  Service worker
  REGION_SELECTED: "REGION_SELECTED",
  REGION_CANCELLED: "REGION_CANCELLED",
  TOOLBAR_STOP: "TOOLBAR_STOP",
  TOOLBAR_PAUSE: "TOOLBAR_PAUSE",
  TOOLBAR_RESUME: "TOOLBAR_RESUME",
  // Thanh công cụ chỉ gửi "ý định" toggle; service worker mới là nơi quyết định
  // pause hay resume dựa trên trạng thái thật -> tránh lệch trạng thái.
  TOOLBAR_TOGGLE_PAUSE: "TOOLBAR_TOGGLE_PAUSE",
  TOOLBAR_CANCEL: "TOOLBAR_CANCEL",

  // Service worker  ->  Side panel (broadcast)
  STATE_UPDATE: "STATE_UPDATE",
  TOAST: "TOAST",
};

// Trạng thái quay
export const REC_STATE = {
  IDLE: "idle",
  SELECTING: "selecting",
  RECORDING: "recording",
  PAUSED: "paused",
  PROCESSING: "processing",
};

// Cấu hình mặc định (ghi vào chrome.storage.sync lần đầu chạy)
export const DEFAULTS = {
  // Đặt tên file
  filenameTemplate: "[project]_[YYYY]-[MM]-[DD]_[HH]-[mm]-[ss]",
  projectName: "MyProject",
  // Thư mục con trong Downloads
  videoFolder: "Screen_Productivity/Video_Record",
  screenshotFolder: "Screen_Productivity/Screenshots",
  ocrFolder: "Screen_Productivity/OCR",
  // false = lưu thẳng vào thư mục + tên đặt sẵn (nhanh, không hỏi)
  // true  = mỗi lần tải sẽ hiện hộp thoại chọn nơi lưu & đổi tên
  askWhereToSave: false,
  // Thiết bị & tuỳ chọn quay
  micEnabled: true,
  systemAudioEnabled: true,
  cameraEnabled: false,
  cursorHighlight: true,
  micDeviceId: "",
  cameraDeviceId: "",
  // Overlay camera (PiP) khi quay — hiện cam lên video như livestream
  camPosition: "br", // tl | tr | bl | br
  camSize: "md", // sm | md | lg
  camShape: "rect", // rect | circle
  camMirror: true,
  // OCR
  ocrLang: "vie+eng",
  ocrAutoCopy: true,
  // Định dạng
  videoFormat: "mp4", // mp4 | webm  (mp4 để mở được ở mọi trình phát)
  imageFormat: "png", // png | jpeg
  jpegQuality: 0.92,
  language: "vi", // giao diện: vi | en
  uiMode: "popup", // popup | sidepanel
  theme: "system", // system | light | dark
};
