const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const HANDLE_SIZE = 10;
const MIN_CROP_SIZE = 4;
const MIN_ZOOM = 0.03;
const MAX_ZOOM = 12;

const elements = {
  fileInput: document.querySelector("#fileInput"),
  openButton: document.querySelector("#openButton"),
  dropOpenButton: document.querySelector("#dropOpenButton"),
  replaceButton: document.querySelector("#replaceButton"),
  fitButton: document.querySelector("#fitButton"),
  exportHeaderButton: document.querySelector("#exportHeaderButton"),
  dropZone: document.querySelector("#dropZone"),
  editorArea: document.querySelector("#editorArea"),
  canvasWrap: document.querySelector("#canvasWrap"),
  editorCanvas: document.querySelector("#editorCanvas"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  loadingText: document.querySelector("#loadingText"),
  zoomOutButton: document.querySelector("#zoomOutButton"),
  zoomInButton: document.querySelector("#zoomInButton"),
  zoomLabelButton: document.querySelector("#zoomLabelButton"),
  panModeButton: document.querySelector("#panModeButton"),
  statusBar: document.querySelector("#statusBar"),
  fileName: document.querySelector("#fileName"),
  fileMeta: document.querySelector("#fileMeta"),
  pdfPanel: document.querySelector("#pdfPanel"),
  prevPageButton: document.querySelector("#prevPageButton"),
  nextPageButton: document.querySelector("#nextPageButton"),
  pageNumberInput: document.querySelector("#pageNumberInput"),
  pageCountLabel: document.querySelector("#pageCountLabel"),
  pdfDpiSelect: document.querySelector("#pdfDpiSelect"),
  resetCropButton: document.querySelector("#resetCropButton"),
  cropXInput: document.querySelector("#cropXInput"),
  cropYInput: document.querySelector("#cropYInput"),
  cropWidthInput: document.querySelector("#cropWidthInput"),
  cropHeightInput: document.querySelector("#cropHeightInput"),
  aspectRatioSelect: document.querySelector("#aspectRatioSelect"),
  formatSelect: document.querySelector("#formatSelect"),
  exportScaleSelect: document.querySelector("#exportScaleSelect"),
  qualityField: document.querySelector("#qualityField"),
  qualityRange: document.querySelector("#qualityRange"),
  qualityOutput: document.querySelector("#qualityOutput"),
  backgroundField: document.querySelector("#backgroundField"),
  backgroundColorInput: document.querySelector("#backgroundColorInput"),
  backgroundColorText: document.querySelector("#backgroundColorText"),
  outputNameInput: document.querySelector("#outputNameInput"),
  outputSizeLabel: document.querySelector("#outputSizeLabel"),
  exportButton: document.querySelector("#exportButton"),
  toast: document.querySelector("#toast"),
};

const sourceCanvas = document.createElement("canvas");
const sourceContext = sourceCanvas.getContext("2d", { alpha: true });
const editorContext = elements.editorCanvas.getContext("2d");

const state = {
  ready: false,
  sourceType: null,
  sourceFile: null,
  sourceName: "",
  crop: { x: 0, y: 0, width: 0, height: 0 },
  view: { zoom: 1, panX: 0, panY: 0 },
  interaction: null,
  spaceDown: false,
  panMode: false,
  pdf: {
    lib: null,
    document: null,
    pageNumber: 1,
    pageCount: 0,
    dpi: 150,
    renderToken: 0,
  },
};

let toastTimer = null;
let resizeObserver = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isValidCrop(crop = state.crop) {
  return crop.width >= 1 && crop.height >= 1;
}

function getCanvasCssSize() {
  const rect = elements.canvasWrap.getBoundingClientRect();
  return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
}

function resizeEditorCanvas() {
  const { width, height } = getCanvasCssSize();
  const dpr = window.devicePixelRatio || 1;
  elements.editorCanvas.width = Math.round(width * dpr);
  elements.editorCanvas.height = Math.round(height * dpr);
  elements.editorCanvas.style.width = `${width}px`;
  elements.editorCanvas.style.height = `${height}px`;
  render();
}

function sourceToScreen(x, y) {
  return {
    x: state.view.panX + x * state.view.zoom,
    y: state.view.panY + y * state.view.zoom,
  };
}

function screenToSource(x, y) {
  return {
    x: (x - state.view.panX) / state.view.zoom,
    y: (y - state.view.panY) / state.view.zoom,
  };
}

function getPointerPosition(event) {
  const rect = elements.editorCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function getSourceScreenRect() {
  return {
    x: state.view.panX,
    y: state.view.panY,
    width: sourceCanvas.width * state.view.zoom,
    height: sourceCanvas.height * state.view.zoom,
  };
}

function getCropScreenRect() {
  const topLeft = sourceToScreen(state.crop.x, state.crop.y);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: state.crop.width * state.view.zoom,
    height: state.crop.height * state.view.zoom,
  };
}

function getHandlePoints(rect = getCropScreenRect()) {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  const centerX = left + rect.width / 2;
  const centerY = top + rect.height / 2;

  return {
    nw: { x: left, y: top },
    n: { x: centerX, y: top },
    ne: { x: right, y: top },
    e: { x: right, y: centerY },
    se: { x: right, y: bottom },
    s: { x: centerX, y: bottom },
    sw: { x: left, y: bottom },
    w: { x: left, y: centerY },
  };
}

function render() {
  const { width, height } = getCanvasCssSize();
  const dpr = window.devicePixelRatio || 1;
  editorContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  editorContext.clearRect(0, 0, width, height);

  editorContext.fillStyle = "#101217";
  editorContext.fillRect(0, 0, width, height);

  if (!state.ready) {
    return;
  }

  const sourceRect = getSourceScreenRect();
  editorContext.save();
  editorContext.imageSmoothingEnabled = state.view.zoom < 2;
  editorContext.imageSmoothingQuality = "high";
  editorContext.shadowColor = "rgba(0, 0, 0, .45)";
  editorContext.shadowBlur = 28;
  editorContext.drawImage(
    sourceCanvas,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
  );
  editorContext.restore();

  if (!isValidCrop()) {
    return;
  }

  const cropRect = getCropScreenRect();
  editorContext.save();
  editorContext.beginPath();
  editorContext.rect(0, 0, width, height);
  editorContext.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
  editorContext.fillStyle = "rgba(0, 0, 0, .58)";
  editorContext.fill("evenodd");
  editorContext.restore();

  editorContext.save();
  editorContext.strokeStyle = "rgba(255, 255, 255, .95)";
  editorContext.lineWidth = 3;
  editorContext.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
  editorContext.strokeStyle = "#e6002d";
  editorContext.lineWidth = 1;
  editorContext.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);

  const handles = getHandlePoints(cropRect);
  for (const point of Object.values(handles)) {
    editorContext.fillStyle = "#ffffff";
    editorContext.fillRect(
      point.x - HANDLE_SIZE / 2,
      point.y - HANDLE_SIZE / 2,
      HANDLE_SIZE,
      HANDLE_SIZE,
    );
    editorContext.strokeStyle = "#e6002d";
    editorContext.lineWidth = 1;
    editorContext.strokeRect(
      point.x - HANDLE_SIZE / 2,
      point.y - HANDLE_SIZE / 2,
      HANDLE_SIZE,
      HANDLE_SIZE,
    );
  }
  editorContext.restore();
}

