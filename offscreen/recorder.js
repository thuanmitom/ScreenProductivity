// offscreen/recorder.js
// Ghi video màn hình. Hỗ trợ: quay tab/window/screen, trộn âm thanh hệ thống +
// micro, quay vùng chọn (crop), và chèn camera (PiP).
//
// ĐỊNH DẠNG MP4:
//   Dùng WebCodecs (VideoEncoder/AudioEncoder) + mp4-muxer để xuất MP4 KHÔNG
//   phân mảnh (moov đầy đủ) -> mở được ở MỌI trình phát. MediaRecorder chỉ tạo
//   được MP4 phân mảnh mà Windows Media Player không đọc được.
//
// CÁCH LẤY KHUNG HÌNH (quan trọng):
//   Nguồn quay màn hình CHỈ phát khung hình mới khi có thay đổi pixel. Nếu đọc
//   trực tiếp từ track, màn hình đứng yên -> gần như không có khung hình -> file
//   xuất ra bị hiểu là "ảnh tĩnh". Ngoài ra offscreen document không bao giờ
//   được vẽ nên requestAnimationFrame KHÔNG chạy.
//   => Ta vẽ nguồn vào canvas theo NHỊP CỐ ĐỊNH bằng setInterval và mã hoá đều
//      đặn 30 khung/giây. Cách này cho frame rate ổn định, chạy tốt trong tài
//      liệu ẩn, tự co giãn khi màn hình đổi kích thước, và gộp luôn việc cắt
//      vùng chọn + chèn camera.

const Mp4 = globalThis.Mp4Muxer; // UMD global từ vendor/mp4-muxer
const FPS = 30;

function webCodecsMp4Available() {
  return (
    typeof globalThis.VideoEncoder === "function" &&
    typeof globalThis.AudioEncoder === "function" &&
    Mp4 && Mp4.Muxer && Mp4.ArrayBufferTarget
  );
}

async function pickAvcCodec(width, height, framerate) {
  const candidates = [
    "avc1.640034", "avc1.640033", "avc1.64002a",
    "avc1.640028", "avc1.4d0028", "avc1.42e01e", "avc1.42001f",
  ];
  for (const codec of candidates) {
    try {
      const res = await VideoEncoder.isConfigSupported({ codec, width, height, framerate });
      if (res && res.supported) return codec;
    } catch (_) {}
  }
  return "avc1.42001f";
}

