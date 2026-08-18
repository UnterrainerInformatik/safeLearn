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

import { execFileSync, execSync, spawn } from "node:child_process";
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
const applicationPath = process.env.SAFELEARN_OBSIDIAN_APP || defaultApplicationPath();
const port = Number(process.env.SAFELEARN_TEST_OBSIDIAN_PORT || 19222);
const startupTimeoutMs = Number(process.env.SAFELEARN_TEST_OBSIDIAN_STARTUP_TIMEOUT_MS || 90000);

/**
 * The window every check is laid out in.
 *
 * This is the size puppeteer's `connect` applies by default, so it is what the
 * checks have always run in; it is named here rather than inherited because
 * `editorMenuItems` has to widen it and put it back, and a helper cannot restore
 * a number nobody wrote down. Passed to `connect` explicitly for the same
 * reason: the two must not be free to disagree.
 */
const viewport = Object.freeze({ width: 800, height: 600 });

/**
 * The height the editor's context menu is read at.
 *
 * Obsidian's own editor menu is twenty-odd entries and taller than the window
 * above, and a menu that does not fit is clamped rather than scrolled - the last
 * entry in it, which is the plugin's, ends up with two pixels of itself on
 * screen. A submenu opens on hover, and hovering two pixels is not a check, it
 * is a coincidence waiting to stop happening. So the window is widened for the
 * reading and put straight back.
 */
const menuHeight = 900;

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
  "fragment-icon",
  "permission-block",
  "permission-block-start",
  "permission-block-end",
  "permission-file",
  "permission-withheld",
  "safelearn-entry",
  "safelearn-entry-timed",
  "safelearn-entry-broken",
  "safelearn-entry-switch",
  "safelearn-entry-unresolved",
  "side-by-side-start",
  "side-by-side-separator",
  "side-by-side-block",
  "side-by-side-end",
  "safelearn-hidden",
  "safelearn-heading",
  "safelearn-heading-file",
  "safelearn-heading-withheld",
  "safelearn-heading-note",
  "safelearn-chip",
  "safelearn-chip-timed",
  "safelearn-chip-broken",
  "safelearn-chip-switch",
  "safelearn-chip-unresolved",
  "safelearn-chip-discarded",
  "safelearn-read-block",
  "safelearn-read-block-start",
  "safelearn-read-block-end",
  "safelearn-read-file",
  "safelearn-columns",
  "safelearn-columns-host",
  "safelearn-column",
]);

let child = null;
let browser = null;
let page = null;
let applicationVersion = null;

// ################### What the renderer raised ###################

/**
 * Some of what the plugin does wrong is not visible as a wrong result. The
 * editor's decoration machinery rejects a set whose ranges are out of order by
 * throwing, and Obsidian catches that throw and logs it - so on screen the
 * document simply carries no markings at all, which is indistinguishable from a
 * plugin that correctly found nothing to mark. A check reading only `markers()`
 * cannot tell those apart; this is what lets it.
 *
 * Both channels are subscribed to, because the two are not interchangeable. An
 * uncaught throw arrives as a page error; a throw Obsidian caught arrives as a
 * console error, and the ordering defect is the second kind - confirmed by
 * observation, see the change's `findings.md`. A collector watching only page
 * errors would report a clean run.
 *
 * Each entry carries the document and the action that were in progress, because
 * a run opens several documents and an error attributed to none of them says
 * little.
 */
const raisedEntries = [];
let collecting = false;
let inProgress = { document: null, action: "starting up" };

function record(kind, text) {
  if (!collecting) return;
  raisedEntries.push({ kind, text, document: inProgress.document, action: inProgress.action });
}

/** Names what a later error should be attributed to. Every action below calls it. */
function doing(action, document = inProgress.document) {
  inProgress = { document, action };
}

/**
 * Everything the renderer raised since the last `forgetRaised()`.
 *
 * This throws rather than returning `[]` when nothing is watching, which is the
 * whole point of the second half of the requirement: a check that asserts no
 * error occurred must be able to establish that, and an empty array from a
 * collector that was never subscribed would read exactly the same as an empty
 * array from a clean run.
 */
export function raised() {
  if (!collecting) {
    throw new Error(
      "Nothing is collecting what the renderer raises, so an empty result would mean nothing. " +
        "`raised()` is only meaningful between `start()` and `shutdown()`."
    );
  }
  return raisedEntries.slice();
}

/**
 * Drops what has been collected so far, so a check can scope the question to its
 * own actions. Obsidian logs its own errors while starting up, and a check
 * asserting "this document raised nothing" should not fail over them.
 */
export function forgetRaised() {
  const dropped = raisedEntries.length;
  raisedEntries.length = 0;
  return dropped;
}

/**
 * Raises an error inside the renderer on purpose.
 *
 * It exists so a check can establish that the collector above reports a real
 * error rather than being permanently empty - a broken collector and a clean run
 * look the same from the outside, which is the failure this whole mechanism is
 * about. It is thrown from a timer so nothing in the evaluate call catches it,
 * and logged as well, so both channels are exercised by one call.
 */
export async function provokeError(message) {
  doing(`provoking an error: ${message}`);
  await page.evaluate((text) => {
    console.error(`${text} (console)`);
    setTimeout(() => {
      throw new Error(`${text} (thrown)`);
    }, 0);
  }, message);
  await settle();
}

// ################### Locating what the run needs ###################

/**
 * The Obsidian executable.
 *
 * Two shapes, because the installations this is run from have two shapes: a
 * directory of AppImages, where the highest version wins the way the user's own
 * launcher picks it, and a single installed executable, which is what the
 * Windows and macOS installers leave behind. The explicit setting is consulted
 * first so that neither platform has to pretend to be the other. Hardcoding a
 * version would test something other than what the person on this machine runs.
 *
 * Note what that file is *not*: the version that ends up running. The AppImage
 * is a launcher, and Obsidian updates itself by writing a newer `.asar` into its
 * application data and loading that instead. `applicationVersion` below reports
 * what actually ran, which is the number a failure should be attributed to.
 */