function fitToView() {
  if (!state.ready) return;
  const { width, height } = getCanvasCssSize();
  const margin = width < 640 ? 28 : 60;
  const availableWidth = Math.max(1, width - margin * 2);
  const availableHeight = Math.max(1, height - margin * 2);
  const zoom = clamp(
    Math.min(availableWidth / sourceCanvas.width, availableHeight / sourceCanvas.height),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  state.view.zoom = zoom;
  state.view.panX = (width - sourceCanvas.width * zoom) / 2;
  state.view.panY = (height - sourceCanvas.height * zoom) / 2;
  updateUi();
  render();
}

function setActualSize() {
  if (!state.ready) return;
  const { width, height } = getCanvasCssSize();
  state.view.zoom = 1;
  state.view.panX = (width - sourceCanvas.width) / 2;
  state.view.panY = (height - sourceCanvas.height) / 2;
  updateUi();
  render();
}

function zoomAt(screenX, screenY, targetZoom) {
  if (!state.ready) return;
  const oldZoom = state.view.zoom;
  const nextZoom = clamp(targetZoom, MIN_ZOOM, MAX_ZOOM);
  const sourcePoint = {
    x: (screenX - state.view.panX) / oldZoom,
    y: (screenY - state.view.panY) / oldZoom,
  };
  state.view.zoom = nextZoom;
  state.view.panX = screenX - sourcePoint.x * nextZoom;
  state.view.panY = screenY - sourcePoint.y * nextZoom;
  updateUi();
  render();
}

function zoomFromCenter(factor) {
  const { width, height } = getCanvasCssSize();
  zoomAt(width / 2, height / 2, state.view.zoom * factor);
}

function defaultCrop() {
  if (!state.ready) return;
  const marginRatio = 0.08;
  let width = sourceCanvas.width * (1 - marginRatio * 2);
  let height = sourceCanvas.height * (1 - marginRatio * 2);
  const ratio = getSelectedAspectRatio();

  if (ratio) {
    if (width / height > ratio) {
      width = height * ratio;
    } else {
      height = width / ratio;
    }
  }

  state.crop = {
    x: (sourceCanvas.width - width) / 2,
    y: (sourceCanvas.height - height) / 2,
    width,
    height,
  };
  updateUi();
  render();
}

function getSelectedAspectRatio() {
  const value = elements.aspectRatioSelect.value;
  if (value === "free") return null;
  if (value === "source") return sourceCanvas.width / sourceCanvas.height;
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

function normalizeCrop(crop) {
  const x1 = Math.min(crop.x, crop.x + crop.width);
  const y1 = Math.min(crop.y, crop.y + crop.height);
  const x2 = Math.max(crop.x, crop.x + crop.width);
  const y2 = Math.max(crop.y, crop.y + crop.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function constrainCrop(crop) {
  const normalized = normalizeCrop(crop);
  const width = clamp(normalized.width, MIN_CROP_SIZE, sourceCanvas.width);
  const height = clamp(normalized.height, MIN_CROP_SIZE, sourceCanvas.height);
  const x = clamp(normalized.x, 0, sourceCanvas.width - width);
  const y = clamp(normalized.y, 0, sourceCanvas.height - height);
  return { x, y, width, height };
}

function hitTest(point) {
  if (!isValidCrop()) return { type: "new" };
  const cropRect = getCropScreenRect();
  const handles = getHandlePoints(cropRect);
  const threshold = Math.max(10, HANDLE_SIZE);

  for (const [name, handlePoint] of Object.entries(handles)) {
    if (
      Math.abs(point.x - handlePoint.x) <= threshold &&
      Math.abs(point.y - handlePoint.y) <= threshold
    ) {
      return { type: "resize", handle: name };
    }
  }

  if (
    point.x >= cropRect.x &&
    point.x <= cropRect.x + cropRect.width &&
    point.y >= cropRect.y &&
    point.y <= cropRect.y + cropRect.height
  ) {
    return { type: "move" };
  }

  const sourceRect = getSourceScreenRect();
  if (
    point.x >= sourceRect.x &&
    point.x <= sourceRect.x + sourceRect.width &&
    point.y >= sourceRect.y &&
    point.y <= sourceRect.y + sourceRect.height
  ) {
    return { type: "new" };
  }

  return { type: "none" };
}

function cursorForHit(hit) {
  if (state.spaceDown || state.panMode) return "grab";
  if (hit.type === "move") return "move";
  if (hit.type === "new") return "crosshair";
  if (hit.type !== "resize") return "default";
  const cursorMap = {
    nw: "nwse-resize",
    se: "nwse-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
  };
  return cursorMap[hit.handle] || "default";
}

function resizeCropFromHandle(handle, startCrop, dx, dy) {
  let left = startCrop.x;
  let top = startCrop.y;
  let right = startCrop.x + startCrop.width;
  let bottom = startCrop.y + startCrop.height;

  if (handle.includes("w")) left += dx;
  if (handle.includes("e")) right += dx;
  if (handle.includes("n")) top += dy;
  if (handle.includes("s")) bottom += dy;

  const ratio = getSelectedAspectRatio();
  if (ratio && handle.length === 2) {
    let width = Math.max(MIN_CROP_SIZE, Math.abs(right - left));
    let height = Math.max(MIN_CROP_SIZE, Math.abs(bottom - top));
    if (width / height > ratio) {
      height = width / ratio;
    } else {
      width = height * ratio;
    }

    const anchorX = handle.includes("w") ? startCrop.x + startCrop.width : startCrop.x;
    const anchorY = handle.includes("n") ? startCrop.y + startCrop.height : startCrop.y;
    left = handle.includes("w") ? anchorX - width : anchorX;
    right = handle.includes("w") ? anchorX : anchorX + width;
    top = handle.includes("n") ? anchorY - height : anchorY;
    bottom = handle.includes("n") ? anchorY : anchorY + height;
  }

  return constrainCrop({ x: left, y: top, width: right - left, height: bottom - top });
}

function createCropFromDrag(start, current) {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  let width = Math.abs(dx);
  let height = Math.abs(dy);
  const ratio = getSelectedAspectRatio();

  if (ratio && width > 0 && height > 0) {
    if (width / height > ratio) {
      height = width / ratio;
    } else {
      width = height * ratio;
    }
  }

  const x = dx >= 0 ? start.x : start.x - width;
  const y = dy >= 0 ? start.y : start.y - height;
  return constrainCrop({ x, y, width, height });
}

function handlePointerDown(event) {
  if (!state.ready) return;
  const point = getPointerPosition(event);
  const sourcePoint = screenToSource(point.x, point.y);
  const wantsPan = state.panMode || state.spaceDown || event.button === 1;
  const hit = wantsPan ? { type: "pan" } : hitTest(point);

  if (hit.type === "none") return;

  event.preventDefault();
  elements.editorCanvas.setPointerCapture(event.pointerId);
  state.interaction = {
    type: hit.type,
    handle: hit.handle || null,
    startScreen: point,
    startSource: sourcePoint,
    startCrop: { ...state.crop },
    startPan: { x: state.view.panX, y: state.view.panY },
  };
  elements.editorCanvas.style.cursor = hit.type === "pan" ? "grabbing" : cursorForHit(hit);
}

function handlePointerMove(event) {
  if (!state.ready) return;
  const point = getPointerPosition(event);

  if (!state.interaction) {
    elements.editorCanvas.style.cursor = cursorForHit(hitTest(point));
    return;
  }

  event.preventDefault();
  const interaction = state.interaction;
  const sourcePoint = screenToSource(point.x, point.y);

  if (interaction.type === "pan") {
    state.view.panX = interaction.startPan.x + point.x - interaction.startScreen.x;
    state.view.panY = interaction.startPan.y + point.y - interaction.startScreen.y;
  } else if (interaction.type === "move") {
    const dx = sourcePoint.x - interaction.startSource.x;
    const dy = sourcePoint.y - interaction.startSource.y;
    state.crop = constrainCrop({
      ...interaction.startCrop,
      x: interaction.startCrop.x + dx,
      y: interaction.startCrop.y + dy,
    });
  } else if (interaction.type === "resize") {
    const dx = sourcePoint.x - interaction.startSource.x;
    const dy = sourcePoint.y - interaction.startSource.y;
    state.crop = resizeCropFromHandle(interaction.handle, interaction.startCrop, dx, dy);
  } else if (interaction.type === "new") {
    state.crop = createCropFromDrag(interaction.startSource, sourcePoint);
  }

  updateUi();
  render();
}

function handlePointerUp(event) {
  if (!state.interaction) return;
  try {
    elements.editorCanvas.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }
  state.interaction = null;
  const point = getPointerPosition(event);
  elements.editorCanvas.style.cursor = cursorForHit(hitTest(point));
  updateUi();
  render();
}

function showLoading(message) {
  elements.loadingText.textContent = message;
  elements.loadingOverlay.classList.remove("is-hidden");
}

function hideLoading() {
  elements.loadingOverlay.classList.add("is-hidden");
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2800);
}

function baseName(filename) {
  return filename.replace(/\.[^.]+$/, "") || "clip";
}

function safeOutputName(name) {
  return (name || "clip")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+|\.+$/g, "") || "clip";
}

async function loadImageFile(file) {
  showLoading("画像を読み込んでいます…");
  try {
    let image;
    if ("createImageBitmap" in window) {
      image = await createImageBitmap(file);
      sourceCanvas.width = image.width;
      sourceCanvas.height = image.height;
      sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
      sourceContext.drawImage(image, 0, 0);
      image.close?.();
    } else {
      image = await loadImageElement(file);
      sourceCanvas.width = image.naturalWidth;
      sourceCanvas.height = image.naturalHeight;
      sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
      sourceContext.drawImage(image, 0, 0);
    }

    state.sourceType = "image";
    state.ready = true;
    state.pdf.document = null;
    state.pdf.pageCount = 0;
    finishLoadingSource();
  } finally {
    hideLoading();
  }
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像を読み込めませんでした。"));
    };
    image.src = objectUrl;
  });
}

