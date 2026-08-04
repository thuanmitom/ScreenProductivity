// shared/filename-template.js
// Sinh tên file từ mẫu token, ví dụ:
//   [project]_[YYYY]-[MM]-[DD]_[HH]-[mm]-[ss]
// ->  MyProject_2026-07-19_09-58-42

const pad = (n, len = 2) => String(n).padStart(len, "0");

// Loại bỏ ký tự không hợp lệ trong tên file trên Windows/macOS/Linux.
export function sanitize(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}

export function buildFilename(template, { projectName = "", ext = "" } = {}) {
  const d = new Date();
  const tokens = {
    "[project]": projectName || "Untitled",
    "[YYYY]": d.getFullYear(),
    "[YY]": String(d.getFullYear()).slice(-2),
    "[MM]": pad(d.getMonth() + 1),
    "[DD]": pad(d.getDate()),
    "[HH]": pad(d.getHours()),
    "[mm]": pad(d.getMinutes()),
    "[ss]": pad(d.getSeconds()),
    "[timestamp]": d.getTime(),
  };

  let out = template || "[project]_[YYYY]-[MM]-[DD]_[HH]-[mm]-[ss]";
  for (const [token, value] of Object.entries(tokens)) {
    out = out.split(token).join(String(value));
  }
  out = sanitize(out) || `capture_${d.getTime()}`;
  return ext ? `${out}.${ext.replace(/^\./, "")}` : out;
}

// Ghép thư mục con + tên file thành đường dẫn tương đối cho chrome.downloads.
export function joinDownloadPath(folder, filename) {
  const clean = (folder || "")
    .split("/")
    .map((seg) => sanitize(seg))
    .filter(Boolean)
    .join("/");
  return clean ? `${clean}/${filename}` : filename;
}