function resolveApplication() {
  if (applicationPath && existsSync(applicationPath) && statSync(applicationPath).isFile()) {
    return applicationPath;
  }
  if (existsSync(applicationDir) && statSync(applicationDir).isDirectory()) {
    const images = readdirSync(applicationDir)
      .filter((entry) => /\.appimage$/i.test(entry))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (images.length > 0) return path.join(applicationDir, images[images.length - 1]);
  }
  throw new Error(
    `No Obsidian found. Looked for ${applicationPath || "(no default for this platform)"} and for an ` +
      `AppImage in ${applicationDir}. Set SAFELEARN_OBSIDIAN_APP to the application, or ` +
      `SAFELEARN_TEST_OBSIDIAN_DIR to the directory holding the AppImages.`
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
 * The plugin checkout, which is reached through a symlink that is set per
 * installation. Exported because `test/directive-grammar.test.js` reads the
 * plugin's grammar out of `main.ts` and has to find the same checkout this
 * harness builds and loads - two places deciding where the plugin is would be
 * free to disagree about it.
 */
export function resolvePlugin() {
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
  // Through a shell, which is what `execSync` is: on Windows `npm` is `npm.cmd`,
  // and since Node 24 spawning a `.cmd` directly is refused outright. The command
  // is a constant, so there is nothing here for a shell to re-interpret.
  try {
    execSync("npm run build", { cwd: dir, encoding: "utf8", stdio: "pipe" });
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

  // A junction on Windows, because a directory symlink there needs either
  // developer mode or elevation and a junction needs neither. The type argument
  // is ignored on every other platform, so this stays one call.
  symlinkSync(
    path.dirname(built),
    path.join(vaultDir, ".obsidian", "plugins", "safelearn-formatter"),
    "junction"
  );
  // The plugin's own persisted settings (`data.json`, `saveData`/`loadData`) live inside
  // the checkout this junction points at, not inside the vault tree just rebuilt above -
  // a real login done there (manual testing against `tasks.md` #9.5/#11.3) would otherwise
  // leak into every run after it, since the checkout is linked in rather than copied.
  rmSync(path.join(path.dirname(built), "data.json"), { force: true });
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

  browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: viewport });
  while (Date.now() < deadline) {
    page = (await browser.pages()).find((candidate) => candidate.url().startsWith("app://obsidian.md/"));
    if (page) break;
    await sleep(250);
  }
  if (!page) throw new Error("Obsidian is running but exposes no renderer to attach to.");

  // Subscribed before the workspace is even ready, so that an error raised while
  // the plugin loads is attributed to loading rather than lost.
  collecting = true;
  raisedEntries.length = 0;
  doing("starting up", null);
  page.on("pageerror", (error) => record("pageerror", error?.stack ?? String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") record("console.error", message.text());
  });

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

  await dismissModals();

  applicationVersion = effectiveVersion(applicationVersion);
  return page;
}

/**
 * Puts away anything standing in front of the workspace.
 *
 * On a run from a runtime directory that has just been removed, Obsidian brings
 * up its community-plugins settings by itself, and a modal takes the keyboard.
 * Typing then goes into a search field instead of the document - and a check
 * that reads its markings afterwards and finds them unchanged reads that as a
 * pass. It cost one unexplained failure in a dozen runs before it was caught in
 * the act by the screenshot a failing check leaves behind.
 */
async function dismissModals() {
  await page.evaluate(() => window.app.setting?.close?.());
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!(await page.evaluate(() => !!document.querySelector(".modal-container")))) return;
    await page.keyboard.press("Escape");
    await settle();
  }
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
  collecting = false;
  raisedEntries.length = 0;
  try {
    await browser?.disconnect();
  } catch {
    // Disconnecting from an application that already died is not a failure.
  }
  if (child) {
    try {
      if (process.platform === "win32") {
        // The launcher spawns the renderer and the GPU process as children of its
        // own; killing the one this holds leaves a window standing.
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
export async function open(name, view = views.livePreview, { beside = false } = {}) {
  const state = viewState[view];
  if (!state) throw new Error(`Unknown view: ${view}. Use one of ${Object.values(views).join(", ")}.`);
  doing(`opening in ${view}`, name);

  await page.evaluate(
    async (file, wanted, split) => {
      const target = window.app.vault.getMarkdownFiles().find((f) => f.path === file || f.name === file);
      if (!target) throw new Error(`The vault holds no ${file}.`);
      const leaf = window.app.workspace.getLeaf(split ? "split" : false);
      await leaf.openFile(target);
      await leaf.setViewState({ type: "markdown", state: { ...leaf.getViewState().state, ...wanted } });
      window.app.workspace.setActiveLeaf(leaf, { focus: true });
    },
    name,
    state,
    beside
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
  doing(`revealing ${JSON.stringify(needle)}`);
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
 * covers and where in the document it sits. A decoration that spans the wrong
 * range shows up here as text that is longer or shorter than the token it
 * belongs to, which is the failure this whole harness exists to make visible.
 *
 * The position is not a refinement of the text. "The marking is still on its own
 * tag after an edit" is not decidable from text alone: a document holding
 * `##fragment` eleven times reports eleven identical entries, and a marking that
 * moved to the wrong one of them reads exactly like a marking that stayed. The
 * offset comes from CodeMirror rather than from counting characters, because
 * CodeMirror is what placed the element - `posAtDOM` answers the question the
 * decoration set was built to answer. The reading view has no such mapping, so
 * there the positions are null rather than guessed.
 */
export async function markers(container) {
  return page.evaluate(
    (selector, classes) => {
      const root = document.querySelector(selector);
      if (!root) return [];
      const view = window.app.workspace.activeEditor?.editor?.cm;
      const locate = (el) => {
        if (!view || selector !== ".cm-content") return { from: null, to: null, line: null, column: null };
        try {
          const from = view.posAtDOM(el);
          const line = view.state.doc.lineAt(from);
          return {
            from,
            to: from + (el.textContent ?? "").length,
            line: line.number,
            column: from - line.from,
          };
        } catch {
          // An element the editor does not own has no position in the document.
          return { from: null, to: null, line: null, column: null };
        }
      };
      return classes.flatMap((cls) =>
        [...root.querySelectorAll(`.${cls}`)].map((el) => ({
          marker: cls,
          text: el.textContent ?? "",
          length: (el.textContent ?? "").length,
          ...locate(el),
        }))
      );
    },
    container,
    markerClasses
  );
}

/**
 * Every heading the plugin shows in place of a directive line, in the order they
 * stand in what is on screen, with the chips each one carries.
 *
 * A heading is not a marking on text, so `markers()` cannot report it usefully:
 * it reads position from `posAtDOM`, and every chip of one heading replaces the
 * same range and answers with the same offset. What tells the chips apart is the
 * order they stand in and what each says, and that is what this returns.
 *
 * It works in both views, because the point of the heading is that both views
 * show the same one - a check comparing them has to read them the same way.
 */
export async function headings(container) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return [];
    return [...root.querySelectorAll(".safelearn-heading")].map((el) => ({
      kinds: [...el.classList]
        .filter((name) => name.startsWith("safelearn-heading-"))
        .map((name) => name.replace("safelearn-heading-", ""))
        .sort(),
      note: el.querySelector(".safelearn-heading-note")?.textContent ?? null,
      chips: [...el.querySelectorAll(".safelearn-chip")].map((chip) => ({
        text: chip.textContent ?? "",
        kinds: [...chip.classList]
          .filter((name) => name.startsWith("safelearn-chip-"))
          .map((name) => name.replace("safelearn-chip-", ""))
          .sort(),
      })),
    }));
  }, container);
}

/**
 * Every side-by-side block the rendered reading view rebuilt, as the text of its
 * columns.
 *
 * The text rather than the markup: what the requirement is about is that the
 * parts stand beside one another and are split where the document splits them,
 * and a check that asserted markup would fail on a change to how a column is
 * wrapped rather than on the behavior.
 */
export async function columns(container) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return [];
    return [...root.querySelectorAll(".safelearn-columns")].map((block) =>
      [...block.querySelectorAll(":scope > .safelearn-column")].map((column) =>
        (column.innerText ?? "").trim()
      )
    );
  }, container);
}

