Phases in the plan's order. Each phase ends deployable with `EXAM_MODULE` unset in production and its harness checks green. P0 + P1 + P4 form the gradebook milestone for the WS grade entry on 05.02.2027 (design.md, Migration Plan step 2).

## 1. P0 — Foundation

- [x] 1.1 Create the `exam/` module directory with `index.js` exporting an async `init()` that returns `{ router, embedHandlers }` or `null` with a reason; no other file in the repo imports from `exam/` except `app.js`
- [x] 1.2 In `app.js`, load the module with a dynamic `import()` only when `EXAM_MODULE === "on"`, wrapped in `try/catch`; mount the router at `/exam` after `checkAuthenticated` and before the catch-all; log "active" with the DB path or "disabled" with the reason
- [x] 1.3 Database access on `node:sqlite` (`DatabaseSync`): path `data/exam.sqlite`, override `EXAM_DB_PATH`, WAL mode, `foreign_keys=ON`; refuse a schema newer than the code
- [x] 1.4 Migration runner over numbered SQL files in `exam/migrations/`, one transaction per file, `PRAGMA user_version`; first migration creates the schema skeleton (school year, class, student, roster entry, course, grading scale) per the plan's data model
- [x] 1.5 Backups: `VACUUM INTO data/exam-backups/` before the first pending migration and daily by timer; retention of 14 daily and 90 days of pre-migration copies; unit test that a copy opens as a database
- [x] 1.6 Self-disabling: a failed open, migration or read-only data directory leaves the server running without the module; a throwing module request answers 500 and touches nothing else (spec `exam-foundation`)
- [x] 1.7 Gate helpers: `requireTeacher` (`hasSomeRoles(req, ["teacher"], true)`, with `allowOverride`, so the student-view downgrade applies), `requireStudent`, and the identity key from `preferred_username`, lowercased; unit tests for both, for a teacher in student view being refused teacher actions, and for switching back
- [x] 1.8 Embedding hooks in `obsidian.js`: `registerEmbedHandler(kind, handler)`, `preReplaceEmbeds(md, req)` in `preParse` after `removeForbiddenContent` and before `preMarkCode`, default handlers (teacher notice / nothing / nothing for unknown kinds), and a flag that forces the defaults in the presentation and document views
- [x] 1.9 Teacher notice markup and CSS for both themes; verify the placeholder and its `data-*` attributes survive `DOMPurify.sanitize`, with attribute values escaped
- [x] 1.10 Client entry `exam/client/exam-client.js` (ES module, custom elements, no build) with a shared loading/error frame; `/exam/assets/` mount in the static allowlist; `wrapInPage` adds the script only when the module is active and the page has a placeholder
- [x] 1.11 Page shell for module pages that reuses the top bar, theme and fonts and follows `page-bootstrap`
- [x] 1.12 Deployment: pass `EXAM_MODULE` through `deploy/docker-compose.yml`'s `environment:`; declare `EXAM_DB_PATH` as test-only in `test/deployment-config.test.js`; assert the WYSIWYG templates (`wysiwyg-container-linux`/`-windows`) set no `EXAM_MODULE`; assert no static mount reaches `data/`
- [x] 1.13 Harness: a second instance configuration with `EXAM_MODULE=on` and `EXAM_DB_PATH` in a temp directory created and removed per run (also on interruption); the module-off run asserts `/exam/*` answers as nothing-behind-it and that pages are unchanged
- [x] 1.14 Content checks for embedding: a fixture page in `md/` with a `safelearn-test` block outside and one inside `@@@ teacher`; student vs. teacher vs. module on/off vs. `?reveal=1`; update `test/coverage-map.json` for the guarded code
- [x] 1.15 Off-host backup: settled with Gerald on 2026-10-17 — the operator backs up, not the application. The copies stay in `data/exam-backups/` beside the database; `docs-exam-module.md` tells operators to back up that directory rather than the live file. safeLearn (staging) keeps no backup; secureLectures' `/app/data` is in babylon5's UrBackup
- [x] 1.16 Docs: `docs-exam-module.md` (switch, data, backups, embed syntax), a pointer from `README.md` and `docs-wysiwyg.md` (module off there), `AI/architecture.md` component map and route table

## 2. P1 — Classes & courses

- [x] 2.1 Migration: school year (start, SS start, end, current flag), class, roster entry (username, names snapshot, left-at), course (class, subject, year, language, weights), unique (class, subject, year)
- [x] 2.2 School-year API and teacher page: create, set current, list; exactly one current year
- [x] 2.3 Roster source: members of a class from `heldDirectoryUsers()` by merged role value; "directory not available" state; add by username fallback
- [x] 2.4 Roster editor page: checklist with nothing pre-ticked, create roster from ticked; add/remove during the year with left-at marking; name refresh that never changes membership
- [x] 2.5 Course API and editor: create course (refuse duplicates), language, config sheet with category weights summing to 100 %
- [x] 2.6 Harness checks: a roster from the demo realm's client-role class; a student cannot reach any P1 route; duplicate course refused; removed student keeps records

## 3. P4 — Gradebook

