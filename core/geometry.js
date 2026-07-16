export const DEFAULT_MIN_CROP_SIZE = 4;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeCrop(crop = {}) {
  const x = finiteNumber(crop.x);
  const y = finiteNumber(crop.y);
  const width = finiteNumber(crop.width);
  const height = finiteNumber(crop.height);
  const x1 = Math.min(x, x + width);
  const y1 = Math.min(y, y + height);
  const x2 = Math.max(x, x + width);
  const y2 = Math.max(y, y + height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function constrainCropToSource(
  crop,
  source,
  { minSize = DEFAULT_MIN_CROP_SIZE } = {},
) {
  const normalized = normalizeCrop(crop);
  const sourceWidth = Math.max(0, finiteNumber(source?.width));
  const sourceHeight = Math.max(0, finiteNumber(source?.height));
  if (!sourceWidth || !sourceHeight) return normalized;

  const minimumWidth = Math.min(Math.max(0, finiteNumber(minSize)), sourceWidth);
  const minimumHeight = Math.min(Math.max(0, finiteNumber(minSize)), sourceHeight);
  const width = clamp(normalized.width, minimumWidth, sourceWidth);
  const height = clamp(normalized.height, minimumHeight, sourceHeight);
  return {
    x: clamp(normalized.x, 0, Math.max(0, sourceWidth - width)),
    y: clamp(normalized.y, 0, Math.max(0, sourceHeight - height)),
    width,
    height,
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

export function scaleCropBetweenSources(crop, fromSource, toSource) {
  const fromWidth = finiteNumber(fromSource?.width);
  const fromHeight = finiteNumber(fromSource?.height);
  const toWidth = finiteNumber(toSource?.width);
  const toHeight = finiteNumber(toSource?.height);
  if (!fromWidth || !fromHeight || !toWidth || !toHeight) return normalizeCrop(crop);
  return constrainCropToSource(
    {
      x: (crop.x / fromWidth) * toWidth,
      y: (crop.y / fromHeight) * toHeight,
      width: (crop.width / fromWidth) * toWidth,
      height: (crop.height / fromHeight) * toHeight,
    },
    { width: toWidth, height: toHeight },
  );
}

export function transformCropForRotation(crop, source, direction = 1) {
  const normalized = constrainCropToSource(crop, source);
  const width = finiteNumber(source?.width);
  const height = finiteNumber(source?.height);
  const clockwise = direction >= 0;
  const transformed = clockwise
    ? {
        x: height - (normalized.y + normalized.height),
        y: normalized.x,
        width: normalized.height,
        height: normalized.width,
      }
    : {
        x: normalized.y,
        y: width - (normalized.x + normalized.width),
        width: normalized.height,
        height: normalized.width,
      };
  return constrainCropToSource(transformed, { width: height, height: width });
}

export function resizeSymmetricCrop({
  handle,
  startCrop,
  dx = 0,
  dy = 0,
  source,
  ratio = null,
  minSize = DEFAULT_MIN_CROP_SIZE,
}) {
  const crop = constrainCropToSource(startCrop, source, { minSize });
  const centerX = crop.x + crop.width / 2;
  const centerY = crop.y + crop.height / 2;
  const maxHalfWidth = Math.min(centerX, source.width - centerX);
  const maxHalfHeight = Math.min(centerY, source.height - centerY);
  let halfWidth = crop.width / 2;
  let halfHeight = crop.height / 2;

  if (handle.includes("w")) halfWidth -= dx;
  if (handle.includes("e")) halfWidth += dx;
  if (handle.includes("n")) halfHeight -= dy;
  if (handle.includes("s")) halfHeight += dy;

  halfWidth = clamp(halfWidth, Math.min(minSize / 2, maxHalfWidth), maxHalfWidth);
  halfHeight = clamp(halfHeight, Math.min(minSize / 2, maxHalfHeight), maxHalfHeight);

  if (ratio && Number.isFinite(ratio) && ratio > 0 && handle.length === 2) {
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

  return constrainCropToSource(
    {
      x: centerX - halfWidth,
      y: centerY - halfHeight,
      width: halfWidth * 2,
      height: halfHeight * 2,
    },
    source,
    { minSize },
  );
}
