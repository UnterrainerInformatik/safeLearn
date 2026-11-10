## Context

The navigation tree is assembled server-side in `obsidian.js` (`getDirectoryListing` → `getDirectoryListingInternal` → `insertDirFolder`). Each folder emits two elements whose class is a key: the folder's content container (`.<key>`) and its chevron (`.<key>-chevron`). The client opens or closes a folder with `toggleDirList(key)` in `obsidian-page.js`, which acts on `document.querySelector('.<key>')` — the first match only. On load, the server appends `toggleDirList(...)` calls to `openNavTreeScript` for the folders on the current page's path, chosen by `lookupAndMarkPath(folderName, level, path)`.

Today the key is `getCssHashKey(folder, j)` = `ff-<hash32(name)>-<depth>`, and `lookupAndMarkPath` compares name and level. Neither knows the parent, so namesakes at the same depth collide (see proposal.md — Why). Verified against the secureLectures corpus: `exercises/WMC`, `homework/WMC`, `templates-quickie/WMC`, `tests/WMC` all map to `ff-<hash32("WMC")>-1`; the tree sorts `exercises` first, so that is the one `querySelector` returns.

## Goals / Non-Goals

**Goals:**
- A folder's key is unique within the tree, so the unchanged `toggleDirList` addresses exactly one folder and one chevron.
- On load, exactly the folders on the current page's path are opened.

**Non-Goals:**
- `toggleDirList`'s fixed `max-height: 2000px` (a very long folder is clipped). Separate issue, not touched.
- The prefix test `f.folders.startsWith(folders)` in `getDirectoryListingInternal` compares a path string against an array (coerced with commas) and is not segment-aware (`WMC` would prefix `WMC2`). It decides which files go into the recursive call, not which folder a click opens; noticed while reading, left for a separate change so this fix does not also reshape the tree.
- `openNavTreeScript` being a module-level variable shared across concurrent renders. Not the reported bug.

## Decisions

**Key = hash of the full folder path, not of the name.** `insertDirFolder` receives the folder's path from the corpus root (`file.folderArray.slice(0, j + 1).join("/")`) and builds the key as `ff-<hash32(fullPath)>`. The depth suffix is no longer needed, because the full path already encodes the depth. The visible label stays the bare folder name.
- *Alternative:* keep name-based keys and make `toggleDirList` walk from the clicked element (`event.currentTarget.nextElementSibling`). Fixes clicks, but the on-load script has no clicked element and would still need unique addressing. Two mechanisms for one job — rejected.
- *Alternative:* use the raw path as a class name via `makeSafeForCSS`. Different paths can map to the same safe name (special characters are collapsed), and the existing `md/folder-tests/special chars $'&`´!` folder shows those exist. A hash of the unmodified path stays a valid class and only collides with negligible probability — kept, as today.

**On-load opening compares path prefixes.** `markPathForSelectedPage` already splits the request path into segments. Instead of matching `(name, level)` per folder, a folder is opened when its full path equals the first `j + 1` segments of the page's path joined by `/`. That removes the need for the `currentLevel` counter in `getDirectoryListingInternal`, which is reset on each recursive call and only happened to work for the common case. Each folder on the path is opened exactly once.

**Test fixture lives under `md/folder-tests/`.** Two folders `namesake-a/` and `namesake-b/`, each with a subfolder `shared/` holding one file whose text names its location. The existing folder-tests check only iterates direct subfolders that contain files, so these two (which only contain a subfolder) do not disturb it. The new check in `test/checks/navigation.js` reads the tree from the rendered sidebar of a real page, clicks in the browser and asserts on visibility (computed `max-height` / bounding box of the file link), as the suite does elsewhere.

## Risks / Trade-offs

- [Something else relies on the old `ff-<hash>-<depth>` class shape] → grep `ff-` across `obsidian.js`, `obsidian-page.js`, `css/` and `test/` during implementation; currently only `getCssHashKey` produces and only `toggleDirList` consumes it.
- [The Obsidian plugin or secureLectures carries a copy of the tree code] → the plugin does not render the web tree; secureLectures takes the code from safeLearn by merge.
- [A visitor's browser holds an open tree state keyed by the old class] → no state is persisted; the tree is rebuilt on every page load.

## Migration Plan

None beyond the normal deploy: ship in safeLearn, then merge into secureLectures as usual. Rollback is a revert.