async function getPdfLibrary() {
  if (state.pdf.lib) return state.pdf.lib;
  const pdfjsLib = await import(PDFJS_URL);
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  state.pdf.lib = pdfjsLib;
  return pdfjsLib;
}

async function loadPdfFile(file) {
  showLoading("PDFを読み込んでいます…");
  try {
    const pdfjsLib = await getPdfLibrary();
    const data = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjsLib.getDocument({ data });
    state.pdf.document = await loadingTask.promise;
    state.pdf.pageCount = state.pdf.document.numPages;
    state.pdf.pageNumber = 1;
    state.pdf.dpi = Number(elements.pdfDpiSelect.value);
    state.sourceType = "pdf";
    state.ready = true;
    await renderPdfPage({ preserveCrop: false });
  } finally {
    hideLoading();
  }
}

async function renderPdfPage({ preserveCrop }) {
  if (!state.pdf.document) return;
  const token = ++state.pdf.renderToken;
  showLoading(`${state.pdf.pageNumber}ページ目を描画しています…`);

  try {
    const oldWidth = sourceCanvas.width;
    const oldHeight = sourceCanvas.height;
    const oldCrop = { ...state.crop };
    const page = await state.pdf.document.getPage(state.pdf.pageNumber);
    const viewport = page.getViewport({ scale: state.pdf.dpi / 72 });

    const maxDimension = 16000;
    const maxPixels = 80_000_000;
    const dimensionReduction = maxDimension / Math.max(viewport.width, viewport.height);
    const areaReduction = Math.sqrt(maxPixels / (viewport.width * viewport.height));
    const reduction = Math.min(1, dimensionReduction, areaReduction);
    const finalViewport =
      reduction < 1 ? page.getViewport({ scale: (state.pdf.dpi / 72) * reduction }) : viewport;

    sourceCanvas.width = Math.max(1, Math.floor(finalViewport.width));
    sourceCanvas.height = Math.max(1, Math.floor(finalViewport.height));
    sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);

    await page.render({ canvasContext: sourceContext, viewport: finalViewport }).promise;
    if (token !== state.pdf.renderToken) return;

    if (preserveCrop && oldWidth > 0 && oldHeight > 0) {
      state.crop = constrainCrop({
        x: (oldCrop.x / oldWidth) * sourceCanvas.width,
        y: (oldCrop.y / oldHeight) * sourceCanvas.height,
        width: (oldCrop.width / oldWidth) * sourceCanvas.width,
        height: (oldCrop.height / oldHeight) * sourceCanvas.height,
      });
    } else {
      defaultCrop();
    }

    finishLoadingSource({ keepCrop: true });
    if (reduction < 1) {
      showToast("ページが非常に大きいため、ブラウザ上限に合わせて描画しました。 ");
    }
  } catch (error) {
    if (token === state.pdf.renderToken) throw error;
  } finally {
    if (token === state.pdf.renderToken) hideLoading();
  }
}