function pickWebmMime() {
  for (const c of ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

function coverSrc(sw, sh, dw, dh) {
  const sa = sw / sh, da = dw / dh;
  if (sa > da) { const cropW = sh * da; return { sx: (sw - cropW) / 2, sy: 0, sw: cropW, sh }; }
  const cropH = sw / da; return { sx: 0, sy: (sh - cropH) / 2, sw, sh: cropH };
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Tạo lại AudioData với timestamp mới.
function retimeAudio(ad, ts) {
  const nCh = ad.numberOfChannels;
  const planar = ad.format.endsWith("-planar");
  if (!planar) {
    const size = ad.allocationSize({ planeIndex: 0 });
    const buf = new ArrayBuffer(size);
    ad.copyTo(buf, { planeIndex: 0 });
    return new AudioData({
      format: ad.format, sampleRate: ad.sampleRate,
      numberOfFrames: ad.numberOfFrames, numberOfChannels: nCh,
      timestamp: ts, data: buf,
    });
  }
  const sizes = []; let total = 0;
  for (let i = 0; i < nCh; i++) { const s = ad.allocationSize({ planeIndex: i }); sizes.push(s); total += s; }
  const buf = new ArrayBuffer(total);
  let off = 0;
  for (let i = 0; i < nCh; i++) { ad.copyTo(new Uint8Array(buf, off, sizes[i]), { planeIndex: i }); off += sizes[i]; }
  return new AudioData({
    format: ad.format, sampleRate: ad.sampleRate,
    numberOfFrames: ad.numberOfFrames, numberOfChannels: nCh,
    timestamp: ts, data: buf,
  });
}

export class Recorder {
  constructor() { this.reset(); }

  reset() {
    this.mode = null; // "mp4" | "webm"
    this.mediaRecorder = null;
    this.chunks = [];
    this.captureStream = null;
    this.micStream = null;
    this.camStream = null;
    this.finalStream = null;
    this.audioCtx = null;
    this.drawTimer = null;
    this.frameTimer = null;
    this.videoEl = null;
    this.camVideoEl = null;
    this.canvas = null;
    this.ctx = null;
    // WebCodecs
    this.videoEncoder = null;
    this.audioEncoder = null;
    this.muxer = null;
    this.aReader = null;
    this._audioDone = null;
    this._aOrigin = null;          // audio dùng đồng hồ AudioContext (khác video!)
    this._t0 = 0;                  // mốc wall-clock của video
    this._pausedAccumUs = 0;
    this._pauseWall = 0;
    this._paused = false;
    this._lastKeyUs = -1e12;
    this._videoFrames = 0;
    this._encodeErrors = 0;
    // chung
    this._stopResolve = null;
    this._discard = false;
    this._stopped = false;
  }

  async start(opts) {
    const {
      streamId, chromeMediaSource, region,
      mic, micDeviceId, systemAudio, videoFormat, camera,
    } = opts;

    const isTab = chromeMediaSource === "tab";
    const wantSystemAudio = !!systemAudio;
    const videoConstraint = { mandatory: { chromeMediaSource, chromeMediaSourceId: streamId } };
    const audioConstraint = wantSystemAudio
      ? { mandatory: { chromeMediaSource, chromeMediaSourceId: streamId } }
      : false;

    try {
      this.captureStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint, audio: audioConstraint,
      });
    } catch (err) {
      if (wantSystemAudio) {
        this.captureStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraint, audio: false,
        });
      } else { throw err; }
    }

    if (mic) {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
          video: false,
        });
      } catch (e) { console.warn("Không mở được micro:", e.message); }
    }

    const mixedAudioTrack = this._buildAudio({ isTab, wantSystemAudio });
    const cam = camera && camera.enabled ? camera : null;
    if (cam) await this._openCamera(cam);

    // Nguồn tự tắt (người dùng bấm "Stop sharing" của Chrome). Phải báo ra
    // ngoài để còn lưu file + dọn thanh công cụ, chứ gọi this.stop() ở đây thì
    // Promise không ai chờ -> mất video và phiên quay treo vĩnh viễn.
    const srcTrack = this.captureStream.getVideoTracks()[0];
    if (srcTrack) {
      srcTrack.addEventListener("ended", () => {
        if (this._stopped || !this.mode) return;
        if (typeof this.onSourceEnded === "function") this.onSourceEnded();
        else this.stop();
      });
    }

    if (videoFormat === "mp4" && webCodecsMp4Available()) {
      this.mode = "mp4";
      await this._startMp4(srcTrack, mixedAudioTrack, region, cam);
      console.log("[ScreenPro] Ghi MP4 (WebCodecs, nhịp cố định 30fps).");
      return { ok: true, mimeType: "video/mp4" };
    }

    // ---- Fallback: MediaRecorder -> WebM ----
    this.mode = "webm";
    let videoTrack = srcTrack;
    if (region || cam) videoTrack = await this._buildCanvasVideo(region, cam);
    const tracks = [videoTrack];
    if (mixedAudioTrack) tracks.push(mixedAudioTrack);
    this.finalStream = new MediaStream(tracks);
    const mime = pickWebmMime();
    this.mediaRecorder = new MediaRecorder(this.finalStream, { mimeType: mime });
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.mediaRecorder.onstop = () => this._onStopMediaRecorder();
    this.mediaRecorder.start(1000);
    console.log("[ScreenPro] Ghi WebM (MediaRecorder). mime:", mime);
    return { ok: true, mimeType: mime };
  }

  // ---------------------------------------------------------------------
  // MP4 qua WebCodecs — vẽ nguồn vào canvas theo nhịp cố định rồi mã hoá.
  // ---------------------------------------------------------------------
  async _startMp4(srcTrack, audioTrack, region, cam) {
    // 1) Đưa nguồn vào <video> để có thể drawImage bất cứ lúc nào.
    //    (Video vẫn chạy trong tài liệu ẩn — không phụ thuộc việc vẽ màn hình.)
    const srcVideo = document.getElementById("preview") || document.createElement("video");
    srcVideo.srcObject = new MediaStream([srcTrack]);
    srcVideo.muted = true;
    srcVideo.playsInline = true;
    await srcVideo.play().catch(() => {});
    if (!srcVideo.videoWidth) {
      await new Promise((r) => {
        srcVideo.addEventListener("loadedmetadata", r, { once: true });
        setTimeout(r, 3000);
      });
    }
    this.videoEl = srcVideo;

    // 2) Kích thước đầu ra (chẵn — yêu cầu của H.264).
    let W, H, sx = 0, sy = 0, sw = 0, sh = 0;
    if (region) {
      const dpr = region.dpr || 1;
      sx = Math.round(region.x * dpr);
      sy = Math.round(region.y * dpr);
      sw = Math.max(2, Math.round(region.w * dpr));
      sh = Math.max(2, Math.round(region.h * dpr));
      W = sw; H = sh;
    } else {
      W = srcVideo.videoWidth || 1280;
      H = srcVideo.videoHeight || 720;
    }
    W = Math.max(2, W - (W % 2));
    H = Math.max(2, H - (H % 2));

    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext("2d", { alpha: false });
    this.canvas = canvas;
    this.ctx = ctx;

    // 3) Muxer + encoder.
    const codec = await pickAvcCodec(W, H, FPS);
    const bitrate = Math.min(16_000_000, Math.max(2_500_000, Math.round(W * H * FPS * 0.07)));
    const hasAudio = !!audioTrack;
    const sampleRate = this.audioCtx ? this.audioCtx.sampleRate : 48000;
    const numberOfChannels = hasAudio ? (audioTrack.getSettings().channelCount || 2) : 0;

    this.muxer = new Mp4.Muxer({
      target: new Mp4.ArrayBufferTarget(),
      video: { codec: "avc", width: W, height: H },
      audio: hasAudio ? { codec: "aac", sampleRate, numberOfChannels } : undefined,
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    });

    this.videoEncoder = new VideoEncoder({
      output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error("VideoEncoder:", e),
    });
    this.videoEncoder.configure({
      codec, width: W, height: H, framerate: FPS,
      bitrate, bitrateMode: "variable",
      latencyMode: "realtime",
      avc: { format: "avc" },
    });

    if (hasAudio) {
      this.audioEncoder = new AudioEncoder({
        output: (chunk, meta) => this.muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error("AudioEncoder:", e),
      });
      this.audioEncoder.configure({
        codec: "mp4a.40.2", sampleRate, numberOfChannels, bitrate: 128_000,
      });
      this._startAudioLoop(audioTrack);
    }

    // 4) Nhịp vẽ + mã hoá cố định.
    const frameDurUs = Math.round(1_000_000 / FPS);
    this._t0 = performance.now();
    this._videoFrames = 0;

    this.frameTimer = setInterval(() => {
      if (this._stopped || this._paused) return;
      if (!this.videoEncoder || this.videoEncoder.state !== "configured") return;
      // Không để hàng đợi phình to nếu máy mã hoá không kịp.
      if (this.videoEncoder.encodeQueueSize > 6) return;

      const ts = Math.max(
        0,
        Math.round((performance.now() - this._t0) * 1000) - this._pausedAccumUs
      );

      let vf = null;
      try {
        if (region) ctx.drawImage(srcVideo, sx, sy, sw, sh, 0, 0, W, H);
        else ctx.drawImage(srcVideo, 0, 0, W, H);
        if (this.camVideoEl && this.camVideoEl.videoWidth) {
          this._drawCamPip(ctx, this.camVideoEl, W, H, cam);
        }
        vf = new VideoFrame(canvas, { timestamp: ts, duration: frameDurUs });
        const keyFrame = ts - this._lastKeyUs >= 2_000_000;
        if (keyFrame) this._lastKeyUs = ts;
        this.videoEncoder.encode(vf, { keyFrame });
        this._videoFrames++;
      } catch (e) {
        if (this._encodeErrors++ < 3) console.warn("Encode khung hình lỗi:", e.message);
      } finally {
        if (vf) vf.close();
      }
    }, 1000 / FPS);
  }

  _startAudioLoop(audioTrack) {
    if (typeof MediaStreamTrackProcessor !== "function") return;
    const proc = new MediaStreamTrackProcessor({ track: audioTrack });
    this.aReader = proc.readable.getReader();
    this._audioDone = (async () => {
      while (true) {
        let res;
        try { res = await this.aReader.read(); } catch (_) { break; }
        if (res.done) break;
        const ad = res.value;
        if (this._stopped || this._paused) { ad.close(); continue; }
        // Audio dùng đồng hồ RIÊNG (AudioContext) — lệch video hàng giờ nếu
        // dùng chung mốc, nên phải chuẩn hoá theo mốc audio của chính nó.
        if (this._aOrigin === null) this._aOrigin = ad.timestamp;
        const ts = ad.timestamp - this._aOrigin - this._pausedAccumUs;
        if (ts < 0) { ad.close(); continue; }
        try {
          if (this.audioEncoder && this.audioEncoder.state === "configured") {
            const ad2 = retimeAudio(ad, ts);
            this.audioEncoder.encode(ad2);
            ad2.close();
          }
        } catch (e) {
          if (this._encodeErrors++ < 3) console.warn("Encode audio lỗi:", e.message);
        }
        ad.close();
      }
    })();
  }

  async _openCamera(cam) {
    try {
      this.camStream = await navigator.mediaDevices.getUserMedia({
        video: cam.deviceId ? { deviceId: { exact: cam.deviceId } } : true,
        audio: false,
      });
      const v = document.createElement("video");
      v.srcObject = this.camStream;
      v.muted = true;
      v.playsInline = true;
      await v.play().catch(() => {});
      this.camVideoEl = v;
    } catch (e) {
      console.warn("Không mở được camera để chèn PiP:", e.message);
    }
  }

  _buildAudio({ isTab, wantSystemAudio }) {
    const sysTracks = this.captureStream.getAudioTracks();
    const hasSys = wantSystemAudio && sysTracks.length > 0;
    const hasMic = this.micStream && this.micStream.getAudioTracks().length > 0;
    if (!hasSys && !hasMic) return null;

    this.audioCtx = new AudioContext();
    const dest = this.audioCtx.createMediaStreamDestination();
    if (hasSys) {
      const s = this.audioCtx.createMediaStreamSource(new MediaStream([sysTracks[0]]));
      s.connect(dest);
      if (isTab) s.connect(this.audioCtx.destination);
    }
    if (hasMic) {
      const m = this.audioCtx.createMediaStreamSource(this.micStream);
      m.connect(dest);
    }
    return dest.stream.getAudioTracks()[0];
  }

  // Chỉ dùng cho nhánh dự phòng WebM (MediaRecorder cần một MediaStream).
  // Dùng setInterval chứ KHÔNG dùng requestAnimationFrame vì offscreen document
  // không bao giờ được vẽ -> rAF không chạy.
  async _buildCanvasVideo(region, cam) {
    const track = this.captureStream.getVideoTracks()[0];
    const baseVideo = document.getElementById("preview") || document.createElement("video");
    baseVideo.srcObject = new MediaStream([track]);
    baseVideo.muted = true;
    await baseVideo.play().catch(() => {});
    if (!baseVideo.videoWidth) {
      await new Promise((r) => { baseVideo.addEventListener("loadedmetadata", r, { once: true }); setTimeout(r, 3000); });
    }
    this.videoEl = baseVideo;

    let cw, ch, sx = 0, sy = 0, sw = 0, sh = 0;
    if (region) {
      const dpr = region.dpr || 1;
      sx = Math.round(region.x * dpr); sy = Math.round(region.y * dpr);
      sw = Math.max(2, Math.round(region.w * dpr)); sh = Math.max(2, Math.round(region.h * dpr));
      cw = sw; ch = sh;
    } else {
      cw = baseVideo.videoWidth || 1280; ch = baseVideo.videoHeight || 720;
    }

    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    this.canvas = canvas;

    this.drawTimer = setInterval(() => {
      try {
        if (region) ctx.drawImage(baseVideo, sx, sy, sw, sh, 0, 0, cw, ch);
        else ctx.drawImage(baseVideo, 0, 0, cw, ch);
        if (this.camVideoEl && this.camVideoEl.videoWidth) {
          this._drawCamPip(ctx, this.camVideoEl, cw, ch, cam);
        }
      } catch (_) {}
    }, 1000 / FPS);

    return canvas.captureStream(FPS).getVideoTracks()[0];
  }

  _drawCamPip(ctx, video, cw, ch, cam) {
    if (!cam) return;
    const sizeFrac = { sm: 0.16, md: 0.24, lg: 0.32 }[cam.size] || 0.24;
    const shape = cam.shape || "rect";
    const margin = Math.round(cw * 0.02);
    const dw = Math.round(cw * sizeFrac);
    const aspect = video.videoWidth / video.videoHeight || 16 / 9;
    let dh = Math.round(dw / aspect);
    if (shape === "circle") dh = dw;
    let dx, dy;
    switch (cam.position) {
      case "tl": dx = margin; dy = margin; break;
      case "tr": dx = cw - dw - margin; dy = margin; break;
      case "bl": dx = margin; dy = ch - dh - margin; break;
      default: dx = cw - dw - margin; dy = ch - dh - margin;
    }
    const radius = shape === "circle" ? dh / 2 : Math.round(dw * 0.08);
    ctx.save();
    if (shape === "circle") { ctx.beginPath(); ctx.arc(dx + dw / 2, dy + dh / 2, dw / 2, 0, Math.PI * 2); ctx.clip(); }
    else { roundRectPath(ctx, dx, dy, dw, dh, radius); ctx.clip(); }
    if (cam.mirror !== false) { ctx.translate(dx + dw / 2, 0); ctx.scale(-1, 1); ctx.translate(-(dx + dw / 2), 0); }
    const c = coverSrc(video.videoWidth, video.videoHeight, dw, dh);
    ctx.drawImage(video, c.sx, c.sy, c.sw, c.sh, dx, dy, dw, dh);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = Math.max(2, Math.round(cw * 0.0035));
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    if (shape === "circle") { ctx.beginPath(); ctx.arc(dx + dw / 2, dy + dh / 2, dw / 2, 0, Math.PI * 2); ctx.stroke(); }
    else { roundRectPath(ctx, dx, dy, dw, dh, radius); ctx.stroke(); }
    ctx.restore();
  }

  pause() {
    if (this._paused) return;
    this._paused = true;
    this._pauseWall = performance.now();
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") this.mediaRecorder.pause();
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    this._pausedAccumUs += Math.round((performance.now() - this._pauseWall) * 1000);
    if (this.mediaRecorder && this.mediaRecorder.state === "paused") this.mediaRecorder.resume();
  }

  stop(discard = false) {
    this._discard = discard;
    return new Promise((resolve) => {
      this._stopResolve = resolve;
      if (this.mode === "mp4") {
        this._finishMp4();
      } else if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stop(); // -> _onStopMediaRecorder
      } else {
        this._cleanup();
        resolve(null);
      }
    });
  }

  async _finishMp4() {
    this._stopped = true;
    if (this.frameTimer) { clearInterval(this.frameTimer); this.frameTimer = null; }
    try { if (this.aReader) await this.aReader.cancel().catch(() => {}); } catch (_) {}
    try { if (this._audioDone) await this._audioDone; } catch (_) {}

    let blob = null;
    const frames = this._videoFrames;
    try {
      if (this.videoEncoder && this.videoEncoder.state === "configured") await this.videoEncoder.flush();
      if (this.audioEncoder && this.audioEncoder.state === "configured") await this.audioEncoder.flush();
      if (!this._discard && this.muxer && frames > 0) {
        this.muxer.finalize();
        blob = new Blob([this.muxer.target.buffer], { type: "video/mp4" });
      }
    } catch (e) {
      console.error("Hoàn tất MP4 lỗi:", e);
    }
    try { this.videoEncoder && this.videoEncoder.state !== "closed" && this.videoEncoder.close(); } catch (_) {}
    try { this.audioEncoder && this.audioEncoder.state !== "closed" && this.audioEncoder.close(); } catch (_) {}
    console.log("[ScreenPro] Kết thúc MP4 —", frames, "khung hình,",
      blob ? Math.round(blob.size / 1024) + "KB" : "không có dữ liệu");

    const resolve = this._stopResolve;
    this._cleanup();
    if (resolve) resolve(blob);
  }

  _onStopMediaRecorder() {
    let blob = null;
    if (!this._discard && this.chunks.length) {
      const mime = this.mediaRecorder?.mimeType || "video/webm";
      blob = new Blob(this.chunks, { type: mime });
    }
    const resolve = this._stopResolve;
    this._cleanup();
    if (resolve) resolve(blob);
  }

  _cleanup() {
    if (this.frameTimer) clearInterval(this.frameTimer);
    if (this.drawTimer) clearInterval(this.drawTimer);
    if (this.videoEl) { try { this.videoEl.pause(); this.videoEl.srcObject = null; } catch (_) {} }
    if (this.camVideoEl) { try { this.camVideoEl.pause(); this.camVideoEl.srcObject = null; } catch (_) {} }
    for (const s of [this.captureStream, this.micStream, this.camStream, this.finalStream]) {
      if (s) s.getTracks().forEach((t) => t.stop());
    }
    if (this.audioCtx && this.audioCtx.state !== "closed") this.audioCtx.close().catch(() => {});
    this.reset();
  }
}