- [x] 3.1 Migration: grading scale (seeded 88/75/63/50), manual entry (course, student, kind, value, date, note), semester grade (course, student, semester, override, comment, comment-visible)
- [x] 3.2 Pure grading functions with unit tests: fraction → grade incl. threshold rounding, category means, weighted mean with renormalization for empty categories, WS vs. SS (whole year) entry selection, the 0.815 → 2 example
- [x] 3.3 Manual entry API and teacher UI: fraction or points/max for test and homework, +/− for participation, edit and delete
- [x] 3.4 Override and comment API and UI; proposal stays visible to teachers beside the override
- [x] 3.5 Teacher course overview page per semester: one row per roster student, categories, proposal, override, effective grade; left students listed separately
- [x] 3.6 Student results: `safelearn-results` embed and a module page; proposal until override, override afterwards, comment only if marked visible; no other student's data by any request
- [x] 3.7 `safelearn-gradebook` embed for teacher pages (course overview inline)
- [x] 3.8 Grading-scale admin for teachers
- [x] 3.9 Harness checks: entries → proposal end to end, override visibility to the student, cross-student access refused, embed off/on
- [x] 3.10 Milestone: switch on in secureLectures (`EXAM_MODULE=on` in `deploy/.env` and compose), redeploy, smoke-check with a real teacher account; record in `AI/open-proposals.md`/architecture. Done 2026-10-17: repository variable `EXAM_MODULE=on` in guFalcon/secureLectures (the workflow writes it into `deploy/.env`), smoke-check passed with Gerald's teacher account
- [x] 3.11 From the smoke-check: the module's pages use the whole width beside the sidebar (`wrapInPage`'s `wide`), and the top bar shows a teacher acting as one a button to `/exam/` while the module is active; harness checks for both, and that the module-off instance offers no button

## 4. P2 — Question pool

- [x] 4.1 Migration: category tree, question (type, text DE/EN, retired flag), answer (text DE/EN, correct, position), image (BLOB, mime), usage (question, test). Done as `005-question-pool.sql`; usage also records course and date, so the browser needs no `test` table before P3, and `pool_import` records the import and its report
- [x] 4.2 `tools/import-moodle-pool.mjs`: parse both XML files with jsdom's XML mode, pair by position, verify type/answer count/correct pattern, refuse all on mismatch with every bad position reported, drop `essay` with a count. Lives at `exam/import-moodle-pool.mjs` (logic in `exam/pool-import.js`) instead: `tools/` is not in the image, and the import runs in the container (D10)
- [x] 4.3 Import: sanitize HTML with the renderer's DOMPurify setup, strip Moodle styles, keep the answer-count hint, move `@@PLUGINFILE@@` images into the image table and rewrite references; refuse a second import. Also moves inline `data:` images (the real export has one, question 32) and keeps every category, including the one that held only essays, so the count is 22
- [x] 4.4 Unit tests for the importer against trimmed fixtures (match, mismatch, essay, image), plus a dry-run against the real files reporting 94/22/9. `test/exam-pool.test.js`; the dry run is skipped where the export is not on the machine. Harness checks for the browser, the image route and the refusals in `test/exam.test.js`
- [x] 4.5 Image route `/exam/api/images/:id` with the access check (teacher, or student inside an open attempt containing it). The student branch is `studentMaySeeImage` in `exam/pool.js`, which answers no until attempts exist; task 5.5 fills it in
- [x] 4.6 Question browser for teachers: category tree, text search, preview in DE/EN with correct answers, usage history per question; students refused
- [x] 4.7 Run the import on babylon5 inside the container and record the report (aggregates only). Done 2026-10-17 15:28 UTC in `secureLectures` after the deploy migrated its database from schema 4 to 5 (pre-migration copy in `data/exam-backups/`): dry run, then import, both reporting 94 questions (77 multichoiceset, 14 multichoice, 3 truefalse) in 22 categories, 9 essays dropped, 7 images, 4 unreferenced files dropped; a second run was refused. Source files checked against the local copies by SHA-256 and removed from the container afterwards

## 5. P3 — Online tests

Moved to the change `exam-online-tests` on 2026-10-17, together with the spec `online-test` and design D8/D9. Its tasks, numbered there, replace the former 5.1–5.14.

## 6. P6 — Board solution

- [x] 6.1 Teacher-only route building one slide per question (original order, course language, correct answers marked, share correct from submitted attempts) through `wrapInReveal`. Done as `GET /exam/tests/:id/solution` (`routes-tests.js`), shares by `correctShares` in `attempts.js` (unit test in `test/exam-tests.test.js`), linked from the test's page as "Solution on the board"; `wrapInReveal` takes a `title` for a deck that is no corpus file
- [x] 6.2 Harness checks: student and teacher-in-student-view refused; no names in the deck; deck contacts no foreign host

## 7. P7 — Question editor

Moved to the change `exam-question-editor` on 2026-10-17, together with the spec `question-editor`. Its tasks, numbered there, replace the former 7.1–7.5.

## 8. P5 — Year change

- [ ] 8.1 Close a school year after its end date: read-only for everyone, still readable by its teachers and students
- [ ] 8.2 Start the next year: offer each class one level up with last year's roster pre-ticked beside the directory's current members; copy courses with language and weights, without entries
- [ ] 8.3 Retention: setting for the retention period (default two years, decided 2026-10-17, design.md Open Questions); the year change reports counts to be removed and deletes only after confirmation
- [ ] 8.4 Harness checks: closed year refuses writes; next-year roster proposal; retention deletion only after confirmation

## 9. Wrap-up

- [ ] 9.1 Update `AI/architecture.md` (component map, routes, data, permissions, observations) and `docs-exam-module.md` to the final state
- [ ] 9.2 Run `npm test` in both module configurations and record the result
