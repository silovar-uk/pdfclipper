import {
  advanced,
  ADVANCED_SETTINGS_KEY,
  constrainCrop,
  createCanvas,
  cropsEqual,
  getSourceCanvas,
  readCrop,
  readSourceSize,
  showToast,
  writeCrop,
} from "./shared.js";
import { scheduleOverlay } from "./overlay.js";

export function recordHistory() {
  if (advanced.history.suppress || document.querySelector("#cropXInput")?.disabled) return;
  const crop = constrainCrop(readCrop());
  const current = advanced.history.items[advanced.history.index];
  if (cropsEqual(current, crop)) return;
  advanced.history.items = advanced.history.items.slice(0, advanced.history.index + 1);
  advanced.history.items.push({ ...crop });
  if (advanced.history.items.length > 80) advanced.history.items.shift();
  advanced.history.index = advanced.history.items.length - 1;
  updateHistoryButtons();
}

export function resetHistory() {
  const crop = readCrop();
  if (!crop.width || !crop.height) return;
  advanced.history.items = [{ ...crop }];
  advanced.history.index = 0;
  updateHistoryButtons();
}

function restoreHistory(index) {
  if (index < 0 || index >= advanced.history.items.length) return;
  advanced.history.index = index;
  writeCrop(advanced.history.items[index], { record: false });
  updateHistoryButtons();
}

function updateHistoryButtons() {
  const undo = document.querySelector("#advancedUndoButton");
  const redo = document.querySelector("#advancedRedoButton");
  if (undo) undo.disabled = advanced.history.index <= 0;
  if (redo) redo.disabled = advanced.history.index >= advanced.history.items.length - 1;
}

export function initializeHistory() {
  const headerActions = document.querySelector(".header-actions");
  const fitButton = document.querySelector("#fitButton");
  if (!headerActions || !fitButton || document.querySelector("#advancedUndoButton")) return;

  const group = document.createElement("div");
  group.className = "history-actions";
  const undo = document.createElement("button");
  undo.id = "advancedUndoButton";
  undo.type = "button";
  undo.className = "button button-ghost button-icon";
  undo.title = "元に戻す（Ctrl / ⌘ + Z）";
  undo.setAttribute("aria-label", "元に戻す");
  undo.textContent = "↶";
  const redo = document.createElement("button");
  redo.id = "advancedRedoButton";
  redo.type = "button";
  redo.className = "button button-ghost button-icon";
  redo.title = "やり直す（Ctrl / ⌘ + Y）";
  redo.setAttribute("aria-label", "やり直す");
  redo.textContent = "↷";
  group.append(undo, redo);
  headerActions.insertBefore(group, fitButton);

  undo.addEventListener("click", () => restoreHistory(advanced.history.index - 1));
  redo.addEventListener("click", () => restoreHistory(advanced.history.index + 1));

  const canvas = document.querySelector("#editorCanvas");
  canvas?.addEventListener("pointerup", () => setTimeout(recordHistory, 0));
  for (const input of document.querySelectorAll("#cropXInput, #cropYInput, #cropWidthInput, #cropHeightInput")) {
    input.addEventListener("change", () => setTimeout(recordHistory, 0));
  }
  for (const selector of ["#resetCropButton", "#aspectRatioSelect", "[data-align-crop]"]) {
    for (const element of document.querySelectorAll(selector)) {
      element.addEventListener("click", () => setTimeout(recordHistory, 0));
      element.addEventListener("change", () => setTimeout(recordHistory, 0));
    }
  }

  window.addEventListener("keydown", (event) => {
    const command = event.ctrlKey || event.metaKey;
    if (!command) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      restoreHistory(advanced.history.index - 1);
    } else if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      restoreHistory(advanced.history.index + 1);
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.key.startsWith("Arrow")) recordHistory();
  });

  const fileMeta = document.querySelector("#fileMeta");
  if (fileMeta) {
    let previous = fileMeta.textContent;
    new MutationObserver(() => {
      const current = fileMeta.textContent;
      if (current !== previous) {
        previous = current;
        setTimeout(resetHistory, 0);
      }
    }).observe(fileMeta, { childList: true, characterData: true, subtree: true });
  }
  updateHistoryButtons();
}

