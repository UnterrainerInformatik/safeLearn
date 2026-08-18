/**
 * The screenshots the documentation shows, taken out of a real Obsidian.
 *
 * `docs-obsidian.md` here and the companion plugin's README both show what the
 * plugin does to a document. Those pictures go stale the moment a marking
 * changes, and a stale picture is worse than none: it documents a behaviour the
 * plugin no longer has. So they are produced by running the thing rather than by
 * someone remembering to crop a window - `npm run docs:screenshots` rebuilds
 * every one of them from the current sources.
 *
 * It is deliberately not `test/obsidian/harness.js`, though it drives Obsidian
 * the same way. That harness exists to make a check fail; this exists to make a
 * picture, and the two want different things out of the application. A check
 * wants the `md/` corpus in the vault and does not care what the window looks
 * like. A picture wants a vault holding nothing but the five documents below, a
 * fixed theme and font size so that two runs a year apart look alike, no inline
 * title and no sidebars in the frame, and a context menu that stays open instead
 * of being dismissed as soon as it has been read. Teaching one driver both jobs
 * would mean a check whose behaviour depends on options only the screenshots
 * use.
 *
 * What it does share is the two settings that say where things are, spelled the
 * same way, so that one installation is described once:
 *
 *   SAFELEARN_TEST_PLUGIN_DIR    The plugin checkout. Default: `AI/plugin`.
 *   SAFELEARN_TEST_OBSIDIAN_DIR  A directory holding Obsidian AppImages; the
 *                                highest version in it runs. Default:
 *                                `~/scripts/obsidian`.
 *   SAFELEARN_OBSIDIAN_APP       The application itself, when it is not an
 *                                AppImage in a directory - on Windows it is an
 *                                installed `.exe` and this is what to set.
 *                                Defaulted per platform below.
 *   SAFELEARN_SCREENSHOT_PORT    The debugging port. Default: 19333, which is
 *                                not the harness's, so a screenshot run and a
 *                                check run cannot attach to each other.
 *
 * Nothing here writes into the repository except the images themselves, and the
 * vault it works in is thrown away and rebuilt on every run.
 */

