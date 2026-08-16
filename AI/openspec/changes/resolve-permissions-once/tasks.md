## 1. One implementation of the whole-file rule

- [ ] 1.1 In `obsidian.js`, beside `getActivePermissionRoles`, add the exported `resolveFileVisibility(req, permissions)` from design Decision 2. It returns `{ visible: true }` when `permissions` is `null` or `undefined`, `{ visible: false, reason: "outside-window" }` when `getActivePermissionRoles` yields an empty set, and otherwise the result of `hasSomeRoles(req, activeRoles, true)` as `{ visible: true }` or `{ visible: false, reason: "role" }`.
- [ ] 1.2 Import `hasSomeRoles` from `utils.js` into `obsidian.js` and confirm no import cycle results — `utils.js` imports `middlewares/keycloak-middleware.js`, which must not reach back into `obsidian.js` (design Risks). Run the application, not only a grep: a cycle in ES modules shows up as an undefined binding at call time, not at parse time.
- [ ] 1.3 Comment the function with what it is for: the navigation tree and the page handler decide the same question, and an edit to the rule that reaches only one of them lets a session see a file in the tree that refuses to open. Name both callers.
- [ ] 1.4 Rewrite `getDirectoryListing` (`obsidian.js:1339-1344`) to call it, dropping its own `getActivePermissionRoles`/`hasSomeRoles` sequence and keeping its treatment of a `null` entry unchanged.
- [ ] 1.5 Rewrite `sanitizeAndParseMarkdown` (`app.js:110-121`) to call it, mapping `reason` to the two existing messages — `"outside-window"` to "This content is not visible right now.", `"role"` to "You do not have the required permissions to view this content." Both strings are asserted by `test/checks/permissions.js`; neither may change.
- [ ] 1.6 Leave the first-line strip at the call site (design Decision 3) and confirm it still runs whenever a directive was parsed, including when the session may see the file.
- [ ] 1.7 Run `npm test`. The permissions and views checks must pass unchanged — this task is a move, not a change in outcome.

## 2. Stop re-reading unchanged files

- [ ] 2.1 In `obsidian.js`, add a module-level `Map` from `fullPath` to `{ mtime, permissions }`, in the form design Decision 1 describes. Key it on `fullPath` (`md/...`), the same string the mtime snapshot uses — not on `path`, which lacks the prefix.
- [ ] 2.2 In the metadata build (`obsidian.js:577-606`), consult the map before calling `getPermissionsFor`: on a hit whose `mtime` equals the value just stat'ed, take the stored `permissions`; otherwise read the file and record the result. Note that `mtime` is already computed one line above (`:587`).
- [ ] 2.3 Rebuild the map from the files the scan saw, so entries for deleted files do not survive it.
- [ ] 2.4 Comment the cache with what it assumes and what it costs: an mtime that does not move when the content does leaves a stale directive in the tree until the next real change, the page handler refuses correctly regardless, and the watcher's own `modified` list already rests on the same assumption.
- [ ] 2.5 Confirm the first scan of a process has no cache and therefore reads every file — the map starts empty, so this should need no branch of its own. If it does need one, that is a sign the key is wrong.
- [ ] 2.6 Verify the saving by hand against a running instance with `NEXT_AUTOSCAN=true`: count the file opens a scan performs before and after — a `console.count` in `getPermissionsFor`, removed again afterwards — while touching one corpus file. Record both numbers in this task. A number that does not drop to one means the key does not match.
- [ ] 2.7 Run `npm test`.

## 3. Prove the two agree

- [ ] 3.1 Extend `test/checks/permissions.js`: for each corpus file carrying a whole-file directive and each test account, assert that the file's presence in that session's navigation tree matches whether requesting it directly returns content rather than a refusal. Read the tree from the rendered sidebar, not from a second call into the application's own functions.
- [ ] 3.2 Include the complementary case explicitly — a file the tree does not list is refused when opened — so that a tree which lists nothing at all cannot pass the check.
- [ ] 3.3 Assert the two refusal messages still reach the page for their respective causes: a directive whose window is closed, and one naming a role the session lacks. `md/test-perms.md` and the timed corpus file already carry both.
- [ ] 3.4 If `/convert` can be driven from the harness with the session cookie it already holds, assert there too that a posted body whose first line is a directive the session fails is refused. If it cannot, record why in `docs-testing.md` under "What the corpus demonstrates but a run cannot assert" rather than leaving it unstated.
- [ ] 3.5 Record the new coverage in `test/coverage-map.json` — `obsidian.js` and `app.js` are already in the `guards` list of `test/checks/permissions.js`; extend that check's `what` to name the tree-versus-page agreement.
- [ ] 3.6 Run `npm test`.

## 4. Settle the observations

- [ ] 4.1 Strike the two Observations in `AI/architecture.md` section 9 — the `getPermissionsFor` per-file read stream and the duplicated whole-file check — in the established form, naming this change and what it did with each.
- [ ] 4.2 State in the same place what remains true: the index is a snapshot, the page handler reads the file, and with `NEXT_AUTOSCAN` off the navigation tree can be older than the corpus. That is behavior, not a defect, and the spec now says so.
- [ ] 4.3 Answer design's open question — whether an empty corpus file, and with it a `permissions` of `undefined`, occurs in `md/` — and either point the check at the file that produces it or record that the case is handled but unexercised.
- [ ] 4.4 Run `npm test` one final time, with every group applied.
