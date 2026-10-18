Each section ends deployable to secureLectures and leaves every existing page and route answering exactly as before.

## 1. Gate and routes

- [ ] 1.1 Move `identityOf` from `exam/gate.js` to `utils.js`, re-export it from `exam/gate.js` so no exam import changes (design D1); unit-test it where it now lives
- [ ] 1.2 `admin/index.js`: the gate `actsAsTeacherWithIdentity(req)` (`hasSomeRoles(req, ["teacher"], true)` and `identityOf`), a page gate that calls `next("router")`, a data gate that answers `403 { error: "Forbidden" }` (D2, D3)
- [ ] 1.3 `GET /admin/api/attachments` → `{ scannedAt, count, paths }` from `unreferencedAttachments()`; `GET /admin/api/directory/status` → `getDirectoryStatus()` unchanged; `GET /admin/assets/**` serving `admin/client/` only
- [ ] 1.4 `app.js`: call `registerAdminRoutes(app, { startPage })` after `checkAuthenticated` and before the catch-all, in the identity branch only. If `publishing-without-keycloak` is already applied, register it in `registerRoutes`' `keycloak` path; if not, leave a note in that change's tasks so its 2.4 keeps it out of `none` mode (D7)

## 2. Pages

- [ ] 2.1 `GET /admin/attachments` page shell through `wrapInPage` with `title` and `wide`; `admin/client/attachments.js` draws count, scan time (reader's format via `i18n/format.js`), **Copy paths** with an in-page confirmation and the `<textarea>` fallback, the list grouped by folder, and the empty state (D8, Risks)
- [ ] 2.2 `GET /admin/directory` page shell; `admin/client/directory.js` draws fetching/phase/progress, entries, built at, skipped as a count, the "no data held" state, and polls every 2 s only while `fetching` (D5)
- [ ] 2.3 `css/admin.css`: layout for both pages in both themes, `sl-button` for every action, long paths wrap, nothing scrolls horizontally at 390px
- [ ] 2.4 Catalog keys under `app.admin.*` in `i18n/en.json` and `i18n/de.json` (BabelEdit format, same keys in both); `test/i18n-catalog.test.js` stays green

## 3. Menu

- [ ] 3.1 `getTopdownMenu`: the **Administration** section with the two buttons (icon + text) for a session passing the same gate, between the format choice and the print buttons (D6)
- [ ] 3.2 Check the open menu at 1280px and 390px with Puppeteer screenshots; nothing in the menu wraps or overlaps

## 4. Verification

- [ ] 4.1 Harness checks, teacher: the menu shows the section; both buttons open their pages; the attachments page lists exactly the paths the server logged as `[Attachments] unreferenced:` for this run (`applicationOutput()`), with the logged count; **Copy paths** puts them on the clipboard one per line
- [ ] 4.2 Harness checks, directory: the session route and the bearer route answer the same report for the teacher at the same moment; the page shows the state that report gives ("no data held" on the demo realm if nothing is held); opening the page starts no fetch (phase stays `idle`)
- [ ] 4.3 Harness checks, refusal: a student and a teacher in student view see no section, get the catch-all answer for both pages and `403` without a path or figure for both data routes; switching back to the teacher view restores all of it
- [ ] 4.4 Harness checks: German interface on menu and both pages; both pages at the legibility viewport (390px) without horizontal scroll
- [ ] 4.5 If `publishing-without-keycloak` is applied: a check with `AUTH=none` and `READER_ROLES=teacher` that the section is absent and all four routes get the catch-all answer
- [ ] 4.6 Run `npm test` with the exam module off and on, and `npm run test:obsidian`; record the results

## 5. Documentation and deployment

- [ ] 5.1 `AI/architecture.md`: route table, component map (`admin/`), permission section; `docs-permissions.md` (where the unreferenced list can now be read), `docs-keycloak.md` and `docs-technical-details.md` (the session status route beside the bearer one); drop "nothing serves it yet" from `unreferencedAttachments()`'s comment
- [ ] 5.2 Deploy to secureLectures (safeLearn first, then the merge, see the sync order) and open both pages with Gerald's teacher account; record the unreferenced count shown and that the directory page matches the plugin's settings tab
