"use strict";

const $ = (id) => document.getElementById(id);
const els = {
  animeInput: $("anime-input"), animeDrop: $("anime-drop"), animeEmpty: $("anime-empty"),
  animeCanvas: $("anime-canvas"), animeMeta: $("anime-meta"), cropMeta: $("crop-meta"),
  drawCrop: $("draw-crop"), resetCrop: $("reset-crop"),
  photoInput: $("photo-input"), photoDrop: $("photo-drop"), photoEmpty: $("photo-empty"),
  photoCanvas: $("photo-canvas"), photoMeta: $("photo-meta"),
  photoZoom: $("photo-zoom"), zoomValue: $("zoom-value"), resetPhoto: $("reset-photo"),
  outerBorder: $("outer-border"), outerValue: $("outer-value"),
  divider: $("divider"), dividerValue: $("divider-value"), borderColor: $("border-color"),
  previewCanvas: $("preview-canvas"), previewEmpty: $("preview-empty"),
  exportSize: $("export-size"), exportSizeMode: $("export-size-mode"),
  exportPng: $("export-png"), exportJpeg: $("export-jpeg"), shareJpeg: $("share-jpeg"),
  status: $("status"),
};

const state = {
  anime: null,
  photo: null,
  crop: null,
  photoZoom: 1,
  photoOffsetX: 0,
  photoOffsetY: 0,
  position: "left",
  outerBorder: 0,
  divider: 0,
  borderColor: "#ffffff",
  drawMode: false,
  animeDrag: null,
  photoDrag: null,
  loadSerial: { anime: 0, photo: 0 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setStatus(message, error = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", error);
}

function fileSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sourceMeta(source) {
  return `${source.file.name} · ${source.width} × ${source.height} px · ${fileSize(source.file.size)}`;
}

function imageFile(file) {
  return file && (
    /^(image\/(jpeg|png|webp|heic|heif|tiff))$/i.test(file.type) ||
    /\.(jpe?g|png|webp|heic|heif|tiff?)$/i.test(file.name)
  );
}

function decodeFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        URL.revokeObjectURL(url);
        reject(new Error("图片没有可读取的像素尺寸"));
        return;
      }
      resolve({ file, image, url, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("当前浏览器无法读取这张图片；可以先在“照片”中导出为 JPEG 或 PNG"));
    };
    image.src = url;
  });
}

async function importFile(role, file) {
  if (!imageFile(file)) {
    setStatus("请选择 JPEG、PNG、WebP、HEIC 或 TIFF 图片。", true);
    return;
  }
  const serial = ++state.loadSerial[role];
  setStatus("正在读取图片…");
  try {
    const source = await decodeFile(file);
    if (serial !== state.loadSerial[role]) {
      URL.revokeObjectURL(source.url);
      return;
    }
    if (state[role]) URL.revokeObjectURL(state[role].url);
    state[role] = source;
    if (role === "anime") {
      state.crop = { x: 0, y: 0, w: source.width, h: source.height };
      setDrawMode(false);
      state.animeDrag = null;
      els.animeDrop.scrollTop = 0;
    } else {
      resetPhotoView();
    }
    refreshAll();
    setStatus(`${role === "anime" ? "动画图" : "实景图"}已导入：${source.width} × ${source.height} px`);
  } catch (error) {
    if (serial === state.loadSerial[role]) setStatus(error.message, true);
  }
}

function setupDrop(zone, input, role) {
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file) importFile(role, file);
    input.value = "";
  });
  zone.addEventListener("dragenter", (event) => {
    event.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  zone.addEventListener("dragleave", (event) => {
    if (!zone.contains(event.relatedTarget)) zone.classList.remove("drag-over");
  });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("drag-over");
    const files = [...event.dataTransfer.files];
    for (const item of event.dataTransfer.items || []) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file && !files.includes(file)) files.push(file);
      }
    }
    const file = files.find(imageFile);
    if (file) importFile(role, file);
    else setStatus("没有收到可读取的图片文件。可先从“照片”导出，再从 Finder 拖入。", true);
  });
}