/**
 * Whether the columns of a block are actually beside one another on screen.
 *
 * The class alone does not establish it: a stylesheet that failed to load, or a
 * flex rule that a theme overrode, leaves the same markup stacked - and stacked
 * is exactly the outcome the requirement exists to rule out. So this reads the
 * boxes the browser laid out.
 */
export async function columnsAreSideBySide(container) {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    const block = root?.querySelector(".safelearn-columns");
    if (!block) return null;
    const boxes = [...block.querySelectorAll(":scope > .safelearn-column")].map((column) =>
      column.getBoundingClientRect()
    );
    if (boxes.length < 2) return null;
    return boxes.every((box, index) => index === 0 || box.left >= boxes[index - 1].right - 1);
  }, container);
}

/**
 * Where a block stands on screen: every element carrying `className`, in the
 * order they are laid out, with the box the editor gave it and the box the
 * block's frame is drawn in.
 *
 * Two boxes rather than one, because they are not the same question and on some
 * elements they are not the same rectangle. Live Preview renders a table, a
 * callout, a diagram, a formula or an embedded note as an element of its own
 * rather than as a line, and lays it out to a width of its own: a table widget's
 * box runs 16px wider on each side than the box of the line above it, and its
 * own horizontal padding puts its content back at exactly the line's width. So
 * `top`/`bottom`/`left`/`right` are what the editor laid out, and
 * `frameLeft`/`frameRight` are where the block's side edges are drawn - on the
 * element's border where it has one, and otherwise inside its own padding, where
 * a rule that must not hard-code one theme's spacing has to put them.
 *
 * A check that compared boxes would report a frame stepping in and out where
 * none does. One that compared class lists would report a frame closing where
 * nothing is drawn at all, which is the state this defect leaves behind.
 *
 * The coordinates are relative to `.cm-content` rather than to the viewport, so
 * that a check may scroll between two reads and still compare them.
 */
