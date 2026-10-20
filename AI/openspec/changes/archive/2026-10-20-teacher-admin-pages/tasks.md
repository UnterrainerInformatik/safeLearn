Each section ends deployable to secureLectures and leaves every existing page and route answering exactly as before.

## 1. Gate and routes

- [x] 1.1 Move `identityOf` from `exam/gate.js` to `utils.js`, re-export it from `exam/gate.js` so no exam import changes (design D1); unit-test it where it now lives
- [x] 1.2 `admin/index.js`: the gate `actsAsTeacherWithIdentity(req)` (`hasSomeRoles(req, ["teacher"], true)` and `identityOf`), a page gate that calls `next("router")`, a data gate that answers `403 { error: "Forbidden" }` (D2, D3)
- [x] 1.3 `GET /admin/api/attachments` → `{ scannedAt, count, paths }` from `unreferencedAttachments()`; `GET /admin/api/directory/status` → `getDirectoryStatus()` unchanged; `GET /admin/assets/**` serving `admin/client/` only
- [x] 1.4 `app.js`, inside `registerRoutes`: call `registerAdminRoutes(app, { startPage })` under its own `if (identity.mode === "keycloak")` right before the exam module's mount, so it lies after `app.use(checkAuthenticated)` and before the catch-all; not in the existing keycloak branch at the top, which runs ahead of `checkAuthenticated` (D7)

## 2. Pages

- [x] 2.1 `GET /admin/attachments` page shell through `wrapInPage` with `title` and `wide`; `admin/client/attachments.js` draws count, scan time (reader's format via `i18n/format.js`), **Copy paths** with an in-page confirmation and the `<textarea>` fallback, the list grouped by folder, and the empty state (D8, Risks)
- [x] 2.2 `GET /admin/directory` page shell; `admin/client/directory.js` draws fetching/phase/progress, entries, built at, skipped as a count, the "no data held" state, and polls every 2 s only while `fetching` (D5)
- [x] 2.3 `css/admin.css`: layout for both pages in both themes, `sl-button` for every action, long paths wrap, nothing scrolls horizontally at 390px
- [x] 2.4 Catalog keys under `app.admin.*` in `i18n/en.json` and `i18n/de.json` (BabelEdit format, same keys in both); `test/i18n-catalog.test.js` stays green

## 3. Menu

- [x] 3.1 `getTopdownMenu`: the **Administration** section with the two buttons (icon + text) for a session passing the same gate and only when `withoutIdentity()` is false, between the format choice and the print buttons (D6)
- [x] 3.2 Check the open menu at 1280px and 390px with Puppeteer screenshots; nothing in the menu wraps or overlaps

## 4. Verification

- [x] 4.1 Harness checks, teacher: the menu shows the section; both buttons open their pages; the attachments page lists exactly the paths the server logged as `[Attachments] unreferenced:` for this run (`applicationOutput()`), with the logged count; **Copy paths** puts them on the clipboard one per line
- [x] 4.2 Harness checks, directory: the session route and the bearer route answer the same report for the teacher at the same moment; the page shows the state that report gives ("no data held" on the demo realm if nothing is held); opening the page starts no fetch (phase stays `idle`)
- [x] 4.3 Harness checks, refusal: a student and a teacher in student view see no section, get the catch-all answer for both pages and `403` without a path or figure for both data routes; switching back to the teacher view restores all of it
- [x] 4.4 Harness checks: German interface on menu and both pages; both pages at the legibility viewport (390px) without horizontal scroll
- [x] 4.5 A check in `test/anonymous.test.js` (the `AUTH=none` harness) with `READER_ROLES=teacher` that the section is absent and all four routes get the catch-all answer
- [x] 4.6 Run `npm test` with the exam module off and on, and `npm run test:obsidian`; record the results
  - 2026-10-20, `npm test` (content suite with the module off, `exam.test.js` with it on): 837 passed, 1 skipped, 1 failed. The failure is `exam.test.js` "the Exams page hides the student's results while they write…" (`.sl-exam-attempt-open[data-test="3"] button` not found); it failed again on a rerun and identically on HEAD `e29d148` in a clean worktree, so it predates this change. All 8 checks of `test/checks/admin-pages.js` and the new `AUTH=none` check pass.
  - `npm run test:obsidian` (`AI/plugin` at origin/master `a7ca25f`): 162/162 passed.

## 5. Documentation and deployment

- [x] 5.1 `AI/architecture.md`: route table, component map (`admin/`), permission section; `docs-permissions.md` (where the unreferenced list can now be read), `docs-keycloak.md` and `docs-technical-details.md` (the session status route beside the bearer one); drop "nothing serves it yet" from `unreferencedAttachments()`'s comment
- [x] 5.2 Deploy to secureLectures (safeLearn first, then the merge, see the sync order) and open both pages with Gerald's teacher account; record the unreferenced count shown and that the directory page matches the plugin's settings tab
  - 2026-10-20: safeLearn `f6f4b8c`, merged into secureLectures (`4d175871`) plus `admin/**` in its deploy path filter (`eba539d5`); deploy run 39443865017 green. Gerald's teacher account: the attachments page shows 574 unreferenced attachments. The directory page shows not running, 2 260 entries, built 16.10.2026 11:26, 0 skipped; the plugin's settings tab shows "2260 entries, built 4 days ago" - the same report, written differently (absolute time and the reader's number format on the page, relative time in the plugin, which mentions skipped records only above zero).
