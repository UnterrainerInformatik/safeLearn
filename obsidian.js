import fs from "fs";
import path from "path";
import pako from "pako";
import { v4 as uuidv4 } from "uuid";
import { JSDOM } from "jsdom";
import { hasSomeRoles } from "./utils.js";
import { getPermissionContext } from "./permission-context.js";
import * as lucideIcons from "lucide-static";

const internalTags = {
  callout: {
    string: {
      start: "<calloutstart/>",
      end: "<calloutend/>",
    },
    regexp: {
      start: "<calloutstart/>",
      end: "<calloutend/>",
    },
  },
};
const internalSubstitutions = {
  code: {
    string: "@#@##@@--@code@--@@##@#@",
    regexp: /@#@##@@--@code@--@@##@#@/gms,
  },
  fragment_single: {
    string: "<!-- __fragment-marker__ -->"
  },
  side_by_side_start: {
    string: "<!-- __side-by-side-start__ -->"
  },
  side_by_side_separator: {
    string: "<!-- __side-by-side-separator__ -->"
  },
  side_by_side_end: {
    string: "<!-- __side-by-side-end__ -->"
  },
};

const VISIBILITY_POLL_INTERVAL_MS = (() => {
  const raw = Number.parseInt(
    process.env.PERMISSION_VISIBILITY_INTERVAL_MS ?? "5000",
    10
  );
  if (Number.isNaN(raw)) {
    return 5000;
  }
  return Math.max(1000, raw);
})();

const timedPermissionEntries = new Map();
let visibilityInterval = null;
let visibilityChangeCallback = null;

const inlinePermissionRegex = /^[ \t]*@@@(.*?)\n([\s\S]*?)@@@/gms;

let codeList = [];
let openNavTreeScript = "";

export const callouts = {
  note: {
    icon: "Pencil",
    color: "#086ddd",
  },
  abstract: {
    icon: "ClipboardList",
    color: "#00bfbc",
  },
  summary: { link: "abstract" },
  tldr: { link: "abstract" },
  info: {
    icon: "Info",
    color: "#086ddd",
  },
  todo: {
    icon: "CheckCircle2",
    color: "#086ddd",
  },
  tip: {
    icon: "Flame",
    color: "#00bfbc",
  },
  hint: { link: "tip" },
  important: { link: "tip" },
  success: {
    icon: "Check",
    color: "#08b94e",
  },
  done: { link: "success" },
  check: { link: "success" },
  question: {
    icon: "HelpCircle",
    color: "#ec7500",
  },
  help: { link: "question" },
  faq: { link: "question" },
  warning: {
    icon: "AlertTriangle",
    color: "#ec7500",
  },
  caution: { link: "warning" },
  attention: { link: "warning" },
  failure: {
    icon: "X",
    color: "#e93147",
  },
  fail: { link: "failure" },
  missing: { link: "failure" },
  danger: {
    icon: "Zap",
    color: "#e93147",
  },
  error: { link: "danger" },
  bug: {
    icon: "Bug",
    color: "#e93147",
  },
  example: {
    icon: "List",
    color: "#7852ee",
  },
  quote: {
    icon: "Quote",
    color: "#9e9e9e",
  },
  cite: { link: "quote" },
};

// Datastructures to store the file paths.
// Key is the file-name without path (and no extension for the md-file-list).
// Value is an array of the relative paths to all the files with that name anywhere in the file-system.
// If there is only one file with that name, the array will contain only one element.
export let dirPrefix = "";
export const mdFilesMap = {};
export const filesMap = {};
export const mdFilesDir = {};
export let mdFilesDirStructure = {};
export const mainFonts = {};
export const mainFontsArray = [];
export const navFonts = {};
export const navFontsArray = [];
export let contentMap = {};

function parseLocalDateTime(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
  if (hasTimezone) {
    const zoned = new Date(trimmed);
    return Number.isNaN(zoned.getTime()) ? null : zoned;
  }
  const [datePart, timePart] = trimmed.split(/[T ]/);
  if (!datePart) {
    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [year, month, day] = datePart
    .split("-")
    .map((segment) => Number.parseInt(segment, 10));
  if ([year, month, day].some((segment) => Number.isNaN(segment))) {
    return null;
  }
  let hour = 0;
  let minute = 0;
  let second = 0;
  if (timePart) {
    const [h, m, s] = timePart.split(":").map((segment) => {
      if (segment === undefined) return undefined;
      return Number.parseInt(segment, 10);
    });
    if (!Number.isNaN(h)) hour = h;
    if (!Number.isNaN(m)) minute = m;
    if (!Number.isNaN(s)) second = s;
  }
  const localDate = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(localDate.getTime()) ? null : localDate;
}

function parsePermissionWindow(rawWindow) {
  if (!rawWindow || typeof rawWindow !== "string") {
    return null;
  }
  const windowText = rawWindow.trim();
  if (!windowText) {
    return null;
  }
  if (/^to\s+/i.test(windowText)) {
    const endOnly = parseLocalDateTime(windowText.replace(/^to\s+/i, ""));
    if (!endOnly) return null;
    return { start: null, end: endOnly.getTime() };
  }
  const parts = windowText.split(/\s+to\s+/i);
  let start = null;
  let end = null;
  if (parts.length === 1) {
    start = parseLocalDateTime(parts[0]);
  } else if (parts.length >= 2) {
    start = parseLocalDateTime(parts[0]);
    end = parseLocalDateTime(parts.slice(1).join(" to "));
  }
  if (!start && !end) {
    return null;
  }
  return {
    start: start ? start.getTime() : null,
    end: end ? end.getTime() : null,
  };
}

function parsePermissionEntry(token) {
  if (typeof token !== "string") {
    return null;
  }
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^(?<role>[^\[\]]+?)(?:\s*\[(?<window>.+)\])?$/);
  if (!match || !match.groups?.role) {
    return null;
  }
  const role = match.groups.role.trim().toLowerCase();
  if (!role) {
    return null;
  }
  const window = parsePermissionWindow(match.groups.window);
  return {
    role,
    window,
  };
}

function parsePermissionEntries(raw) {
  if (typeof raw !== "string") {
    return [];
  }
  return raw
    .split(",")
    .map((token) => parsePermissionEntry(token))
    .filter((entry) => entry !== null);
}

export function parseFirstLineForPermissions(line) {
  if (typeof line !== "string") {
    return null;
  }
  const match = line.match(/^\s*@@@\s*(.*)/);
  if (!match) {
    return null;
  }
  const entries = parsePermissionEntries(match[1]);
  return entries.length > 0 ? entries : [];
}

function isPermissionEntryActive(entry, referenceTime = Date.now()) {
  if (!entry) {
    return false;
  }
  if (!entry.window) {
    return true;
  }
  const { start, end } = entry.window;
  if (start && referenceTime < start) {
    return false;
  }
  if (end && referenceTime > end) {
    return false;
  }
  return true;
}

export function getActivePermissionRoles(permissions, referenceDate = new Date()) {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    return [];
  }
  const referenceTime = referenceDate instanceof Date ? referenceDate.getTime() : referenceDate;
  return permissions
    .filter((entry) => isPermissionEntryActive(entry, referenceTime))
    .map((entry) => entry.role);
}

/**
 * Decides whether a session may see content addressed by a whole-file
 * permission directive. This is the one implementation of that rule, and it
 * exists because two callers ask the same question from different sides:
 * getDirectoryListing below builds the navigation tree from the index entries
 * a scan derived, and sanitizeAndParseMarkdown in app.js parses the directive
 * out of the file it just read. When the rule lived in both of them, an edit
 * that reached only one - what a closed time window means, how the roles are
 * tested - let a session see a file in the tree that refuses to open, or hid
 * one it was allowed to read.
 *
 * It takes an already parsed directive rather than a path, because the page
 * handler, /convert and mdGetToHtml hold content that has no corpus file
 * behind it. A null or undefined directive means the file names no roles and
 * every authenticated session may see it.
 *
 * Returns { visible: true } or { visible: false, reason } where reason is
 * "outside-window" when the directive's time windows leave no role active at
 * all, and "role" when the session simply does not hold one of them. The tree
 * ignores the reason; the page turns it into its two messages.
 */
export async function resolveFileVisibility(req, permissions) {
  if (permissions === null || permissions === undefined) {
    return { visible: true };
  }
  // The request's own reference time, not this call's. The navigation tree and
  // the page it links to reach this function from different sides, and a window
  // that closes between the two would otherwise leave them disagreeing about
  // the same file.
  const { referenceDate } = await getPermissionContext(req);
  const activeRoles = getActivePermissionRoles(permissions, referenceDate);
  if (activeRoles.length === 0) {
    return { visible: false, reason: "outside-window" };
  }
  if (await hasSomeRoles(req, activeRoles, true)) {
    return { visible: true };
  }
  return { visible: false, reason: "role" };
}

function hasTimedWindow(entry) {
  return Boolean(entry?.window && (entry.window.start || entry.window.end));
}

/**
 * Every inline `@@@` block of a document, as the file writes it: where the block
 * begins and ends, where its body begins and ends, and the entries its directive
 * parses to.
 *
 * What is deliberately absent is any verdict. Who may see a block depends on the
 * session asking and on the moment it asks - `role-resolution` makes that the
 * whole point of resolving it per request - so a conclusion recorded here would
 * be a conclusion recorded for one session and handed to the next. The index
 * stores this shape and nothing more; the decision is taken by
 * `filterForbiddenSegments` when a request actually asks.
 */
function extractInlinePermissionBlocks(markdown) {
  if (typeof markdown !== "string" || markdown.length === 0) {
    return [];
  }
  const regex = new RegExp(inlinePermissionRegex);
  const blocks = [];
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const end = match.index + match[0].length;
    blocks.push({
      start: match.index,
      end,
      // The body ends three characters - the closing `@@@` - before the block.
      contentStart: end - 3 - match[2].length,
      contentEnd: end - 3,
      entries: parsePermissionEntries(match[1]),
    });
  }
  return blocks;
}

function registerTimedPermissionEntries(fileFullPath, sourceKey, entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }
  const now = Date.now();
  entries.forEach((entry, index) => {
    if (!hasTimedWindow(entry)) {
      return;
    }
    const key = `${fileFullPath}::${sourceKey}::${index}`;
    timedPermissionEntries.set(key, {
      file: fileFullPath,
      entry,
      wasActive: isPermissionEntryActive(entry, now),
    });
  });
}

/**
 * The windows the visibility timer watches, rebuilt from the index rather than
 * from the corpus.
 *
 * It used to read every file of the corpus on every scan, which made the
 * carry-forward in `scanFiles` worth nothing: one edit still opened all of them.
 * Now that an index entry carries the parsed directives of a file's blocks, this
 * is a walk over what the scan already holds, and a scan really does read only
 * what changed.
 */
async function rebuildTimedPermissionSchedule(indexEntries = new Map()) {
  timedPermissionEntries.clear();
  for (const [fullPath, entry] of indexEntries) {
    if (entry.permissions !== null && entry.permissions !== undefined) {
      registerTimedPermissionEntries(fullPath, "file", entry.permissions);
    }
    entry.blocks.forEach((block, idx) => {
      registerTimedPermissionEntries(fullPath, `block-${idx}`, block.entries);
    });
  }
  ensureVisibilityTimerState();
}