export async function blockBoxes(container, className) {
  return page.evaluate(
    (selector, name) => {
      const root = document.querySelector(selector);
      if (!root) return [];
      const origin = root.getBoundingClientRect();
      const width = (value) => parseFloat(value) || 0;
      return [...root.querySelectorAll(`.${name}`)]
        .map((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const onItsBorder = width(style.borderLeftWidth) > 0;
          return {
            line: element.classList.contains("cm-line"),
            classes: [...element.classList],
            text: (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
            top: box.top - origin.top,
            bottom: box.bottom - origin.top,
            left: box.left - origin.left,
            right: box.right - origin.left,
            frameLeft: box.left - origin.left + (onItsBorder ? 0 : width(style.paddingLeft)),
            frameRight: box.right - origin.left - (onItsBorder ? 0 : width(style.paddingRight)),
          };
        })
        .sort((a, b) => a.top - b.top);
    },
    container,
    className
  );
}

/** The plugin as Obsidian knows it, which is what a command id is prefixed with. */
export const pluginId = "safelearn-formatter";

/**
 * Runs one of the plugin's commands the way the command palette runs it, and
 * reports the document before and after.
 *
 * What a command inserts is a statement about a person's file, so it is checked
 * by reading the file. Calling the plugin's own function instead would assert
 * that a function does what it does, and say nothing about whether the command
 * exists, whether Obsidian will run it, or what it does to a real document.
 */
export async function runCommand(id, { expectEdit = true } = {}) {
  const full = id.includes(":") ? id : `${pluginId}:${id}`;
  doing(`running the command ${JSON.stringify(full)}`);
  const before = await documentText();
  const accepted = await page.evaluate((command) => window.app.commands.executeCommandById(command), full);
  if (!accepted) {
    throw new Error(
      `Obsidian did not run ${full}. Either no command of that id is registered, or it declined - ` +
        `an editor command declines when there is no editor to run in.`
    );
  }
  await settle();
  const after = await documentText();
  if (expectEdit && before === after) {
    throw new Error(
      `${full} ran and the document is exactly as it was. A command that inserts something and ` +
        `changes nothing has not been observed doing anything.`
    );
  }
  return { before, after, changed: before !== after };
}

/**
 * Whether a registered command currently reports itself runnable.
 *
 * `executeCommandById` calls a command's action directly and is not gated by
 * `checkCallback` at all - confirmed empirically while writing
 * `plugin-admin-directory-ui`'s checks: it ran `list-classes` even with
 * `checkCallback` returning `false`. `checkCallback(true)` ("checking, don't
 * run") is what the command palette and the hotkey manager actually call to
 * decide whether to offer a command, so a check about "not shown in the
 * palette" has to ask this, not whether a direct `executeCommandById` call
 * was accepted.
 */
export async function commandIsAvailable(id) {
  const full = id.includes(":") ? id : `${pluginId}:${id}`;
  return page.evaluate((full) => {
    const command = window.app.commands.commands[full];
    if (!command) throw new Error(`No command registered with id ${JSON.stringify(full)}.`);
    return typeof command.checkCallback === "function" ? !!command.checkCallback(true) : true;
  }, full);
}

/**
 * Every command Obsidian holds for this plugin, as it holds them.
 *
 * Read from the application rather than written down here, so that a check
 * comparing the palette with the context menu compares two things the plugin
 * produced instead of one thing the plugin produced and one a check remembered.
 */
export async function registeredCommands() {
  return page.evaluate(
    (prefix) =>
      Object.values(window.app.commands.commands)
        .filter((command) => command.id.startsWith(`${prefix}:`))
        .map((command) => ({ id: command.id, name: command.name })),
    pluginId
  );
}

/**
 * The section the plugin puts its entry in, which is also how that entry is told
 * from everybody else's.
 *
 * Its own name, chosen by the plugin, so it is ours to rely on the way the
 * marker classes are - and it is the only thing in the menu that says which
 * entries came from here. Matching on the titles instead would ask what the
 * commands are called, which is a different question and one the checks below
 * are supposed to be able to fail on separately.
 */
export const menuSection = "safelearn";

/**
 * Opens the editor's context menu the way a right-click opens it, opens the
 * plugin's submenu the way a hover opens it, and reports the whole of what
 * stands in both.
 *
 * The context menu is reached by dispatching at the editor rather than by
 * building a menu here: what the requirement is about is that the commands are
 * *reachable* that way, and a menu assembled in a check would be reachable
 * whether the plugin subscribed to anything or not. The submenu is reached the
 * same way and for the same reason - it opens on a hover, and Obsidian does not
 * take a dispatched `mouseover` for one, so the pointer is really moved onto the
 * entry. Its own click is a no-op, so clicking is not the way in.
 *
 * The entry is found by its section rather than by `.menu-item.has-submenu`
 * alone: Obsidian's own *Copy path*, *Paragraph* and *Insert* carry that class
 * too, and the first match in the document is one of theirs.
 */
async function readEditorMenu() {
  doing("opening the editor's context menu");
  // Wide enough to hover in - see `menuHeight`. Put back in `finally`, so that a
  // check failing here does not leave every check after it in a window it did
  // not ask for.
  await page.setViewport({ width: viewport.width, height: menuHeight });
  try {
    await page.evaluate(() => {
      document.querySelectorAll(".menu").forEach((menu) => menu.remove());
      const content = document.querySelector(".cm-content");
      if (!content) throw new Error("No editor to open a context menu in.");
      const box = content.getBoundingClientRect();
      content.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: Math.round(box.left + 8),
          clientY: Math.round(box.top + 8),
        })
      );
    });
    await settle();

    const parent = await page.evaluate((section) => {
      const element = document.querySelector(`.menu-item[data-section="${section}"].has-submenu`);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
    }, menuSection);

    if (parent) {
      // Moved to it rather than jumped at it: a hover is a transition, and the
      // pointer starting on the entry is not one.
      await page.mouse.move(parent.x, parent.y - 120);
      await page.mouse.move(parent.x, parent.y, { steps: 6 });
      await page
        .waitForFunction(() => document.querySelectorAll(".menu").length >= 2, { timeout: 5000 })
        .catch(() => {
          throw new Error(
            `The plugin's entry in the editor's context menu carries has-submenu, and hovering it ` +
              `opened no second menu. What is missing is the submenu, not the commands: look at ` +
              `whether MenuItem.setSubmenu still opens on hover in this Obsidian.`
          );
        });
    }
    await settle();

    return await page.evaluate((section) => {
      const menus = [...document.querySelectorAll(".menu")];
      const describe = (item) => ({
        title: item.querySelector(".menu-item-title")?.textContent ?? "",
        // The drawn icon, not the name that was asked for. A name Obsidian's set
        // does not hold draws nothing and raises nothing, so the element is the
        // only thing that knows.
        icon: !!item.querySelector(".menu-item-icon svg"),
      });
      const items = (root) => [...root.querySelectorAll(".menu-item")].map(describe);

      const entry = document.querySelector(`.menu-item[data-section="${section}"]`);
      const owner = entry?.closest(".menu") ?? null;
      return {
        topLevel: owner
          ? [...owner.querySelectorAll(`.menu-item[data-section="${section}"]`)].map(describe)
          : [],
        // Nothing under an entry that is not there. Without this an absent
        // plugin would report every menu on screen as its submenu.
        submenu: owner ? menus.filter((menu) => menu !== owner).flatMap(items) : [],
        titles: menus
          .flatMap((menu) => [...menu.querySelectorAll(".menu-item-title")])
          .map((element) => element.textContent ?? ""),
      };
    }, menuSection);
  } finally {
    await page.keyboard.press("Escape");
    await settle();
    await page.setViewport({ ...viewport });
  }
}

/**
 * Every title standing in the editor's context menu, wherever in it it stands -
 * Obsidian's own entries, the plugin's entry, and what is under it.
 *
 * Titles with no text are dropped. `command.name.endsWith("")` is true of every
 * command, so a single menu item without text - from Obsidian, from another
 * plugin, from an entry that comes to carry only an icon - would let a check
 * comparing the palette with the menu pass having established nothing.
 */
export async function editorMenuItems() {
  const { titles } = await readEditorMenu();
  return titles.filter((title) => title.length > 0);
}

/**
 * What the plugin put in the menu's top level, and what stands under its entry.
 *
 * The two are reported apart because that is the claim: one entry among
 * Obsidian's own, and the commands one level below it. A run where the five have
 * come back up to the top level reads here as five and none, which is a
 * different sentence from the menu having lost them.
 */
