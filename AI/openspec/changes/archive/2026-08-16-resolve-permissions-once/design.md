## Context

See proposal.md — Why. What shapes the approach is what the two callers actually have in their hands, which is not the same thing.

**What a scan does today.** `scanFiles(prefix, dir, resetFonts, root)` (`obsidian.js:507`) runs in four movements:

1. `snapshotDir` walks the tree and records `mtimeMs` per Markdown file, keyed by `prefix + path.relative(root, filePath)` — the `md/...` form (`:512-535`).
2. The new snapshot is diffed against `lastFileSnapshot`, producing `added`, `removed` and `modified`; the new one replaces it (`:537-557`).
3. The global maps are cleared and `scanFilesInternal` rebuilds `mdFilesDir` (`:559-574`).
4. Metadata is built for every key of `mdFilesDir` in one `Promise.all`, and each entry gets `mtime` and `permissions: await getPermissionsFor(absPath)` (`:577-606`). `mdFilesDirStructure` is replaced by the result (`:632`).

Movement 4 is where every file is opened. Note that it already stores `mtime` per entry (`:587`, `:602`) — the value a carry-forward has to compare against is present in both the old structure and the new snapshot.

**The two keys are not the same string.** The snapshot keys on `prefix + relative path` (`md/sub/file.md`); `mdFilesDir` keys on the path without the prefix (`sub/file.md`), and the entry carries both as `path` and `fullPath` (`:590-591`). Anything that looks an entry up across a scan has to pick one and use it consistently — `fullPath` is the one that matches the snapshot and the one the watcher's `diff` reports.

**What each caller has.** The navigation tree holds index entries and nothing else — it never opens a file (`getDirectoryListing`, `obsidian.js:1335-1347`). The page handler holds file *content*: `app.js:309` reads the file with `fs.readFile` and hands the text to `sanitizeAndParseMarkdown`, which never learns which path it came from. `/convert` and `mdGetToHtml` hand it text that has no path at all. So the shared decision cannot take a path, and cannot fetch anything: it has to take an already-parsed directive.

**What `parseFirstLineForPermissions` returns.** `null` when the line is not a directive, otherwise the role list. Both callers treat `null` and `undefined` as "no directive, everyone may see it" — `getDirectoryListing` explicitly (`:1340`), `sanitizeAndParseMarkdown` by only entering the branch when `permissions !== null` (`app.js:111`). That equivalence has to survive, and it is the one place the two implementations can be read as disagreeing today: the tree guards against `undefined`, the page does not. An index entry can hold `undefined` only if `getPermissionsFor` resolved without a line, which happens for an empty file.

**Reading the first line costs a stream today, and nothing on the render path.** `getPermissionsFor` opens `fs.createReadStream` plus a `readline` interface per file. The page handler, in contrast, already has the whole file in memory and pays a `split("\n")[0]`. So the I/O half of this change is entirely in the scan, and the render half is entirely about having one implementation of the rule — not about saving work.

## Goals / Non-Goals

**Goals:**

- A scan reads from disk only the files whose mtime says they changed.
- One implementation decides whether a session may see a file, whatever the caller and whatever it has in its hands.
- The navigation tree and the page a link leads to give the same answer for the same session at the same moment.
- Content with no corpus entry stays governed by the directive it carries.

**Non-Goals:**

- Serving pages from the index. The index is a snapshot; the file on disk is the truth, and with `NEXT_AUTOSCAN` off there is no scan between a directive being written and a page being requested.
- Making the watcher rescan incrementally. `scanFiles` rebuilds the whole structure on every call by construction (`mdFilesDirStructure = {}` at `:571`), and the maps it fills are module-level globals several other functions read. Turning that into an incremental update is a larger change with a different risk profile; carrying permission entries across a full rebuild gets the I/O without it.
- Caching file *content*. Only the parsed directive is carried forward — a few role names per file. Holding the corpus in memory is a different question, with a memory bound this change should not quietly introduce.
- Touching block-level `@@@` directives, which are resolved during rendering and have no index representation at all.

## Decisions

### Decision 1: Carry permissions forward on unchanged mtime, keyed by `fullPath`

Keep a module-level `Map` from `fullPath` to `{ mtime, permissions }`, filled at the end of every scan and consulted in movement 4: when the map holds an entry for this `fullPath` whose `mtime` equals the one just stat'ed, use its `permissions`; otherwise call `getPermissionsFor` and record the result. Entries for files that are gone fall out because the map is rebuilt from the files a scan sees.

The comparison is on the same `mtimeMs` value the snapshot diff uses, so the cache cannot disagree with the `added`/`modified` lists the watcher acts on — one source, two readers.