function transformCropForRotation(crop, oldWidth, oldHeight, direction) {
  if (direction > 0) {
    return {
      x: oldHeight - (crop.y + crop.height),
      y: crop.x,
      width: crop.height,
      height: crop.width,
    };
  }
  return {
    x: crop.y,
    y: oldWidth - (crop.x + crop.width),
    width: crop.height,
    height: crop.width,
  };
}

function updateRotationIndicator() {
  const indicator = document.querySelector("#rotationIndicator");
  if (!indicator) return;
  const isPdf = !document.querySelector("#pdfPanel")?.classList.contains("is-hidden");
  const turns = isPdf ? advanced.pdfRotation : advanced.imageRotation;
  indicator.textContent = `${(turns * 90) % 360}°`;
}

function rotateCanvasQuarter(direction, { updatePersistentRotation = true, preserveNormalizedCrop = null } = {}) {
  const canvas = getSourceCanvas();
  if (!canvas?.width || !canvas?.height || advanced.applyingRotation) return;
  advanced.applyingRotation = true;
  try {
    const oldWidth = canvas.width;
    const oldHeight = canvas.height;
    const oldCrop = readCrop();
    const temp = createCanvas();
    temp.width = oldHeight;
    temp.height = oldWidth;
    const tempContext = temp.getContext("2d", { alpha: true });
    tempContext.translate(temp.width / 2, temp.height / 2);
    tempContext.rotate((direction * Math.PI) / 2);
    tempContext.drawImage(canvas, -oldWidth / 2, -oldHeight / 2);

    canvas.width = temp.width;
    canvas.height = temp.height;
    const context = canvas.getContext("2d", { alpha: true });
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(temp, 0, 0);

    let nextCrop = transformCropForRotation(oldCrop, oldWidth, oldHeight, direction);
    if (preserveNormalizedCrop) {
      nextCrop = {
        x: preserveNormalizedCrop.x * canvas.width,
        y: preserveNormalizedCrop.y * canvas.height,
        width: preserveNormalizedCrop.width * canvas.width,
        height: preserveNormalizedCrop.height * canvas.height,
      };
    }
    writeCrop(nextCrop, { record: false });
    document.querySelector("#fitButton")?.click();
    if (updatePersistentRotation) {
      const isPdf = !document.querySelector("#pdfPanel")?.classList.contains("is-hidden");
      if (isPdf) advanced.pdfRotation = (advanced.pdfRotation + direction + 4) % 4;
      else advanced.imageRotation = (advanced.imageRotation + direction + 4) % 4;
    }
    updateRotationIndicator();
    resetHistory();
  } finally {
    advanced.applyingRotation = false;
  }
}

function applyStoredPdfRotation(preserveNormalizedCrop = null) {
  if (!advanced.pdfRotation) return;
  for (let index = 0; index < advanced.pdfRotation; index += 1) {
    rotateCanvasQuarter(1, {
      updatePersistentRotation: false,
      preserveNormalizedCrop: index === advanced.pdfRotation - 1 ? preserveNormalizedCrop : null,
    });
  }
}