export async function editorMenuLayout() {
  const { topLevel, submenu } = await readEditorMenu();
  return {
    topLevel: topLevel.map((item) => item.title),
    submenu: submenu.map((item) => item.title),
  };
}

/**
 * Every entry the plugin contributes, and whether each is drawn with an icon.
 *
 * Read from the document, because an icon that was asked for is not an icon that
 * was drawn: `setIcon` with a name Obsidian's set does not hold leaves the icon
 * column empty and raises nothing at all.
 */
export async function editorMenuIcons() {
  const { topLevel, submenu } = await readEditorMenu();
  return [...topLevel, ...submenu];
}

/**
 * Where the open dialog laid out its field and its confirmation.
 *
 * What a dialog claims here is a geometry - that there is space between the two
 * boxes - and a class name cannot establish one: an element carrying
 * `modal-button-container` that a theme collapsed to nothing leaves the button
 * against the lower edge of the field, which is exactly the state the
 * requirement exists to rule out. So this reads the boxes the browser laid out,
 * the way `columnsAreSideBySide` does, rather than the classes somebody meant to
 * lay them out with.
 *
 * The field is whichever of the two the dialog carries - a number field or a
 * textarea - because the field is the one thing the dialogs are entitled to
 * differ in.
 */
export async function dialogBoxes() {
  await page.waitForFunction(
    () => !!document.querySelector(".modal-container input, .modal-container textarea"),
    { timeout: 10000 }
  );
  return page.evaluate(() => {
    const modal = document.querySelector(".modal-container");
    const field = modal?.querySelector("input, textarea");
    const button = modal?.querySelector("button");
    if (!field || !button) return null;
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    };
    return { field: box(field), button: box(button) };
  });
}

/**
 * Answers the dialog a command opened, with the value it asks for.
 *
 * It waits for the dialog rather than assuming it is there: a command that opens
 * nothing would otherwise be reported as one whose dialog was answered.
 */
export async function answerColumnCount(value) {
  doing(`answering the column count with ${JSON.stringify(value)}`);
  await page.waitForFunction(() => !!document.querySelector(".modal-container input"), { timeout: 10000 });
  await page.evaluate((columns) => {
    const input = document.querySelector(".modal-container input");
    input.value = String(columns);
    document.querySelector(".modal-container button").click();
  }, value);
  await settle();
}

/**
 * Answers a dialog that takes a list, with one entry per line.
 *
 * Separate from `answerColumnCount` because the two dialogs ask different
 * things: one takes a number, one takes the class list a person pasted into it,
 * and a helper that took either would have to guess which field it was looking
 * at.
 */
export async function answerNameList(names) {
  doing(`answering the name list with ${JSON.stringify(names)}`);
  await page.waitForFunction(() => !!document.querySelector(".modal-container textarea"), { timeout: 10000 });
  await page.evaluate((lines) => {
    document.querySelector(".modal-container textarea").value = lines.join("\n");
    document.querySelector(".modal-container button").click();
  }, names);
  await settle();
}

/**
 * The name-list dialog's textarea content, read without changing it - unlike
 * `answerNameList`, which always overwrites it. For a check that picked a
 * directory result into the field and wants to read what landed there.
 */
export async function nameListTextareaValue() {
  return page.evaluate(() => document.querySelector(".modal-container textarea")?.value ?? null);
}

/** Confirms the name-list dialog with whatever the textarea currently holds - the other half of `nameListTextareaValue`. */
export async function confirmNameList() {
  doing("confirming the name list with its current contents");
  await page.evaluate(() => document.querySelector(".modal-container button").click());
  await settle();
}

// ################### Directory login and search (plugin-admin-directory-ui) ###################

/**
 * Puts the running plugin instance into a login state without a real PKCE
 * round trip or a live safeLearn instance - `9.3` asks for a check that stays
 * independent of both. Reaches the instance the way Obsidian itself holds it
 * (`app.plugins.plugins[id]`) and stubs `searchDirectory` directly: it is a
 * plain instance method, so replacing it shadows the real one without
 * touching `data.json` or the plugin checkout the vault's plugin folder is
 * linked to.
 */
export async function setDirectoryLoginFixture(entries = []) {
  doing(`seeding a directory login fixture with ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`);
  await page.evaluate(
    ({ id, entries }) => {
      const plugin = window.app.plugins.plugins[id];
      if (!plugin) throw new Error(`No running plugin instance at app.plugins.plugins[${JSON.stringify(id)}].`);
      plugin.data.instanceUrl = "https://safelearn.example.test";
      plugin.accessToken = "fixture-access-token";
      plugin.searchDirectory = async (query) => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return entries;
        return entries.filter(
          (entry) =>
            entry.name.toLowerCase().includes(normalized) ||
            Object.keys(entry.roles).some((role) => role.includes(normalized))
        );
      };
    },
    { id: pluginId, entries }
  );
}

/** Undoes `setDirectoryLoginFixture`, back to "no instance configured" - the state a fresh vault starts in. */
export async function clearDirectoryLoginFixture() {
  await page.evaluate((id) => {
    const plugin = window.app.plugins.plugins[id];
    if (!plugin) return;
    plugin.data.instanceUrl = "";
    plugin.accessToken = null;
    delete plugin.searchDirectory;
  }, pluginId);
}

/** Opens the plugin's own settings tab, the way clicking it in Obsidian's settings window does. */
export async function openPluginSettings() {
  doing("opening the plugin's settings tab");
  await page.evaluate((id) => {
    // `shouldUsePopout()` decides to open the settings window as a separate
    // Electron `BrowserWindow` under this run's window/screen conditions -
    // one Puppeteer, attached only to the main renderer, cannot see or drive.
    // Forced off so the modal mounts inline in the document instead, which is
    // the only thing this override changes: the settings tab's own content
    // and behavior are unaffected either way.
    window.app.setting.shouldUsePopout = () => false;
    window.app.setting.open();
    window.app.setting.openTabById(id);
  }, pluginId);
  await page.waitForFunction(() => !!document.querySelector(".vertical-tab-content .setting-item"), {
    timeout: 10000,
  });
  await settle();
}

