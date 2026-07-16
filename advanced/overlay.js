import {
  advanced,
  clamp,
  constrainCrop,
  HANDLE_THRESHOLD,
  MIN_CROP_SIZE,
  readAspectRatio,
  readCrop,
  readSourceSize,
  writeCrop,
} from "./shared.js";

function roundedRect(context, x, y, width, height, radius) {
  if (typeof context.roundRect === "function") {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawAdvancedOverlay() {
  const canvas = document.querySelector("#editorCanvas");
  const cropRect = advanced.geometry.cropRect;
  if (!canvas || !cropRect || document.querySelector("#editorArea")?.classList.contains("is-hidden")) return;
  const context = canvas.getContext("2d");
  const gridEnabled = document.querySelector("#advancedGridToggle")?.checked;

  context.save();
  if (gridEnabled) {
    context.beginPath();
    context.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    context.clip();
    context.strokeStyle = "rgba(255, 255, 255, .56)";
    context.lineWidth = 1;
    context.setLineDash([5, 5]);
    for (const ratio of [1 / 3, 2 / 3]) {
      const x = cropRect.x + cropRect.width * ratio;
      const y = cropRect.y + cropRect.height * ratio;
      context.beginPath();
      context.moveTo(x, cropRect.y);
      context.lineTo(x, cropRect.y + cropRect.height);
      context.moveTo(cropRect.x, y);
      context.lineTo(cropRect.x + cropRect.width, y);
      context.stroke();
    }
  }
  context.restore();

  const crop = readCrop();
  const label = `${Math.round(crop.width).toLocaleString()} × ${Math.round(crop.height).toLocaleString()} px`;
  context.save();
  context.font = '600 12px Inter, "Noto Sans JP", sans-serif';
  const labelWidth = context.measureText(label).width + 16;
  const labelHeight = 26;
  const cssWidth = canvas.getBoundingClientRect().width;
  const x = clamp(cropRect.x, 6, Math.max(6, cssWidth - labelWidth - 6));
  const y = cropRect.y > labelHeight + 8 ? cropRect.y - labelHeight - 6 : cropRect.y + 6;
  context.fillStyle = "rgba(12, 13, 16, .88)";
  roundedRect(context, x, y, labelWidth, labelHeight, 7);
  context.fill();
  context.fillStyle = "#ffffff";
  context.fillText(label, x + 8, y + 17);
  context.restore();
}

export function scheduleOverlay() {
  if (advanced.overlayScheduled) return;
  advanced.overlayScheduled = true;
  requestAnimationFrame(() => {
    advanced.overlayScheduled = false;
    drawAdvancedOverlay();
  });
}

function getHandlePoints(rect) {
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

function hitTest(point, rect) {
  for (const [handle, position] of Object.entries(getHandlePoints(rect))) {
    if (
      Math.abs(point.x - position.x) <= HANDLE_THRESHOLD &&
      Math.abs(point.y - position.y) <= HANDLE_THRESHOLD
    ) {
      return { type: "resize", handle };
    }
  }
  if (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  ) {
    return { type: "move" };
  }
  return { type: "none" };
}

function resizeSymmetrically(handle, startCrop, dx, dy, source, ratio) {
  const centerX = startCrop.x + startCrop.width / 2;
  const centerY = startCrop.y + startCrop.height / 2;
  const maxHalfWidth = Math.min(centerX, source.width - centerX);
  const maxHalfHeight = Math.min(centerY, source.height - centerY);
  let halfWidth = startCrop.width / 2;
  let halfHeight = startCrop.height / 2;

  if (handle.includes("w")) halfWidth -= dx;
  if (handle.includes("e")) halfWidth += dx;
  if (handle.includes("n")) halfHeight -= dy;
  if (handle.includes("s")) halfHeight += dy;

  halfWidth = clamp(halfWidth, MIN_CROP_SIZE / 2, maxHalfWidth);
  halfHeight = clamp(halfHeight, MIN_CROP_SIZE / 2, maxHalfHeight);

  if (ratio && handle.length === 2) {
    if (halfWidth / halfHeight > ratio) halfHeight = halfWidth / ratio;
    else halfWidth = halfHeight * ratio;
    if (halfWidth > maxHalfWidth) {
      halfWidth = maxHalfWidth;
      halfHeight = halfWidth / ratio;
    }
    if (halfHeight > maxHalfHeight) {
      halfHeight = maxHalfHeight;
      halfWidth = halfHeight * ratio;
    }
  }

  return constrainCrop(
    {
      x: centerX - halfWidth,
      y: centerY - halfHeight,
      width: halfWidth * 2,
      height: halfHeight * 2,
    },
    source,
  );
}

export function initializeShiftInteractions() {
  const canvas = document.querySelector("#editorCanvas");
  if (!canvas) return;
  let interaction = null;

  const getPoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  canvas.addEventListener(
    "pointerdown",
    (event) => {
      const panModeActive = document.querySelector("#panModeButton")?.getAttribute("aria-pressed") === "true";
      if (!event.shiftKey || event.button !== 0 || !advanced.geometry.cropRect || panModeActive) return;
      const source = readSourceSize();
      if (!source) return;
      const point = getPoint(event);
      const hit = hitTest(point, advanced.geometry.cropRect);
      if (hit.type === "none") return;

      event.preventDefault();
      event.stopImmediatePropagation();
      canvas.setPointerCapture(event.pointerId);
      interaction = {
        type: hit.type,
        handle: hit.handle || null,
        pointerId: event.pointerId,
        startPoint: point,
        startCrop: readCrop(),
        startScreenCrop: { ...advanced.geometry.cropRect },
        source,
        axis: null,
      };
      const resizeCursors = {
        nw: "nwse-resize",
        se: "nwse-resize",
        ne: "nesw-resize",
        sw: "nesw-resize",
        n: "ns-resize",
        s: "ns-resize",
        e: "ew-resize",
        w: "ew-resize",
      };
      canvas.style.cursor = hit.type === "move" ? "move" : resizeCursors[hit.handle] || "crosshair";
    },
    true,
  );

  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!interaction || event.pointerId !== interaction.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const point = getPoint(event);
      const zoomX = interaction.startScreenCrop.width / interaction.startCrop.width;
      const zoomY = interaction.startScreenCrop.height / interaction.startCrop.height;
      const dx = (point.x - interaction.startPoint.x) / zoomX;
      const dy = (point.y - interaction.startPoint.y) / zoomY;

      if (interaction.type === "move") {
        const screenDx = point.x - interaction.startPoint.x;
        const screenDy = point.y - interaction.startPoint.y;
        if (!interaction.axis && Math.hypot(screenDx, screenDy) >= 4) {
          interaction.axis = Math.abs(screenDx) >= Math.abs(screenDy) ? "x" : "y";
        }
        const moveX = interaction.axis === "y" ? 0 : dx;
        const moveY = interaction.axis === "x" ? 0 : dy;
        writeCrop(
          constrainCrop(
            {
              ...interaction.startCrop,
              x: interaction.startCrop.x + moveX,
              y: interaction.startCrop.y + moveY,
            },
            interaction.source,
          ),
          { record: false },
        );
      } else {
        writeCrop(
          resizeSymmetrically(
            interaction.handle,
            interaction.startCrop,
            dx,
            dy,
            interaction.source,
            readAspectRatio(),
          ),
          { record: false },
        );
      }
    },
    true,
  );

  const finishInteraction = (event) => {
    if (!interaction || event.pointerId !== interaction.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    interaction = null;
    canvas.style.cursor = "default";
    advanced.recordHistory?.();
  };

  canvas.addEventListener("pointerup", finishInteraction, true);
  canvas.addEventListener("pointercancel", finishInteraction, true);
  window.addEventListener("blur", () => {
    interaction = null;
    canvas.style.cursor = "default";
  });
}

export function alignCrop(direction) {
  const source = readSourceSize();
  if (!source) return;
  const crop = constrainCrop(readCrop(), source);
  if (direction === "left") crop.x = 0;
  if (direction === "center-x") crop.x = (source.width - crop.width) / 2;
  if (direction === "right") crop.x = source.width - crop.width;
  if (direction === "top") crop.y = 0;
  if (direction === "center-y") crop.y = (source.height - crop.height) / 2;
  if (direction === "bottom") crop.y = source.height - crop.height;
  writeCrop(crop);
}

export function initializeAlignmentButtons() {
  const buttons = [...document.querySelectorAll("[data-align-crop]")];
  for (const button of buttons) {
    button.addEventListener("click", () => alignCrop(button.dataset.alignCrop));
  }
  const xInput = document.querySelector("#cropXInput");
  if (!xInput) return;
  const syncDisabled = () => {
    for (const button of buttons) button.disabled = xInput.disabled;
  };
  new MutationObserver(syncDisabled).observe(xInput, {
    attributes: true,
    attributeFilter: ["disabled"],
  });
  syncDisabled();
}