import { execFileSync, execSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import puppeteer from "puppeteer";

const projectRoot = path.resolve(import.meta.dirname, "..");
const runtimeDir = path.join(projectRoot, "test", ".runtime", "screenshots");
const vaultDir = path.join(runtimeDir, "vault");

/**
 * Obsidian's own application data, kept away from the one belonging to the
 * person on this machine so that a run cannot touch their vault list, their
 * window geometry or their open-vault flag. It is the one part of the runtime
 * directory that is not rebuilt per run: a fresh one makes Obsidian download its
 * current release before it will start.
 */
const userDataDir = path.join(runtimeDir, "user-data");

/** Where the pictures go. The plugin's README addresses them relative to itself. */
const docsAssetsDir = path.join(projectRoot, "md", "assets");
const docsPrefix = "plugin-";

const pluginDir = process.env.SAFELEARN_TEST_PLUGIN_DIR || path.join(projectRoot, "AI", "plugin");
const port = Number(process.env.SAFELEARN_SCREENSHOT_PORT || 19333);
const startupTimeoutMs = Number(process.env.SAFELEARN_TEST_OBSIDIAN_STARTUP_TIMEOUT_MS || 90000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ################### Locating what a run needs ###################

/**
 * The Obsidian executable.
 *
 * Two shapes, because the two installations this is run from have two shapes: a
 * directory of AppImages, where the highest version wins the way the user's own
 * launcher picks it, and a single installed executable. The explicit setting is
 * consulted first so that neither platform has to pretend to be the other.
 */
function resolveApplication() {
  const explicit = process.env.SAFELEARN_OBSIDIAN_APP || defaultApplicationPath();
  if (explicit && existsSync(explicit) && statSync(explicit).isFile()) return explicit;

  const directory = process.env.SAFELEARN_TEST_OBSIDIAN_DIR || path.join(os.homedir(), "scripts", "obsidian");
  if (existsSync(directory) && statSync(directory).isDirectory()) {
    const images = readdirSync(directory)
      .filter((entry) => /\.appimage$/i.test(entry))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (images.length > 0) return path.join(directory, images[images.length - 1]);
  }

  throw new Error(
    `No Obsidian found. Looked for ${explicit || "(no default for this platform)"} and for an AppImage in ` +
      `${directory}. Set SAFELEARN_OBSIDIAN_APP to the application, or SAFELEARN_TEST_OBSIDIAN_DIR to the ` +
      `directory holding the AppImages.`
  );
}

/** Where each platform's installer puts it, so that the common case needs no setting. */
function defaultApplicationPath() {
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(local, "Programs", "obsidian", "Obsidian.exe");
  }
  if (process.platform === "darwin") return "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
  return null;
}

/**
 * Builds the plugin from its sources. `main.js` is rollup's output and is not
 * committed, so without this a run photographs whatever an earlier build left
 * behind - and a picture of a stale build documents nothing.
 */
function buildPlugin() {
  if (!existsSync(path.join(pluginDir, "package.json"))) {
    throw new Error(
      `No plugin checkout at ${pluginDir}. On this repository that path is the link AI/plugin, which is set ` +
        `per installation - or set SAFELEARN_TEST_PLUGIN_DIR to the checkout.`
    );
  }
  if (!existsSync(path.join(pluginDir, "node_modules"))) {
    throw new Error(
      `The plugin checkout at ${pluginDir} has no node_modules. Run \`npm install\` there once. This does not ` +
        `install dependencies as a side effect: it needs the network and it is not what a person asked for.`
    );
  }
  // Through a shell, which is what `execSync` is: on Windows `npm` is `npm.cmd`,
  // and since Node 24 spawning a `.cmd` directly is refused outright. The command
  // is a constant, so there is nothing here for a shell to re-interpret.
  try {
    execSync("npm run build", { cwd: pluginDir, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    // Rollup says what is wrong and this function does not - but a build that
    // failed before it ever ran says it in `error` alone, and reporting an empty
    // reason is how a run gets blamed on the plugin's sources.
    const output = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`The plugin did not build:\n${output || error.message}`);
  }
  const built = path.join(pluginDir, "main.js");
  if (!existsSync(built)) throw new Error(`The build reported success but produced no ${built}.`);
  return built;
}

// ################### The documents the shots are taken of ###################

/**
 * Written for the pictures rather than taken from `md/`. The corpus demonstrates
 * the server's behaviour and is arranged for the checks that assert on it; a
 * screenshot wants one tag form per document, short enough that the whole of it
 * fits in the frame, and prose a teacher recognises as their own work.
 */
const documents = {
  "permissions.md": [
    "# Homework 3 — Integration by parts",
    "",
    "Everybody reads this paragraph. The four blocks below are gated.",
    "",
    "@@@ teacher",
    "Solution: choose u = x and dv = e^x dx.",
    "@@@",
    "",
    "@@@ 4bhif, 5bhif[2026-09-01T08:00:00 to 2026-09-01T09:40:00]",
    "The exam paper. 4BHIF permanently, 5BHIF during the slot.",
    "@@@",
    "",
    "@@@ #exam, #answer",
    "The worked answer, in the exam and the answer variant.",
    "@@@",
    "",
    "@@@ 4bhif[yesterday]",
    "A window the server cannot read: the block stays granted for good.",
    "@@@",
    "",
  ].join("\n"),

  "whole-file.md": [
    "@@@ teachers",
    "# Marking scheme",
    "",
    "A directive on the first line gates the whole file and never closes.",
    "",
  ].join("\n"),

  "fragment.md": [
    "# Newton's method",
    "",
    "This stands on the slide from the start.",
    "##fragment",
    "- and this appears on the next press",
    "- ##fragment and this one after it",
    "",
  ].join("\n"),

  "side-by-side.md": [
    "# Integration by parts",
    "",
    "##side-by-side-start",
    "**Given**",
    "",
    "- f(x) = x · e^x",
    "- over the interval [0, 1]",
    "##separator",
    "**Wanted**",
    "",
    "- the antiderivative",
    "- the definite value",
    "##side-by-side-end",
    "",
  ].join("\n"),

  "per-name.md": ["## Feedback", "", ""].join("\n"),
};

/**
 * The vault, built from scratch every time.
 *
 * The plugin enters as copies of its three built files rather than as a link:
 * this is not the thing under test, it is the thing being photographed, and a
 * copy cannot be edited from here by accident.
 *
 * What cannot be written here is the restricted-mode switch. A vault Obsidian
 * has not seen before starts with community plugins off, and that state lives in
 * the application rather than in any file in the vault - `start` turns it off
 * through the application itself.
 */
function assembleVault(built) {
  rmSync(vaultDir, { recursive: true, force: true });
  const pluginTarget = path.join(vaultDir, ".obsidian", "plugins", "safelearn-formatter");
  mkdirSync(pluginTarget, { recursive: true });
  mkdirSync(userDataDir, { recursive: true });

  for (const [name, text] of Object.entries(documents)) {
    writeFileSync(path.join(vaultDir, name), text);
  }
  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    copyFileSync(path.join(path.dirname(built), file), path.join(pluginTarget, file));
  }

  const config = path.join(vaultDir, ".obsidian");
  writeFileSync(path.join(config, "community-plugins.json"), JSON.stringify(["safelearn-formatter"]));
  writeFileSync(
    path.join(config, "app.json"),
    JSON.stringify({ promptDelete: false, spellcheck: false, showLineNumber: false, readableLineLength: true })
  );
  // Fixed on purpose. Dark matches the screenshots the documentation already
  // carries, and a font size written down here is one that does not change
  // because somebody adjusted their own Obsidian between two runs.
  writeFileSync(
    path.join(config, "appearance.json"),
    JSON.stringify({ theme: "obsidian", baseFontSize: 17, showViewHeader: false, showInlineTitle: false })
  );
  // The vault list Obsidian reads, inside the isolated application data: ours,
  // and open. Without this it shows the vault picker and waits.
  writeFileSync(
    path.join(userDataDir, "obsidian.json"),
    JSON.stringify({ vaults: { safelearnshots01: { path: vaultDir, ts: Date.now(), open: true } } })
  );
}

// ################### Starting and attaching ###################

let child = null;
let browser = null;
let page = null;

async function waitForDebugger(deadline) {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return await response.json();
    } catch {
      // Not up yet. The deadline is the only thing that ends this.
    }
    await sleep(250);
  }
  throw new Error(`Obsidian did not open a debugging port on 127.0.0.1:${port} within ${startupTimeoutMs}ms.`);
}

