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

const mobileQuery = window.matchMedia("(max-width: 700px), (pointer: coarse) and (max-height: 550px)");
const mobile = {
  stage: $("mobile-stage"), board: $("mobile-board"), canvas: $("mobile-canvas"),
  animeEmpty: $("mobile-anime-empty"), photoEmpty: $("mobile-photo-empty"),
  anime: $("mobile-anime"), photo: $("mobile-photo"), layout: $("mobile-layout"),
  layoutLabel: $("mobile-layout-label"), layoutIcon: $("mobile-layout-icon"),
  settings: $("mobile-settings"), export: $("mobile-export"),
  hint: $("mobile-hint"), status: $("mobile-status"), outputSize: $("mobile-export-size"),
  zoom: $("mobile-zoom"), zoomValue: $("mobile-zoom-value"), resetPhoto: $("mobile-reset-photo"),
  cropSheet: $("crop-sheet"), settingsSheet: $("settings-sheet"), exportSheet: $("export-sheet"),
};
let mobileSpec = null;
let lastMobilePhotoGesture = -Infinity;

const state = {
  anime: null,
  photo: null,
  crop: null,
  photoZoom: 1,
  photoOffsetX: 0,
  photoOffsetY: 0,
  position: mobileQuery.matches && window.innerHeight > window.innerWidth ? "top" : "left",
  outerBorder: 0,
  divider: 0,
  borderColor: "#ffffff",
  drawMode: false,
  animeDrag: null,
  loadSerial: { anime: 0, photo: 0 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setStatus(message, error = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", error);
  mobile.status.textContent = message;
  mobile.status.classList.toggle("error", error);
  for (const notice of document.querySelectorAll(".sheet-error")) notice.textContent = error ? message : "";
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
    if (role === "anime" && mobileQuery.matches) openSheet(mobile.cropSheet);
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
  if (!state.anime || state.animeDrag || event.button !== 0) return;
  event.preventDefault();
  const point = pixelPoint(event, els.animeCanvas, state.anime.width, state.anime.height);
  const corner = state.drawMode ? null : cornerAt(point, event.pointerType);
  const mode = state.drawMode ? "draw" : corner ? "resize" : insideCrop(point) ? "move" : "draw";
  state.animeDrag = {
    mode, pointerId: event.pointerId, start: point, original: { ...state.crop }, anchor: corner && corner.anchor,
  };
  if (mode === "draw") state.crop = { x: point.x, y: point.y, w: 0, h: 0 };
  if (mode === "move") els.animeCanvas.classList.add("moving");
  els.animeCanvas.setPointerCapture(event.pointerId);
  refreshAll();
});

els.animeCanvas.addEventListener("pointermove", (event) => {
  const drag = state.animeDrag;
  if (!drag || !state.anime || event.pointerId !== drag.pointerId) return;
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

function finishAnimeDrag(event) {
  const drag = state.animeDrag;
  if (!drag || (event && event.pointerId !== drag.pointerId)) return;
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
  mobile.zoom.value = "1";
  mobile.zoomValue.value = "100%";
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

function setPhotoZoom(next, focalPoint, render = true) {
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
  mobile.zoom.value = String(state.photoZoom);
  mobile.zoomValue.value = `${Math.round(state.photoZoom * 100)}%`;
  if (render) {
    renderPhoto();
    renderPreview();
  }
}

els.photoZoom.addEventListener("input", () => setPhotoZoom(Number(els.photoZoom.value)));
els.resetPhoto.addEventListener("click", () => {
  resetPhotoView();
  renderPhoto();
  renderPreview();
});

function photoPoint(event, canvas) {
  const frame = getFrame();
  const bounds = canvas.getBoundingClientRect();
  if (canvas === mobile.canvas) {
    const box = compositionRects(mobileSpec).photo;
    return {
      x: ((event.clientX - bounds.left) * mobileSpec.width / bounds.width - box.x) * frame.width / box.width,
      y: ((event.clientY - bounds.top) * mobileSpec.height / bounds.height - box.y) * frame.height / box.height,
    };
  }
  return { x: (event.clientX - bounds.left) * frame.width / bounds.width, y: (event.clientY - bounds.top) * frame.height / bounds.height };
}

function setupPhotoGestures(canvas) {
  const pointers = new Map();
  let drag = null;
  const midpoint = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const startDrag = (point) => ({ point, offsetX: state.photoOffsetX, offsetY: state.photoOffsetY });

  canvas.addEventListener("pointerdown", (event) => {
    if (!state.photo || event.button !== 0 || pointers.size >= 2) return;
    if (canvas === mobile.canvas && pointers.size === 0 && mobileRoleAt(event) !== "photo") return;
    event.preventDefault();
    pointers.set(event.pointerId, photoPoint(event, canvas));
    drag = pointers.size === 1 ? startDrag([...pointers.values()][0]) : null;
    canvas.classList.add("moving");
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    const oldMid = pointers.size === 2 ? midpoint() : null;
    const oldDistance = pointers.size === 2 ? distance() : 0;
    const point = photoPoint(event, canvas);
    pointers.set(event.pointerId, point);
    if (pointers.size === 2) {
      const nextMid = midpoint();
      if (oldDistance > 0) setPhotoZoom(state.photoZoom * distance() / oldDistance, oldMid, false);
      state.photoOffsetX += nextMid.x - oldMid.x;
      state.photoOffsetY += nextMid.y - oldMid.y;
    } else if (drag) {
      state.photoOffsetX = drag.offsetX + point.x - drag.point.x;
      state.photoOffsetY = drag.offsetY + point.y - drag.point.y;
    }
    clampPhotoOffset();
    renderPhoto();
    renderPreview();
  });

  function finish(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (canvas === mobile.canvas) lastMobilePhotoGesture = performance.now();
    drag = pointers.size === 1 ? startDrag([...pointers.values()][0]) : null;
    if (!pointers.size) canvas.classList.remove("moving");
  }
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
  canvas.addEventListener("lostpointercapture", finish);
  canvas.addEventListener("wheel", (event) => {
    if (!state.photo || (canvas === mobile.canvas && mobileRoleAt(event) !== "photo")) return;
    event.preventDefault();
    setPhotoZoom(state.photoZoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08), photoPoint(event, canvas));
  }, { passive: false });
}

setupPhotoGestures(els.photoCanvas);
setupPhotoGestures(mobile.canvas);

function setPosition(position) {
  state.position = position;
  for (const button of document.querySelectorAll(".position-button")) {
    const active = button.dataset.position === position;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  renderPreview();
}
for (const button of document.querySelectorAll(".position-button")) {
  button.addEventListener("click", () => setPosition(button.dataset.position));
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
  if (mobileQuery.matches && !mobile.cropSheet.open) return;
  const maxWidth = Math.min(680, Math.max(200, els.animeDrop.clientWidth - 2));
  const maxHeight = mobileQuery.matches ? Math.max(1, els.animeDrop.clientHeight - 2) : 4800;
  const scale = Math.min(maxWidth / source.width, maxHeight / source.height);
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
  if (mobileQuery.matches) return;
  const maxWidth = Math.min(680, Math.max(200, els.photoDrop.clientWidth - 2));
  const scale = Math.min(maxWidth / frame.width, 500 / frame.height);
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const ctx = sizeCanvas(els.photoCanvas, width, height);
  ctx.setTransform(els.photoCanvas.width / frame.width, 0, 0, els.photoCanvas.height / frame.height, 0, 0);
  drawPhoto(ctx, 0, 0, frame.width, frame.height);
}

function compositionSize(allowIncomplete = false) {
  if (!allowIncomplete && (!state.anime || !state.photo || !state.crop || state.crop.w < 12 || state.crop.h < 12)) return null;
  const frame = getFrame() || { width: 1600, height: 900 };
  const frameWidth = Math.max(1, Math.round(frame.width));
  const frameHeight = Math.max(1, Math.round(frame.height));
  const outer = state.outerBorder;
  const divider = state.divider;
  const horizontal = state.position === "left" || state.position === "right";
  return {
    frameWidth, frameHeight, outer, divider, horizontal,
    width: horizontal ? 2 * frameWidth + divider + 2 * outer : frameWidth + 2 * outer,
    height: horizontal ? frameHeight + 2 * outer : 2 * frameHeight + divider + 2 * outer,
  };
}

function compositionRects(spec) {
  const { frameWidth: w, frameHeight: h, outer: b, divider: d, horizontal } = spec;
  const first = { x: b, y: b, width: w, height: h };
  const second = { x: horizontal ? b + w + d : b, y: horizontal ? b : b + h + d, width: w, height: h };
  const animeFirst = state.position === "left" || state.position === "top";
  return { anime: animeFirst ? first : second, photo: animeFirst ? second : first };
}

function paintComposition(ctx, spec) {
  const { frameWidth: w, frameHeight: h } = spec;
  const { anime, photo } = compositionRects(spec);
  ctx.fillStyle = state.borderColor;
  ctx.fillRect(0, 0, spec.width, spec.height);
  const c = state.crop;
  if (state.anime && c && c.w > 0 && c.h > 0) {
    ctx.drawImage(state.anime.image, c.x, c.y, c.w, c.h, anime.x, anime.y, w, h);
  } else {
    ctx.fillStyle = "#e9efe7";
    ctx.fillRect(anime.x, anime.y, w, h);
  }
  if (state.photo) drawPhoto(ctx, photo.x, photo.y, w, h);
  else {
    ctx.fillStyle = "#f5f7f2";
    ctx.fillRect(photo.x, photo.y, w, h);
  }
}

function renderPreview() {
  const spec = compositionSize();
  const output = spec && outputSize(spec);
  els.previewEmpty.classList.toggle("hidden", !!spec);
  els.previewCanvas.classList.toggle("hidden", !spec);
  els.exportPng.disabled = !spec;
  els.exportJpeg.disabled = !spec;
  els.shareJpeg.disabled = !spec;
  mobile.export.disabled = !spec;
  els.exportSize.textContent = output ? `导出尺寸 ${output.width} × ${output.height} px` : "导入两张图片后显示";
  mobile.outputSize.textContent = els.exportSize.textContent;
  if (mobileQuery.matches) {
    renderMobile();
    return;
  }
  if (!spec) return;
  const availableWidth = Math.max(180, els.previewCanvas.parentElement.clientWidth - 38);
  const scale = Math.min(2, availableWidth / spec.width, 420 / spec.height);
  const width = Math.max(1, Math.round(spec.width * scale));
  const height = Math.max(1, Math.round(spec.height * scale));
  const ctx = sizeCanvas(els.previewCanvas, width, height);
  ctx.setTransform(els.previewCanvas.width / spec.width, 0, 0, els.previewCanvas.height / spec.height, 0, 0);
  paintComposition(ctx, spec);
}

function mobileRoleAt(event) {
  if (!mobileSpec) return null;
  const point = pixelPoint(event, mobile.canvas, mobileSpec.width, mobileSpec.height);
  for (const [role, box] of Object.entries(compositionRects(mobileSpec))) {
    if (point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height) return role;
  }
  return null;
}

function renderMobile() {
  if (!mobileQuery.matches) return;
  mobileSpec = compositionSize(true);
  const scale = Math.min(mobile.stage.clientWidth / mobileSpec.width, Math.max(1, mobile.stage.clientHeight - 16) / mobileSpec.height);
  const width = Math.max(1, Math.round(mobileSpec.width * scale));
  const height = Math.max(1, Math.round(mobileSpec.height * scale));
  mobile.board.style.width = `${width}px`;
  mobile.board.style.height = `${height}px`;
  const ctx = sizeCanvas(mobile.canvas, width, height);
  ctx.setTransform(mobile.canvas.width / mobileSpec.width, 0, 0, mobile.canvas.height / mobileSpec.height, 0, 0);
  paintComposition(ctx, mobileSpec);
  for (const [role, button] of [["anime", mobile.animeEmpty], ["photo", mobile.photoEmpty]]) {
    const box = compositionRects(mobileSpec)[role];
    button.classList.toggle("hidden", !!state[role]);
    button.style.left = `${box.x / mobileSpec.width * 100}%`;
    button.style.top = `${box.y / mobileSpec.height * 100}%`;
    button.style.width = `${box.width / mobileSpec.width * 100}%`;
    button.style.height = `${box.height / mobileSpec.height * 100}%`;
  }
  const horizontal = mobileSpec.horizontal;
  mobile.layoutLabel.textContent = horizontal ? "左右" : "上下";
  mobile.layoutIcon.style.transform = horizontal ? "rotate(90deg)" : "none";
  mobile.layout.setAttribute("aria-label", horizontal ? "切换为上下拼接" : "切换为左右拼接");
  mobile.zoom.disabled = !state.photo;
  mobile.resetPhoto.disabled = !state.photo;
  mobile.hint.textContent = state.anime && state.photo ? "点动画图裁切 · 实景图单指移动、双指缩放" : state.anime ? "选择实景照片，开始对照取景" : state.photo ? "选择动画或漫画，作为对照画面" : "选两张图片，直接在这里对照取景";
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

function openSheet(sheet) {
  if (!mobileQuery.matches) return;
  for (const other of [mobile.cropSheet, mobile.settingsSheet, mobile.exportSheet]) {
    if (other !== sheet && other.open) other.close();
  }
  if (!sheet.open) sheet.showModal();
  requestAnimationFrame(refreshAll);
}

for (const button of document.querySelectorAll("[data-close-sheet]")) {
  button.addEventListener("click", () => button.closest("dialog").close());
}
for (const sheet of [mobile.cropSheet, mobile.settingsSheet, mobile.exportSheet]) {
  sheet.addEventListener("close", () => {
    finishAnimeDrag();
    setDrawMode(false);
    refreshAll();
  });
  sheet.addEventListener("click", (event) => {
    if (event.target !== sheet) return;
    const bounds = sheet.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) sheet.close();
  });
}

const panelMounts = [
  { node: $("anime-card"), mount: $("crop-mount") },
  { node: $("settings-card"), mount: $("settings-mount") },
  { node: $("export-controls"), mount: $("export-mount") },
];
for (const panel of panelMounts) {
  panel.home = document.createComment("panel home");
  panel.node.before(panel.home);
}
function updateMobileLayout() {
  for (const sheet of [mobile.cropSheet, mobile.settingsSheet, mobile.exportSheet]) {
    if (sheet.open) sheet.close();
  }
  document.body.classList.toggle("mobile-layout", mobileQuery.matches);
  for (const panel of panelMounts) {
    if (mobileQuery.matches) panel.mount.append(panel.node);
    else panel.home.after(panel.node);
  }
  refreshAll();
}

mobile.animeEmpty.addEventListener("click", () => els.animeInput.click());
mobile.photoEmpty.addEventListener("click", () => els.photoInput.click());
mobile.anime.addEventListener("click", () => state.anime ? openSheet(mobile.cropSheet) : els.animeInput.click());
mobile.photo.addEventListener("click", () => els.photoInput.click());
mobile.settings.addEventListener("click", () => openSheet(mobile.settingsSheet));
mobile.export.addEventListener("click", () => openSheet(mobile.exportSheet));
mobile.layout.addEventListener("click", () => {
  const next = { top: "left", bottom: "right", left: "top", right: "bottom" }[state.position];
  setPosition(next);
});
mobile.zoom.addEventListener("input", () => setPhotoZoom(Number(mobile.zoom.value)));
mobile.resetPhoto.addEventListener("click", () => els.resetPhoto.click());
mobile.canvas.addEventListener("click", (event) => {
  if (performance.now() - lastMobilePhotoGesture < 350) return;
  const role = mobileRoleAt(event);
  if (role === "anime") {
    if (state.anime) openSheet(mobile.cropSheet);
    else els.animeInput.click();
  } else if (role === "photo" && !state.photo) els.photoInput.click();
});

if (mobileQuery.matches) {
  els.exportSizeMode.value = "social";
}
if (navigator.share && navigator.canShare) els.shareJpeg.classList.remove("hidden");

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(refreshAll, 100);
});

mobileQuery.addEventListener("change", updateMobileLayout);
new ResizeObserver(() => {
  if (mobileQuery.matches) renderMobile();
}).observe(mobile.stage);
updateMobileLayout();
setPosition(state.position);
