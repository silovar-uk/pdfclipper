import {
  advanced,
  PDFJS_URL,
  PDFJS_WORKER_URL,
  showToast,
} from "./shared.js";

const state = {
  pdfDocument: null,
  observer: null,
  generation: 0,
  renderedPages: new Set(),
};

function isPdfFile(file) {
  if (!(file instanceof File)) return false;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return file.type === "application/pdf" || extension === "pdf";
}

function ensureStylesheet() {
  if (document.querySelector('link[data-pdfclipper-thumbnails="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./thumbnails.css", import.meta.url).href;
  link.dataset.pdfclipperThumbnails = "true";
  document.head.append(link);
}

function ensureUi() {
  const pdfPanel = document.querySelector("#pdfPanel");
  if (!pdfPanel) return null;
  let section = document.querySelector("#pdfThumbnailSection");
  if (section) return section;

  section = document.createElement("details");
  section.id = "pdfThumbnailSection";
  section.className = "pdf-thumbnail-section is-hidden";
  section.open = true;
  section.innerHTML = `
    <summary>
      <span>ページ一覧</span>
      <span id="pdfThumbnailCount" class="pdf-thumbnail-count">0</span>
    </summary>
    <p id="pdfThumbnailStatus" class="pdf-thumbnail-status">PDFを読み込んでいます…</p>
    <div id="pdfThumbnailList" class="pdf-thumbnail-list" aria-label="PDFページ一覧"></div>
  `;
  pdfPanel.append(section);
  return section;
}

function clearThumbnails({ hide = false } = {}) {
  state.generation += 1;
  state.observer?.disconnect();
  state.observer = null;
  const previousDocument = state.pdfDocument;
  state.pdfDocument = null;
  previousDocument?.destroy?.().catch?.(() => {});
  state.renderedPages.clear();
  document.querySelector("#pdfThumbnailList")?.replaceChildren();
  const status = document.querySelector("#pdfThumbnailStatus");
  if (status) status.textContent = "PDFを読み込んでいます…";
  const count = document.querySelector("#pdfThumbnailCount");
  if (count) count.textContent = "0";
  if (hide) document.querySelector("#pdfThumbnailSection")?.classList.add("is-hidden");
}

function syncActivePage() {
  const currentPage = Number(document.querySelector("#pageNumberInput")?.value || 1);
  for (const button of document.querySelectorAll("[data-pdf-thumbnail-page]")) {
    const active = Number(button.dataset.pdfThumbnailPage) === currentPage;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
    if (active && button.dataset.userSelected === "true") {
      button.scrollIntoView({ block: "nearest", behavior: "smooth" });
      delete button.dataset.userSelected;
    }
  }
}

async function renderThumbnail(button, pageNumber, generation) {
  if (!state.pdfDocument || generation !== state.generation || state.renderedPages.has(pageNumber)) return;
  state.renderedPages.add(pageNumber);
  button.dataset.loading = "true";

  try {
    const page = await state.pdfDocument.getPage(pageNumber);
    if (generation !== state.generation) return;
    const baseViewport = page.getViewport({ scale: 1 });
    const maxWidth = 120;
    const maxHeight = 150;
    const scale = Math.min(maxWidth / baseViewport.width, maxHeight / baseViewport.height);
    const viewport = page.getViewport({ scale });
    const canvas = button.querySelector("canvas");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(viewport.width * dpr));
    canvas.height = Math.max(1, Math.round(viewport.height * dpr));
    canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: context,
      viewport,
      transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0],
    }).promise;
    if (generation !== state.generation) return;
    button.classList.add("is-rendered");
  } catch (error) {
    console.error(error);
    button.classList.add("has-error");
    state.renderedPages.delete(pageNumber);
  } finally {
    delete button.dataset.loading;
  }
}

