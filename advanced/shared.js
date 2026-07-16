export const advanced = window.PDFClipperAdvanced;
export const MIN_CROP_SIZE = 4;
export const HANDLE_THRESHOLD = 14;
export const ADVANCED_SETTINGS_KEY = "pdfclipper-advanced-v1";
export const JSZIP_URL = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function readNumber(input) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : 0;
}

export function getSourceCanvas() {
  return advanced.sourceCanvas;
}

export function createCanvas() {
  return advanced.originalCreateElement.call(document, "canvas");
}

export function readSourceSize() {
  const canvas = getSourceCanvas();
  if (canvas?.width && canvas?.height) return { width: canvas.width, height: canvas.height };
  const text = document.querySelector("#fileMeta")?.textContent || "";
  const match = text.match(/([\d,]+)\s*×\s*([\d,]+)\s*px/);
  if (!match) return null;
  return {
    width: Number(match[1].replaceAll(",", "")),
    height: Number(match[2].replaceAll(",", "")),
  };
}

export function readCrop() {
  return {
    x: readNumber(document.querySelector("#cropXInput")),
    y: readNumber(document.querySelector("#cropYInput")),
    width: readNumber(document.querySelector("#cropWidthInput")),
    height: readNumber(document.querySelector("#cropHeightInput")),
  };
}

export function cropsEqual(a, b, tolerance = 0.1) {
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) < tolerance &&
    Math.abs(a.y - b.y) < tolerance &&
    Math.abs(a.width - b.width) < tolerance &&
    Math.abs(a.height - b.height) < tolerance
  );
}

export function constrainCrop(crop, source = readSourceSize()) {
  if (!source) return crop;
  const width = clamp(Math.abs(crop.width), MIN_CROP_SIZE, source.width);
  const height = clamp(Math.abs(crop.height), MIN_CROP_SIZE, source.height);
  return {
    x: clamp(crop.x, 0, source.width - width),
    y: clamp(crop.y, 0, source.height - height),
    width,
    height,
  };
}

export function writeCrop(crop, { record = true } = {}) {
  const normalized = constrainCrop(crop);
  const xInput = document.querySelector("#cropXInput");
  const yInput = document.querySelector("#cropYInput");
  const widthInput = document.querySelector("#cropWidthInput");
  const heightInput = document.querySelector("#cropHeightInput");
  if (!xInput || !yInput || !widthInput || !heightInput) return;

  advanced.history.suppress = true;
  xInput.value = String(Math.round(normalized.x));
  yInput.value = String(Math.round(normalized.y));
  widthInput.value = String(Math.round(normalized.width));
  heightInput.value = String(Math.round(normalized.height));
  xInput.dispatchEvent(new Event("change", { bubbles: true }));
  queueMicrotask(() => {
    advanced.history.suppress = false;
    if (record) advanced.recordHistory?.();
  });
}

export function readAspectRatio() {
  const select = document.querySelector("#aspectRatioSelect");
  const source = readSourceSize();
  if (!select || select.value === "free") return null;
  if (select.value === "source") {
    return source && source.height > 0 ? source.width / source.height : null;
  }
  const ratio = Number(select.value);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 3000);
}

export function safeOutputName(name) {
  return (
    (name || "clip")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .replace(/^\.+|\.+$/g, "") || "clip"
  );
}

export function baseName(filename) {
  return filename.replace(/\.[^.]+$/, "") || "clip";
}

export function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("画像を生成できませんでした。"))),
      mimeType,
      quality,
    );
  });
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