function ensureVisibilityTimerState() {
  if (timedPermissionEntries.size === 0) {
    if (visibilityInterval) {
      clearInterval(visibilityInterval);
      visibilityInterval = null;
    }
    return;
  }
  if (!visibilityInterval) {
    visibilityInterval = setInterval(runVisibilityChecks, VISIBILITY_POLL_INTERVAL_MS);
  }
}

function runVisibilityChecks() {
  if (timedPermissionEntries.size === 0) {
    return;
  }
  const now = Date.now();
  const filesToReload = new Set();
  for (const entry of timedPermissionEntries.values()) {
    const currentlyActive = isPermissionEntryActive(entry.entry, now);
    if (entry.wasActive !== currentlyActive) {
      entry.wasActive = currentlyActive;
      filesToReload.add(entry.file);
    }
  }
  if (filesToReload.size > 0 && typeof visibilityChangeCallback === "function") {
    console.log(
      `[TimedPermissions] Visibility changed for: ${Array.from(filesToReload).join(", ")}`
    );
    visibilityChangeCallback(Array.from(filesToReload));
  }
}

export function registerVisibilityChangeCallback(callback) {
  visibilityChangeCallback = typeof callback === "function" ? callback : null;
}

/**
 * Everything the index records about one file, from one read of it.
 *
 * This used to be a stream closed after its first line, because the directive on
 * that line was all the index held. It holds the text and the block boundaries
 * too now, so that a search can decide which files are worth opening without
 * touching the disk - and all three come out of the same read rather than out of
 * three passes over the same file.
 *
 * What the read costs was measured against the production corpus: 279 files,
 * 1.41 MB, 15 ms for the whole of it. A scan pays that once, on the files that
 * actually changed.
 */
async function readCorpusFile(filePath) {
  const text = await fs.promises.readFile(filePath, "utf8");
  // `readline` handed the first line over without its line ending, whichever of
  // the two it was, and `parseFirstLineForPermissions` is held to the same input
  // as before.
  const firstLine = text.split("\n", 1)[0].replace(/\r$/, "");
  return {
    permissions: parseFirstLineForPermissions(firstLine),
    text,
    blocks: extractInlinePermissionBlocks(text),
  };
}

function makeSafeForCSS(name) {
  return name.replace(/[^a-z0-9]/g, function (s) {
    var c = s.charCodeAt(0);
    if (c == 32) return "-";
    if (c >= 65 && c <= 90) return "_" + s.toLowerCase();
    return "__" + ("000" + c.toString(16)).slice(-4);
  });
}

/**
 * The name a file in one of the font directories is offered under, or `null`
 * when it is not one of the fonts the picker offers.
 *
 * The picker lists one entry per family and the preference stores the user's
 * choice as an index into that list, so what lands here decides what an already
 * stored preference points at. Two kinds of file are passed over:
 *
 * - anything that is not a `.ttf`: the licence text that ships beside a font is
 *   not a font.
 * - a weight variant, written as the family followed by `-` and its numeric
 *   weight (`Lato-300.ttf`). Those are there for a stylesheet that asks for the
 *   family and the weight — `css/reveal-theme-moon.css` does, over the same
 *   files — and offering them would list one family three times and move every
 *   preference stored behind it.
 *
 * `OpenDyslexic3-Regular.ttf` is a family and not a variant: what marks a
 * variant is the number.
 */
function pickerFontName(file) {
  const extension = path.extname(file);
  if (extension.toLowerCase() !== ".ttf") return null;
  const name = path.basename(file, extension);
  if (/-\d{3}$/.test(name)) return null;
  return name;
}

export async function scanFonts(dir, root = dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    try {
      if (dir && file) {
        // Check if dir and file are not null
        const filePath = path.join(dir, file);
        const isDirectory = fs.statSync(filePath).isDirectory();
        if (isDirectory) {
          const nmods = process.env.NEXT_PUBLIC_IS_APP_FOLDER
            ? "/app/node_modules"
            : "node_modules";
          const slides = process.env.NEXT_PUBLIC_IS_APP_FOLDER
            ? "/app/slides"
            : "slides";
          if (
            filePath.startsWith(".") ||
            filePath.startsWith(nmods) ||
            filePath.startsWith(slides)
          )
            continue;
          scanFonts(filePath, root);
        } else {
          // All other files.
          const fileName = path.basename(file);
          const relativePath = path.relative(root, filePath);
          const p = relativePath.replace(/\\/g, "/");
          const fontName = pickerFontName(file);
          if (fontName && p.startsWith("main-fonts/")) {
            mainFonts[fontName] = "assets/" + p;
            mainFontsArray.push(fontName);
          }
          if (fontName && p.startsWith("nav-fonts/")) {
            navFonts[fontName] = "assets/" + p;
            navFontsArray.push(fontName);
          }
        }
      }
    } catch (err) {
      console.error(`Error reading file while scanning fonts ${file}`, err);
    }
  }
}

/**
 * If it's the root dir, dirPrefix should be an empty string.
 */
// Persistent snapshot across scans
let lastFileSnapshot = new Map();

/**
 * What the last scan derived from every file it saw, keyed by fullPath (the
 * `md/...` form, the same string lastFileSnapshot uses): `{ mtime, permissions,
 * text, blocks }`. A scan rebuilds the index from scratch, and deriving all of
 * that again meant opening the entire corpus each time - with NEXT_AUTOSCAN on,
 * once per keystroke-triggered save anywhere under md/. An entry whose mtime
 * still matches is carried forward whole instead of read again.
 *
 * `text` and `blocks` are here so that a search can decide which files are worth
 * opening without touching the disk; they are never what a reader is answered
 * from. `corpus-search` states that rule and `searchCorpus` below obeys it: a
 * candidate proposed here is read from disk again before a single word of it
 * reaches anyone.
 *
 * What this assumes: that mtime moves when the content does. Where it does not
 * - a filesystem with coarse timestamps, a restore that preserves mtimes - the
 * carried-forward directive goes stale and the navigation tree disagrees with
 * the page for that file until the next real change. The page handler reads the
 * file itself and refuses correctly regardless, so this costs visibility, never
 * access. The assumption is not new: the watcher's own `modified` list already
 * rests on exactly this comparison. This extends its reach, it does not
 * introduce it.
 *
 * Rebuilt from the files each scan saw, so a deleted file's entry does not
 * survive it.
 */
let lastIndexEntries = new Map();

/**
 * Scans all markdown files recursively and detects added/removed/modified files.
 * Returns { added, removed, modified } with full paths like "md/subdir/file.md".
 */
export async function scanFiles(prefix, dir, resetFonts = false, root = dir) {
  const previousSnapshot = new Map(lastFileSnapshot);
  const newSnapshot = new Map();

  // Recursively collect file mtimes
  function snapshotDir(d) {
    const files = fs.readdirSync(d);
    for (const f of files) {
      const filePath = path.join(d, f);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        // Skip excluded folders
        const nmods = process.env.NEXT_PUBLIC_IS_APP_FOLDER ? "/app/node_modules" : "node_modules";
        const slides = process.env.NEXT_PUBLIC_IS_APP_FOLDER ? "/app/slides" : "slides";
        if (
          filePath.startsWith(".") ||
          filePath.startsWith(nmods) ||
          filePath.startsWith(slides)
        )
          continue;
        snapshotDir(filePath);
      } else if (path.extname(f) === ".md") {
        const rel = prefix + path.relative(root, filePath).replace(/\\/g, "/");
        newSnapshot.set(rel, stat.mtimeMs);
      }
    }
  }

  snapshotDir(dir);

  // Diff detection
  const added = [];
  const removed = [];
  const modified = [];

  for (const [file, mtime] of newSnapshot) {
    if (!previousSnapshot.has(file)) {
      added.push(file);
    } else if (previousSnapshot.get(file) !== mtime) {
      modified.push(file);
    }
  }

  for (const [file] of previousSnapshot) {
    if (!newSnapshot.has(file)) {
      removed.push(file);
    }
  }

  // Save new snapshot
  lastFileSnapshot = newSnapshot;

  // Reset old global data (compatibility)
  dirPrefix = prefix;
  Object.keys(mdFilesMap).forEach(key => delete mdFilesMap[key]);
  Object.keys(filesMap).forEach(key => delete filesMap[key]);
  Object.keys(mdFilesDir).forEach(key => delete mdFilesDir[key]);
  if (resetFonts) {
    Object.keys(mainFonts).forEach(key => delete mainFonts[key]);
    mainFontsArray.length = 0;
    Object.keys(navFonts).forEach(key => delete navFonts[key]);
    navFontsArray.length = 0;
  }
  contentMap = {};
  mdFilesDirStructure = {};

  // Rebuild maps
  scanFilesInternal(dir, root);

  // Build file metadata
  const carriedEntries = lastIndexEntries;
  const currentEntries = new Map();
  let mdFiles = await Promise.all(
    Object.keys(mdFilesDir).map(async (file) => {
      const pwe = mdFilesDir[file];
      const folders = pwe.split("/").slice(0, -1).join("/");
      const folderArray = folders.split("/");
      if (folderArray.length === 1 && folderArray[0] === "") {
        folderArray.pop();
      }
      const absPath = path.join(dir, file);
      const relFullPath = prefix + file;
      const mtime = fs.existsSync(absPath) ? fs.statSync(absPath).mtimeMs : 0;
      // Carry the entry forward when the file has not moved since the last scan
      // saw it, and open the file only otherwise. The first scan of a process
      // finds an empty map and therefore reads everything, which needs no branch
      // of its own. The condition is the one it always was: same path and same
      // mtime reuses everything the entry holds, anything else derives all of it
      // from one read.
      const carried = carriedEntries.get(relFullPath);
      const derived =
        carried && carried.mtime === mtime ? carried : await readCorpusFile(absPath);
      const { permissions, text, blocks } = derived;
      currentEntries.set(relFullPath, { mtime, permissions, text, blocks });
      return {
        [file]: {
          path: file,
          fullPath: relFullPath, // <-- new: full md/... path
          absolutePath: absPath,
          pathWithoutExt: pwe,
          folders,
          folderArray,
          depth: folders === "" ? 0 : folders.split("/").length,
          fileName: file.split("/").pop(),
          fileNameWithoutExtension: pwe.split("/").pop().split(".")[0],
          lastFolder: pwe.split("/").slice(-2, -1)[0] || "",
          cssName: makeSafeForCSS(folders),
          permissions,
          mtime,
        },
      };
    })
  );

  // Built from the files this scan saw, so a removed file's entry is gone.
  lastIndexEntries = currentEntries;

  // Flatten
  mdFiles = mdFiles.reduce((acc, file) => {
    const key = Object.keys(file)[0];
    acc[key] = file[key];
    return acc;
  }, {});

  // Sort like before
  mdFiles = Object.entries(mdFiles)
    .sort(([keyA, valueA], [keyB, valueB]) => {
      for (let i = 0; i < Math.min(valueA.folderArray.length, valueB.folderArray.length); i++) {
        const comp = valueA.folderArray[i].localeCompare(valueB.folderArray[i], undefined, { sensitivity: "base" });
        if (comp !== 0) return comp;
      }
      if (valueA.folderArray.length !== valueB.folderArray.length) {
        return valueB.folderArray.length - valueA.folderArray.length;
      }
      return valueA.fileName.localeCompare(valueB.fileName, undefined, { sensitivity: "base" });
    })
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  mdFilesDirStructure = mdFiles;

  await rebuildTimedPermissionSchedule(currentEntries);

  return { added, removed, modified };
}

