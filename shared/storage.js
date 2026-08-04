// shared/storage.js
// Lớp bọc mỏng quanh chrome.storage.sync, luôn trả về đầy đủ khoá kèm mặc định.
import { DEFAULTS } from "./constants.js";

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(partial) {
  await chrome.storage.sync.set(partial);
}

export function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") callback(changes);
  });
}
