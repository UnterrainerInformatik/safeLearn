/**
 * The Obsidian harness: what the companion plugin does, watched in the real
 * application.
 *
 * The plugin under test is a CodeMirror `ViewPlugin` and a Markdown
 * post-processor. Neither exists outside a running Obsidian, and the defects
 * worth catching - decorations that follow an edit to the wrong place - only
 * appear while text is being typed. So this harness drives the Obsidian
 * application itself over the Chrome DevTools Protocol rather than reproducing
 * its editor.
 *
 * It is deliberately separate from `test/harness.js`. That one brings up the
 * server and authenticates twice against a Keycloak realm shared with other
 * people; this one needs no server, no login and no account. The two runs are
 * kept apart by location as well: `npm test` collects `test/*.test.js`, and
 * `test/coverage.test.js` builds its expectation from `test/` and `test/checks/`
 * - a file placed in either would join the server suite whether it belonged
 * there or not. This directory is outside both.
 *
 * Everything machine-specific is an environment variable with a default that
 * works on the installation this was written on, in the same form the server
 * harness uses. What is absent is named rather than waited for.
 */

import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import puppeteer from "puppeteer";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const runtimeDir = path.join(projectRoot, "test", ".runtime", "obsidian");
const vaultDir = path.join(runtimeDir, "vault");

/**
 * Obsidian's own application data, kept out of `~/.config/obsidian` so that a
 * run cannot touch the vault list, the window geometry or the open-vault flag of
 * the person using this machine. It is the one part of the runtime directory
 * that is *not* rebuilt per run: a fresh one makes Obsidian download its current
 * release before it will start, which is eight megabytes over the network for no
 * gain. The vault itself is rebuilt every time - see `assembleVault`.
 */
const userDataDir = path.join(runtimeDir, "user-data");

const pluginDir = process.env.SAFELEARN_TEST_PLUGIN_DIR || path.join(projectRoot, "AI", "plugin");
const applicationDir =
  process.env.SAFELEARN_TEST_OBSIDIAN_DIR || path.join(os.homedir(), "scripts", "obsidian");
const port = Number(process.env.SAFELEARN_TEST_OBSIDIAN_PORT || 19222);
const startupTimeoutMs = Number(process.env.SAFELEARN_TEST_OBSIDIAN_STARTUP_TIMEOUT_MS || 90000);

/** Leaves the window standing after the run, to look at what a failure left behind. */
const keepOpen = ["1", "true", "yes"].includes(
  String(process.env.SAFELEARN_TEST_OBSIDIAN_KEEP_OPEN).toLowerCase()
);

/** The three states the plugin behaves differently in. */
export const views = Object.freeze({
  livePreview: "live-preview",
  source: "source",
  reading: "reading",
});

/** The classes the plugin puts on what it decorates. Its own names, so ours to rely on. */
export const markerClasses = Object.freeze([
  "fragment-highlight",
  "permission-block",
  "side-by-side-start",
  "side-by-side-separator",
  "side-by-side-block",
  "side-by-side-end",
  "safelearn-hidden",
]);

let child = null;
let browser = null;
let page = null;
let applicationVersion = null;

// ################### Locating what the run needs ###################

/**
 * The Obsidian executable, resolved the way the user's own launcher resolves it:
 * the AppImages in one directory, sorted by version, highest wins. Hardcoding a
 * version would test something other than what the person on this machine runs.
 *
 * Note what that file is *not*: the version that ends up running. The AppImage
 * is a launcher, and Obsidian updates itself by writing a newer `.asar` into its
 * application data and loading that instead. `applicationVersion` below reports
 * what actually ran, which is the number a failure should be attributed to.
 */
function resolveApplication() {
  if (!existsSync(applicationDir)) {
    throw new Error(
      `No Obsidian installation at ${applicationDir}. Set SAFELEARN_TEST_OBSIDIAN_DIR to the ` +
        `directory holding the Obsidian AppImage.`
    );
  }
  const images = readdirSync(applicationDir)
    .filter((entry) => /\.appimage$/i.test(entry))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (images.length === 0) {
    throw new Error(
      `${applicationDir} holds no Obsidian AppImage. Set SAFELEARN_TEST_OBSIDIAN_DIR to the ` +
        `directory holding it.`
    );
  }
  return path.join(applicationDir, images[images.length - 1]);
}

