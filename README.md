# Screen Productivity — Quay, Chụp & OCR

> Tiện ích mở rộng trình duyệt (Chrome/Edge) tích hợp **Quay màn hình**, **Chụp ảnh màn hình**, **Nhận diện chữ (OCR)** và **Quản lý file thông minh** — trong một Side Panel gọn gàng, song ngữ Việt / Anh.

Manifest V3 · Không cần server · OCR chạy hoàn toàn **offline**.

---

## Tính năng

**Quay màn hình**
- Quay Tab hiện tại / Cửa sổ ứng dụng / Toàn màn hình / **Vùng chọn** (kéo khung chữ nhật).
- Kiểm tra thiết bị trước khi quay: bật/tắt & chọn Micro, Camera, có **thanh đo âm lượng thời gian thực**.
- Thu **âm thanh hệ thống + micro** cùng lúc (tự trộn).
- **Highlight con trỏ chuột** khi quay.
- Thanh công cụ nổi: Dừng · Tạm dừng/Tiếp tục · **Vẽ/đánh dấu (annotation)** · Huỷ.

**Chụp màn hình**
- Chụp vùng đang hiển thị · Chụp **vùng chọn** · Chụp **toàn bộ trang** (tự cuộn & ghép, tự ẩn header dính để ảnh liền mạch).
- Ảnh chụp được **tự copy vào clipboard** và hiện preview — bấm *Lưu file* khi muốn tải về.

**OCR (nhận diện chữ)**
- Quét một vùng bất kỳ trên trang → trích xuất text → tự **copy vào clipboard** và hiển thị để sửa nhanh.
- Hỗ trợ Tiếng Việt + English.

**Cấu hình & lưu trữ**
- Mẫu đặt tên file tuỳ biến, ví dụ `[project]_[YYYY]-[MM]-[DD]_[HH]-[mm]-[ss]`.
- Tự lưu vào thư mục con trong Downloads (Video / Screenshots / OCR).

---

## Cài đặt (Load unpacked)

Vì tiện ích chưa lên Chrome Web Store, bạn cài trực tiếp từ mã nguồn:

1. **Tải mã nguồn**: bấm `Code → Download ZIP` trên GitHub, rồi giải nén. Hoặc:
   ```bash
   git clone https://github.com/<tài-khoản>/screen-productivity-ext.git
   ```
2. Mở trình duyệt tới `chrome://extensions` (Edge: `edge://extensions`).
3. Bật **Chế độ nhà phát triển / Developer mode** (góc trên bên phải).
4. Bấm **Tải tiện ích đã giải nén / Load unpacked** và chọn thư mục `screen-productivity-ext` (thư mục chứa file `manifest.json`).
5. Ghim tiện ích lên thanh công cụ. Bấm vào icon để mở **Side Panel**.

> Yêu cầu Chrome/Edge phiên bản **116 trở lên** (do dùng Side Panel API + Offscreen API).

**Lần đầu sử dụng:**
- Mặc định extension mở dạng **Popup** khi bấm icon. Vào tab *Cài đặt* để đổi sang **Side panel** nếu thích giao diện cố định bên cạnh.
- Khi bật Micro/Camera lần đầu, extension sẽ mở một trang nhỏ để bạn bấm **Cho phép** — chỉ cần làm một lần.
- Khi quay, nếu Chrome hiện hộp thoại chia sẻ, hãy chọn đúng tab/cửa sổ/màn hình muốn quay (nhớ tích *Chia sẻ âm thanh* nếu cần thu tiếng).

---

## Cách dùng nhanh

- **Quay**: chọn chế độ → kiểm tra mic (xem thanh âm lượng nhảy) → bấm *Bắt đầu quay*. Dùng thanh nổi để Tạm dừng / Vẽ / Dừng. Video `.webm` tự lưu vào Downloads.
- **Chụp**: sang tab *Chụp* → chọn kiểu chụp.
- **OCR**: sang tab *OCR* → *Quét vùng chữ* → kéo chọn vùng → text hiện ra và tự copy.
- **Cài đặt**: đổi mẫu tên file, thư mục lưu, định dạng ảnh, ngôn ngữ giao diện (nút VI/EN góc trên).

---

## Cấu trúc thư mục

```
screen-productivity-ext/
├── manifest.json              # Khai báo Manifest V3
├── background/
│   └── service-worker.js      # Điều phối trung tâm (không có DOM)
├── offscreen/                 # Môi trường ẩn có DOM
│   ├── offscreen.html
│   ├── offscreen.js           # Router
│   ├── recorder.js            # MediaRecorder + trộn âm thanh + crop vùng
│   ├── image.js               # Cắt / ghép ảnh
│   └── ocr-engine.js          # Tesseract.js
├── content-scripts/
│   ├── overlay.js             # Vùng chọn, toolbar nổi, cursor highlight, annotation
│   └── overlay.css
├── sidepanel/
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
├── shared/
│   ├── constants.js           # Giao thức message + mặc định
│   ├── storage.js
│   └── filename-template.js
├── vendor/                    # Tesseract.js + dữ liệu ngôn ngữ (offline)
│   ├── tesseract/
│   └── tessdata/              # eng.traineddata, vie.traineddata
├── icons/
└── _locales/{vi,en}/messages.json
```

---

## Ghi chú kỹ thuật

- **Vì sao có Offscreen Document?** Trong Manifest V3, Service Worker không có DOM nên không dùng được `MediaRecorder`, `canvas` hay Tesseract. Mọi tác vụ nặng chạy trong offscreen document ẩn.
- **Quay vùng chọn** hoạt động bằng cách quay tab rồi cắt từng khung hình qua `canvas.captureStream()`.
- **Highlight con trỏ / annotation** là lớp phủ do content script vẽ lên trang, nên xuất hiện trong bản quay ở chế độ Tab/Vùng chọn.
- **Video lớn**: bản quay được chuyển thành data URL trước khi tải. Với video rất dài, bộ nhớ có thể tăng cao — nên chia thành nhiều đoạn ngắn.
- Không thể quay/chụp các trang hệ thống (`chrome://`, Chrome Web Store…) do giới hạn của trình duyệt.

## Giấy phép

Mã nguồn: MIT (xem `LICENSE`). Tesseract.js và dữ liệu tessdata theo giấy phép Apache-2.0 của dự án gốc (xem các file `*LICENSE*` trong `vendor/`).

---

<details>
<summary><b>English (short)</b></summary>

A Manifest V3 browser extension bundling **screen recording, screenshots, OCR and smart file management** in one bilingual (VI/EN) side panel. OCR runs fully offline via a vendored Tesseract.js.

**Install:** open `chrome://extensions`, enable *Developer mode*, click *Load unpacked*, and select this folder (the one containing `manifest.json`). Requires Chrome/Edge 116+.

**Features:** record tab/window/screen/region with mic + system audio, live mic meter, cursor highlight, floating toolbar with annotation; capture visible/region/full-page; region OCR with auto clipboard copy; customizable filename templates and download subfolders.
</details>