async function start() {
  const application = resolveApplication();
  assembleVault(buildPlugin());

  child = spawn(application, [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  const deadline = Date.now() + startupTimeoutMs;
  await waitForDebugger(deadline);
  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
  while (Date.now() < deadline) {
    page = (await browser.pages()).find((candidate) => candidate.url().startsWith("app://obsidian.md/"));
    if (page) break;
    await sleep(250);
  }
  if (!page) throw new Error("Obsidian is running but exposes no renderer to attach to.");

  await page.waitForFunction(
    () => !!document.querySelector(".workspace") && !!document.querySelector(".nav-file-title, .empty-state"),
    { timeout: Math.max(1000, deadline - Date.now()) }
  );

  // Restricted mode, turned off through the application because it is not a file.
  await page.evaluate(async () => {
    await window.app.plugins.setEnable(true);
  });
  await page
    .waitForFunction(() => !!window.app?.plugins?.plugins?.["safelearn-formatter"], { timeout: 30000 })
    .catch(() => {
      throw new Error("The plugin was found and enabled but never loaded. Check its onload for a throw.");
    });

  // Anything standing in front of the workspace is in the picture and takes the
  // keyboard. On a runtime directory that has just been removed Obsidian brings
  // up its own settings unprompted.
  await page.evaluate(() => window.app.setting?.close?.());
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await page.evaluate(() => !!document.querySelector(".modal-container")))) break;
    await page.keyboard.press("Escape");
    await sleep(300);
  }

  // What is being documented is the editor, not the file explorer.
  await page.evaluate(() => {
    window.app.workspace.leftSplit?.collapse?.();
    window.app.workspace.rightSplit?.collapse?.();
  });
  await page.setViewport({ width: 1280, height: 940, deviceScaleFactor: 2 });
  await sleep(800);
}

async function shutdown() {
  try {
    await browser?.disconnect();
  } catch {
    // Disconnecting from an application that already died is not a failure.
  }
  if (child) {
    try {
      if (process.platform === "win32") {
        // The launcher spawns the renderer and the GPU process as children of
        // its own; killing the one this holds leaves a window standing.
        execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        // SIGTERM is not enough for an AppImage: it runs from its own squashfs
        // mount and the wrapper outlives a polite request.
        process.kill(-child.pid, "SIGKILL");
      }
    } catch {
      // Already gone.
    }
    await sleep(500);
  }
  browser = null;
  page = null;
  child = null;
}

// ################### Driving it ###################

const viewState = {
  live: { mode: "source", source: false },
  reading: { mode: "preview" },
};