// Browser windows normally open a dropped file. Keep the user on this page.
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => {
  if (!els.animeDrop.contains(event.target) && !els.photoDrop.contains(event.target)) {
    event.preventDefault();
    setStatus("请把图片拖到对应的动画图或实景图区域。", true);
  }
});
setupDrop(els.animeDrop, els.animeInput, "anime");
setupDrop(els.photoDrop, els.photoInput, "photo");

function fullCrop() {
  if (!state.anime) return;
  state.crop = { x: 0, y: 0, w: state.anime.width, h: state.anime.height };
  setDrawMode(false);
  refreshAll();
}

function setDrawMode(value) {
  state.drawMode = value;
  els.drawCrop.textContent = value ? "在图片上拖出区域…" : "框选区域";
  els.animeCanvas.classList.toggle("drawing", value);
}

els.drawCrop.addEventListener("click", () => setDrawMode(!state.drawMode));
els.resetCrop.addEventListener("click", fullCrop);

function pixelPoint(event, canvas, width, height) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) * width / rect.width, 0, width),
    y: clamp((event.clientY - rect.top) * height / rect.height, 0, height),
  };
}

function cornerAt(point, pointerType) {
  const crop = state.crop;
  const rect = els.animeCanvas.getBoundingClientRect();
  const radius = pointerType === "touch" ? 25 : 13;
  const radiusX = radius * state.anime.width / rect.width;
  const radiusY = radius * state.anime.height / rect.height;
  const corners = [
    { name: "tl", x: crop.x, y: crop.y, anchor: { x: crop.x + crop.w, y: crop.y + crop.h } },
    { name: "tr", x: crop.x + crop.w, y: crop.y, anchor: { x: crop.x, y: crop.y + crop.h } },
    { name: "bl", x: crop.x, y: crop.y + crop.h, anchor: { x: crop.x + crop.w, y: crop.y } },
    { name: "br", x: crop.x + crop.w, y: crop.y + crop.h, anchor: { x: crop.x, y: crop.y } },
  ];
  return corners.find((corner) =>
    Math.abs(point.x - corner.x) <= radiusX && Math.abs(point.y - corner.y) <= radiusY
  );
}

function insideCrop(point) {
  const c = state.crop;
  return point.x >= c.x && point.x <= c.x + c.w && point.y >= c.y && point.y <= c.y + c.h;
}

function rectBetween(a, b) {
  return {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y),
  };
}

els.animeCanvas.addEventListener("pointerdown", (event) => {
  if (!state.anime || event.button !== 0) return;
  event.preventDefault();
  const point = pixelPoint(event, els.animeCanvas, state.anime.width, state.anime.height);
  const corner = state.drawMode ? null : cornerAt(point, event.pointerType);
  const mode = state.drawMode ? "draw" : corner ? "resize" : insideCrop(point) ? "move" : "draw";
  state.animeDrag = {
    mode, start: point, original: { ...state.crop }, anchor: corner && corner.anchor,
  };
  if (mode === "draw") state.crop = { x: point.x, y: point.y, w: 0, h: 0 };
  if (mode === "move") els.animeCanvas.classList.add("moving");
  els.animeCanvas.setPointerCapture(event.pointerId);
  refreshAll();
});

els.animeCanvas.addEventListener("pointermove", (event) => {
  const drag = state.animeDrag;
  if (!drag || !state.anime) return;
  const point = pixelPoint(event, els.animeCanvas, state.anime.width, state.anime.height);
  if (drag.mode === "draw") {
    state.crop = rectBetween(drag.start, point);
  } else if (drag.mode === "resize") {
    state.crop = rectBetween(drag.anchor, point);
  } else {
    const x = drag.original.x + point.x - drag.start.x;
    const y = drag.original.y + point.y - drag.start.y;
    state.crop = {
      ...drag.original,
      x: clamp(x, 0, state.anime.width - drag.original.w),
      y: clamp(y, 0, state.anime.height - drag.original.h),
    };
  }
  refreshAll();
});