export async function closePluginSettings() {
  await page.evaluate(() => window.app.setting.close());
  await settle();
}

/** The name of every setting currently shown in the plugin's settings tab, in DOM order - including ones with no text field, such as "Login". */
export async function settingsFieldNames() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".vertical-tab-content .setting-item")].map(
      (item) => item.querySelector(".setting-item-name")?.textContent ?? ""
    )
  );
}

/** Every text field the settings tab currently shows, by the label `Setting.setName` gave it. */
export async function settingsTextFields() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".vertical-tab-content .setting-item")].reduce((fields, item) => {
      const name = item.querySelector(".setting-item-name")?.textContent ?? "";
      const input = item.querySelector("input[type='text'], input:not([type])");
      if (input) fields[name] = input.value;
      return fields;
    }, {})
  );
}

/** Types into one of the settings tab's text fields, found by its `Setting.setName` label, and blurs it. */
export async function fillSettingsField(label, value) {
  doing(`setting ${JSON.stringify(label)} to ${JSON.stringify(value)}`);
  await page.evaluate(
    ({ label, value }) => {
      const item = [...document.querySelectorAll(".vertical-tab-content .setting-item")].find(
        (candidate) => candidate.querySelector(".setting-item-name")?.textContent === label
      );
      const input = item?.querySelector("input[type='text'], input:not([type])");
      if (!input) throw new Error(`No settings field named ${JSON.stringify(label)}.`);
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));
    },
    { label, value }
  );
  await settle();
}

/** Whether the directory search strip (search input + class dropdown) is rendered above the name-list textarea. */
export async function directorySearchStripPresent() {
  return page.evaluate(() => !!document.querySelector(".modal-container .safelearn-directory-search"));
}

/** Types into the search strip's query field and, if given, chooses a class from its dropdown. */
export async function searchDirectoryStrip(query, className = "") {
  doing(`searching the directory for ${JSON.stringify(query)}${className ? ` in ${className}` : ""}`);
  await page.waitForFunction(() => !!document.querySelector(".modal-container .safelearn-directory-search input"), {
    timeout: 10000,
  });
  // The class dropdown is populated by its own fetch, kicked off when the
  // strip is built and not necessarily settled yet by the time the input
  // exists - see `tasks.md` #7.2. Setting a `<select>` to a value it has no
  // matching `<option>` for yet would silently fall back to the default.
  if (className) {
    await page.waitForFunction(
      () => (document.querySelector(".modal-container .safelearn-directory-class-filter")?.options.length ?? 0) > 1,
      { timeout: 10000 }
    );
  }
  await page.evaluate(
    ({ query, className }) => {
      const strip = document.querySelector(".modal-container .safelearn-directory-search");
      const input = strip.querySelector("input");
      input.value = query;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const select = strip.querySelector("select");
      if (select && className) {
        select.value = className;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    { query, className }
  );
  // The strip debounces (~300ms) before it calls the directory client - see
  // `tasks.md` #7.3. Waited out here rather than reduced in the plugin for a
  // check's convenience.
  await new Promise((resolve) => setTimeout(resolve, 500));
  await settle();
}

/**
 * The directory search strip's currently rendered matches, as text - the
 * plugin renders each as `"${name} — ${roles.join(", ")}"` (`main.ts`
 * `buildDirectorySearch`), not as a separate name attribute, so a check reads
 * the same text a person would.
 */
export async function directorySearchResults() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".modal-container .safelearn-directory-results .safelearn-directory-result")].map(
      (row) => row.textContent ?? ""
    )
  );
}

/** Clicks the search strip's rendered match whose text starts with `name`. */
export async function chooseDirectoryResult(name) {
  doing(`choosing the directory result ${JSON.stringify(name)}`);
  await page.evaluate((name) => {
    const rows = [
      ...document.querySelectorAll(".modal-container .safelearn-directory-results .safelearn-directory-result"),
    ];
    const row = rows.find((candidate) => candidate.textContent?.startsWith(name));
    if (!row) {
      throw new Error(
        `No rendered directory result starting with ${JSON.stringify(name)}, got ${JSON.stringify(rows.map((candidate) => candidate.textContent))}.`
      );
    }
    row.click();
  }, name);
  await settle();
}

/**
 * What the plugin told the person, in the application's own notices.
 *
 * A command that writes a name the server will read as a role is required to
 * say so, and saying so is the only place that fact is visible at all - so a
 * check has to be able to read it rather than take it on trust.
 */
export async function noticesShown() {
  return page.evaluate(() =>
    [...document.querySelectorAll(".notice")].map((notice) => notice.textContent ?? "")
  );
}

/** Clears the notices standing, so a check can scope the question to its own action. */
export async function forgetNotices() {
  await page.evaluate(() => {
    for (const notice of [...document.querySelectorAll(".notice")]) notice.remove();
  });
}

/** Where the cursor and the selection stand, for asserting where a command left them. */
export async function cursorPosition() {
  return page.evaluate(() => {
    const editor = window.app.workspace.activeEditor?.editor;
    if (!editor) return null;
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    return { from: { line: from.line, ch: from.ch }, to: { line: to.line, ch: to.ch } };
  });
}

/**
 * What the browser actually computed for the first element carrying `className`.
 *
 * A frame that is open on one side is a statement about what is drawn, and the
 * class that is supposed to draw it is not the same thing: a rule that never
 * loaded, or one a later rule overrode, leaves the class in place and the frame
 * closed. So the check reads the box, not the markup.
 */
export async function styleOf(container, className, properties) {
  return page.evaluate(
    (selector, name, wanted) => {
      const element = document.querySelector(selector)?.querySelector(`.${name}`);
      if (!element) return null;
      const style = getComputedStyle(element);
      return Object.fromEntries(wanted.map((property) => [property, style.getPropertyValue(property)]));
    },
    container,
    className,
    properties
  );
}

/**
 * The markup of what is on screen, for the one question text cannot answer:
 * whether taking a tag out of a line left the formatting around it standing.
 */
export async function renderedHtml(container) {
  return page.evaluate((selector) => document.querySelector(selector)?.innerHTML ?? "", container);
}

