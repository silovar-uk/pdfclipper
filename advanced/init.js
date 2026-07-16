import { advanced } from "./shared.js";
import {
  initializeAlignmentButtons,
  initializeShiftInteractions,
  scheduleOverlay,
} from "./overlay.js";
import {
  enhanceSelectOptions,
  enhanceShortcuts,
  initializeHistory,
  initializePdfRotationPersistence,
  initializeTransformControls,
  recordHistory,
} from "./history-transform.js";
import { disposeOutputTools, initializeOutputTools } from "./output.js";

function initializeAdvancedFeatures() {
  Document.prototype.createElement = advanced.originalCreateElement;
  advanced.scheduleOverlay = scheduleOverlay;
  advanced.recordHistory = recordHistory;

  enhanceSelectOptions();
  initializeAlignmentButtons();
  initializeTransformControls();
  initializeOutputTools();
  initializeHistory();
  initializeShiftInteractions();
  initializePdfRotationPersistence();
  enhanceShortcuts();
  scheduleOverlay();
}

initializeAdvancedFeatures();
window.addEventListener("beforeunload", disposeOutputTools);