function finishLoadingSource({ keepCrop = false } = {}) {
  elements.dropZone.classList.add("is-hidden");
  elements.editorArea.classList.remove("is-hidden");
  elements.pdfPanel.classList.toggle("is-hidden", state.sourceType !== "pdf");
  elements.outputNameInput.value = `${baseName(state.sourceName)}_clip`;
  resizeEditorCanvas();
  fitToView();
  if (!keepCrop) defaultCrop();
  setControlsEnabled(true);
  updateUi();
  render();
}

async function loadFile(file) {
  if (!file) return;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const isPdf = file.type === "application/pdf" || extension === "pdf";
  const isImage = file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(extension);

  if (!isPdf && !isImage) {
    showToast("PNG、JPG、WebP、PDFを選択してください。 ");
    return;
  }

  state.sourceFile = file;
  state.sourceName = file.name || "clipboard-image.png";
  state.ready = false;
  state.interaction = null;
  updateUi();

  try {
    if (isPdf) {
      await loadPdfFile(file);
    } else {
      await loadImageFile(file);
    }
  } catch (error) {
    console.error(error);
    state.ready = false;
    hideLoading();
    showToast(error?.message || "ファイルを読み込めませんでした。 ");
  }
}

function setControlsEnabled(enabled) {
  const controls = [
    elements.replaceButton,
    elements.fitButton,
    elements.exportHeaderButton,
    elements.resetCropButton,
    elements.cropXInput,
    elements.cropYInput,
    elements.cropWidthInput,
    elements.cropHeightInput,
    elements.aspectRatioSelect,
    elements.formatSelect,
    elements.exportScaleSelect,
    elements.outputNameInput,
    elements.exportButton,
  ];
  for (const control of controls) control.disabled = !enabled;
}

