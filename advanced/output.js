import {
  advanced,
  baseName,
  canvasToBlob,
  constrainCrop,
  createCanvas,
  downloadBlob,
  getSourceCanvas,
  JSZIP_URL,
  readCrop,
  safeOutputName,
  showToast,
} from "./shared.js";

async function buildCurrentOutput({ forcePng = false } = {}) {
  const source = getSourceCanvas();
  const crop = constrainCrop(readCrop());
  if (!source || !crop.width || !crop.height) throw new Error("書き出す範囲を選択してください。");
  const scale = Number(document.querySelector("#exportScaleSelect")?.value) || 1;
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));
  if (width * height > 100_000_000) {
    throw new Error("出力サイズが大きすぎます。倍率または範囲を小さくしてください。");
  }

  const selectedFormat = document.querySelector("#formatSelect")?.value || "png";
  const format = forcePng ? "png" : selectedFormat;
  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
  const extension = format === "jpeg" ? "jpg" : "png";
  const output = createCanvas();
  output.width = width;
  output.height = height;
  const context = output.getContext("2d", { alpha: format !== "jpeg" });
  if (format === "jpeg") {
    context.fillStyle = document.querySelector("#backgroundColorInput")?.value || "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  const quality = Number(document.querySelector("#qualityRange")?.value || 92) / 100;
  const blob = await canvasToBlob(output, mimeType, quality);
  const outputName = safeOutputName(document.querySelector("#outputNameInput")?.value || "clip");
  return { blob, name: `${outputName}.${extension}`, width, height, format };
}

async function copyCurrentCrop() {
  if (!window.ClipboardItem || !navigator.clipboard?.write) {
    showToast("このブラウザは画像コピーに対応していません。");
    return;
  }
  try {
    const result = await buildCurrentOutput({ forcePng: true });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": result.blob })]);
    showToast("切り抜きをPNGとしてコピーしました。");
  } catch (error) {
    console.error(error);
    showToast(error?.message || "画像をコピーできませんでした。");
  }
}

function incrementOutputName() {
  const input = document.querySelector("#outputNameInput");
  if (!input) return;
  const current = safeOutputName(input.value);
  const match = current.match(/^(.*?)(?:_(\d+))?$/);
  const prefix = match?.[1] || current;
  const next = match?.[2] ? Number(match[2]) + 1 : advanced.clips.length + 1;
  input.value = `${prefix}_${String(next).padStart(2, "0")}`;
}

async function addCurrentClip() {
  const button = document.querySelector("#addClipButton");
  try {
    if (button) button.disabled = true;
    const result = await buildCurrentOutput();
    const previewUrl = URL.createObjectURL(result.blob);
    advanced.clips.push({
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      ...result,
      previewUrl,
      page: document.querySelector("#pdfPanel")?.classList.contains("is-hidden")
        ? null
        : Number(document.querySelector("#pageNumberInput")?.value),
    });
    renderClipQueue();
    incrementOutputName();
    showToast(`${result.name} を書き出し候補に追加しました。`);
  } catch (error) {
    console.error(error);
    showToast(error?.message || "候補に追加できませんでした。");
  } finally {
    syncAdvancedDisabledState();
  }
}

function removeClip(id) {
  const index = advanced.clips.findIndex((clip) => clip.id === id);
  if (index < 0) return;
  URL.revokeObjectURL(advanced.clips[index].previewUrl);
  advanced.clips.splice(index, 1);
  renderClipQueue();
}

function clearClips() {
  for (const clip of advanced.clips) URL.revokeObjectURL(clip.previewUrl);
  advanced.clips = [];
  renderClipQueue();
}