function finishAnimeDrag() {
  const drag = state.animeDrag;
  if (!drag) return;
  if (state.crop.w < 12 || state.crop.h < 12) state.crop = drag.original;
  state.animeDrag = null;
  els.animeCanvas.classList.remove("moving");
  if (state.drawMode) setDrawMode(false);
  refreshAll();
}

els.animeCanvas.addEventListener("pointerup", finishAnimeDrag);
els.animeCanvas.addEventListener("pointercancel", finishAnimeDrag);

function getFrame() {
  if (state.anime && state.crop && state.crop.w > 0 && state.crop.h > 0) {
    return { width: state.crop.w, height: state.crop.h };
  }
  return state.photo ? { width: state.photo.width, height: state.photo.height } : null;
}

function resetPhotoView() {
  state.photoZoom = 1;
  state.photoOffsetX = 0;
  state.photoOffsetY = 0;
  els.photoZoom.value = "1";
  els.zoomValue.value = "100%";
}

function photoDrawSize(frame) {
  if (!frame || !state.photo) return null;
  const base = Math.max(frame.width / state.photo.width, frame.height / state.photo.height);
  return {
    width: state.photo.width * base * state.photoZoom,
    height: state.photo.height * base * state.photoZoom,
  };
}

function clampPhotoOffset() {
  const frame = getFrame();
  const size = photoDrawSize(frame);
  if (!size) return;
  state.photoOffsetX = clamp(state.photoOffsetX, -(size.width - frame.width) / 2, (size.width - frame.width) / 2);
  state.photoOffsetY = clamp(state.photoOffsetY, -(size.height - frame.height) / 2, (size.height - frame.height) / 2);
}

function setPhotoZoom(next, focalPoint) {
  if (!state.photo) return;
  const frame = getFrame();
  const before = photoDrawSize(frame);
  const oldLeft = (frame.width - before.width) / 2 + state.photoOffsetX;
  const oldTop = (frame.height - before.height) / 2 + state.photoOffsetY;
  const focus = focalPoint || { x: frame.width / 2, y: frame.height / 2 };
  const imageX = (focus.x - oldLeft) / before.width;
  const imageY = (focus.y - oldTop) / before.height;
  state.photoZoom = clamp(next, 1, 6);
  const after = photoDrawSize(frame);
  state.photoOffsetX = focus.x - imageX * after.width - (frame.width - after.width) / 2;
  state.photoOffsetY = focus.y - imageY * after.height - (frame.height - after.height) / 2;
  clampPhotoOffset();
  els.photoZoom.value = String(state.photoZoom);
  els.zoomValue.value = `${Math.round(state.photoZoom * 100)}%`;
  renderPhoto();
  renderPreview();
}

els.photoZoom.addEventListener("input", () => setPhotoZoom(Number(els.photoZoom.value)));
els.resetPhoto.addEventListener("click", () => {
  resetPhotoView();
  renderPhoto();
  renderPreview();
});

const photoPointers = new Map();
let pinchDistance = 0;

