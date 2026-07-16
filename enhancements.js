// PDF Clipper advanced bootstrap.
// Runs before app.js to retain the private source canvas and source file.
const advanced = {
  sourceCanvas: null,
  sourceFile: null,
  sourceVersion: 0,
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

function rememberSourceFile(file) {
  if (!(file instanceof File)) return;
  advanced.sourceFile = file;
  advanced.sourceVersion += 1;
  window.dispatchEvent(
    new CustomEvent("pdfclipper:source-file", {
      detail: { file, version: advanced.sourceVersion },
    }),
  );
}

// Capture before app.js clears the file input after starting its own load.
document.addEventListener(
  "change",
  (event) => {
    if (event.target?.id !== "fileInput") return;
    rememberSourceFile(event.target.files?.[0]);
  },
  true,
);

window.addEventListener(
  "drop",
  (event) => rememberSourceFile(event.dataTransfer?.files?.[0]),
  true,
);

window.addEventListener(
  "paste",
  (event) => {
    const item = [...(event.clipboardData?.items || [])].find((entry) => entry.kind === "file");
    rememberSourceFile(item?.getAsFile());
  },
  true,
);

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