/**
 * Selects from the start of the line holding `from` to the end of the line
 * holding `to`, without typing anything.
 *
 * A selection running across a block has to show the lines it covers - otherwise
 * a person copies text they cannot see - and that is a different input from a
 * cursor resting in a line. Neither may be produced by typing, so this reports
 * the document before and after the way the other cursor actions do.
 */
export async function selectAcross(from, to) {
  return withoutEditing(`selecting from ${JSON.stringify(from)} to ${JSON.stringify(to)}`, () =>
    page.evaluate(
      (first, last) => {
        const editor = window.app.workspace.activeEditor?.editor;
        if (!editor) throw new Error("No active editor to select in.");
        const lines = editor.getValue().split("\n");
        const start = lines.findIndex((line) => line.includes(first));
        const end = lines.findIndex((line) => line.includes(last));
        if (start === -1) throw new Error(`No line holding ${JSON.stringify(first)}.`);
        if (end === -1) throw new Error(`No line holding ${JSON.stringify(last)}.`);
        editor.setSelection({ line: start, ch: 0 }, { line: end, ch: lines[end].length });
        (editor.cm ?? editor).focus();
      },
      from,
      to
    )
  );
}

/**
 * Waits for the editor to have finished redecorating.
 *
 * CodeMirror rebuilds on its own schedule and Obsidian layers its own work on
 * top, so a read taken in the same tick as the action that provoked it reads the
 * state before the rebuild. Two frames rather than one: the plugin's own
 * `requestAnimationFrame` work would otherwise land after the read.
 */
async function settle() {
  await page.evaluate(
    () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  );
}

/** The document as the editor currently holds it, for establishing that an action changed nothing. */
export async function documentText() {
  return page.evaluate(() => window.app.workspace.activeEditor?.editor?.getValue() ?? null);
}

/**
 * Runs an action that is not supposed to touch the text, and reports the
 * document before and after it.
 *
 * The requirement is that marking responds to a cursor move and to a scroll, and
 * neither may be checked by typing: typing also changes the document, so a check
 * built on it would pass against an implementation that only ever reacts to text
 * changes - which is precisely today's defect. So the actions below hand back the
 * evidence that no text moved, rather than a check having to take it on trust.
 */
async function withoutEditing(action, body) {
  doing(action);
  const before = await documentText();
  await body();
  await settle();
  const after = await documentText();
  return { before, after, changed: before !== after };
}

/**
 * Types at the cursor the way a keyboard does, rather than setting document
 * state. A decoration that follows an edit to the wrong position is a defect
 * about input handling, and assigning the document text would not exercise it.
 */
export async function type(text) {
  doing(`typing ${JSON.stringify(text)}`);
  const before = await documentText();
  await page.keyboard.type(text, { delay: 20 });
  await settle();
  const after = await documentText();

  // Established rather than assumed, for the same reason the actions that must
  // *not* edit report what they did: keystrokes go wherever the focus is, and a
  // check whose typing never reached the document reads the markings it left
  // untouched as a pass.
  if (before === after) {
    throw new Error(
      `Typing ${JSON.stringify(text)} left the document exactly as it was. The keystrokes went ` +
        `somewhere other than the editor - something modal in front of it takes them.`
    );
  }
  return { before, after, changed: true };
}

/**
 * Puts the cursor at the end of the line holding `needle`, in the editor.
 *
 * The focus goes through CodeMirror rather than through Obsidian's editor
 * wrapper, here and in the three actions below it. `editor.focus()` is the
 * obvious call and it silently does nothing once the keyboard has been
 * somewhere the wrapper does not track - typing into a table leaves it that
 * way, and opening another document does not clear it. Keystrokes then go to
 * the page body, and a check that typed afterwards read the document as
 * unchanged, which is indistinguishable from a plugin that ignored the edit.
 * `cm.focus()` is what the page actually acts on.
 */
export async function placeCursorAfter(needle) {
  return withoutEditing(`placing the cursor after ${JSON.stringify(needle)}`, () =>
    page.evaluate((text) => {
      const editor = window.app.workspace.activeEditor?.editor;
      if (!editor) throw new Error("No active editor to place a cursor in.");
      const lines = editor.getValue().split("\n");
      const line = lines.findIndex((l) => l.includes(text));
      if (line === -1) throw new Error(`No line holding ${JSON.stringify(text)}.`);
      editor.setCursor({ line, ch: lines[line].length });
      (editor.cm ?? editor).focus();
    }, needle)
  );
}

/**
 * Puts the cursor at the very start of the document.
 *
 * The one position no other action here can reach, and the one a command must
 * not write above when the first line is a directive that gates the file.
 */
export async function placeCursorAtStart() {
  return withoutEditing("placing the cursor at the start of the document", () =>
    page.evaluate(() => {
      const editor = window.app.workspace.activeEditor?.editor;
      if (!editor) throw new Error("No active editor to place a cursor in.");
      editor.setCursor({ line: 0, ch: 0 });
      (editor.cm ?? editor).focus();
    })
  );
}

/**
 * Puts the cursor inside `needle` rather than beside it - in Live Preview a tag
 * is shown as its own characters only while the cursor is in it, so "beside"
 * would not exercise the rule at all. The middle of the occurrence, so no
 * boundary decides the outcome.
 *
 * `last` picks the last line holding the needle rather than the first. It exists
 * for the marker that closes a permission block: `@@@` stands on that line and
 * on the directive line that opened the block, and the two are shown by
 * different rules - a check that means the one and reaches the other passes
 * against a plugin that does nothing to either.
 */
export async function moveCursorInto(needle, { last = false } = {}) {
  return withoutEditing(`moving the cursor into ${last ? "the last " : ""}${JSON.stringify(needle)}`, () =>
    page.evaluate(
      (text, fromTheEnd) => {
        const editor = window.app.workspace.activeEditor?.editor;
        if (!editor) throw new Error("No active editor to place a cursor in.");
        const lines = editor.getValue().split("\n");
        const holding = lines.flatMap((l, index) => (l.includes(text) ? [index] : []));
        if (holding.length === 0) throw new Error(`No line holding ${JSON.stringify(text)}.`);
        const line = fromTheEnd ? holding[holding.length - 1] : holding[0];
        editor.setCursor({ line, ch: lines[line].indexOf(text) + Math.floor(text.length / 2) });
        (editor.cm ?? editor).focus();
      },
      needle,
      last
    )
  );
}