function pointerMidpoint() {
  const [a, b] = [...photoPointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pointerDistance() {
  const [a, b] = [...photoPointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

els.photoCanvas.addEventListener("pointerdown", (event) => {
  if (!state.photo || event.button !== 0) return;
  event.preventDefault();
  photoPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (photoPointers.size === 1) {
    state.photoDrag = {
      clientX: event.clientX, clientY: event.clientY,
      offsetX: state.photoOffsetX, offsetY: state.photoOffsetY,
    };
  } else if (photoPointers.size === 2) {
    state.photoDrag = null;
    pinchDistance = pointerDistance();
  }
  els.photoCanvas.classList.add("moving");
  els.photoCanvas.setPointerCapture(event.pointerId);
});

els.photoCanvas.addEventListener("pointermove", (event) => {
  if (!photoPointers.has(event.pointerId)) return;
  photoPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const frame = getFrame();
  if (photoPointers.size === 2) {
    const distance = pointerDistance();
    if (pinchDistance > 0 && distance > 0) {
      const midpoint = pointerMidpoint();
      const focus = pixelPoint({ clientX: midpoint.x, clientY: midpoint.y }, els.photoCanvas, frame.width, frame.height);
      setPhotoZoom(state.photoZoom * distance / pinchDistance, focus);
    }
    pinchDistance = distance;
    return;
  }
  if (!state.photoDrag) return;
  const rect = els.photoCanvas.getBoundingClientRect();
  state.photoOffsetX = state.photoDrag.offsetX + (event.clientX - state.photoDrag.clientX) * frame.width / rect.width;
  state.photoOffsetY = state.photoDrag.offsetY + (event.clientY - state.photoDrag.clientY) * frame.height / rect.height;
  clampPhotoOffset();
  renderPhoto();
  renderPreview();
});

function finishPhotoDrag(event) {
  photoPointers.delete(event.pointerId);
  if (photoPointers.size === 1) {
    const pointer = [...photoPointers.values()][0];
    state.photoDrag = {
      clientX: pointer.x, clientY: pointer.y,
      offsetX: state.photoOffsetX, offsetY: state.photoOffsetY,
    };
  } else if (photoPointers.size === 0) {
    state.photoDrag = null;
    pinchDistance = 0;
    els.photoCanvas.classList.remove("moving");
  }
}

els.photoCanvas.addEventListener("pointerup", finishPhotoDrag);
els.photoCanvas.addEventListener("pointercancel", finishPhotoDrag);
els.photoCanvas.addEventListener("wheel", (event) => {
  if (!state.photo) return;
  event.preventDefault();
  const frame = getFrame();
  const point = pixelPoint(event, els.photoCanvas, frame.width, frame.height);
  setPhotoZoom(state.photoZoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08), point);
}, { passive: false });

for (const button of document.querySelectorAll(".position-button")) {
  button.addEventListener("click", () => {
    state.position = button.dataset.position;
    for (const peer of document.querySelectorAll(".position-button")) {
      const active = peer === button;
      peer.classList.toggle("active", active);
      peer.setAttribute("aria-pressed", String(active));
    }
    renderPreview();
  });
}

els.outerBorder.addEventListener("input", () => {
  state.outerBorder = Number(els.outerBorder.value);
  els.outerValue.value = `${state.outerBorder} px`;
  renderPreview();
});
els.divider.addEventListener("input", () => {
  state.divider = Number(els.divider.value);
  els.dividerValue.value = `${state.divider} px`;
  renderPreview();
});
els.borderColor.addEventListener("input", () => {
  state.borderColor = els.borderColor.value;
  renderPreview();
});

function sizeCanvas(canvas, cssWidth, cssHeight) {
  const area = cssWidth * cssHeight;
  const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6000000 / area)));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.max(1, Math.round(cssWidth * ratio));
  canvas.height = Math.max(1, Math.round(cssHeight * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(canvas.width / cssWidth, 0, 0, canvas.height / cssHeight, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

function renderAnime() {
  const source = state.anime;
  els.animeEmpty.classList.toggle("hidden", !!source);
  els.animeCanvas.classList.toggle("hidden", !source);
  els.drawCrop.disabled = !source;
  els.resetCrop.disabled = !source;
  els.animeMeta.textContent = source ? sourceMeta(source) : "尚未导入图片";
  if (!source) {
    els.cropMeta.textContent = "";
    return;
  }
  const maxWidth = Math.min(680, Math.max(200, els.animeDrop.clientWidth - 2));
  const scale = Math.min(maxWidth / source.width, 4800 / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const ctx = sizeCanvas(els.animeCanvas, width, height);
  ctx.drawImage(source.image, 0, 0, width, height);

  const c = state.crop;
  const x = c.x / source.width * width;
  const y = c.y / source.height * height;
  const w = c.w / source.width * width;
  const h = c.h / source.height * height;
  ctx.fillStyle = "#14231e70";
  ctx.fillRect(0, 0, width, y);
  ctx.fillRect(0, y, x, h);
  ctx.fillRect(x + w, y, width - x - w, h);
  ctx.fillRect(0, y + h, width, height - y - h);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
  ctx.strokeStyle = "#318765";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 3, y + 3, Math.max(0, w - 6), Math.max(0, h - 6));
  if (w > 36 && h > 36) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#2b7658";
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      ctx.fillRect(cx - 5, cy - 5, 10, 10);
      ctx.strokeRect(cx - 5, cy - 5, 10, 10);
    }
  }
  els.cropMeta.textContent = `选区 ${Math.round(c.w)} × ${Math.round(c.h)} px`;
}

function drawPhoto(ctx, x, y, width, height) {
  if (!state.photo) return;
  const frame = { width, height };
  const base = Math.max(frame.width / state.photo.width, frame.height / state.photo.height);
  const drawWidth = state.photo.width * base * state.photoZoom;
  const drawHeight = state.photo.height * base * state.photoZoom;
  const left = x + (width - drawWidth) / 2 + state.photoOffsetX;
  const top = y + (height - drawHeight) / 2 + state.photoOffsetY;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.drawImage(state.photo.image, left, top, drawWidth, drawHeight);
  ctx.restore();
}

function renderPhoto() {
  const source = state.photo;
  const frame = getFrame();
  els.photoEmpty.classList.toggle("hidden", !!source);
  els.photoCanvas.classList.toggle("hidden", !source);
  els.photoZoom.disabled = !source;
  els.resetPhoto.disabled = !source;
  els.photoMeta.textContent = source ? sourceMeta(source) : "尚未导入图片";
  if (!source || !frame) return;
  clampPhotoOffset();
  const maxWidth = Math.min(680, Math.max(200, els.photoDrop.clientWidth - 2));
  const scale = Math.min(maxWidth / frame.width, 500 / frame.height);
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const ctx = sizeCanvas(els.photoCanvas, width, height);
  ctx.setTransform(els.photoCanvas.width / frame.width, 0, 0, els.photoCanvas.height / frame.height, 0, 0);
  drawPhoto(ctx, 0, 0, frame.width, frame.height);
}

function compositionSize() {
  if (!state.anime || !state.photo || !state.crop || state.crop.w < 12 || state.crop.h < 12) return null;
  const frameWidth = Math.max(1, Math.round(state.crop.w));
  const frameHeight = Math.max(1, Math.round(state.crop.h));
  const outer = state.outerBorder;
  const divider = state.divider;
  const horizontal = state.position === "left" || state.position === "right";
  return {
    frameWidth, frameHeight, outer, divider, horizontal,
    width: horizontal ? 2 * frameWidth + divider + 2 * outer : frameWidth + 2 * outer,
    height: horizontal ? frameHeight + 2 * outer : 2 * frameHeight + divider + 2 * outer,
  };
}

function paintComposition(ctx, spec) {
  const { frameWidth: w, frameHeight: h, outer: b, divider: d, horizontal } = spec;
  ctx.fillStyle = state.borderColor;
  ctx.fillRect(0, 0, spec.width, spec.height);
  const first = { x: b, y: b };
  const second = horizontal ? { x: b + w + d, y: b } : { x: b, y: b + h + d };
  const animeFirst = state.position === "left" || state.position === "top";
  const anime = animeFirst ? first : second;
  const photo = animeFirst ? second : first;
  const c = state.crop;
  ctx.drawImage(state.anime.image, c.x, c.y, c.w, c.h, anime.x, anime.y, w, h);
  drawPhoto(ctx, photo.x, photo.y, w, h);
}

function renderPreview() {
  const spec = compositionSize();
  const output = spec && outputSize(spec);
  els.previewEmpty.classList.toggle("hidden", !!spec);
  els.previewCanvas.classList.toggle("hidden", !spec);
  els.exportPng.disabled = !spec;
  els.exportJpeg.disabled = !spec;
  els.shareJpeg.disabled = !spec;
  els.exportSize.textContent = output ? `导出尺寸 ${output.width} × ${output.height} px` : "导入两张图片后显示";
  if (!spec) return;
  const availableWidth = Math.max(180, els.previewCanvas.parentElement.clientWidth - 38);
  const scale = Math.min(2, availableWidth / spec.width, 420 / spec.height);
  const width = Math.max(1, Math.round(spec.width * scale));
  const height = Math.max(1, Math.round(spec.height * scale));
  const ctx = sizeCanvas(els.previewCanvas, width, height);
  ctx.setTransform(els.previewCanvas.width / spec.width, 0, 0, els.previewCanvas.height / spec.height, 0, 0);
  paintComposition(ctx, spec);
}

function refreshAll() {
  renderAnime();
  renderPhoto();
  renderPreview();
}

function downloadName(extension) {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  return `seichi-collage-${date}-${time}.${extension}`;
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片导出失败，请尝试缩小动画裁切区域")), type, quality);
    } catch (error) {
      reject(error);
    }
  });
}