async function open(name, view = "live") {
  await page.evaluate(
    async (file, state) => {
      const target = window.app.vault.getAbstractFileByPath(file);
      if (!target) throw new Error(`The vault holds no ${file}.`);
      await window.app.workspace.getLeaf(false).openFile(target, { state });
    },
    name,
    viewState[view]
  );
  await sleep(1200);
}

/**
 * Puts the cursor in a line named by text rather than by number, so that editing
 * a document above does not silently move a picture's subject.
 */
async function cursorInto(needle, offset = 2) {
  await page.evaluate(
    (text, shift) => {
      const editor = window.app.workspace.activeEditor?.editor;
      const value = editor.getValue();
      const index = value.indexOf(text);
      if (index < 0) throw new Error(`No ${JSON.stringify(text)} in the open document.`);
      const before = value.slice(0, index);
      editor.focus();
      editor.setCursor({
        line: before.split("\n").length - 1,
        ch: index - (before.lastIndexOf("\n") + 1) + shift,
      });
    },
    needle,
    offset
  );
  await sleep(600);
}

/**
 * Refuses to photograph a document the plugin did not mark.
 *
 * A plugin that failed to load leaves the tags standing as ordinary text, and
 * that is a perfectly good-looking screenshot of the wrong thing. Every shot
 * below names the class that has to be on the page for it to be the shot it
 * claims to be.
 */
async function requireMarking(className) {
  const found = await page.evaluate((name) => !!document.querySelector(`.${name}`), className);
  if (!found) {
    throw new Error(
      `Nothing on the page carries .${className}, so the plugin did not mark this document. ` +
        `Taking the picture anyway would document a plugin that is not working.`
    );
  }
}

/**
 * The visible content of the open pane, cropped to what is actually written in
 * it - a picture with half a screen of empty document below it wastes the width
 * it is shown at.
 */
async function capture(name, { pad = 16, extra = null, only = null, docs = true } = {}) {
  const clip = await page.evaluate(
    (padding, extraSel, onlySel) => {
      if (onlySel) {
        const element = document.querySelector(onlySel);
        if (!element) throw new Error(`Nothing matches ${onlySel}.`);
        const box = element.getBoundingClientRect();
        return {
          x: Math.max(0, box.left - padding),
          y: Math.max(0, box.top - padding),
          width: box.width + padding * 2,
          height: box.height + padding * 2,
        };
      }
      // Only one of the two views is on screen at a time, so asking for both and
      // keeping what is visible needs no knowledge of which one is open.
      const candidates = [
        ...document.querySelectorAll(
          ".markdown-source-view .cm-line, .markdown-reading-view .markdown-preview-sizer > *"
        ),
      ].filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 1 && box.height > 1 && element.offsetParent !== null;
      });
      if (candidates.length === 0) throw new Error("Nothing visible to crop to.");

      const host = candidates[0].closest(".view-content").getBoundingClientRect();
      let top = Infinity;
      let bottom = -Infinity;
      let left = Infinity;
      let right = -Infinity;
      for (const element of candidates) {
        const box = element.getBoundingClientRect();
        if (box.bottom < host.top || box.top > host.bottom) continue;
        top = Math.min(top, box.top);
        bottom = Math.max(bottom, Math.min(box.bottom, host.bottom));
        left = Math.min(left, box.left);
        right = Math.max(right, box.right);
      }
      if (extraSel) {
        const element = document.querySelector(extraSel);
        if (element) {
          const box = element.getBoundingClientRect();
          left = Math.min(left, box.left);
          right = Math.max(right, box.right);
          top = Math.min(top, box.top);
          bottom = Math.max(bottom, box.bottom);
        }
      }
      return {
        x: Math.max(0, left - padding),
        y: Math.max(0, top - padding),
        width: right - left + padding * 2,
        height: bottom - top + padding * 2,
      };
    },
    pad,
    extra,
    only
  );

  const inPlugin = path.join(pluginDir, "assets", `${name}.png`);
  await page.screenshot({ path: inPlugin, clip, captureBeyondViewport: false });
  if (docs) copyFileSync(inPlugin, path.join(docsAssetsDir, `${docsPrefix}${name}.png`));
  console.log(`  ${name}.png  ${Math.round(clip.width)}×${Math.round(clip.height)}${docs ? "" : "  (plugin only)"}`);
}