/** The plugin checkout, which is reached through a symlink that is set per installation. */
function resolvePlugin() {
  if (!existsSync(path.join(pluginDir, "package.json"))) {
    throw new Error(
      `No plugin checkout at ${pluginDir}. On this repository that path is the symlink AI/plugin, ` +
        `which is set per installation - see AI/memory/plugin-repo-link.md - or set ` +
        `SAFELEARN_TEST_PLUGIN_DIR to the checkout.`
    );
  }
  return pluginDir;
}

// ################### Building what gets loaded ###################

/**
 * Builds the plugin from its sources. `main.js` is rollup's output and is not
 * committed, so without this a run either loads nothing or loads whatever an
 * earlier build left behind - and a run that tests a stale artifact tests
 * nothing. The build's own output is attached to a failure, because rollup says
 * what is wrong and this function does not.
 */
export function buildPlugin() {
  const dir = resolvePlugin();
  if (!existsSync(path.join(dir, "node_modules"))) {
    throw new Error(
      `The plugin checkout at ${dir} has no node_modules. Run \`npm install\` there once. ` +
        `This harness does not install dependencies as a side effect of a test run: it needs the ` +
        `network and it is not what a person asked for by running a check.`
    );
  }
  try {
    execFileSync("npm", ["run", "build"], { cwd: dir, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    const output = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`The plugin did not build:\n${output}`);
  }

  const built = path.join(dir, "main.js");
  if (!existsSync(built)) {
    throw new Error(`The build reported success but produced no ${built}.`);
  }
  // A build that "succeeded" while leaving an artifact older than the source it
  // was built from did not build that source.
  const source = path.join(dir, "main.ts");
  if (existsSync(source) && statSync(built).mtimeMs < statSync(source).mtimeMs) {
    throw new Error(
      `${built} is older than ${source}. The build did not produce it from the current sources.`
    );
  }
  return built;
}

// ################### The vault a run works in ###################

/**
 * Builds the vault this run uses, from scratch, every time.
 *
 * The corpus enters as copies rather than as links. A check types into
 * documents, and the corpus is what the server suite asserts against - a plugin
 * run that could edit `md/` could break `npm test` from a distance.
 *
 * The plugin enters as a link to its checkout, because that is the thing under
 * test and it is rebuilt between runs.
 *
 * What cannot be written here is the restricted-mode switch. A vault Obsidian
 * has not seen before starts with community plugins off, and that state lives in
 * the application's local storage rather than in any file in the vault:
 * `community-plugins.json` lists what *would* be enabled, and Obsidian still
 * loads none of it. `start()` turns it off through the application itself.
 */
export function assembleVault() {
  const built = path.join(resolvePlugin(), "main.js");

  rmSync(vaultDir, { recursive: true, force: true });
  mkdirSync(path.join(vaultDir, ".obsidian", "plugins"), { recursive: true });
  mkdirSync(userDataDir, { recursive: true });

  const corpus = path.join(projectRoot, "md");
  for (const entry of readdirSync(corpus).filter((name) => name.endsWith(".md"))) {
    cpSync(path.join(corpus, entry), path.join(vaultDir, entry));
  }

  symlinkSync(path.dirname(built), path.join(vaultDir, ".obsidian", "plugins", "safelearn-formatter"));
  writeFileSync(
    path.join(vaultDir, ".obsidian", "community-plugins.json"),
    JSON.stringify(["safelearn-formatter"])
  );
  // Nothing a run does should raise a confirmation nobody is there to answer.
  writeFileSync(path.join(vaultDir, ".obsidian", "app.json"), JSON.stringify({ promptDelete: false }));

  // The vault list Obsidian reads, inside the isolated application data: ours,
  // and open. Without this it would show the vault picker and wait.
  writeFileSync(
    path.join(userDataDir, "obsidian.json"),
    JSON.stringify({ vaults: { safelearnharness01: { path: vaultDir, ts: Date.now(), open: true } } })
  );
  return vaultDir;
}

// ################### Starting and attaching ###################

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  throw new Error(
    `Obsidian did not open a debugging port on 127.0.0.1:${port} within ${startupTimeoutMs}ms.`
  );
}