function outputSize(spec) {
  if (els.exportSizeMode.value === "original") return { width: spec.width, height: spec.height };
  const scale = Math.min(1, 4096 / Math.max(spec.width, spec.height), Math.sqrt(12000000 / (spec.width * spec.height)));
  return { width: Math.max(1, Math.round(spec.width * scale)), height: Math.max(1, Math.round(spec.height * scale)) };
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function exportImage(type, share = false) {
  const spec = compositionSize();
  if (!spec) return;
  const output = outputSize(spec);
  if (output.width > 16384 || output.height > 16384 || output.width * output.height > 100000000) {
    setStatus("导出尺寸超过浏览器可稳定处理的范围，请缩小动画裁切区域。", true);
    return;
  }
  const button = share ? els.shareJpeg : type === "image/png" ? els.exportPng : els.exportJpeg;
  button.disabled = true;
  setStatus("正在生成图片…");
  try {
    const canvas = document.createElement("canvas");
    canvas.width = output.width;
    canvas.height = output.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器无法创建导出画布");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.scale(output.width / spec.width, output.height / spec.height);
    paintComposition(ctx, spec);
    const blob = await canvasBlob(canvas, type, type === "image/jpeg" ? 0.93 : undefined);
    const name = downloadName(type === "image/png" ? "png" : "jpg");
    if (share && navigator.share && navigator.canShare) {
      const file = new File([blob], name, { type });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          setStatus(`已打开分享菜单：${output.width} × ${output.height} px`);
          return;
        } catch (error) {
          if (error.name === "AbortError") {
            setStatus("已取消分享");
            return;
          }
        }
      }
    }
    downloadBlob(blob, name);
    setStatus(`已导出 ${output.width} × ${output.height} px 图片`);
  } catch (error) {
    setStatus(error.message || "图片导出失败", true);
  } finally {
    button.disabled = false;
  }
}

els.exportPng.addEventListener("click", () => exportImage("image/png"));
els.exportJpeg.addEventListener("click", () => exportImage("image/jpeg"));
els.shareJpeg.addEventListener("click", () => exportImage("image/jpeg", true));
els.exportSizeMode.addEventListener("change", renderPreview);

if (window.matchMedia("(pointer: coarse) and (max-width: 700px)").matches) {
  els.exportSizeMode.value = "social";
}
if (navigator.share && navigator.canShare) els.shareJpeg.classList.remove("hidden");

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(refreshAll, 100);
});

refreshAll();
