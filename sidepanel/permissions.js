// sidepanel/permissions.js
// Trang này chỉ để "kích" hộp thoại xin quyền mic/camera của Chrome
// (trong popup extension, Chrome không hiện prompt nên phải mở tab riêng).

const statusEl = document.getElementById("status");
const retryBtn = document.getElementById("retry");

async function requestPerms() {
  statusEl.className = "status";
  statusEl.textContent = "Đang chờ bạn cấp quyền…";
  retryBtn.style.display = "none";

  let micOk = false;
  let camOk = false;

  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    micOk = true;
  } catch (_) {}

  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach((t) => t.stop());
    camOk = true;
  } catch (_) {}

  if (micOk || camOk) {
    statusEl.className = "status ok";
    statusEl.textContent =
      `Đã cấp quyền: ${micOk ? "Micro ✓" : ""} ${camOk ? "Camera ✓" : ""}`.trim() +
      " — Tab sẽ tự đóng…";
    setTimeout(() => window.close(), 1800);
  } else {
    statusEl.className = "status err";
    statusEl.textContent =
      "Quyền bị từ chối. Hãy bấm biểu tượng 🔒/🎥 trên thanh địa chỉ để mở lại quyền, rồi bấm Thử lại.";
    retryBtn.style.display = "inline-block";
  }
}

retryBtn.addEventListener("click", requestPerms);
requestPerms();