function scanFilesInternal(dir, root = dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    try {
      if (dir && file) {
        // Check if dir and file are not null
        const filePath = path.join(dir, file);
        const isDirectory = fs.statSync(filePath).isDirectory();

        if (isDirectory) {
          const nmods = process.env.NEXT_PUBLIC_IS_APP_FOLDER
            ? "/app/node_modules"
            : "node_modules";
          const slides = process.env.NEXT_PUBLIC_IS_APP_FOLDER
            ? "/app/slides"
            : "slides";
          if (
            filePath.startsWith(".") ||
            filePath.startsWith(nmods) ||
            filePath.startsWith(slides)
          )
            continue;
          scanFilesInternal(filePath, root);
        } else if (path.extname(file) === ".md") {
          // MD files.
          const fileNameWithoutExt = path.basename(file, ".md");
          const relativePath = path.relative(root, filePath);
          const p = relativePath.replace(/\\/g, "/");
          // MD files.
          const dirPathWithoutFileName = path.dirname(relativePath);
          let p2 = dirPathWithoutFileName.replace(/\\/g, "/");
          p2 = p2 + "/" + fileNameWithoutExt;
          if (p2.startsWith("./")) {
            p2 = p2.slice(2);
          }
          mdFilesDir[p] = p2;
          if (mdFilesMap[fileNameWithoutExt]) {
            mdFilesMap[fileNameWithoutExt].push(p);
          } else {
            mdFilesMap[fileNameWithoutExt] = [p];
          }
        } else {
          // All other files.
          const fileName = path.basename(file);
          const relativePath = path.relative(root, filePath);
          const p = relativePath.replace(/\\/g, "/");
          if (filesMap[fileName]) {
            filesMap[fileName].push(p);
          } else {
            filesMap[fileName] = [p];
          }
          const fontName = pickerFontName(file);
          if (fontName && p.startsWith("assets/main-fonts/")) {
            mainFonts[fontName] = p;
            mainFontsArray.push(fontName);
          }
          if (fontName && p.startsWith("assets/nav-fonts/")) {
            navFonts[fontName] = p;
            navFontsArray.push(fontName);
          }
        }
      }
    } catch (err) {
      console.error(`Error reading file ${file}`, err);
    }
  }
}

export function lucideIcon(name, color, size = 18) {
  let svg = lucideIcons[name];
  svg = svg.replace('width="24"', `width="${size}"`);
  svg = svg.replace('height="24"', `height="${size}"`);
  return `<span style="color: ${color};">${svg}</span>`;
}

export async function preParse(md, req) {
  let r = md;
  r = await removeForbiddenContent(r, req);
  r = await preReplacePlantUml(r, req);
  r = await preReplaceMermaid(r, req);
  r = preMarkCode(r);
  r = preReplaceObsidianFileLinks(r, req);
  r = preMarkCallouts(r);
  r = preprocessFragments(r)
  r = preprocessSideBySide(r);
  r = unmarkCode(r);
  return r;
}

/**
 * The passages of `md` this session may see, in document order, each carrying
 * the offset in `md` it was taken from.
 *
 * This is the one implementation of inline block filtering, and it hands back a
 * list rather than a string on purpose. Removing a block makes the text before
 * it and the text after it adjacent, and a search reading the joined form can
 * find a term across that seam - a term nobody wrote, assembled out of two
 * passages a hidden block used to separate. A caller that never sees the two
 * sides in one string cannot report such a match, so the seam is closed by
 * construction rather than by a boundary check every future caller would have
 * to remember.
 *
 * `removeForbiddenContent` below joins the list and is what the render pipeline
 * uses; `corpus-search` matches within each segment separately. Neither of them
 * restates the rule this function applies - `hasSomeRoles` decides, as it does
 * for the rendered page.
 */
export async function filterForbiddenSegments(md, req) {
  const regex = new RegExp(inlinePermissionRegex);
  const matches = [];
  let match;
  while ((match = regex.exec(md)) !== null) {
    matches.push(match);
  }
  if (matches.length === 0) {
    // Nothing to decide, so nothing to resolve a context for: a document that
    // carries no inline directive must not cost a lookup.
    return [{ text: md, offset: 0 }];
  }
  // Awaited once, ahead of the fan-out below. Every block of the document is
  // then decided against the same reference time, so a window cannot close
  // between the first paragraph of a page and the last.
  const { referenceDate } = await getPermissionContext(req);
  const visible = await Promise.all(
    matches.map(async ([, perms]) => {
      const permissionEntries = parsePermissionEntries(perms);
      if (permissionEntries.length === 0) {
        return false;
      }
      const activeRoles = getActivePermissionRoles(permissionEntries, referenceDate);
      if (activeRoles.length === 0) {
        return false;
      }
      return hasSomeRoles(req, activeRoles, true);
    })
  );

  const segments = [];
  // An empty passage is not a passage. Two adjacent blocks leave one between
  // them, and carrying it would put a zero-length segment into every offset the
  // search reports against.
  const keep = (text, offset) => {
    if (text.length > 0) {
      segments.push({ text, offset });
    }
  };

  let carried = 0;
  for (let i = 0; i < matches.length; i++) {
    const [fullMatch, , content] = matches[i];
    keep(md.slice(carried, matches[i].index), carried);
    if (visible[i]) {
      // Where the block's body sits in the original: the match ends with the
      // closing `@@@`, so the body ends three characters before the match does.
      // Derived from the end rather than from the opening line, because the
      // directive the regex reads before the first newline is itself matched
      // with the `s` flag.
      keep(content, matches[i].index + fullMatch.length - 3 - content.length);
    }
    carried = matches[i].index + fullMatch.length;
  }
  keep(md.slice(carried), carried);
  return segments;
}

/**
 * The document as the session may read it: the surviving passages, joined. The
 * render pipeline's caller of the function above, and the reason that function
 * exists in two forms at all.
 */
async function removeForbiddenContent(md, req) {
  const segments = await filterForbiddenSegments(md, req);
  return segments.map((segment) => segment.text).join("");
}

// ################### Searching the corpus ###################

/**
 * The shortest query the search will answer, and how long the field waits after
 * a keystroke before issuing one.
 *
 * Both are security parameters rather than comfort ones: together they bound how
 * fast a reader can probe the corpus, and the minimum length bounds how much of
 * it one probe can be about. Measured against the production corpus - 279 files,
 * 1.41 MB - by counting the files a query of each length proposes as candidates:
 *
 *   1 character  -> 273 of 279 files, for the median query
 *   2 characters -> 173
 *   3 characters -> 101
 *   4 characters -> 42
 *
 * One and two characters return most of the corpus whatever they are, so they
 * measure the corpus rather than search it; three is where a query starts being
 * about something. A shorter one is refused rather than truncated or answered
 * empty, because a refusal is the only answer that says nothing about what is
 * there.
 *
 * 250 ms is longer than an answer takes - the slowest three-character query
 * measured against that corpus, the one that opens 200 of its files, is answered
 * in about 90 ms and most are answered in tens - so the reader never waits on a
 * queue, and it is short enough not to feel like a delay. It also means that
 * typing issues no query at all until the reader pauses, so a probe costs a
 * pause each.
 */
export const minimumQueryLength = 3;
export const searchDebounceMs = 250;

/**
 * How much of the surrounding passage a snippet quotes on either side. Read
 * against the real sidebar: the column is about 230 px wide, and this is what
 * fills three or four lines of it rather than a paragraph.
 */
const snippetContext = 60;

/** `text`, safe to put inside a regular expression as a literal. */
function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Where `query` occurs in `text`, case-insensitively, as offsets into `text`.
 *
 * A regular expression rather than `indexOf` over a lowercased copy: lowercasing
 * changes the length of a few characters, and an offset taken against a copy of
 * a different length would quote the wrong part of the passage.
 */
function occurrencesIn(text, query) {
  const regex = new RegExp(escapeForRegExp(query), "gi");
  const at = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    at.push(match.index);
    // A query of at least three characters cannot be empty, so lastIndex always
    // advances; this is the guard against a future caller passing one that is.
    if (match.index === regex.lastIndex) regex.lastIndex++;
  }
  return at;
}

/**
 * The files that could answer `query`, as fullPaths, from the index alone.
 *
 * This is the whole of what the index is allowed to decide. It touches no disk
 * and asks no permission question, and it is deliberately generous: a file it
 * proposes may turn out to be one the session may not see, or one whose text has
 * changed since the scan. Both of those are settled by reading the file, which
 * is what makes an index that has gone stale cost a wasted read rather than a
 * disclosure.
 */
function candidatePaths(query) {
  const needle = query.toLowerCase();
  const paths = [];
  for (const [fullPath, entry] of lastIndexEntries) {
    if (
      fullPath.toLowerCase().includes(needle) ||
      entry.text.toLowerCase().includes(needle)
    ) {
      paths.push(fullPath);
    }
  }
  return paths;
}

/**
 * A heading's text as the rendered page will show it.
 *
 * The client finds the heading to scroll to by comparing this against the
 * `textContent` of a `.docanchor`, so what is stripped here is what the renderer
 * turns into markup rather than into text: an embedded image becomes an `<img>`
 * and contributes nothing, a wiki link becomes its alias or its target, code
 * spans and emphasis keep their content and lose their delimiters, and the
 * fragment marker is consumed before a deck is built.
 *
 * A heading whose wiki link names no file of the corpus is left as written by
 * the renderer and stripped here, so the two disagree and the jump finds
 * nothing. That is a jump that does not happen, never a jump to the wrong place:
 * a target that is not found is a no-op by construction.
 */
function headingText(raw) {
  return raw
    .replace(/##fragment(?=\s|$)/g, "")
    .replace(/!\[\[[^\]\n]*\]\]/g, "")
    .replace(/\[\[[^\]\n|]*\|([^\]\n]*)\]\]/g, "$1")
    .replace(/\[\[([^\]\n]*)\]\]/g, "$1")
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, "")
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/`+/g, "")
    .replace(/\*\*|__|\*|~~/g, "")
    .replace(/\s+#+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The ATX headings of the filtered content, in the order the session will see
 * them, each numbered by how many headings of the same text came before it.
 *
 * The occurrence number is counted over the filtered content and nowhere else -
 * a corpus of exam questions repeats `## Answer` dozens of times, and the reader
 * has to land on the one the search found. The client repeats this count over
 * the rendered page, which is the same document filtered the same way, so the
 * two agree.
 *
 * Fenced code is skipped so a `#` inside a fence is not read as a heading. The
 * fence state is per passage: a fence that opened in one passage and closed in
 * another would be a fence spanning the place a hidden block was cut out, which
 * is not something the document as written says.
 */