function updateUi() {
  elements.fileName.textContent = state.sourceName || "未選択";

  if (state.ready) {
    const typeLabel = state.sourceType === "pdf" ? "PDFページ" : "画像";
    elements.fileMeta.textContent = `${typeLabel}・${sourceCanvas.width.toLocaleString()} × ${sourceCanvas.height.toLocaleString()} px`;
    elements.zoomLabelButton.textContent = `${Math.round(state.view.zoom * 100)}%`;

    const crop = constrainCrop(state.crop);
    elements.cropXInput.value = String(Math.round(crop.x));
    elements.cropYInput.value = String(Math.round(crop.y));
    elements.cropWidthInput.value = String(Math.round(crop.width));
    elements.cropHeightInput.value = String(Math.round(crop.height));

    const exportScale = Number(elements.exportScaleSelect.value) || 1;
    const outputWidth = Math.max(1, Math.round(crop.width * exportScale));
    const outputHeight = Math.max(1, Math.round(crop.height * exportScale));
    elements.outputSizeLabel.textContent = `${outputWidth.toLocaleString()} × ${outputHeight.toLocaleString()} px`;

    const pageText = state.sourceType === "pdf" ? `・${state.pdf.pageNumber} / ${state.pdf.pageCount}ページ` : "";
    elements.statusBar.textContent = `元画像 ${sourceCanvas.width.toLocaleString()} × ${sourceCanvas.height.toLocaleString()} px${pageText}・表示 ${Math.round(state.view.zoom * 100)}%・選択 ${Math.round(crop.width).toLocaleString()} × ${Math.round(crop.height).toLocaleString()} px`;
  } else {
    elements.fileMeta.textContent = "画像またはPDFを選択してください";
    elements.outputSizeLabel.textContent = "—";
    elements.statusBar.textContent = "ファイルはサーバーへ送信されません。すべてブラウザ内で処理します。";
  }

  const isJpeg = elements.formatSelect.value === "jpeg";
  elements.qualityField.classList.toggle("is-hidden", !isJpeg);
  elements.backgroundField.classList.toggle("is-hidden", !isJpeg);
  elements.exportButton.textContent = `${isJpeg ? "JPG" : "PNG"}で書き出す`;

  elements.qualityOutput.textContent = `${elements.qualityRange.value}%`;

  if (state.sourceType === "pdf") {
    elements.pageNumberInput.value = String(state.pdf.pageNumber);
    elements.pageNumberInput.max = String(state.pdf.pageCount);
    elements.pageCountLabel.textContent = `/ ${state.pdf.pageCount}`;
    elements.prevPageButton.disabled = state.pdf.pageNumber <= 1;
    elements.nextPageButton.disabled = state.pdf.pageNumber >= state.pdf.pageCount;
  }
}