/**
 * Scrolls the line holding `needle` into view and touches nothing else.
 *
 * Deliberately not `reveal`: that one moves the cursor to the line first, so a
 * plugin that rebuilds on a cursor move alone would satisfy a check meant for
 * scrolling. Here the cursor stays where it was, which is what makes the scroll
 * the only thing that happened.
 */
export async function scrollTo(needle) {
  const result = await withoutEditing(`scrolling to ${JSON.stringify(needle)}`, () =>
    page.evaluate((text) => {
      const editor = window.app.workspace.activeEditor?.editor;
      if (!editor) throw new Error("No active editor to scroll.");
      const lines = editor.getValue().split("\n");
      const line = lines.findIndex((l) => l.includes(text));
      if (line === -1) throw new Error(`No line holding ${JSON.stringify(text)}.`);
      editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: lines[line].length } }, true);
    }, needle)
  );
  // The scroll is what brings the line into the DOM at all; without waiting for
  // that, a check reads an absence it caused itself. See `reveal`.
  //
  // The editor is asked, rather than the rendered text: in Live Preview a line
  // holding `[[a-note]]` or a heading is on screen as something that does not
  // contain those characters at all, so waiting for the source text to appear
  // waits for something that never will.
  //
  // The viewport rather than `visibleRanges`, for the same reason one step
  // further on: a document rendered mostly as widgets - a corpus file of nested
  // quotes is one - has almost none of its source in a visible range, because
  // what replaced it is what is on screen. The viewport is the part of the
  // document the editor has built at all, which is the question being asked.
  await page.waitForFunction(
    (text) => {
      const editor = window.app.workspace.activeEditor?.editor;
      const view = editor?.cm;
      if (!view) return false;
      const index = editor.getValue().split("\n").findIndex((l) => l.includes(text));
      if (index === -1) return false;
      const at = view.state.doc.line(index + 1).from;
      return view.viewport.from <= at && at <= view.viewport.to;
    },
    { timeout: 15000 },
    needle
  );
  await settle();
  return result;
}

/**
 * Closes every open document but one.
 *
 * A check that opened a second view beside the first has to put the window back
 * the way it found it. `markers()` and the rest read the first `.cm-content` in
 * the document, and with two editors on screen that is whichever one the layout
 * happens to put first - so a leaf left standing turns the next check into a
 * question about a different document than it thinks.
 */
export async function closeExtraViews() {
  doing("closing extra views");
  await page.evaluate(() => {
    const leaves = window.app.workspace.getLeavesOfType("markdown");
    for (const leaf of leaves.slice(1)) leaf.detach();
  });
  await settle();
}

// ################### Whether the editor reaches into rendered output ###################

/**
 * Puts a paragraph of raw text into the rendered reading view, from outside the
 * plugin, and reports what became of it.
 *
 * This is how "the editor does not modify rendered output" is asked as a
 * question with an answer. The editor's rewrite of the reading view removes tags
 * from text that carries them, and a view it has already been through carries
 * none - so running it a second time changes nothing observable, and a check
 * watching for changes would see none whether the mechanism is there or not.
 * Text planted after the fact is text the rewrite has not seen: if the editor
 * reaches into rendered output while a person types, the planted tag is taken
 * out of it, and if it does not, the text stands as it was left.
 */
export async function plantInRenderedView(text) {
  doing(`planting ${JSON.stringify(text)} in the rendered view`);
  await page.evaluate((body) => {
    const view = document.querySelector(".markdown-preview-view");
    if (!view) throw new Error("No rendered reading view to plant anything in.");
    const planted = document.createElement("p");
    planted.className = "harness-planted";
    planted.textContent = body;
    view.appendChild(planted);
  }, text);
  return text;
}

/** What the planted paragraph says now, or null if it is no longer there at all. */
export async function plantedText() {
  return page.evaluate(() => document.querySelector(".harness-planted")?.textContent ?? null);
}

// ################### Documents a check constructs ###################

/** Where a run's disposable vault is, so a check can establish what it holds. */
export function vaultPath() {
  return vaultDir;
}

/** Where the corpus is, so a check can establish that it was left alone. */
export function corpusPath() {
  return path.join(projectRoot, "md");
}

/**
 * Writes a document into the vault this run assembled.
 *
 * The corpus cannot absorb test material - `md/` is what the authenticated suite
 * asserts against - but some behavior only appears in a *combination* of tag
 * forms that no corpus file happens to carry: a file-level directive with tags
 * below it, or a fragment at the start of a line inside a block. Those are
 * written here, into the copy that is rebuilt from scratch every run.
 *
 * The path is resolved and checked against the vault before anything is written,
 * so a check that passes `../../md/test-md-file.md` by mistake is refused rather
 * than quietly rewriting the corpus. Obsidian creates the file itself, because a
 * file appearing underneath it is noticed on the file watcher's schedule and a
 * check would be reading a vault that does not know about it yet.
 */
export async function writeDocument(name, text) {
  const target = path.resolve(vaultDir, name);
  const inside = path.relative(vaultDir, target);
  if (inside === "" || inside.startsWith("..") || path.isAbsolute(inside)) {
    throw new Error(
      `${name} resolves to ${target}, which is outside the run's vault at ${vaultDir}. A check ` +
        `may only construct documents inside the disposable vault - the corpus in md/ is what the ` +
        `authenticated suite asserts against.`
    );
  }
  const vaultRelative = inside.split(path.sep).join("/");
  doing(`writing ${vaultRelative}`, vaultRelative);
  await page.evaluate(
    async (file, body) => {
      const existing = window.app.vault.getAbstractFileByPath(file);
      if (existing) await window.app.vault.modify(existing, body);
      else await window.app.vault.create(file, body);
    },
    vaultRelative,
    text
  );
  await page.waitForFunction(
    (file) => window.app.vault.getMarkdownFiles().some((f) => f.path === file),
    { timeout: 15000 },
    vaultRelative
  );
  return vaultRelative;
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