function headingsOf(segments) {
  const headings = [];
  const seen = new Map();
  segments.forEach((segment, index) => {
    let fenced = false;
    let at = 0;
    for (const line of segment.text.split("\n")) {
      if (/^ {0,3}(?:```|~~~)/.test(line)) {
        fenced = !fenced;
      } else if (!fenced) {
        const heading = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/);
        if (heading) {
          const text = headingText(heading[2] ?? "");
          const occurrence = (seen.get(text) ?? 0) + 1;
          seen.set(text, occurrence);
          headings.push({ text, occurrence, segment: index, offset: at });
        }
      }
      at += line.length + 1;
    }
  });
  return headings;
}

/** The heading a match at `offset` of segment `index` stands under, or null. */
function headingAt(headings, index, offset) {
  let found = null;
  for (const heading of headings) {
    if (heading.segment > index) break;
    if (heading.segment === index && heading.offset > offset) break;
    found = heading;
  }
  return found;
}

/**
 * The passage around a match, quoted from the one segment it was found in.
 *
 * Clipped to that segment's own bounds, so a snippet cannot be assembled out of
 * two passages a hidden block used to separate. That is the same rule the
 * matching itself obeys, restated where the text is quoted rather than assumed.
 */
function snippetAround(segment, offset, length) {
  const from = Math.max(0, offset - snippetContext);
  const to = Math.min(segment.text.length, offset + length + snippetContext);
  const quoted = segment.text.slice(from, to).replace(/\s+/g, " ").trim();
  return `${from > 0 ? "…" : ""}${quoted}${to < segment.text.length ? "…" : ""}`;
}

/**
 * What one candidate file contributes to an answer, or null when it contributes
 * nothing - which is what a file the session may not see contributes, and what a
 * file whose text no longer holds the query contributes. The two are the same
 * answer on purpose.
 *
 * Everything below is derived from the file as it stands on disk right now and
 * from the permission rules as they apply to this request. The index proposed
 * this file; it decides nothing about it.
 */
async function answerFromFile(req, file, query) {
  let raw;
  try {
    raw = await fs.promises.readFile(file.absolutePath, "utf8");
  } catch {
    // A file the index still names and the disk no longer has is a file that
    // matches nothing. It is not an error a reader is told about.
    return null;
  }

  // The same two steps the page handler performs before anything else, in the
  // same order: the leading marks it drops, then the whole-file directive.
  let content = raw.replace(/^[​‌‍‎‏﻿]/, "");
  const permissions = parseFirstLineForPermissions(content.split("\n")[0]);
  if (permissions !== null) {
    const { visible } = await resolveFileVisibility(req, permissions);
    if (!visible) {
      return null;
    }
    content = content.split("\n").slice(1).join("\n");
  }

  const segments = await filterForbiddenSegments(content, req);
  const headings = headingsOf(segments);

  // Matched inside each passage separately. Nothing here ever holds the joined
  // document, so a match across the place a hidden block was removed cannot be
  // found in the first place.
  const found = [];
  segments.forEach((segment, index) => {
    for (const offset of occurrencesIn(segment.text, query)) {
      found.push({ segment, index, offset, heading: headingAt(headings, index, offset) });
    }
  });

  const inName = occurrencesIn(file.fileNameWithoutExtension, query).length > 0;
  if (found.length === 0 && !inName) {
    return null;
  }

  // One entry per heading the session may see, in the order the filtered content
  // puts them in. The heading and its occurrence and nothing else: one snippet
  // per document is what the sidebar has room to show, and what is not shown is
  // not sent.
  const underHeadings = [];
  const already = new Set();
  for (const match of found) {
    if (!match.heading) continue;
    const key = `${match.heading.occurrence}:${match.heading.text}`;
    if (already.has(key)) continue;
    already.add(key);
    underHeadings.push({
      text: match.heading.text,
      occurrence: match.heading.occurrence,
    });
  }

  const first = found[0];
  return {
    name: file.fileNameWithoutExtension,
    path: `/${encodePathPreserveSlashes(file.fullPath)}`,
    snippet: first ? snippetAround(first.segment, first.offset, query.length) : null,
    headings: underHeadings,
    // Not part of the answer - stripped before it is sent - but what the order of
    // the answer is built from.
    prominent:
      inName || headings.some((heading) => occurrencesIn(heading.text, query).length > 0),
  };
}

/**
 * What this session may be told about `query`.
 *
 * Two passes, and the split between them is the whole safety argument. The first
 * reads the index and decides only which files are worth opening. The second
 * opens each of them, resolves its whole-file directive, removes the blocks this
 * session may not see, and derives every word of the answer - the headings, the
 * order, the snippets - from what survives. Nothing an index entry holds reaches
 * a reader.
 *
 * The candidates are answered concurrently on purpose: each of them asks for the
 * request's permission context, and they all join the one build rather than
 * starting one each, so a whole query costs the identity provider a single
 * lookup however many files it opens.
 */
export async function searchCorpus(req, rawQuery) {
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  if (query.length < minimumQueryLength) {
    return { results: [] };
  }

  const byFullPath = new Map(
    Object.values(mdFilesDirStructure).map((file) => [file.fullPath, file])
  );
  const answers = await Promise.all(
    candidatePaths(query)
      .map((fullPath) => byFullPath.get(fullPath))
      .filter((file) => file !== undefined)
      .map((file) => answerFromFile(req, file, query))
  );

  return {
    results: answers
      .filter((answer) => answer !== null)
      .sort((a, b) => {
        // A match in the document's name or in one of its headings is what the
        // reader was probably looking for; a match in a paragraph is what they
        // get when it was not.
        if (a.prominent !== b.prominent) return a.prominent ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      })
      .map(({ prominent, ...answer }) => answer),
  };
}

function preMarkCode(md) {
  let regex = /^[ \t]*```(.*?)\n([\s\S]*?)```/gms;
  let match;
  let r = md;
  codeList = [];
  while ((match = regex.exec(r)) !== null) {
    const string = `\`\`\`${match[1].toLowerCase()}\n${match[2]}\`\`\``;
    codeList.push(string);
    r = r.replace(match[0], internalSubstitutions.code.string);
    regex = /^[ \t]*```(.*?)\n([\s\S]*?)```/gms;
  }
  return r;
}

function unmarkCode(md) {
  let c = 0;
  return md.replace(internalSubstitutions.code.regexp, () => {
    return codeList[c++];
  });
}

function preMarkCallouts(md) {
  const regex = />[\s]*\[!(.*?)\].*?\n/gs;
  let match;
  let markedMd = md;
  let offset = 0;
  while ((match = regex.exec(md)) !== null) {
    const { trimmedLines, originalLength } = getFollowingQuotedLines(
      md,
      match.index + match[0].length
    );
    const markedLines = `${internalTags.callout.string.start}\n\n${match[0]
      .trim()
      .substring(1)
      .trim()}\n${trimmedLines}\n\n${internalTags.callout.string.end}\n\n`;
    const originalSectionLength = match[0].length + originalLength; // originalLength already includes the newline
    markedMd =
      markedMd.slice(0, match.index + offset) +
      markedLines +
      markedMd.slice(match.index + originalSectionLength + offset);
    offset += markedLines.length - originalSectionLength;
  }
  return markedMd;
}

function getFollowingQuotedLines(md, index) {
  const lines = md.slice(index).split("\n");
  let i = 0;
  let originalLength = 0;
  while (i < lines.length && lines[i].trim().startsWith(">")) {
    originalLength += lines[i].length + 1; // +1 for the newline
    lines[i] = lines[i].substring(lines[i].indexOf(">") + 1); // remove leading ">"
    i++;
  }
  return { trimmedLines: lines.slice(0, i).join("\n"), originalLength };
}

function preprocessSideBySide(md) {
  const START = "##side-by-side-start";
  const END = "##side-by-side-end";
  const SEP = "##separator";

  // The three markers are matched as one block, from start to end, so that a
  // `##separator` standing on its own outside a block is left where it is.
  const blockRegex = new RegExp(`${START}[\\s\\S]*?${END}`, "g");

  return md.replace(blockRegex, (block) => {
    const content = block
      .replace(START, "")
      .replace(END, "")
      .trim();

    const columns = content.split(SEP).map(col => col.trim());
    
    // The blank lines around each column are what keeps it working: the content
    // is still Markdown at this point, and Markdown inside an HTML block is only
    // parsed when an empty line separates it from the surrounding tags.
    const htmlColumns = columns.map(col => `<div class="side-by-side-col">\n\n${col}\n\n</div>`);

    return `<div class="side-by-side">\n${htmlColumns.join("\n")}\n</div>\n\n`;
  });
}

function preprocessFragments(md) {
  const marker = internalSubstitutions.fragment_single.string;
  const r = md.replace(/##fragment(?=\s|$)/g, marker)
  return r;
}

function postprocessFragments(html) {
  const { fragment_single } = internalSubstitutions;
  const markerValue = fragment_single.string.replace(/<!--|-->/g, "").trim();

  const dom = new JSDOM(html);
  const document = dom.window.document;

  let fragmentIndex = -1;
  let started = false;

  function resetFragmentIndex() {
    fragmentIndex = -1;
    started = false;
  }

  function walk(node) {
    if (!node) return;

    const childNodes = Array.from(node.childNodes);
    for (let child of childNodes) {
      // A fragment index runs within a heading section, not across the page, so
      // an H2 or H3 starts the numbering again and closes the section that was
      // open.
      if (child.nodeType === 1 && (child.tagName === "H2" || child.tagName === "H3")) {
        resetFragmentIndex();
      }

      // The comment node preprocessFragments left behind in place of
      // `##fragment`. Meeting it advances the index and opens the section whose
      // nodes are wrapped from here on, and it is removed so that it never
      // reaches the browser.
      if (child.nodeType === 8 && child.nodeValue.trim() === markerValue) {
        fragmentIndex++;
        started = true;
        child.remove();
        continue;
      }

      if (!started) {
        if (child.nodeType === 1) walk(child);
        continue;
      }

      // The two branches below differ because a text node has no element of its
      // own to carry the class, so it is replaced by a span that does. An
      // element keeps its identity, takes the class and the index itself, and is
      // walked into so that the markers below it are still found.
      if (child.nodeType === 3 && child.textContent.trim() !== "") {
        const span = document.createElement("span");
        span.classList.add("fragment");
        span.setAttribute("data-fragment-index", fragmentIndex);
        span.textContent = child.textContent;
        child.replaceWith(span);
        continue;
      }

      if (child.nodeType === 1) {
        child.classList.add("fragment");
        child.setAttribute("data-fragment-index", fragmentIndex);
        walk(child);
      }
    }
  }

  walk(document.body);
  return document.body.innerHTML;
}

function encodePathPreservingSlashes(rawPath) {
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    return rawPath ?? "";
  }
  return rawPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function preReplaceObsidianFileLinks(html, req) {
  const regex = /(?<!\!)\[\[([^\]\n]+)\]\]/g;

  return html.replace(regex, (match) => {
    let fileName = match.slice(2, -2);
    let alt = null;
    if (fileName && fileName.includes("|")) {
      const parts = fileName.split("|");
      fileName = parts[0].trim();
      if (fileName.endsWith("\\")) {
        fileName = fileName.slice(0, -1);
      }
      alt = parts[1].trim();
      if (alt === "") {
        alt = null;
      }
    }
    if (fileName.startsWith("/md/")) {
      fileName = fileName.slice(4);
    }
    if (fileName.startsWith("md/")) {
      fileName = fileName.slice(3);
    }
    const lastPartOfFileName = fileName.split("/").pop();
    const filePath = mdFilesMap[lastPartOfFileName];
    // console.log(fileName)
    // console.log(mdFilesMap)
    if (filePath) {
      let f = filePath[0];
      if (filePath.length > 1) {
        // A basename that exists in more than one folder is only addressable by
        // the path that tells the copies apart. That path is emitted whole, the
        // extension included: the page handler in `app.js` answers a request
        // because it ends in `.md`, so a link that dropped the extension would
        // fall through to the catch-all - which is what the single-candidate
        // line above does too.
        f = filePath.find((path) => path === fileName + ".md");
        if (!f) {
          return match;
        }
      }
      console.log(f);
      const serverUrl = `${req.protocol}://${req.get("host")}`;
      const encodedPath = encodePathPreservingSlashes(dirPrefix + f);
      const url = `${serverUrl}/${encodedPath}`;
      return `[${alt ? alt : fileName}](${url})`;
    } else {
      return match;
    }
  });
}

export async function preReplaceMermaid(md, req) {
  let regex = /^\s*```+\s*(mermaid)$/gim;
  let match;
  while ((match = regex.exec(md)) !== null) {
    // PlantUML
    const start = match.index + match[0].length;
    const end = md.indexOf("```", start);
    const mermaid = md.substring(start, end);
    md = md.substring(0, match.index) + '<pre class="mermaid">' + mermaid + '</pre>' + md.substring(end + 3);
    regex = /^\s*```+\s*(mermaid)$/gim;
  }
  return md;
}

export async function preReplacePlantUml(md, req) {
  let regex = /^\s*```+\s*(plantuml)$/gim;
  let match;
  while ((match = regex.exec(md)) !== null) {
    // PlantUML
    const start = match.index + match[0].length;
    const end = md.indexOf("```", start);
    const plantuml = md.substring(start, end);
    let serverUrl = process.env.NEXT_PUBLIC_PLANTUML_URL;
    if (serverUrl === undefined || serverUrl === null || serverUrl === "") {
      serverUrl = `https://plantuml.unterrainer.info/plantuml`;
    }

    // Encode in UTF-8, compress using Deflate, and reencode in ASCII
    const compressed = pako.deflate(plantuml, { to: "string" });
    const encoded = toPlantUmlEncoding(compressed);

    const url = `${serverUrl}/svg/${encoded}`;
    const img = `![PlantUML](${url})`;
    md = md.substring(0, match.index) + img + md.substring(end + 3);
    regex = /^\s*```+\s*(plantuml)$/gim;
  }
  return md;
}

function toPlantUmlEncoding(buffer) {
  const dictionary =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
  let result = "";
  let current = 0;
  let remaining = 0;
  for (const byte of buffer) {
    current = (current << 8) | byte;
    remaining += 8;
    while (remaining >= 6) {
      remaining -= 6;
      const index = (current >> remaining) & 0x3f;
      result += dictionary[index];
    }
  }
  if (remaining > 0) {
    result += dictionary[(current << (6 - remaining)) & 0x3f];
  }
  return result;
}

export function manipulateHtml(html, req) {
  let r = html;
  r = replacePreMarkCallouts(r);
  r = replaceObsidianImageLinks(r, req);
  r = replaceObsidianImageAltResizeValues(r);
  r = postprocessFragments(r)
  r = makeContentMap(r);
  return r;
}

export function splitForReveal(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const sections = [];
  let currentSection = [];

  for (const node of Array.from(document.body.childNodes)) {
    if (node.tagName === "H2") {
      if (currentSection.length > 0) {
        sections.push(splitSubSections(currentSection.join("")));
        currentSection = [];
      }
    }
    currentSection.push(node.outerHTML || node.textContent);
  }

  if (currentSection.length > 0) {
    sections.push(splitSubSections(currentSection.join("")));
  }

  return sections.join("");
}

function splitSubSections(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const subSections = [];
  let currentSubSection = [];

  for (const node of Array.from(document.body.childNodes)) {
    if (node.tagName === "H3") {
      if (currentSubSection.length > 0) {
        subSections.push(currentSubSection.join(""));
        currentSubSection = [];
      }
    }
    currentSubSection.push(node.outerHTML || node.textContent);
  }

  if (currentSubSection.length > 0) {
    subSections.push(currentSubSection.join(""));
  }

  return `<section>${subSections
    .map((subSection) => `<section>${subSection}</section>`)
    .join("")}</section>`;
}

function makeContentMap(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const headers = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
  contentMap = {};

  contentMap["ROOT"] = { text: "TOP", indent: 1 };
  headers.forEach((header) => {
    const guid = uuidv4();
    const indent = parseInt(header.tagName.slice(1));
    contentMap[guid] = { text: header.textContent, indent: indent };
    header.setAttribute("id", guid);
    header.setAttribute("class", "docanchor");
  });
  return `<span id="ROOT" class="docanchor"></span>` + dom.serialize();
}

function replaceObsidianImageAltResizeValues(html) {
  // One regex for alt first, then src, one for the other way around.
  const regex1 = /<img[^>]+alt="(.*?)"[^>]+src="(.*?)"[^>]*>/gi;
  const regex2 = /<img[^>]+src="(.*?)"[^>]+alt="(.*?)"[^>]*>/gi;
  let r = html.replace(regex1, (match, alt, src) => {
    return insertObsidianImageAltResizeValues(match, alt, src);
  });
  r = r.replace(regex2, (match, src, alt) => {
    return insertObsidianImageAltResizeValues(match, alt, src);
  });
  return r;
}

function insertObsidianImageAltResizeValues(match, alt, src) {
  if (alt && alt.includes("|")) {
    const r = parseWidthHeight(alt);
    return `<img alt="${r ? r.name : alt}" src="${src}" style="${
      r ? `width: ${r.width}; height: ${r.height}` : ""
    }" />`;
  }
  return match;
}

function parseWidthHeight(input) {
  const parts = input.split("|");
  const name = parts[0];
  let width = "100%";
  let height = "auto";
  if (parts.length > 1) {
    // something|100x200 or something|100
    const s = parts[1].split("x");
    if (s.length === 2) {
      // something|100x200
      width = isNaN(s[0]) ? s[0] : s[0] + "px";
      height = isNaN(s[1]) ? s[1] : s[1] + "px";
    } else {
      // something|100
      width = isNaN(s[0]) ? s[0] : s[0] + "px";
    }

    return { name, width, height };
  }
  return null;
}

function replaceObsidianImageLinks(html, req) {
  const regex = /!\[\[(.*?)\]\]/g;

  return html.replace(regex, (match) => {
    let fileName = match.slice(3, -2);
    const r = parseWidthHeight(fileName);
    if (r) {
      fileName = r.name;
    }
    if (fileName.startsWith("/md/")) {
      fileName = fileName.slice(4);
    }
    if (fileName.startsWith("md/")) {
      fileName = fileName.slice(3);
    }
    const lastPartOfFileName = fileName.split("/").pop();
    const filePath = filesMap[lastPartOfFileName];
    if (filePath) {
      let f = filePath[0];
      if (filePath.length > 1) {
        f = filePath.find((path) => path === fileName);
        if (!f) {
          return match;
        }
      }
      const serverUrl = `${req.protocol}://${req.get("host")}`;
      return getHtmlFor(getFileExtension(f), fileName, serverUrl, dirPrefix, f, r);
    } else {
      return match;
    }
  });
}

function getFileExtension(filePath) {
  const parts = filePath.split(".");
  if (parts.length > 1) {
    return parts[parts.length - 1].toLowerCase();
  }
  return null;
}

const imageFileTypes = [
  "png",
  "jpg",
  "jpeg",
  "apng",
  "avif",
  "gif",
  "jfif",
  "pjpeg",
  "pjp",
  "svg",
  "webp",
  "bmp",
  "ico",
  "tiff",
  "tif",
  "heif",
  "heic",
];

function getHtmlFor(fileType, fileName, serverUrl, dirPrefix, file, r) {
  if (fileType !== null) {
    const type = fileType.toLowerCase();
    // console.log(type)
    if (imageFileTypes.includes(type)) {
      return `<img src="${serverUrl}/${
        dirPrefix + file
      }" alt="${fileName}" style="${
        r ? `width: ${r.width}; height: ${r.height};` : ""
      }"/>`;
    } else if (type === "svg") {
      return `<img src="${serverUrl}/${dirPrefix + file}" alt="${fileName}" />`;
    } else if (type === "mp4") {
      return `<video controls><source src="${serverUrl}/${
        dirPrefix + file
      }" type="video/mp4"></video>`;
    } else if (type === "webm") {
      return `<video controls><source src="${serverUrl}/${
        dirPrefix + file
      }" type="video/webm"></video>`;
    } else if (type === "ogg") {
      return `<audio controls><source src="${serverUrl}/${
        dirPrefix + file
      }" type="audio/ogg"></audio>`;
    }
  }
  return `<a href="${serverUrl}/${dirPrefix + file}">${fileName}</a>`;
}

function replacePreMarkCallouts(html) {
  const regex = new RegExp(
    `${internalTags.callout.regexp.start}([\\s\\S]*?)${internalTags.callout.regexp.end}`,
    "gi"
  );
  return html.replace(regex, (match, s) => {
    const lines = s.split(/\s*(\n|<br\s*\/?>)\s*/);
    const ls = lines.filter((l) => l.trim().length > 0);
    // First line hold the info about the callout type, collapsable, and caption.
    let n = ls[0];
    if (n.startsWith("<p>")) {
      n = n.slice(3);
    }
    if (n.endsWith("</p>")) {
      n = n.slice(0, -4);
    }
    if (ls[ls.length - 1].endsWith("</p>")) {
      ls[ls.length - 1] = ls[ls.length - 1].slice(0, -4);
    }
    const calloutRegex = /\[!(.*?)\](.*)/;
    const calloutMatch = n.match(calloutRegex);
    if (!calloutMatch || !calloutMatch[1]) {
      return match;
    }
    const type = calloutMatch[1].trim();
    const caption = (calloutMatch[2] || "").trim();
    let content = ls.slice(1).join("\n");
    // The split keeps <br> tokens as elements, which can leave a leading
    // visual line break in callout content. Remove those artifacts.
    content = content.replace(/^(?:\s|<br\s*\/?>|<p>\s*<\/p>)+/gi, "");
    let callout = callouts[type.toLowerCase()];
    if (!callout) return match;
    let t = type;
    while (callout.link) {
      t = callout.link;
      callout = callouts[t];
    }
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (caption.length > 0) {
      t = caption;
    }
    let collapsable = false;
    if (t.startsWith("-")) {
      t = t.slice(1).trim();
      collapsable = true;
    }
    return `<div class="obsidian-callout${
      collapsable ? " obsidian-collapsable" : ""
    }" style="
      background-color: ${callout.color + "1a"};
      ">
        <div class="row obsidian-collapsable-trigger"
        style="cursor: ${collapsable ? "pointer" : "default"}"
        >
          <div class="col obsidian-callout-icon">${lucideIcon(
            callout.icon,
            callout.color
          )}</div>
          <div class="col obsidian-callout-title" style="color: ${
            callout.color
          };">${t}</div>
          ${
            collapsable
              ? `<div class="col obsidian-callout-chevron" style="color: ${
                  callout.color
                };">${lucideIcon("ChevronRight", callout.color)}</div>`
              : ""
          }
        </div>
        <div class="${
          collapsable ? "collapsable " : ""
        }obsidian-callout-content" style="${
      content ? "" : "display: none; overflow: hidden;"
    }">${content || ""}</div>
      </div>`;
  });
}

function indentStringFor(indent) {
  let r = "";
  for (let j = 0; j < indent; j++) {
    r += "&nbsp;&nbsp;";
  }
  return r;
}

function findFirstDifferentIndex(arr1, arr2) {
  for (let i = 0; i < Math.min(arr1.length, arr2.length); i++) {
    if (arr1[i] !== arr2[i]) {
      return i;
    }
  }
  // If no difference was found but the arrays are of different lengths
  if (arr1.length !== arr2.length) {
    return Math.min(arr1.length, arr2.length);
  }
  // If no difference was found and the arrays are of the same length
  return -1;
}

async function getDirectoryListing(req) {
  const allFiles = Object.values(mdFilesDirStructure);
  const files = await Promise.all(
    allFiles.map(async (f) => {
      const { visible } = await resolveFileVisibility(req, f.permissions);
      return visible ? f : null;
    })
  );
  const filteredFiles = files.filter((f) => f !== null);
  const p = await markPathForSelectedPage(req, files);

  openNavTreeScript = '<script lang="javascript">\n';
  openNavTreeScript += `toggleDirList('sidebar-dirlist');\n`;
  let r = await getDirectoryListingInternal(p, req, filteredFiles, []);
  openNavTreeScript += "</script>";
  // console.log("openNavTreeScript", openNavTreeScript);

  // A session may be allowed to see no file at all - a container bound to an
  // empty vault reaches this with an empty set - and then there is no last entry
  // to ask about and nothing was opened that would have to be closed.
  const last = filteredFiles[filteredFiles.length - 1];
  if (last && last.folders.length > 0) {
    r += `</div></div>`;
  }
  return r;
}

async function markPathForSelectedPage(req, files) {
  // console.log("getSelectedPage", req);
  // console.log("getSelectedPage", files);
  let path = decodeURIComponent(req.path);
  if (path.startsWith("/md/")) {
    path = path.slice(4);
  }
  while (path.startsWith("/")) {
    path = path.slice(1);
  }
  const r = {
    path: [],
    file: null,
  };
  const splitPath = path.split("/");
  r.file = splitPath.pop();
  for (let i = 0; i < splitPath.length; i++) {
    const f = {
      dir: splitPath[i],
      level: i,
    };
    r.path.push(f);
  }
  console.log("markPathForSelectedPage", r);
  return r;
}

function lookupAndMarkPath(folder, level, path) {
  for (const p of path) {
    if (p.level === level && p.dir === folder) {
      return true;
    }
  }
  return false;
}

async function getDirectoryListingInternal(path, req, files, folders) {
  let html = "";
  let lastProcessedFileIndex = -1;
  let lastFile = null;
  let currentLevel = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    lastFile = file;
    const diffIndex = findFirstDifferentIndex(file.folderArray, folders);
    if (diffIndex > -1) {
      // New folder section
      if (folders.length > diffIndex) {
        // Close not needed folder sections
        for (let j = folders.length - 1; j >= diffIndex; j--) {
          html += `</div></div>`;
        }
      }
      // Insert as many folders as needed to reach the new folder
      for (let j = diffIndex; j < file.folderArray.length; j++) {
        const folder = file.folderArray[j];
        html += insertDirFolder(folder, j);
        if (lookupAndMarkPath(folder, currentLevel, path.path)) {
          openNavTreeScript += `toggleDirList('${getCssHashKey(folder, j)}');\n`;
          currentLevel++;
        }
      }
      folders = file.folderArray;

      // Add the current file to the new folder section
      html += insertDirLink(file, req, file.folderArray.length, i, files);

      // Recursive call for subfolder
      const subfolderFiles = files.filter(
        (f, index) => f.folders.startsWith(folders) && index > i
      );
      html += await getDirectoryListingInternal(
        path,
        req,
        subfolderFiles,
        folders
      );

      // Update the last processed file index
      lastProcessedFileIndex = i + subfolderFiles.length;
      i = lastProcessedFileIndex; // Skip the files that have been processed
    } else if (i > lastProcessedFileIndex) {
      // Add file to current folder section
      html += insertDirLink(file, req, file.folderArray.length, i, files);
    }
  }
  return html;
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function getCssHashKey(folder, j) {
  return `ff-${hash32(folder)}-${j}`;
}

function insertDirFolder(folder, j) {
  let r = "";
  const key = getCssHashKey(folder, j);
  r += `<div class="folder" style="margin: 0px; padding: 0px;">`;
  r += `<div class="folder-name row" onclick="toggleDirList('${key}')" style="cursor: pointer;">${indentStringFor(
    j
  )}${folder}<div class="folder-files ${key}-chevron" style="
          position: inline-block;
          top: 1px;
          padding: 0px;
          margin: 0px;
          transition: transform 0.3s ease;
        ">${lucideIcon("ChevronRight", null, "12px")}</div></div>`;
  r += `<div class="folder-files ${key}" style="
          opacity: 1;
          padding-top: 0px;
          max-height: 0;
          overflow: hidden;
          transition: padding 0.3s ease, max-height 0.3s ease, opacity 0.3s ease, visibility 0.3s step-start;
        ">`;
  return r;
}

function encodePathPreserveSlashes(path) {
  return path
    .split("/")
    .map(seg => encodeURIComponent(seg))
    .join("/");
}

function insertDirLink(file, req, indent, i, files) {
  let r = "";
  let correctedPath = decodeURIComponent(req.path);
  if (correctedPath.startsWith("/md/")) {
    correctedPath = correctedPath.slice(4);
  }
  let highlight = "";

  if (file.path === correctedPath) highlight = "highlight";
  r += `<a href="/${
    encodePathPreserveSlashes(dirPrefix + file.path)
  }" class="${highlight}">${indentStringFor(
    file.lastFolder === "" ? 0 : indent
  )}${file.fileNameWithoutExtension}</a>`;
  // Only add <br> if it isn't the last file in the folder
  if (i < files.length - 1 && files[i + 1].folders === file.folders) {
    r += "<br>";
  }
  return r;
}

function getContentListing() {
  const list = Object.keys(contentMap).map((guid) => {
    const o = contentMap[guid];
    let indentation = "&nbsp;".repeat((o.indent - 1) * 2);
    return `${indentation}<a href="#${guid}">${o.text}</a>`;
  });
  return list.join("<br>");
}

function getFontImports() {
  let result = "";
  for (const font in navFonts) {
    const f = navFonts[font];
    result += `
        @font-face {
          font-family: "nav ${font}";
          src: url(/${f.replaceAll(" ", "\\ ")}) format("truetype");
        }
      `;
  }
  for (const font in mainFonts) {
    const f = mainFonts[font];
    result += `
        @font-face {
          font-family: "main ${font}";
          src: url(/${f.replaceAll(" ", "\\ ")}) format("truetype");
        }
      `;
  }
  return result;
}

function getNavFontsSelection() {
  let result = "";
  let c = 0;
  for (const font of navFontsArray) {
    result += `<option value="${c}">${font}</option>
    `;
    c++;
  }
  return result;
}

function getMainFontsSelection() {
  let result = "";
  let c = 0;
  for (const font of mainFontsArray) {
    result += `<option value="${c}">${font}</option>
    `;
    c++;
  }
  return result;
}

async function getTopdownMenu(req) {
  return `
  <div style="padding: 0px; margin: 0px;">
    <button class="sl-button-accent" style="margin-left: 0px;" onclick="window.location.href='/logout'">${lucideIcon(
      "LogOut"
    )}<span style="margin-left: 6px; margin-right: 6px; position: relative; top: -2px;">logout</span></button>
    <button class="sl-button" onclick="toggleLightDark()">${lucideIcon(
      "SunMoon"
    )}<span style="margin-left: 6px; margin-right: 6px; position: relative; top: -2px;">light/dark</span></button>

    <div style="padding: 0px; margin: 0px; margin-top: 10px; width: 95%; text-align: left; display: flex;">
      <span style="top: 1px; position: relative; cursor: pointer;" onclick="navFontChange(4)">${lucideIcon(
        "PanelsTopLeft"
      )}</span>
      <select class="sl-select" style="width: auto; flex-grow: 1;" id="navFontSelect" onchange="navFontChange(this.value)">
        ${getNavFontsSelection()}
      </select>
    </div>
    <div style="padding: 0px; margin: 0px; margin-top: 2px; width: 95%; padding-right: 100px; text-align: left; display: flex;">
      <span style="top: 1px; position: relative; cursor: pointer;" onclick="mainFontChange(0)">${lucideIcon(
        "SquareMenu"
      )}</span>
      <select class="sl-select" style="width: auto; flex-grow: 1;" id="mainFontSelect" onchange="mainFontChange(this.value)">
        ${getMainFontsSelection()}
      </select>
    </div>
  </div>
  <div style="padding: 0px; margin: 0px; margin-left: 0px; margin-top: 10px; margin-bottom: 20px;">
    <div style="padding: 0px; margin: 0px; margin-bottom: 1px; margin-top: 10px; margin-left: 4px;">
      <button class="sl-button button-group-left" onclick="fontSmaller()">${lucideIcon(
        "AArrowDown"
      )}</button>  
      <button class="sl-button-accent button-group-middle" onclick="fontStandard()">${lucideIcon(
        "ALargeSmall"
      )}</button>
      <button class="sl-button button-group-right" onclick="fontBigger()">${lucideIcon(
        "AArrowUp"
      )}</button>
    </div>
    <div style="padding: 0px; margin: 0px; margin-top: 10px; margin-left: 4px;">
      <button class="sl-button button-group-left" onclick="spacingSmaller()">${lucideIcon(
        "Rows4"
      )}</button>
      <button class="sl-button-accent button-group-middle" onclick="spacingStandard()">${lucideIcon(
        "Rows3"
      )}</button>
      <button class="sl-button button-group-right" onclick="spacingBigger()">${lucideIcon(
        "Rows2"
      )}</button>
    </div>
    <div style="padding: 0px; margin: 0px; margin-top: 10px; cursor: pointer;" onclick="toggleStartWithLastPage()">
      <input type="checkbox" id="startWithLastPageCheckbox">remember last visited page</input>
    </div>
    <div class="flipswitch menu" style="display: inline-block; top: 16px; margin-left: 3px;">
      <input checked="" onchange="toggleViewAnswer()" id="answersFs" class="flipswitch-cb" name="flipswitch" type="checkbox">
      <label for="answersFs" class="flipswitch-label">
          <div class="flipswitch-inner answers menu"></div>
          <div class="flipswitch-switch answers menu"></div>
      </label>
    </div>
    ${
      (await hasSomeRoles(req, ["teacher"], true))
        ? `<div class="flipswitch menu" style="display: inline-block; top: 16px; margin-top: 12px; margin-left: 3px;">
        <input checked="" onchange="toggleViewExam()" id="examFs" class="flipswitch-cb" name="flipswitch" type="checkbox">
        <label for="examFs" class="flipswitch-label">
            <div class="flipswitch-inner exam menu"></div>
            <div class="flipswitch-switch exam menu"></div>
        </label>
    </div>`
        : ""
    }
    <div style="padding: 0px; margin: 0px; margin-left: 0px; margin-top: 25px; margin-bottom: -10px; text-align: left; display: flex;">
      <button class="sl-button" style="height: 32px; margin: 0px;" onclick="openAsPresentation(true, false)">${lucideIcon(
        "Printer"
      )}
      ${lucideIcon("Presentation")}
      </button>
      <button class="sl-button" style="height: 32px; margin: 0px; margin-left: 6px" onclick="openAsDocument(false)">${lucideIcon(
        "Printer"
      )}
      ${lucideIcon("ReceiptText")}
      </button>
    </div>
  </div>
  `;
}

async function getTopBar(startPage, req) {
  return `
    <button class="sl-button topbar-burger" style="height: 32px; margin: 6px; margin-left: 0px;" onclick="toggleSidebar()">${lucideIcon(
      "Menu"
    )}</button>
    <div class="topbar-title nav-font">${
      req.path !== "/convert/"
        ? decodeURIComponent(
            req.path.startsWith(`/${dirPrefix}`)
              ? req.path.slice(dirPrefix.length + 1)
              : req.path
          )
        : decodeURIComponent(req.query.url)
    }</div>
    <div class="topbar-menu">
      ${
        (await hasSomeRoles(req, ["teacher"]))
          ? `<div class="flipswitch" style="display: inline-block; top: 8px;">
        <input checked="" onchange="toggleViewTeacher()" id="studentTeacherFs" class="flipswitch-cb" name="flipswitch" type="checkbox">
        <label for="studentTeacherFs" class="flipswitch-label">
            <div class="flipswitch-inner"></div>
            <div class="flipswitch-switch"></div>
        </label>
      </div>`
          : ""
      }
      <button class="sl-button" style="height: 32px; margin: 6px;" onclick="openAsPresentation(false)">${lucideIcon(
        "Presentation"
      )}</button>
      <button class="sl-button-accent topdown-menu-chevron" style="height: 32px; margin: 6px;" onclick="toggleTopdownMenu()">${lucideIcon(
        "Settings"
      )}</button>
    </div>
  `;
}

async function getSideBar(startPage, req) {
  return `
    <div class="sidebar-menu">
      <a href="${startPage}">Home</a>
    </div>
    <!-- The search field, beside the tree rather than above the content,
         because it answers the same question the tree does: where is this.
         The two numbers are read by the field's script instead of being
         written down a second time in obsidian-page.js - the minimum length
         the route enforces and the interval the field waits are one decision
         each, taken in obsidian.js and carried here.

         The field is a combobox over the list below it: the arrow keys move a
         selection through the results and an expanded result's headings while
         the focus stays here, so aria-activedescendant is what names the node
         the reader is on - obsidian-page.js writes it from the same place it
         writes the mark.

         autocomplete="off" is load-bearing, not tidiness. Arrow-down in a text
         input is also the key that opens the browser's own list of values this
         field has held before, and on a machine several readers share that list
         is other readers' queries. Arrow-down has to enter the result list and
         nothing else. -->
    <div class="sidebar-title sidebar-title-search"><b>Search</b></div>
    <div class="sidebar-search">
      <input
        id="searchField"
        class="sl-search-input nav-font"
        type="search"
        placeholder="at least ${minimumQueryLength} characters"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        role="combobox"
        aria-controls="searchResults"
        aria-expanded="false"
        aria-autocomplete="list"
        data-minimum-length="${minimumQueryLength}"
        data-debounce-ms="${searchDebounceMs}"
        oninput="onSearchInput()">
      <div id="searchResults" class="sidebar-menu sl-search-results" role="listbox" aria-label="Search results"></div>
    </div>
    <div class="sidebar-title sidebar-title-dirlist row" onclick="toggleDirList('sidebar-dirlist')"><b>Site</b><div class="sidebar-dirlist-chevron">${lucideIcon(
      "ChevronRight",
      null,
      "12px"
    )}</div></div>
    <div class="sidebar-menu sidebar-dirlist">
      ${await getDirectoryListing(req)}
    </div>
    <div class="sidebar-title sidebar-title-content"><b>Content</b></div>
    <div class="sidebar-menu sidebar-anchors">
      ${await getContentListing()}
    </div>
  `;
}

function getMermaidScriptEntry() {
  return `<script type="module">
  import mermaid from "/node_modules/mermaid/dist/mermaid.esm.min.mjs";
  import elkLayouts from "/node_modules/@mermaid-js/layout-elk/dist/mermaid-layout-elk.esm.min.mjs";

  mermaid.registerLayoutLoaders(elkLayouts);
  mermaid.initialize({
    startOnLoad: false,
    logLevel: 'debug'
  });

  function decodeEntities(str) {
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
  }

  // If reveal is ready, or simply on DOMContentLoaded
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("pre.mermaid").forEach(async (el, i) => {
      const raw = el.textContent;
      const code = decodeEntities(raw);
      try {
        const { svg } = await mermaid.render("m" + i, code);
        el.innerHTML = svg;
      } catch (e) {
        console.error("Mermaid render failed", e);
      }
    });
  });
</script>`;
}

function getAutoReloadScript() {
  return `<script>
(function () {
  function normalizeToMdPath(raw) {
    try {
      // strip domain if present
      raw = raw.replace(/^https?:\\/\\/[^/]+/, "");
      // strip query + hash
      raw = raw.split("?")[0].split("#")[0];
      // strip leading slashes
      raw = raw.replace(/^\\/+/, "");
      // If already md/... keep it
      if (raw.startsWith("md/")) return raw;
      // If it's /md/... after stripping, also ok
      if (raw.startsWith("/md/")) return raw.slice(1);
      // If it's a .md at root or elsewhere, coerce to md/<filename>.md
      if (raw.endsWith(".md")) {
        const parts = raw.split("/");
        const fname = parts[parts.length - 1];
        return "md/" + fname;
      }
      return raw; // fallback (non-md pages)
    } catch {
      return "md/unknown.md";
    }
  }

  // Prefer Reveal's configured URL (if present), otherwise use pathname
  const revealUrl = (window.Reveal && typeof Reveal.getConfig === "function" && Reveal.getConfig()?.url) || null;
  const currentFile = normalizeToMdPath(revealUrl || location.pathname);

  const context = {
    type: window.Reveal ? 'reveal' : 'page',
    currentFile: decodeURIComponent(location.pathname.replace(/^\\/+/, ""))
  };

  const address = '/hot-reload?context=' + encodeURIComponent(JSON.stringify(context));

  // A page holds one stream at a time and gives it up when it is put aside. What
  // that is worth was measured: walking one tab through pages without this, the
  // server's client map grew by one per page and never shrank, because a page
  // navigated away from goes into the back/forward cache alive, connection and
  // all. The fifth page in a row then did not load at all — the browser allows
  // six connections per host, and the navigation queued behind the five streams
  // the earlier pages were still holding.
  //
  // pagehide and pageshow are the pair that covers that: a document entering the
  // cache is hidden rather than unloaded, and comes back through pageshow.
  //
  // The retry is a doubling backoff rather than a fixed three seconds, so an
  // application that is down does not collect one request per open page every
  // three seconds for as long as it stays down. It is reset by a connection that
  // opens, so a stream that drops once retries promptly.
  const firstRetryMs = 1000;
  const longestRetryMs = 60000;
  let retryMs = firstRetryMs;
  let retry = null;
  let es = null;

  function disconnect() {
    if (retry !== null) {
      clearTimeout(retry);
      retry = null;
    }
    if (es) {
      es.close();
      es = null;
    }
  }

  function connect() {
    disconnect();
    es = new EventSource(address);

    es.addEventListener('open', function() {
      retryMs = firstRetryMs;
    });

    es.addEventListener('reload', function(event) {
      try {
        const payload = JSON.parse(event.data || '{}');
        console.log('[SSE] Reload event:', payload);

        // Save position before reload
        if (window.Reveal && Reveal.getIndices) {
          const slideIndices = Reveal.getIndices();
          sessionStorage.setItem("revealSlide", JSON.stringify(slideIndices));
        } else {
          sessionStorage.setItem("scrollY", window.scrollY);
        }

        if (payload.type === 'nav' && !window.Reveal) {
          location.reload();
        } else if (payload.type === 'page') {
          const current = decodeURIComponent(location.pathname.replace(/^\\/+/, ""));
          if (payload.files && payload.files.some(f => current.endsWith(f))) {
            location.reload();
          } else {
            console.log('[SSE] Skipping reload: not affected', { current, files: payload.files });
          }
        } else {
          console.log('[SSE] Skipping reload: not affected', { current, files: payload.files });
        }
      } catch (err) {
        console.error('[SSE] Error parsing reload payload:', err);
      }
    });

    es.onerror = function(err) {
      console.warn('[SSE] Connection lost. Reconnecting in ' + retryMs + ' ms.', err);
      disconnect();
      retry = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, longestRetryMs);
    };
  }

  // Leaving this page — for another one, or into the back/forward cache — gives
  // the stream up; coming back out of that cache opens a new one. Without the
  // second half a restored page would be listening to nothing.
  window.addEventListener("pagehide", disconnect);
  window.addEventListener("pageshow", function() {
    if (!es) connect();
  });

  // Puts back what the page was looking at before a hot reload. Whether a page
  // is visible is not this script's business in any of the three views — that
  // belongs to init() in obsidian-page.js and to the deck's own script — but the
  // two have to happen together, so this is offered as a function the view's
  // owner calls rather than triggered from an event of its own.
  //
  // It is not on DOMContentLoaded because that event is not early: it waits for
  // the deferred Mermaid module and the graph it imports, and lands after the
  // preference request has answered and after Reveal reports ready. A restore
  // hung off it would be applied to a page that is already on screen, which is
  // the jump the hidden period exists to prevent.
  //
  // The caller reveals first and calls this immediately after, in the same task:
  // a hidden body has no scroll height and no slide geometry, so there would be
  // nothing to scroll or lay out, and nothing is painted between the two.
  //
  // It reports whether it put a position back. A page opened from a search wants
  // to scroll to the heading the result named, and a page that was hot-reloaded
  // wants the offset the reader had scrolled to; when both apply - a reload of a
  // page that was opened from a search - the reader has scrolled since, so the
  // saved position wins and the jump below stands down.
  window.safeLearnRestorePosition = function() {
    try {
      if (window.Reveal && Reveal.slide) {
        const savedSlide = sessionStorage.getItem("revealSlide");
        if (!savedSlide) return false;
        const idx = JSON.parse(savedSlide);
        Reveal.slide(idx.h || 0, idx.v || 0, (typeof idx.f === "number") ? idx.f : 0);
        Reveal.layout();
        sessionStorage.removeItem("revealSlide");
        return true;
      }
      const savedScroll = sessionStorage.getItem("scrollY");
      if (!savedScroll) return false;
      window.scrollTo(0, parseInt(savedScroll, 10));
      sessionStorage.removeItem("scrollY");
      return true;
    } catch (err) {
      // A saved position that cannot be read is not a reason to leave the page
      // hidden: the caller reveals whether this succeeds or not.
      console.warn('[SSE] Could not restore the saved position:', err);
      return false;
    }
  };

  /**
   * Scrolls to the heading a search result named, if this page was opened from
   * one.
   *
   * Offered beside safeLearnRestorePosition and for the same reason: a page view
   * is served with its body hidden, and a hidden body has no scroll height, so
   * anything that scrolls has to run after the reveal and in the same task as
   * it. Nothing is painted between the two, so the first frame the reader sees
   * is already at the heading. The view's owner calls this immediately after the
   * restore - see revealPage() in obsidian-page.js.
   *
   * A native #fragment cannot do this: the browser resolves a fragment during
   * load, while the body is still hidden, and would land at the top. Nor could
   * it address the right place - makeContentMap gives every heading a fresh
   * uuid on every render, so a heading's id means nothing outside the render
   * that produced it. What a result carries instead is the heading's text and
   * which occurrence of that text it is, counted over the content this session
   * is served. This counts the same way over the page in front of it.
   *
   * The fixed header's offset is applied here rather than repaired afterwards,
   * which is what the hashchange listener at the top of obsidian-page.js does
   * for hand-written hash links. That listener stays; this does not use it.
   *
   * A target that is not found is a silent no-op and the page stays at its top.
   * That is what makes a hand-written target useless for probing: a heading that
   * is absent and a heading that was filtered out of this session's copy look
   * exactly alike from here.
   */
  window.safeLearnJumpToHeading = function() {
    try {
      const asked = new URLSearchParams(window.location.search);
      const wanted = (asked.get("heading") || "").replace(/\\s+/g, " ").trim();
      if (!wanted) return;
      const occurrence = parseInt(asked.get("occurrence") || "1", 10);
      if (!Number.isFinite(occurrence) || occurrence < 1) return;

      let seen = 0;
      for (const anchor of document.querySelectorAll(".docanchor")) {
        if ((anchor.textContent || "").replace(/\\s+/g, " ").trim() !== wanted) continue;
        seen++;
        if (seen !== occurrence) continue;
        // 50 is the height of the fixed header, the same number the hashchange
        // listener subtracts after the browser has already scrolled.
        window.scrollTo(0, anchor.getBoundingClientRect().top + window.scrollY - 50);
        return;
      }
    } catch (err) {
      // A page that cannot be scrolled to a heading is still a page. Nothing
      // about which target was asked for is reported anywhere a reader can see.
      console.warn('[search] Could not scroll to the heading that was asked for:', err);
    }
  };

  connect();
})();
</script>`;
}

export async function wrapInPage(html, startPage, req) {
  const pre = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <style>
          ${await getFontImports()}
        </style>
        <link rel="stylesheet" href="/css/main.css">
        <link rel="shortcut icon" href="/assets/favicon.ico" type="image/x-icon" />
        <title>${req.file.name}</title>
      </head>
      <!-- Hidden from the first byte the browser renders, and inline for that
           reason: a hide expressed in a stylesheet would only hold once the
           stylesheet had loaded. What the period is for is the session's own
           font size, theme and dark mode — init() in obsidian-page.js applies
           them to the already-parsed document, and until /userattributes answers
           the page would be showing the defaults. init() ends the period, and it
           is the only thing that does; wrapAsDocument below serves the body the
           same way for the same reason. -->
      <body style="display: none;">
        <div id="topbar">${await getTopBar(startPage, req)}</div>
        <div id="wrapper">
          <div id="sidebar" class="nav-font">&nbsp;<br>${await getSideBar(
            startPage,
            req
          )}</div>
          <div id="markdown-content">
    `;
  const post = `
          </div>
          <div id="topdown-menu" class="nav-font">
            ${await getTopdownMenu(req)}
          </div>
        </div>
        <script src="/obsidian-page.js"></script>
        ${getMermaidScriptEntry()}
        ${getAutoReloadScript()}
        <script lang="javascript">
        initFonts('${JSON.stringify(mainFontsArray)}', '${JSON.stringify(
    navFontsArray
  )}');
        init();
        </script>
        ${openNavTreeScript}
      </body>
      </html>
    `;
  return pre + html + post;
}

export async function wrapAsDocument(html, req) {
  const pre = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <style>
          ${await getFontImports()}
        </style>
        <link rel="stylesheet" href="/css/main.css">
        <link rel="shortcut icon" href="/assets/favicon.ico" type="image/x-icon" />
        <title>${req.file.name}</title>
      </head>
      <body style="display: none;">
        <div id="wrapper">
          <div id="markdown-content">
    `;
  const post = `
          </div>
        </div>
        <script src="/obsidian-page.js"></script>
        ${getMermaidScriptEntry()}
        ${getAutoReloadScript()}
        <script lang="javascript">
        initFonts('${JSON.stringify(mainFontsArray)}', '${JSON.stringify(
    navFontsArray
  )}');
        init();
        </script>
      </body>
      </html>
    `;
  return pre + html + post;
}

export async function wrapInReveal(reveal, req) {
  const pre = `
  <!DOCTYPE html>
  <html>
  
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  
    <title>${req.file.name}</title>
  
    <!-- Reveal, from the version package.json declares and app.js serves out of
         node_modules. The theme is this project's derivation of the package's
         moon.css: the package's own imports Lato from Google, which a deck must
         not do. Printing needs no stylesheet of its own — reveal.css carries it. -->
    <link rel="stylesheet" href="/node_modules/reveal.js/dist/reset.css">
    <link rel="stylesheet" href="/node_modules/reveal.js/dist/reveal.css">
    <link rel="stylesheet" href="/css/reveal-theme-moon.css">

    <style>
      ${getFontImports()}
    </style>
    <!-- Last, and last on purpose: these are this deck's rules over the theme's. -->
    <link rel="stylesheet" href="/css/reveal.css">
    <link rel="shortcut icon" href="/assets/favicon.ico" type="image/x-icon" />

    ${getMermaidScriptEntry()}
    ${getAutoReloadScript()}
  </head>

  <!-- Hidden from the first byte, as in the two page views, and for the second
       of the two reasons that period exists: a deck restored to the slide it was
       on before a hot reload would otherwise be seen at slide one first. A deck
       loads no obsidian-page.js and has no preferences to wait for, so its owner
       is the script at the end of this body rather than init(). -->
  <body style="display: none;">
    <div class="reveal" width="100%" height="100%">
      <div class="slides" width="100%" height="100%" id="revealContent">
  `;
  const post = `
      </div>
    </div>
    <!-- The engine and the one plugin this deck uses, both from the installed
         package. A plugin is a script loaded here and named in \`plugins\` below;
         there is no loader to bootstrap, which is what headjs used to do. -->
    <script src="/node_modules/reveal.js/dist/reveal.js"></script>
    <script src="/node_modules/reveal.js/plugin/notes/notes.js"></script>

    <script>
      /**
       * The deck's reveal owner — the counterpart to init() in the two page
       * views, which a deck does not load. What it waits for is Reveal reporting
       * ready: the point at which the deck has its slides and can be told which
       * one to show.
       *
       * The slide the deck was on before a hot reload is put back here, in the
       * same task and after the body is shown, for the reason the reload script
       * states: a hidden body measures zero in both directions, so neither the
       * slide geometry nor the scale would come out right. Nothing is painted
       * between the two, so the deck is first seen on the slide it was left on.
       *
       * The value written is the empty string, the same as in a page view and
       * for the same reason: the stylesheets decide, not this script.
       *
       * Called twice or more it does nothing the second time, and clearing the
       * bound below is part of showing the deck, so the two callers cannot both
       * reveal it and the bound cannot log after a deck that came up normally.
       */
      function showDeck() {
        if (deckShown) return;
        deckShown = true;
        clearTimeout(deckBound);
        deckBound = null;

        document.body.style.display = "";
        window.safeLearnRestorePosition?.();
        // Reveal scales a deck to its viewport, and it computed that scale while
        // the body still measured zero, so it has to be taken again.
        if (window.Reveal && Reveal.layout) Reveal.layout();
      }

      /**
       * The same bound the page views put on their wait, for the same reason and
       * in the same order of magnitude. A deck whose engine never reports ready
       * is broken either way — Reveal.initialize is called inline right below —
       * but a broken deck that shows its slides unscaled is still worth more
       * than a black screen.
       */
      const deckBoundMs = 5000;
      let deckShown = false;
      let deckBound = setTimeout(function () {
        console.warn(
          "[bootstrap] Showing this deck without waiting for Reveal: it did not " +
            "report ready within " + deckBoundMs + " ms."
        );
        showDeck();
      }, deckBoundMs);

      // More info about config & plugins:
      // - https://revealjs.com/config/
      // - https://revealjs.com/plugins/
      Reveal.initialize({
        // The speaker view, opened with "s": a second window showing the
        // current slide and the <aside class="notes"> of that slide, which the
        // audience's window does not display.
        plugins: [ RevealNotes ],

        // Display controls in the bottom right corner
        controls: true,
  
        // The "normal" size of the presentation, aspect ratio will
        // be preserved when the presentation is scaled to fit different
        // resolutions. Can be specified using percentage units.
        width: "90%",
        height: "90%",

        // Factor of the display size that should remain empty around
        // the content
        margin: 0.04,

        // Bounds for smallest/largest possible scale to apply to content
        minScale: 0.2,
        maxScale: 2.0,
  
        // Display a presentation progress bar
        progress: true,
  
        // Set default timing of 2 minutes per slide
        defaultTiming: 120,
  
        // Display the page number of the current slide
        slideNumber: true,
  
        // Push each slide change to the browser history
        history: false,
  
        // Enable keyboard shortcuts for navigation
        keyboard: true,
  
        // Enable the slide overview mode
        overview: true,
  
        // Vertical centering of slides
        center: true,
  
        // Enables touch navigation on devices with touch input
        touch: true,
  
        // Loop the presentation
        loop: false,
  
        // Change the presentation direction to be RTL
        rtl: false,
  
        // Randomizes the order of slides each time the presentation loads
        shuffle: false,
  
        // Turns fragments on and off globally
        fragments: true,
  
        // Flags if the presentation is running in an embedded mode,
        // i.e. contained within a limited portion of the screen
        embedded: false,
  
        // Flags if we should show a help overlay when the questionmark
        // key is pressed
        help: true,
  
        // Flags if speaker notes should be visible to all viewers
        showNotes: false,
  
        // Global override for autolaying embedded media (video/audio/iframe)
        // - null: Media will only autoplay if data-autoplay is present
        // - true: All media will autoplay, regardless of individual setting
        // - false: No media will autoplay, regardless of individual setting
        autoPlayMedia: null,
  
        // Number of milliseconds between automatically proceeding to the
        // next slide, disabled when set to 0, this value can be overwritten
        // by using a data-autoslide attribute on your slides
        autoSlide: 0,
  
        // Stop auto-sliding after user input
        autoSlideStoppable: true,

        // Enable slide navigation via mouse wheel
        mouseWheel: true,

        // Opens links in an iframe preview overlay
        previewLinks: true,
  
        // Transition style
        transition: 'convex', // none/fade/slide/convex/concave/zoom
  
        // Transition speed
        transitionSpeed: 'default', // default/fast/slow
  
        // Transition style for full page slide backgrounds
        backgroundTransition: 'fade', // none/fade/slide/convex/concave/zoom
  
        // Number of slides away from the current that are visible
        viewDistance: 3,

        // The display mode that will be used to show slides
        display: 'block'
      }).then(showDeck);
      Reveal.configure({
        // PDF Configurations
        pdfMaxPagesPerSlide: 1
      });
    </script>
  </body>
  
  </html>
    `;
  return pre + reveal + post;
}