function applyCropInputs() {
  if (!state.ready) return;
  const requested = {
    x: Number(elements.cropXInput.value),
    y: Number(elements.cropYInput.value),
    width: Number(elements.cropWidthInput.value),
    height: Number(elements.cropHeightInput.value),
  };

  if (Object.values(requested).some((value) => !Number.isFinite(value))) {
    updateUi();
    return;
  }

  state.crop = constrainCrop(requested);
  updateUi();
  render();
}

function applyAspectRatio() {
  if (!state.ready) return;
  const ratio = getSelectedAspectRatio();
  if (!ratio) return;

  let width = state.crop.width;
  let height = width / ratio;
  if (height > sourceCanvas.height) {
    height = sourceCanvas.height;
    width = height * ratio;
  }

  state.crop = constrainCrop({
    x: state.crop.x + (state.crop.width - width) / 2,
    y: state.crop.y + (state.crop.height - height) / 2,
    width,
    height,
  });
  updateUi();
  render();
}

function moveCropBy(dx, dy) {
  if (!state.ready) return;
  state.crop = constrainCrop({ ...state.crop, x: state.crop.x + dx, y: state.crop.y + dy });
  updateUi();
  render();
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("画像の生成に失敗しました。"))),
      mimeType,
      quality,
    );
  });
}

