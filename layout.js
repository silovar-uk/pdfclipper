const body = document.body;
const pageRail = document.querySelector("#pageRail");
const sidebar = document.querySelector(".sidebar");
const backdrop = document.querySelector("#panelBackdrop");
const desktopPageButton = document.querySelector("#pageRailHeaderButton");
const pageCloseButton = document.querySelector("#pageRailCloseButton");
const sidebarCloseButton = document.querySelector("#sidebarCloseButton");
const mobilePagesButton = document.querySelector("#mobilePagesButton");
const mobileSettingsButton = document.querySelector("#mobileSettingsButton");
const mobileQueueButton = document.querySelector("#mobileQueueButton");
const mobileExportButton = document.querySelector("#mobileExportButton");
const dockCopyButton = document.querySelector("#dockCopyButton");
const dockAddButton = document.querySelector("#dockAddButton");
const dockExportButton = document.querySelector("#dockExportButton");
const mobileQuery = window.matchMedia("(max-width: 900px)");

function closeMobilePanels() {
  body.classList.remove("mobile-settings-open", "mobile-pages-open");
  mobilePagesButton?.classList.remove("is-active");
  mobileSettingsButton?.classList.remove("is-active");
  mobileQueueButton?.classList.remove("is-active");
}

function openMobilePanel(type) {
  closeMobilePanels();
  if (type === "pages" && !pageRail?.classList.contains("is-hidden")) {
    body.classList.add("mobile-pages-open");
    mobilePagesButton?.classList.add("is-active");
  }
  if (type === "settings") {
    body.classList.add("mobile-settings-open");
    mobileSettingsButton?.classList.add("is-active");
  }
}

function togglePageRail() {
  if (mobileQuery.matches) {
    if (body.classList.contains("mobile-pages-open")) closeMobilePanels();
    else openMobilePanel("pages");
    return;
  }
  body.classList.toggle("page-rail-collapsed");
}

function openQueue() {
  openMobilePanel("settings");
  mobileQueueButton?.classList.add("is-active");
  mobileSettingsButton?.classList.remove("is-active");
  window.setTimeout(() => {
    const clipsPanel = document.querySelector(".clips-panel");
    clipsPanel?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, 80);
}

function clickOriginal(selector) {
  const original = document.querySelector(selector);
  if (original && !original.disabled) original.click();
}

function mirrorButton(target, source, { copyText = true } = {}) {
  if (!target) return;
  if (!source) {
    target.disabled = true;
    return;
  }
  target.disabled = Boolean(source.disabled);
  if (copyText) target.textContent = source.textContent?.trim() || target.textContent;
}

function syncActionButtons() {
  const originalExport = document.querySelector("#exportButton");
  const originalCopy = document.querySelector("#copyCropButton");
  const originalAdd = document.querySelector("#addClipButton");

  mirrorButton(dockExportButton, originalExport);
  mirrorButton(mobileExportButton, originalExport, { copyText: false });
  mirrorButton(dockCopyButton, originalCopy);
  mirrorButton(dockAddButton, originalAdd);
}

function syncPageRailState() {
  const available = Boolean(pageRail && !pageRail.classList.contains("is-hidden"));
  body.classList.toggle("has-page-rail", available);
  desktopPageButton?.classList.toggle("is-hidden", !available);
  if (mobilePagesButton) mobilePagesButton.disabled = !available;
  if (!available) {
    body.classList.remove("page-rail-collapsed", "mobile-pages-open");
    mobilePagesButton?.classList.remove("is-active");
  }
}

function handleViewportChange() {
  if (!mobileQuery.matches) closeMobilePanels();
  else body.classList.remove("page-rail-collapsed");
}

desktopPageButton?.addEventListener("click", togglePageRail);
pageCloseButton?.addEventListener("click", () => {
  if (mobileQuery.matches) closeMobilePanels();
  else body.classList.add("page-rail-collapsed");
});
sidebarCloseButton?.addEventListener("click", closeMobilePanels);
backdrop?.addEventListener("click", closeMobilePanels);
mobilePagesButton?.addEventListener("click", () => openMobilePanel("pages"));
mobileSettingsButton?.addEventListener("click", () => openMobilePanel("settings"));
mobileQueueButton?.addEventListener("click", openQueue);
mobileExportButton?.addEventListener("click", () => clickOriginal("#exportButton"));
dockExportButton?.addEventListener("click", () => clickOriginal("#exportButton"));
dockCopyButton?.addEventListener("click", () => clickOriginal("#copyCropButton"));
dockAddButton?.addEventListener("click", () => clickOriginal("#addClipButton"));

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMobilePanels();
});

mobileQuery.addEventListener?.("change", handleViewportChange);

const pageObserver = new MutationObserver(syncPageRailState);
if (pageRail) pageObserver.observe(pageRail, { attributes: true, attributeFilter: ["class"] });

const actionsObserver = new MutationObserver(syncActionButtons);
if (sidebar) {
  actionsObserver.observe(sidebar, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
    attributeFilter: ["disabled", "class"],
  });
}

syncPageRailState();
syncActionButtons();
handleViewportChange();