/**
 * Brings up Obsidian on the assembled vault and hands back the renderer page.
 *
 * The port binds to loopback. The renderer is picked by its URL rather than by
 * being first: an Electron application exposes more than one target and their
 * order is not a contract.
 */
export async function start() {
  const application = resolveApplication();
  buildPlugin();
  assembleVault();

  child = spawn(application, [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  const deadline = Date.now() + startupTimeoutMs;
  const info = await waitForDebugger(deadline);
  applicationVersion = /obsidian\/([\d.]+)/.exec(info["User-Agent"] ?? "")?.[1] ?? "unknown";

  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
  while (Date.now() < deadline) {
    page = (await browser.pages()).find((candidate) => candidate.url().startsWith("app://obsidian.md/"));
    if (page) break;
    await sleep(250);
  }
  if (!page) throw new Error("Obsidian is running but exposes no renderer to attach to.");

  // A window that exists is not a workspace that is ready. The file explorer
  // having something in it is the point at which the vault is actually open.
  await page.waitForFunction(
    () => !!document.querySelector(".workspace") && !!document.querySelector(".nav-file-title, .empty-state"),
    { timeout: Math.max(1000, deadline - Date.now()) }
  );

  // Restricted mode, turned off through the application because it is not a file
  // (see `assembleVault`). `setEnable` is what the settings toggle calls.
  await page.evaluate(async () => {
    await window.app.plugins.setEnable(true);
  });
  await page.waitForFunction(
    () => !!window.app?.plugins?.plugins?.["safelearn-formatter"],
    { timeout: 30000 }
  ).catch(() => {
    throw new Error(
      "The plugin was found and enabled but never loaded. Check the plugin's onload for a throw."
    );
  });

  applicationVersion = effectiveVersion(applicationVersion);
  return page;
}

/**
 * The version that actually ran, which is none of the obvious candidates.
 *
 * The AppImage is a launcher and reports its own version in the user agent
 * (1.11.4 here). Obsidian then updates itself by writing a newer `.asar` into
 * its application data and loading that instead - so what runs is 1.13.7 while
 * everything on the outside still says 1.11.4. The renderer exposes neither
 * `app.appVersion` nor a global `apiVersion` to an unprivileged evaluate, so the
 * honest source is the package that got loaded. The user-agent version is the
 * fallback for an installation that has never updated and therefore has none.
 */
function effectiveVersion(fallback) {
  try {
    const packages = readdirSync(userDataDir)
      .map((entry) => /^obsidian-([\d.]+)\.asar$/.exec(entry)?.[1])
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return packages.length > 0 ? packages[packages.length - 1] : fallback;
  } catch {
    return fallback;
  }
}

/** What actually ran, for a failure that turns out to be Obsidian's and not the plugin's. */
export function obsidianVersion() {
  return applicationVersion;
}

export async function shutdown() {
  if (keepOpen) return;
  try {
    await browser?.disconnect();
  } catch {
    // Disconnecting from an application that already died is not a failure.
  }
  if (child) {
    // SIGTERM is not enough for an AppImage: it runs from its own squashfs mount
    // and the wrapper outlives a polite request.
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // Already gone.
    }
    await sleep(500);
  }
  browser = null;
  page = null;
  child = null;
}

// ################### Reading what the plugin did ###################

const viewState = {
  [views.livePreview]: { mode: "source", source: false },
  [views.source]: { mode: "source", source: true },
  [views.reading]: { mode: "preview" },
};

/**
 * Opens a corpus file in a named view state and waits until that state is the
 * one on screen. A check says which state it is asserting about, because the
 * plugin decorates live text in one mechanism and rewrites rendered output in
 * another, and a pass in one says nothing about the other.
 */
export async function open(name, view = views.livePreview) {
  const state = viewState[view];
  if (!state) throw new Error(`Unknown view: ${view}. Use one of ${Object.values(views).join(", ")}.`);

  await page.evaluate(
    async (file, wanted) => {
      const target = window.app.vault.getMarkdownFiles().find((f) => f.path === file || f.name === file);
      if (!target) throw new Error(`The vault holds no ${file}.`);
      const leaf = window.app.workspace.getLeaf(false);
      await leaf.openFile(target);
      await leaf.setViewState({ type: "markdown", state: { ...leaf.getViewState().state, ...wanted } });
      window.app.workspace.setActiveLeaf(leaf, { focus: true });
    },
    name,
    state
  );

  const container = view === views.reading ? ".markdown-reading-view" : ".cm-content";
  await page.waitForFunction((selector) => !!document.querySelector(selector), { timeout: 15000 }, container);
  return container;
}

/**
 * Brings the part of the document holding `needle` into view, and waits until it
 * is actually in the DOM.
 *
 * This is not a convenience. Both of Obsidian's renderers are virtualized: the
 * editor keeps only the lines around the viewport in the document, and the
 * reading view renders sections as they are approached. A decoration on line 157
 * of a corpus file exists in CodeMirror's decoration set and has no element to
 * find, so a check that reads the DOM without scrolling first does not observe
 * "the plugin did nothing" - it observes nothing at all, and cannot tell the two
 * apart. Every check that asserts about a specific tag reveals it first.
 */
export async function reveal(container, needle) {
  if (container === ".cm-content") {
    await page.evaluate((text) => {
      const editor = window.app.workspace.activeEditor?.editor;
      if (!editor) throw new Error("No active editor to scroll.");
      const lines = editor.getValue().split("\n");
      const line = lines.findIndex((l) => l.includes(text));
      if (line === -1) throw new Error(`No line holding ${JSON.stringify(text)}.`);
      editor.setCursor({ line, ch: 0 });
      editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: lines[line].length } }, true);
    }, needle);
  } else {
    // The reading view has no cursor to move. Walk down it until the text
    // renders, bounded, so a needle that is not in the document ends the wait
    // instead of scrolling forever.
    await page.evaluate(async (text) => {
      const view = document.querySelector(".markdown-preview-view");
      if (!view) return;
      for (let step = 0; step < 60; step++) {
        if ((view.innerText ?? "").includes(text)) return;
        view.scrollTop += view.clientHeight * 0.8;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }, needle);
  }

  await page.waitForFunction(
    (selector, text) => (document.querySelector(selector)?.innerText ?? "").includes(text),
    { timeout: 15000 },
    container,
    needle
  );
}