async function exportCrop() {
  if (!state.ready || !isValidCrop()) {
    showToast("書き出す範囲を選択してください。 ");
    return;
  }

  const crop = constrainCrop(state.crop);
  const scale = Number(elements.exportScaleSelect.value) || 1;
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));

  const maxPixels = 100_000_000;
  if (width * height > maxPixels) {
    showToast("出力サイズが大きすぎます。倍率または範囲を小さくしてください。 ");
    return;
  }

  const format = elements.formatSelect.value;
  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const context = outputCanvas.getContext("2d", { alpha: format !== "jpeg" });

  if (format === "jpeg") {
    context.fillStyle = elements.backgroundColorInput.value || "#ffffff";
    context.fillRect(0, 0, width, height);
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    sourceCanvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    width,
    height,
  );

  try {
    elements.exportButton.disabled = true;
    elements.exportHeaderButton.disabled = true;
    const quality = Number(elements.qualityRange.value) / 100;
    const blob = await canvasToBlob(outputCanvas, mimeType, quality);
    const extension = format === "jpeg" ? "jpg" : "png";
    const name = `${safeOutputName(elements.outputNameInput.value)}.${extension}`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast(`${name} を保存しました。 `);
  } catch (error) {
    console.error(error);
    showToast(error?.message || "書き出しに失敗しました。 ");
  } finally {
    elements.exportButton.disabled = false;
    elements.exportHeaderButton.disabled = false;
  }
}

async function setPdfPage(pageNumber) {
  if (!state.pdf.document) return;
  const nextPage = clamp(Math.round(pageNumber), 1, state.pdf.pageCount);
  if (nextPage === state.pdf.pageNumber) {
    updateUi();
    return;
  }
  state.pdf.pageNumber = nextPage;
  updateUi();
  try {
    await renderPdfPage({ preserveCrop: false });
  } catch (error) {
    console.error(error);
    showToast("PDFページを描画できませんでした。 ");
  }
}

function normalizeHex(value) {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(trimmed)) return `#${trimmed.toLowerCase()}`;
  return null;
}

function handleKeyboard(event) {
  const activeTag = document.activeElement?.tagName;
  const isFormField = ["INPUT", "SELECT", "TEXTAREA"].includes(activeTag);
  const commandKey = event.ctrlKey || event.metaKey;

  if (commandKey && event.key.toLowerCase() === "o") {
    event.preventDefault();
    elements.fileInput.click();
    return;
  }

  if (event.code === "Space" && !isFormField) {
    state.spaceDown = true;
    if (state.ready) elements.editorCanvas.style.cursor = "grab";
    event.preventDefault();
  }

  if (!state.ready || isFormField) return;

  const step = event.shiftKey ? 10 : 1;
  const moves = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };

  if (moves[event.key]) {
    event.preventDefault();
    moveCropBy(...moves[event.key]);
  } else if (event.key === "0") {
    event.preventDefault();
    fitToView();
  } else if (event.key === "1") {
    event.preventDefault();
    setActualSize();
  } else if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomFromCenter(1.2);
  } else if (event.key === "-") {
    event.preventDefault();
    zoomFromCenter(1 / 1.2);
  } else if (event.key === "Enter") {
    event.preventDefault();
    exportCrop();
  }
}

function handleKeyUp(event) {
  if (event.code === "Space") {
    state.spaceDown = false;
    if (state.ready) elements.editorCanvas.style.cursor = "default";
  }
}