*Alternatives considered.* **Passing `added`/`modified` into movement 4** and re-reading exactly those is the same idea expressed as a list rather than as a lookup, but it makes movement 4 depend on movement 2's output, and the first scan of a process has an empty snapshot where every file is "added" — the lookup handles that case without a special branch. **Caching on file content hash** would survive a touch that does not change the file, at the cost of reading every file to compute it, which is the thing being avoided. **Not caching at all and making the watcher call `scanFiles` less often** treats the symptom: a full scan is also triggered on startup and by the timed-permission scheduler, and those pay the same cost.

*What this trades away.* An mtime that does not move when the content does — a filesystem with coarse timestamps, a restore that preserves mtimes — leaves a stale directive in the index, and the navigation tree then disagrees with the page for that file until the next real change. The page still refuses correctly, so this is a visibility oddity and not an exposure. The same assumption is already load-bearing in the watcher's `modified` list, so this change does not introduce it — but it does extend its reach, and the tasks record that where the cache is built.

### Decision 2: One exported function taking a parsed directive and a request

Add to `obsidian.js`, beside `getActivePermissionRoles`:

```js
export async function maySeeFileWithPermissions(req, permissions) // -> boolean
```

It returns `true` when `permissions` is `null` or `undefined`; otherwise it computes `getActivePermissionRoles(permissions)`, returns `false` on an empty set, and otherwise returns `hasSomeRoles(req, activeRoles, true)`. `getDirectoryListing` calls it per entry; `sanitizeAndParseMarkdown` calls it with what it parsed from the first line.

Taking `req` rather than a role set keeps `hasSomeRoles` — and with it the whole of `role-resolution`, including the teacher's student-view downgrade — inside the one function, which is the point: the two call sites must not be able to pass different flags to it. Today they both pass `allowOverride = true`, and that agreement is invisible.

*Alternative considered.* Having the function return a reason (`"no-directive" | "outside-window" | "not-your-role"`) so the page could distinguish its two error messages. The page's two messages differ ("not visible right now" vs. "you do not have the required permissions") and are asserted by `test/checks/permissions.js`, so the messages must survive. They can, without a reason code: the page keeps its own `getActivePermissionRoles` call for the empty-window message and calls the shared function for the decision. That splits the rule again, which is what this change is undoing — so the function returns the distinction, as a small result object rather than a boolean, and the page maps it to its messages. The signature above becomes:

```js
export async function resolveFileVisibility(req, permissions)
// -> { visible: true } | { visible: false, reason: "outside-window" | "role" }
```

The tree ignores `reason`; the page selects its message from it. One rule, two presentations of the same outcome.

### Decision 3: The page keeps stripping the first line itself

Removing the directive line before parsing (`app.js:120`) is a rendering concern — the line must not appear in the output — and applies whenever a directive was found, independently of whether the session may see the file. It stays at the call site.

## Risks / Trade-offs

- **A carried-forward directive is only as good as mtime.** Covered in Decision 1. Bounded by the page handler remaining the gate.
- **`resolveFileVisibility` is async and called once per corpus file to build the tree.** That is what happens today; the function is a rename of existing work, not new work per file.
- **Moving the decision into `obsidian.js` puts a `utils.js` import there.** `obsidian.js` does not import `hasSomeRoles` today; `app.js` does (`app.js:101`). `utils.js` imports from `middlewares/keycloak-middleware.js`, and `obsidian.js` imports neither — so the direction is new but acyclic. A task checks for a cycle rather than assuming there is none.

## Open Questions

- ~~Whether the empty-file case (`getPermissionsFor` resolving `undefined`) can occur in the corpus at all, or only in a deployment's own `md/`. It is handled either way, but if it cannot occur, the check that a run makes of it has to be built rather than found.~~

  **Answered during implementation: empty files occur, but they resolve to `null`, not `undefined`.** The corpus holds three zero-byte Markdown files — `Untitled.md` in each of the three `md/folder-tests/` directories. `getPermissionsFor` initialises `result = null` and resolves it when the stream closes; a zero-byte file fires no `line` event at all, so the initial value survives. Verified against one of the three: the `line` handler ran zero times and the promise resolved `null`.

  So `undefined` cannot reach `resolveFileVisibility` from the index. Every entry the metadata build writes carries a `permissions` key, and the only value the reader can produce is `null` or an array. The `undefined` half of the guard is defensive and unexercised — it was already so in `getDirectoryListing`, whose `f.permissions !== undefined` test covered no real case either. It is kept rather than dropped because the function is exported and its two documented callers are not the only ones a fork may add; a caller that parses its own first line and hands over a missing value should be treated as "no directive" rather than crash. Recorded in `docs-testing.md`.

  The `null` path itself is exercised on every run: those three empty files are listed in the navigation tree for every session, which is exactly the "a directive is absent" scenario of the `corpus-index` spec.