function renderClipQueue() {
  const list = document.querySelector("#clipList");
  const count = document.querySelector("#clipCount");
  const empty = document.querySelector("#clipEmpty");
  const clear = document.querySelector("#clearClipsButton");
  const zip = document.querySelector("#exportZipButton");
  if (!list || !count || !empty || !clear || !zip) return;

  list.replaceChildren();
  count.textContent = String(advanced.clips.length);
  empty.classList.toggle("is-hidden", advanced.clips.length > 0);
  clear.disabled = advanced.clips.length === 0;
  zip.disabled = advanced.clips.length === 0;

  for (const clip of advanced.clips) {
    const item = document.createElement("article");
    item.className = "clip-item";
    const image = document.createElement("img");
    image.src = clip.previewUrl;
    image.alt = "";
    const body = document.createElement("div");
    body.className = "clip-item-body";
    const name = document.createElement("strong");
    name.textContent = clip.name;
    const meta = document.createElement("span");
    meta.textContent = `${clip.width.toLocaleString()} × ${clip.height.toLocaleString()} px${clip.page ? `・${clip.page}ページ` : ""}`;
    body.append(name, meta);
    const actions = document.createElement("div");
    actions.className = "clip-item-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "clip-save";
    save.textContent = "保存";
    save.addEventListener("click", () => downloadBlob(clip.blob, clip.name));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "clip-remove";
    remove.textContent = "削除";
    remove.addEventListener("click", () => removeClip(clip.id));
    actions.append(save, remove);
    item.append(image, body, actions);
    list.append(item);
  }
}

function uniqueZipName(name, used) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const extension = dot >= 0 ? name.slice(dot) : "";
  let index = 2;
  let candidate = `${base}_${index}${extension}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${base}_${index}${extension}`;
  }
  used.add(candidate);
  return candidate;
}

async function exportClipsAsZip() {
  if (!advanced.clips.length) return;
  const button = document.querySelector("#exportZipButton");
  try {
    button.disabled = true;
    button.textContent = "ZIPを作成中…";
    const module = await import(JSZIP_URL);
    const zip = new module.default();
    const used = new Set();
    for (const clip of advanced.clips) zip.file(uniqueZipName(clip.name, used), clip.blob);
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const sourceName = document.querySelector("#fileName")?.textContent || "pdfclipper";
    downloadBlob(blob, `${safeOutputName(baseName(sourceName))}_clips.zip`);
    showToast(`${advanced.clips.length}件をZIPで保存しました。`);
  } catch (error) {
    console.error(error);
    showToast("ZIPを作成できませんでした。通信環境を確認してください。");
  } finally {
    button.textContent = "ZIPでまとめて保存";
    renderClipQueue();
  }
}

function syncAdvancedDisabledState() {
  const disabled = document.querySelector("#cropXInput")?.disabled ?? true;
  for (const id of ["copyCropButton", "addClipButton"]) {
    const button = document.querySelector(`#${id}`);
    if (button) button.disabled = disabled;
  }
}

export function initializeOutputTools() {
  const exportButton = document.querySelector("#exportButton");
  if (!exportButton || document.querySelector("#copyCropButton")) return;
  const actions = document.createElement("div");
  actions.className = "secondary-actions";
  actions.innerHTML = `
    <button id="copyCropButton" class="button button-secondary" type="button" disabled>PNGをコピー</button>
    <button id="addClipButton" class="button button-secondary" type="button" disabled>候補に追加</button>
  `;
  exportButton.before(actions);
  document.querySelector("#copyCropButton")?.addEventListener("click", copyCurrentCrop);
  document.querySelector("#addClipButton")?.addEventListener("click", addCurrentClip);

  const panel = document.createElement("section");
  panel.className = "panel clips-panel";
  panel.innerHTML = `
    <div class="panel-title-row">
      <h2>書き出し候補 <span id="clipCount" class="count-badge">0</span></h2>
      <button id="clearClipsButton" class="text-button" type="button" disabled>すべて削除</button>
    </div>
    <p id="clipEmpty" class="clip-empty">複数の切り抜きをためて、最後にZIPでまとめて保存できます。</p>
    <div id="clipList" class="clip-list"></div>
    <button id="exportZipButton" class="button button-secondary button-full" type="button" disabled>ZIPでまとめて保存</button>
  `;
  exportButton.closest(".panel")?.after(panel);
  document.querySelector("#clearClipsButton")?.addEventListener("click", clearClips);
  document.querySelector("#exportZipButton")?.addEventListener("click", exportClipsAsZip);

  const xInput = document.querySelector("#cropXInput");
  if (xInput) {
    new MutationObserver(syncAdvancedDisabledState).observe(xInput, {
      attributes: true,
      attributeFilter: ["disabled"],
    });
  }
  syncAdvancedDisabledState();
  renderClipQueue();
}

export function disposeOutputTools() {
  for (const clip of advanced.clips) URL.revokeObjectURL(clip.previewUrl);
}