function trimWhitespace() {
  const source = getSourceCanvas();
  const crop = constrainCrop(readCrop());
  if (!source || !crop.width || !crop.height) return;

  const maxPreviewDimension = 1800;
  const scale = Math.min(1, maxPreviewDimension / Math.max(crop.width, crop.height));
  const preview = createCanvas();
  preview.width = Math.max(1, Math.round(crop.width * scale));
  preview.height = Math.max(1, Math.round(crop.height * scale));
  const context = preview.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, preview.width, preview.height);

  let pixels;
  try {
    pixels = context.getImageData(0, 0, preview.width, preview.height).data;
  } catch {
    showToast("余白を解析できませんでした。");
    return;
  }

  const sample = (x, y) => {
    const index = (y * preview.width + x) * 4;
    return [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
  };
  const corners = [
    sample(0, 0),
    sample(preview.width - 1, 0),
    sample(0, preview.height - 1),
    sample(preview.width - 1, preview.height - 1),
  ];
  const background = [0, 1, 2, 3].map((channel) =>
    Math.round(corners.reduce((total, color) => total + color[channel], 0) / corners.length),
  );
  const transparentBackground = background[3] < 24;
  const tolerance = 30;
  let minX = preview.width;
  let minY = preview.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < preview.height; y += 1) {
    for (let x = 0; x < preview.width; x += 1) {
      const index = (y * preview.width + x) * 4;
      const alpha = pixels[index + 3];
      const isContent = transparentBackground
        ? alpha > 18
        : Math.max(
            Math.abs(pixels[index] - background[0]),
            Math.abs(pixels[index + 1] - background[1]),
            Math.abs(pixels[index + 2] - background[2]),
            Math.abs(alpha - background[3]),
          ) > tolerance;
      if (isContent) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    showToast("削除できる余白を見つけられませんでした。");
    return;
  }
  const inverseScale = 1 / scale;
  const margin = Math.max(1, Math.round(inverseScale * 2));
  writeCrop({
    x: crop.x + minX * inverseScale - margin,
    y: crop.y + minY * inverseScale - margin,
    width: (maxX - minX + 1) * inverseScale + margin * 2,
    height: (maxY - minY + 1) * inverseScale + margin * 2,
  });
  showToast("周囲の余白を削除しました。");
}

function saveAdvancedSettings() {
  try {
    localStorage.setItem(
      ADVANCED_SETTINGS_KEY,
      JSON.stringify({ grid: document.querySelector("#advancedGridToggle")?.checked !== false }),
    );
  } catch {
    // Local storage may be blocked.
  }
}

function loadAdvancedSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(ADVANCED_SETTINGS_KEY) || "null");
    if (settings && document.querySelector("#advancedGridToggle")) {
      document.querySelector("#advancedGridToggle").checked = settings.grid !== false;
    }
  } catch {
    // Ignore malformed settings.
  }
}

export function initializeTransformControls() {
  const alignment = document.querySelector(".alignment-controls");
  if (!alignment || document.querySelector("#advancedTransformControls")) return;
  const controls = document.createElement("div");
  controls.id = "advancedTransformControls";
  controls.className = "transform-controls";
  controls.innerHTML = `
    <button id="rotateLeftButton" class="tool-button" type="button" disabled>↶ 左90°</button>
    <button id="rotateRightButton" class="tool-button" type="button" disabled>↷ 右90°</button>
    <button id="trimWhitespaceButton" class="tool-button tool-button-wide" type="button" disabled>余白を自動削除</button>
    <span id="rotationIndicator" class="rotation-indicator">0°</span>
  `;
  alignment.before(controls);

  const gridLabel = document.createElement("label");
  gridLabel.className = "check-field";
  gridLabel.innerHTML = '<input id="advancedGridToggle" type="checkbox" checked disabled /><span>3分割グリッドを表示</span>';
  alignment.after(gridLabel);

  document.querySelector("#rotateLeftButton")?.addEventListener("click", () => rotateCanvasQuarter(-1));
  document.querySelector("#rotateRightButton")?.addEventListener("click", () => rotateCanvasQuarter(1));
  document.querySelector("#trimWhitespaceButton")?.addEventListener("click", trimWhitespace);
  document.querySelector("#advancedGridToggle")?.addEventListener("change", () => {
    saveAdvancedSettings();
    document.querySelector("#fitButton")?.click();
    scheduleOverlay();
  });

  const xInput = document.querySelector("#cropXInput");
  const syncDisabled = () => {
    const disabled = xInput?.disabled ?? true;
    for (const id of ["rotateLeftButton", "rotateRightButton", "trimWhitespaceButton", "advancedGridToggle"]) {
      const control = document.querySelector(`#${id}`);
      if (control) control.disabled = disabled;
    }
  };
  if (xInput) {
    new MutationObserver(syncDisabled).observe(xInput, { attributes: true, attributeFilter: ["disabled"] });
  }
  syncDisabled();

  const help = alignment.parentElement?.querySelector(".help-text");
  if (help) {
    help.textContent =
      "枠内ドラッグで移動。Shift＋枠内ドラッグで水平・垂直移動。Shift＋ハンドル操作で中心を保ったまま対称にサイズ変更。";
  }
  loadAdvancedSettings();
}

