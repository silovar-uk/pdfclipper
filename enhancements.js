// PDF Clipper advanced bootstrap.
// Runs before app.js to keep a reference to the editor's private source canvas.
const advanced = {
  sourceCanvas: null,
  pdfRotation: 0,
  imageRotation: 0,
  applyingRotation: false,
  pendingPdfCrop: null,
  lastPdfPage: 1,
  clips: [],
  history: { items: [], index: -1, suppress: false },
  overlayScheduled: false,
  geometry: { sourceRect: null, cropRect: null },
};

const originalCreateElement = Document.prototype.createElement;
const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
const originalStrokeRect = CanvasRenderingContext2D.prototype.strokeRect;

advanced.originalCreateElement = originalCreateElement;
advanced.originalDrawImage = originalDrawImage;
advanced.originalStrokeRect = originalStrokeRect;
window.PDFClipperAdvanced = advanced;

Document.prototype.createElement = function (tagName, options) {
  const element = originalCreateElement.call(this, tagName, options);
  if (!advanced.sourceCanvas && String(tagName).toLowerCase() === "canvas") {
    advanced.sourceCanvas = element;
  }
  return element;
};

CanvasRenderingContext2D.prototype.drawImage = function (...args) {
  if (this.canvas?.id === "editorCanvas" && args.length === 5) {
    const [, x, y, width, height] = args;
    advanced.geometry.sourceRect = { x, y, width, height };
  }
  return originalDrawImage.apply(this, args);
};

CanvasRenderingContext2D.prototype.strokeRect = function (x, y, width, height) {
  if (this.canvas?.id === "editorCanvas" && this.lineWidth >= 2) {
    advanced.geometry.cropRect = { x, y, width, height };
    advanced.scheduleOverlay?.();
  }
  return originalStrokeRect.call(this, x, y, width, height);
};

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => import("./advanced/init.js"), 0);
});