/**
 * The text as shown, which is what a person reading the document would see -
 * and, because of the virtualization described at `reveal`, only the part of it
 * currently on screen.
 */
export async function visibleText(container) {
  return page.evaluate((selector) => document.querySelector(selector)?.innerText ?? "", container);
}

/**
 * Every element carrying one of the plugin's own classes, with the text it
 * covers. A decoration that spans the wrong range shows up here as text that is
 * longer or shorter than the token it belongs to, which is the failure this
 * whole harness exists to make visible.
 */
export async function markers(container) {
  return page.evaluate(
    (selector, classes) => {
      const root = document.querySelector(selector);
      if (!root) return [];
      return classes.flatMap((cls) =>
        [...root.querySelectorAll(`.${cls}`)].map((el) => ({
          marker: cls,
          text: el.textContent ?? "",
          length: (el.textContent ?? "").length,
        }))
      );
    },
    container,
    markerClasses
  );
}

/**
 * Types at the cursor the way a keyboard does, rather than setting document
 * state. A decoration that follows an edit to the wrong position is a defect
 * about input handling, and assigning the document text would not exercise it.
 */
export async function type(text) {
  await page.keyboard.type(text, { delay: 20 });
  // CodeMirror decorates on its own schedule; give the update a frame to land.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
}

/** Puts the cursor at the end of the line holding `needle`, in the editor. */
export async function placeCursorAfter(needle) {
  await page.evaluate((text) => {
    const editor = window.app.workspace.activeEditor?.editor;
    if (!editor) throw new Error("No active editor to place a cursor in.");
    const lines = editor.getValue().split("\n");
    const line = lines.findIndex((l) => l.includes(text));
    if (line === -1) throw new Error(`No line holding ${JSON.stringify(text)}.`);
    editor.setCursor({ line, ch: lines[line].length });
    editor.focus();
  }, needle);
}

/**
 * An image of what the harness saw, beside the server suite's own failure
 * screenshots. A visual defect reported only as an assertion message cannot be
 * judged afterwards.
 */
export async function screenshot(name) {
  const file = path.join(projectRoot, "test", ".runtime", `obsidian-${name}-${process.pid}.png`);
  await page.screenshot({ path: file });
  return path.relative(projectRoot, file);
}
