import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, css, layoutScript, thumbnailsScript] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../layout.css", import.meta.url), "utf8"),
  readFile(new URL("../layout.js", import.meta.url), "utf8"),
  readFile(new URL("../advanced/thumbnails.js", import.meta.url), "utf8"),
]);

test("desktop shell contains page rail, workspace, and inspector", () => {
  const pageRailIndex = html.indexOf('id="pageRail"');
  const workspaceIndex = html.indexOf('class="workspace"');
  const sidebarIndex = html.indexOf('class="sidebar"');
  assert.ok(pageRailIndex >= 0);
  assert.ok(workspaceIndex > pageRailIndex);
  assert.ok(sidebarIndex > workspaceIndex);
});

test("inspector has independent scroll area and fixed action dock", () => {
  assert.match(html, /class="sidebar-scroll"/);
  assert.match(html, /class="sidebar-dock"/);
  assert.match(css, /\.sidebar-scroll\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.sidebar\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) auto/s);
});

test("mobile layout keeps canvas and exposes bottom navigation", () => {
  assert.match(html, /class="mobile-nav"/);
  assert.match(html, /id="mobilePagesButton"/);
  assert.match(html, /id="mobileSettingsButton"/);
  assert.match(css, /body\.mobile-settings-open \.sidebar/);
  assert.match(css, /body\.mobile-pages-open \.page-rail/);
});

test("PDF thumbnails mount in the dedicated page rail", () => {
  assert.match(thumbnailsScript, /querySelector\("#pageRailContent"\)/);
  assert.doesNotMatch(thumbnailsScript, /pdfPanel\.append/);
});

test("fixed action buttons delegate to original editor actions", () => {
  assert.match(layoutScript, /clickOriginal\("#exportButton"\)/);
  assert.match(layoutScript, /clickOriginal\("#copyCropButton"\)/);
  assert.match(layoutScript, /clickOriginal\("#addClipButton"\)/);
});
