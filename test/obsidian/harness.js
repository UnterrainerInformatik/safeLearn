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

/** Puts the cursor at the end of the line holding `needle`, in the editor. */
export async function placeCursorAfter(needle) {
  return withoutEditing(`placing the cursor after ${JSON.stringify(needle)}`, () =>
    page.evaluate((text) => {
      const editor = window.app.workspace.activeEditor?.editor;
      if (!editor) throw new Error("No active editor to place a cursor in.");
      const lines = editor.getValue().split("\n");
      const line = lines.findIndex((l) => l.includes(text));
      if (line === -1) throw new Error(`No line holding ${JSON.stringify(text)}.`);
      editor.setCursor({ line, ch: lines[line].length });
      editor.focus();
    }, needle)
  );
}

/**
 * Puts the cursor inside `needle` rather than beside it - in Live Preview a tag
 * is shown as its own characters only while the cursor is in it, so "beside"
 * would not exercise the rule at all. The middle of the first occurrence, so no
 * boundary decides the outcome.
 */
export async function moveCursorInto(needle) {
  return withoutEditing(`moving the cursor into ${JSON.stringify(needle)}`, () =>
    page.evaluate((text) => {
      const editor = window.app.workspace.activeEditor?.editor;
      if (!editor) throw new Error("No active editor to place a cursor in.");
      const lines = editor.getValue().split("\n");
      const line = lines.findIndex((l) => l.includes(text));
      if (line === -1) throw new Error(`No line holding ${JSON.stringify(text)}.`);
      editor.setCursor({ line, ch: lines[line].indexOf(text) + Math.floor(text.length / 2) });
      editor.focus();
    }, needle)
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