/**
 * Opens the editor's context menu and leaves it standing, which is the whole
 * difference between this and the harness's `editorMenuItems`. The commands are
 * read back and insisted on: a menu that lost them is the picture nobody would
 * notice was wrong.
 */
async function openEditorMenu() {
  await page.evaluate(() => {
    document.querySelector(".menu")?.remove();
    const content = document.querySelector(".cm-content");
    if (!content) throw new Error("No editor to open a context menu in.");
    const box = content.getBoundingClientRect();
    content.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: Math.round(box.left + box.width * 0.42),
        clientY: Math.round(box.top + 40),
      })
    );
  });
  await sleep(900);

  const items = await page.evaluate(() =>
    [...document.querySelectorAll(".menu .menu-item .menu-item-title")].map((element) => element.textContent ?? "")
  );
  const expected = [
    "Insert side-by-side block",
    "Insert side-by-side block with a chosen number of columns",
    "Insert fragment marker",
    "Insert a restricted section for each name",
    "Restrict the selection to named readers",
  ];
  const missing = expected.filter((title) => !items.includes(title));
  if (missing.length > 0) {
    throw new Error(
      `The editor's context menu is missing ${JSON.stringify(missing)}. It holds ${JSON.stringify(items)}. ` +
        `A screenshot of it would document a menu the plugin no longer fills.`
    );
  }
}

// ################### The shots ###################

async function takeAll() {
  mkdirSync(path.join(pluginDir, "assets"), { recursive: true });

  // The restricted blocks at rest: every directive line stands as the heading of
  // the block it opens, and each entry is marked as what it is.
  await open("permissions.md");
  await cursorInto("Everybody reads", 10);
  await requireMarking("safelearn-heading");
  await capture("permission-blocks");

  // The same document with the cursor in one directive: that one line is its own
  // characters again while the others are still headings.
  await cursorInto("@@@ 4bhif, 5bhif", 12);
  await requireMarking("safelearn-entry");
  await capture("permission-editing");

  // The same document, read.
  await open("permissions.md", "reading");
  await requireMarking("safelearn-read-block");
  await capture("permission-reading");

  // A first-line directive, drawn with its lower edge left off.
  await open("whole-file.md");
  await cursorInto("A directive on the first line", 5);
  await requireMarking("permission-file");
  await capture("whole-file");

  // Fragments, as the icon that stands in the tag's place.
  await open("fragment.md");
  await cursorInto("This stands on the slide", 8);
  await requireMarking("fragment-icon");
  await capture("fragment");

  // Side-by-side, in the editor and rebuilt as columns when read.
  await open("side-by-side.md");
  await cursorInto("##side-by-side-end", 18);
  await requireMarking("side-by-side-block");
  await capture("side-by-side-editor");
  await open("side-by-side.md", "reading");
  await requireMarking("safelearn-columns");
  await capture("side-by-side-reading");

  // The commands, where a person right-clicks for them.
  await open("fragment.md");
  await cursorInto("This stands on the slide", 8);
  await openEditorMenu();
  await capture("menu", { extra: ".menu" });
  await page.keyboard.press("Escape");
  await sleep(400);

  // The class list a teacher pastes, and the sections it writes. The dialog is
  // the plugin's alone, so it is cropped to itself; the documentation page here
  // does not show it, which is what `docs: false` says.
  await open("per-name.md");
  await cursorInto("## Feedback", 11);
  await page.evaluate(() =>
    window.app.commands.executeCommandById("safelearn-formatter:insert-sections-per-name")
  );
  await page.waitForFunction(() => !!document.querySelector(".modal-container textarea"), { timeout: 10000 });
  await page.evaluate(() => {
    document.querySelector(".modal-container textarea").value = ["Anna Berger", "David Huber", "Lena Wagner"].join(
      String.fromCharCode(10)
    );
  });
  await sleep(400);
  await capture("name-list", { only: ".modal-container .modal", docs: false });
  await page.evaluate(() => document.querySelector(".modal-container button").click());
  await sleep(1200);
  await cursorInto("## Feedback", 11);
  await requireMarking("safelearn-heading");
  await capture("per-name-result");
}

// ################### Running it ###################

try {
  console.log(`Obsidian: ${resolveApplication()}`);
  console.log(`Plugin:   ${pluginDir}`);
  await start();
  await takeAll();
  console.log(`Written to ${path.join(pluginDir, "assets")} and ${docsAssetsDir}.`);
} catch (error) {
  console.error(`\nNo screenshots were taken: ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  await shutdown();
}
