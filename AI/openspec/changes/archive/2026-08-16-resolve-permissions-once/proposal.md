## Why

Source: `AI/architecture.md` section 9, Code-level observations — the `getPermissionsFor` bullet and the duplicated whole-file check. No file in `AI/proposals/` corresponds to this change.

Two observations that were recorded separately are one problem seen from two sides: **the whole-file permission directive is read twice, from two sources, by two implementations of the same rule.**

`scanFiles` reads it from disk. For every Markdown file in the corpus it opens a read stream and a `readline` interface to look at the first line (`obsidian.js:601` → `:389`), and stores the result as `permissions` in `mdFilesDirStructure`. It does this for **every** file on **every** scan, although it has just computed, three dozen lines earlier, exactly which files changed: `scanFiles` keeps an mtime snapshot across calls and returns `{ added, removed, modified }` (`obsidian.js:507-554`). With `NEXT_AUTOSCAN` enabled, chokidar calls `scanFiles` on every filesystem event under `md/` (`app.js:261`), so saving one file in an editor re-opens every file in the corpus to re-read a line that did not change in any of them.

`sanitizeAndParseMarkdown` reads it from the content it was handed. It splits the first line off the text, parses it with the same `parseFirstLineForPermissions`, asks `getActivePermissionRoles` which roles are in their time window, refuses when that set is empty, and otherwise calls `hasSomeRoles` (`app.js:109-121`). That is the same sequence `getDirectoryListing` runs over the stored `permissions` to decide which files appear in the navigation tree (`obsidian.js:1339-1344`) — written out a second time, in a second file.

Nothing leaks today. The page handler is the sharp gate and it reads the file as it is on disk, so a stale index cannot show anyone content they may not see. What the duplication costs is agreement and the ability to change the rule: the navigation tree and the page decide the same question from two sources through two copies of the logic, and an edit to one of them — a change to how a time window is read, to what an empty role set means — silently applies to only one of the two. A pupil then sees a file in the sidebar that refuses to open, or does not see one they are allowed to read.

## What Changes

- **A file's directive is read again only when the file changed.** `scanFiles` already knows which files are added or modified. The permission line is read from disk for those, and carried over for every file whose mtime is unchanged. A scan triggered by one edited file opens one file, not the whole corpus.
- **The decision becomes one function, called from both places.** "May this session see this file, given its directive?" — active roles, the empty-set refusal, the role test — moves into one exported function in `obsidian.js`. The navigation tree and the page handler call it. Neither restates the rule.
- **Content that has no index entry keeps being checked.** `/convert` renders a Markdown body posted in a request, and `mdGetToHtml` renders whatever a URL returns (`app.js:463-487`, `:140-153`). Neither has a corpus file behind it, so neither can be answered from the index. The shared function takes a parsed directive, not a path, which is what lets both kinds of caller use it.
- **The page handler keeps reading the file, not the index.** The index is a scan-time snapshot; between scans — and with `NEXT_AUTOSCAN` off, indefinitely — it can be older than the file. Serving a page from it would make a directive take effect only after a restart. The gate stays where the freshest truth is.
- Not touched: what `parseFirstLineForPermissions` accepts, the block-level `@@@` directives, the role set a session is credited with (`role-resolution` governs that), the time-window semantics of `getActivePermissionRoles`, and the rescan-everything behavior of the watcher itself — one edit still rebuilds the whole index, it just stops re-reading unchanged files while doing so.

## Capabilities

### New Capabilities

- `corpus-index`: the in-memory index the application builds over `md/` — what a scan puts in it, when an entry is read again from disk, and the rule that the whole-file permission directive is interpreted by one implementation whatever the caller. Covers the agreement between the navigation tree and the page a link leads to.

### Modified Capabilities

None. `role-resolution` governs which roles a session holds and how a directive is evaluated against them; this change moves *where* that evaluation is called from without altering its outcome. `content-verification` gains a check, which its existing requirements already demand of any change to guarded code.

## Impact

- `obsidian.js` — `getPermissionsFor` gains a caller that can skip it; `scanFiles` carries entries forward across the mtime diff it already computes; the decision from `getDirectoryListing` becomes an exported function used by both callers.
- `app.js` — `sanitizeAndParseMarkdown` calls that function instead of restating the sequence. The first-line strip stays where it is; it is rendering, not permission.
- `test/checks/permissions.js` — the two must be shown to agree: a file that refuses to render does not appear in the tree, and one that renders does. `test/coverage-map.json` records it.
- `AI/architecture.md` — two Observations in section 9 resolve.
- `docs-testing.md` — only if a verification gap has to be recorded, in the form section "What the corpus demonstrates but a run cannot assert" already uses.
- No dependency is added or removed. No configuration changes. Nothing an operator has to do.