function initializeEvents() {
  const openFilePicker = () => elements.fileInput.click();
  elements.openButton.addEventListener("click", openFilePicker);
  elements.dropOpenButton.addEventListener("click", openFilePicker);
  elements.replaceButton.addEventListener("click", openFilePicker);
  elements.fileInput.addEventListener("change", () => {
    const [file] = elements.fileInput.files;
    loadFile(file);
    elements.fileInput.value = "";
  });

  for (const eventName of ["dragenter", "dragover"]) {
    window.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add("is-dragging");
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    window.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove("is-dragging");
    });
  }

  window.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer?.files || [];
    loadFile(file);
  });

  window.addEventListener("paste", (event) => {
    const items = [...(event.clipboardData?.items || [])];
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (file) {
      const extension = file.type.split("/")[1] || "png";
      const namedFile = new File([file], `clipboard-${Date.now()}.${extension}`, { type: file.type });
      loadFile(namedFile);
    }
  });

  elements.editorCanvas.addEventListener("pointerdown", handlePointerDown);
  elements.editorCanvas.addEventListener("pointermove", handlePointerMove);
  elements.editorCanvas.addEventListener("pointerup", handlePointerUp);
  elements.editorCanvas.addEventListener("pointercancel", handlePointerUp);
  elements.editorCanvas.addEventListener(
    "wheel",
    (event) => {
      if (!state.ready) return;
      event.preventDefault();
      const point = getPointerPosition(event);
      zoomAt(point.x, point.y, state.view.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
    },
    { passive: false },
  );

  elements.zoomOutButton.addEventListener("click", () => zoomFromCenter(1 / 1.2));
  elements.zoomInButton.addEventListener("click", () => zoomFromCenter(1.2));
  elements.zoomLabelButton.addEventListener("click", fitToView);
  elements.panModeButton.addEventListener("click", () => {
    state.panMode = !state.panMode;
    elements.panModeButton.setAttribute("aria-pressed", String(state.panMode));
    elements.panModeButton.classList.toggle("is-active", state.panMode);
    elements.editorCanvas.style.cursor = state.panMode ? "grab" : "default";
  });
  elements.fitButton.addEventListener("click", fitToView);

  elements.resetCropButton.addEventListener("click", defaultCrop);
  for (const input of [
    elements.cropXInput,
    elements.cropYInput,
    elements.cropWidthInput,
    elements.cropHeightInput,
  ]) {
    input.addEventListener("change", applyCropInputs);
  }
  elements.aspectRatioSelect.addEventListener("change", applyAspectRatio);

  elements.formatSelect.addEventListener("change", updateUi);
  elements.exportScaleSelect.addEventListener("change", updateUi);
  elements.qualityRange.addEventListener("input", updateUi);
  elements.backgroundColorInput.addEventListener("input", () => {
    elements.backgroundColorText.value = elements.backgroundColorInput.value;
  });
  elements.backgroundColorText.addEventListener("change", () => {
    const color = normalizeHex(elements.backgroundColorText.value);
    if (color) {
      elements.backgroundColorInput.value = color;
      elements.backgroundColorText.value = color;
    } else {
      elements.backgroundColorText.value = elements.backgroundColorInput.value;
      showToast("背景色は #ffffff の形式で入力してください。 ");
    }
  });

  elements.exportButton.addEventListener("click", exportCrop);
  elements.exportHeaderButton.addEventListener("click", exportCrop);

  elements.prevPageButton.addEventListener("click", () => setPdfPage(state.pdf.pageNumber - 1));
  elements.nextPageButton.addEventListener("click", () => setPdfPage(state.pdf.pageNumber + 1));
  elements.pageNumberInput.addEventListener("change", () => setPdfPage(Number(elements.pageNumberInput.value)));
  elements.pdfDpiSelect.addEventListener("change", async () => {
    if (!state.pdf.document) return;
    state.pdf.dpi = Number(elements.pdfDpiSelect.value);
    try {
      await renderPdfPage({ preserveCrop: true });
    } catch (error) {
      console.error(error);
      showToast("解像度を変更できませんでした。 ");
    }
  });

  window.addEventListener("keydown", handleKeyboard);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", () => {
    state.spaceDown = false;
    state.interaction = null;
  });

  resizeObserver = new ResizeObserver(() => resizeEditorCanvas());
  resizeObserver.observe(elements.canvasWrap);
}

function initialize() {
  setControlsEnabled(false);
  initializeEvents();
  resizeEditorCanvas();
  updateUi();
}

initialize();
