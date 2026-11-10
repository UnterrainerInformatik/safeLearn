## Why

On secureLectures a teacher sees `homework/` with a subfolder `WMC` in the navigation tree, and clicking `WMC` does nothing — no console error. The tree identifies a folder only by its **name and depth**: `getCssHashKey(folder, j)` in `obsidian.js` builds `ff-<hash(name)>-<depth>`, and `toggleDirList()` in `obsidian-page.js` opens `document.querySelector('.<key>')`, the *first* element carrying that class. secureLectures has four folders called `WMC` at depth 1 (`exercises/`, `homework/`, `templates-quickie/`, `tests/`). They all share one key, so every click on any of them opens and closes `exercises/WMC` — which sits inside the collapsed `exercises` folder, so nothing visible happens. Only the first namesake in sort order works. The same name-and-depth match also decides which folders open automatically on page load, so a page inside `homework/WMC` opens `exercises/WMC` instead of its own folder.

This is not a permission problem and not specific to teachers: any reader of any instance sees it as soon as two folders at the same depth share a name, and per-subject subfolders (`WMC`, `questions`, …) make that the normal case.

## What Changes

- Each folder in the navigation tree gets a key derived from its **full path** from the corpus root (e.g. `homework/WMC`), not from its name and depth. A click on a folder opens and closes exactly that folder, and its own chevron.
- Opening the folders that lead to the current page on load matches the page's path folder by folder against the full path, so it opens the page's own folders and no namesake.
- The test corpus gains two folders under `md/folder-tests/` that each contain a subfolder of the same name, each with a file, so the case exists in safeLearn itself.
- `test/checks/navigation.js` gains a check that clicking each of the two namesake subfolders reveals its own file, and that opening a page inside the second one opens that folder on load.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `page-navigation`: adds the requirement that each folder of the navigation tree opens and closes on its own, independent of other folders carrying the same name, and that the folders leading to the current page are the ones opened on load.

## Impact

- `obsidian.js`: `getCssHashKey`, `insertDirFolder`, `getDirectoryListingInternal`, `markPathForSelectedPage` / `lookupAndMarkPath`.
- `obsidian-page.js`: `toggleDirList` stays as it is if the keys are unique; no API change.
- Corpus: two new folders with one file each under `md/folder-tests/` (the existing folder-tests check iterates that directory's direct subfolders and must keep passing).
- `test/checks/navigation.js`, `test/coverage-map.json` (description of the navigation checks).
- secureLectures receives the fix through the usual merge from safeLearn; no downstream change.
