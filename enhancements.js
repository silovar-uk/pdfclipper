// app.js keeps editor state inside its module. Observe only the editor canvas
// so these optional controls can stay separate from the PDF/image loading engine.
const geometry = {
  sourceRect: null,
  cropRect: null,
};

const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
const originalStrokeRect = CanvasRenderingContext2D.prototype.strokeRect;

CanvasRenderingContext2D.prototype.drawImage = function (...args) {
  if (this.canvas?.id === "editorCanvas" && args.length === 5) {
    const [, x, y, width, height] = args;
    geometry.sourceRect = { x, y, width, height };
  }
  return originalDrawImage.apply(this, args);
};

CanvasRenderingContext2D.prototype.strokeRect = function (x, y, width, height) {
  if (this.canvas?.id === "editorCanvas" && this.lineWidth >= 2) {
    geometry.cropRect = { x, y, width, height };
  }
  return originalStrokeRect.call(this, x, y, width, height);
};

const MIN_CROP_SIZE = 4;
const HANDLE_THRESHOLD = 14;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readNumber(input) {
  const value = Number(input?.value);
  return Number.isFinite(value) ? value : 0;
}

function readSourceSize() {
  const text = document.querySelector("#fileMeta")?.textContent || "";
  const match = text.match(/([\d,]+)\s*×\s*([\d,]+)\s*px/);
  if (!match) return null;
  return {
    width: Number(match[1].replaceAll(",", "")),
    height: Number(match[2].replaceAll(",", "")),
  };
}

function readCrop() {
  return {
    x: readNumber(document.querySelector("#cropXInput")),
    y: readNumber(document.querySelector("#cropYInput")),
    width: readNumber(document.querySelector("#cropWidthInput")),
    height: readNumber(document.querySelector("#cropHeightInput")),
  };
}

function writeCrop(crop) {
  const xInput = document.querySelector("#cropXInput");
  const yInput = document.querySelector("#cropYInput");
  const widthInput = document.querySelector("#cropWidthInput");
  const heightInput = document.querySelector("#cropHeightInput");
  if (!xInput || !yInput || !widthInput || !heightInput) return;

  xInput.value = String(crop.x);
  yInput.value = String(crop.y);
  widthInput.value = String(crop.width);
  heightInput.value = String(crop.height);
  xInput.dispatchEvent(new Event("change", { bubbles: true }));
}

function readAspectRatio() {
  const select = document.querySelector("#aspectRatioSelect");
  const source = readSourceSize();
  if (!select || select.value === "free") return null;
  if (select.value === "source") {
    return source && source.height > 0 ? source.width / source.height : null;
  }
  const ratio = Number(select.value);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

function constrainCrop(crop, source) {
  const width = clamp(crop.width, MIN_CROP_SIZE, source.width);
  const height = clamp(crop.height, MIN_CROP_SIZE, source.height);
  return {
    x: clamp(crop.x, 0, source.width - width),
    y: clamp(crop.y, 0, source.height - height),
    width,
    height,
  };
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
    if (halfWidth / halfHeight > ratio) {
      halfHeight = halfWidth / ratio;
    } else {
      halfWidth = halfHeight * ratio;
    }

    if (halfWidth > maxHalfWidth) {
      halfWidth = maxHalfWidth;
      halfHeight = halfWidth / ratio;
    }
    if (halfHeight > maxHalfHeight) {
      halfHeight = maxHalfHeight;
      halfWidth = halfHeight * ratio;
    }

    halfWidth = Math.max(MIN_CROP_SIZE / 2, halfWidth);
    halfHeight = Math.max(MIN_CROP_SIZE / 2, halfHeight);
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

function alignCrop(direction) {
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

function initializeAlignmentButtons() {
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

function initializeShiftInteractions() {
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
      if (!event.shiftKey || event.button !== 0 || !geometry.cropRect || panModeActive) return;
      const source = readSourceSize();
      if (!source) return;
      const point = getPoint(event);
      const hit = hitTest(point, geometry.cropRect);
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
        startScreenCrop: { ...geometry.cropRect },
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
  };

  canvas.addEventListener("pointerup", finishInteraction, true);
  canvas.addEventListener("pointercancel", finishInteraction, true);
  window.addEventListener("blur", () => {
    interaction = null;
    canvas.style.cursor = "default";
  });
}

initializeAlignmentButtons();
initializeShiftInteractions();