function observeThumbnailButtons(list, generation) {
  const buttons = [...list.querySelectorAll("[data-pdf-thumbnail-page]")];
  if (!("IntersectionObserver" in window)) {
    buttons.forEach((button, index) => {
      if (index < 12) renderThumbnail(button, Number(button.dataset.pdfThumbnailPage), generation);
    });
    list.addEventListener(
      "scroll",
      () => {
        for (const button of buttons) {
          const listRect = list.getBoundingClientRect();
          const buttonRect = button.getBoundingClientRect();
          if (buttonRect.bottom >= listRect.top - 160 && buttonRect.top <= listRect.bottom + 160) {
            renderThumbnail(button, Number(button.dataset.pdfThumbnailPage), generation);
          }
        }
      },
      { passive: true },
    );
    return;
  }

  state.observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const button = entry.target;
        const pageNumber = Number(button.dataset.pdfThumbnailPage);
        state.observer.unobserve(button);
        renderThumbnail(button, pageNumber, generation);
      }
    },
    { root: list, rootMargin: "180px 0px", threshold: 0.01 },
  );

  for (const button of buttons) state.observer.observe(button);
}

function buildThumbnailPlaceholders(pageCount, generation) {
  const list = document.querySelector("#pdfThumbnailList");
  const status = document.querySelector("#pdfThumbnailStatus");
  const count = document.querySelector("#pdfThumbnailCount");
  if (!list || !status || !count) return;

  list.replaceChildren();
  count.textContent = String(pageCount);
  status.classList.add("is-hidden");
  const fragment = document.createDocumentFragment();

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pdf-thumbnail-button";
    button.dataset.pdfThumbnailPage = String(pageNumber);
    button.setAttribute("aria-label", `${pageNumber}ページを表示`);
    button.innerHTML = `
      <span class="pdf-thumbnail-canvas-wrap"><canvas aria-hidden="true"></canvas></span>
      <span class="pdf-thumbnail-label">${pageNumber}</span>
    `;
    button.addEventListener("click", () => {
      const input = document.querySelector("#pageNumberInput");
      if (!input) return;
      button.dataset.userSelected = "true";
      input.value = String(pageNumber);
      input.dispatchEvent(new Event("change", { bubbles: true }));
      syncActivePage();
    });
    fragment.append(button);
  }
  list.append(fragment);
  state.observer?.disconnect();
  observeThumbnailButtons(list, generation);
  syncActivePage();
}

async function loadPdfThumbnails(file) {
  const section = ensureUi();
  if (!section) return;
  if (!isPdfFile(file)) {
    clearThumbnails({ hide: true });
    return;
  }

  clearThumbnails();
  section.classList.remove("is-hidden");
  const generation = state.generation;
  const status = document.querySelector("#pdfThumbnailStatus");
  if (status) {
    status.classList.remove("is-hidden");
    status.textContent = "ページ一覧を準備しています…";
  }

  try {
    const pdfjsLib = await import(PDFJS_URL);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    const data = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDocument = await loadingTask.promise;
    if (generation !== state.generation) {
      pdfDocument.destroy?.();
      return;
    }
    state.pdfDocument = pdfDocument;
    buildThumbnailPlaceholders(pdfDocument.numPages, generation);
  } catch (error) {
    console.error(error);
    if (generation !== state.generation) return;
    if (status) {
      status.classList.remove("is-hidden");
      status.textContent = "ページ一覧を読み込めませんでした。";
    }
    showToast("PDFのページ一覧を読み込めませんでした。");
  }
}

export function initializePdfThumbnails() {
  ensureStylesheet();
  ensureUi();

  window.addEventListener("pdfclipper:source-file", (event) => {
    loadPdfThumbnails(event.detail?.file);
  });

  const statusBar = document.querySelector("#statusBar");
  if (statusBar) {
    new MutationObserver(syncActivePage).observe(statusBar, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  for (const selector of ["#prevPageButton", "#nextPageButton", "#pageNumberInput"]) {
    document.querySelector(selector)?.addEventListener("click", () => setTimeout(syncActivePage, 0));
    document.querySelector(selector)?.addEventListener("change", () => setTimeout(syncActivePage, 0));
  }

  if (advanced.sourceFile) loadPdfThumbnails(advanced.sourceFile);
}

export function disposePdfThumbnails() {
  clearThumbnails({ hide: true });
}