function addSelectOption(select, value, label, { beforeValue = null } = {}) {
  if (!select || [...select.options].some((option) => option.value === value)) return;
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  if (beforeValue) {
    const target = [...select.options].find((item) => item.value === beforeValue);
    if (target) {
      select.insertBefore(option, target);
      return;
    }
  }
  select.append(option);
}

export function enhanceSelectOptions() {
  const aspect = document.querySelector("#aspectRatioSelect");
  addSelectOption(aspect, "0.5625", "9 : 16", { beforeValue: "source" });
  addSelectOption(aspect, "0.7071067812", "A判（縦）", { beforeValue: "source" });
  addSelectOption(aspect, "1.4142135624", "A判（横）", { beforeValue: "source" });
  const scale = document.querySelector("#exportScaleSelect");
  if (scale && ![...scale.options].some((option) => option.value === "0.5")) {
    const option = document.createElement("option");
    option.value = "0.5";
    option.textContent = "0.5倍";
    scale.insertBefore(option, scale.firstElementChild);
  }
}

export function initializePdfRotationPersistence() {
  const loading = document.querySelector("#loadingOverlay");
  const fileName = document.querySelector("#fileName");
  if (!loading) return;

  let wasLoading = !loading.classList.contains("is-hidden");
  new MutationObserver(() => {
    const isLoading = !loading.classList.contains("is-hidden");
    const isPdf = !document.querySelector("#pdfPanel")?.classList.contains("is-hidden");
    if (isLoading && !wasLoading && isPdf && advanced.pdfRotation) {
      const source = readSourceSize();
      const crop = readCrop();
      const page = Number(document.querySelector("#pageNumberInput")?.value || 1);
      if (source && page === advanced.lastPdfPage) {
        advanced.pendingPdfCrop = {
          x: crop.x / source.width,
          y: crop.y / source.height,
          width: crop.width / source.width,
          height: crop.height / source.height,
        };
      } else {
        advanced.pendingPdfCrop = null;
      }
    }
    if (!isLoading && wasLoading && isPdf && advanced.pdfRotation) {
      requestAnimationFrame(() => {
        applyStoredPdfRotation(advanced.pendingPdfCrop);
        advanced.pendingPdfCrop = null;
        advanced.lastPdfPage = Number(document.querySelector("#pageNumberInput")?.value || 1);
      });
    }
    wasLoading = isLoading;
  }).observe(loading, { attributes: true, attributeFilter: ["class"] });

  if (fileName) {
    let previousName = fileName.textContent;
    new MutationObserver(() => {
      if (fileName.textContent !== previousName) {
        previousName = fileName.textContent;
        advanced.pdfRotation = 0;
        advanced.imageRotation = 0;
        advanced.pendingPdfCrop = null;
        advanced.lastPdfPage = 1;
        updateRotationIndicator();
      }
    }).observe(fileName, { childList: true, characterData: true, subtree: true });
  }
}

export function enhanceShortcuts() {
  const list = document.querySelector(".shortcuts-panel dl");
  if (!list || document.querySelector("#advancedShortcutUndo")) return;
  const entries = [
    ["Ctrl / ⌘ + Z", "元に戻す", "advancedShortcutUndo"],
    ["Ctrl / ⌘ + Y", "やり直す", "advancedShortcutRedo"],
  ];
  for (const [key, label, id] of entries) {
    const row = document.createElement("div");
    row.id = id;
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = label;
    row.append(dt, dd);
    list.prepend(row);
  }
}
