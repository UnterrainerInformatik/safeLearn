## 1. Data model

- [x] 1.1 `exam/migrations/013-offline-tests.sql`: `test.kind`, `test.duration_s`, `test.handout_a`/`handout_b` with their `CHECK`, `test.assessment_id`; `sitting.started_at`; `sitting_participant.present`, `sitting_participant.handout_group` (D1, D3)
- [x] 1.2 Migration test: existing tests read as online, existing participants as present in group A, nothing else changes

## 2. Offline tests and sittings

- [x] 2.1 `exam/tests.js`: create/update an offline test (name, duration, test or short test, handouts), creating and renaming its gradebook column; refuse deletion while the column holds entries (D9)
- [x] 2.2 Guard every question path on `kind = 'online'`: scheduling without questions, assembly, snapshot, follow-pool, `startAttempt`, `previewView` (D1)
- [x] 2.3 Offline sittings: create with planned time and roster, `startSitting` (refused before resolving handouts, twice, or for an online sitting), `held_on` moved to the start date; `extendSitting`/`endSitting` refused before the start (D2)
- [x] 2.4 Add the started condition to every "sitting open" query, `openTestsOf` and `nextOpenTestsChange` included (D2)
- [x] 2.5 Attendance: set present/absent and group per participant, refused for non-participants and for group B without handout B; `notify` the sitting and the student's open-tests listeners (D3)
- [x] 2.6 Make-up for an offline test: selected participants, same duration and handouts, own start button
- [x] 2.7 `exam/routes-tests.js`: API routes for 2.1, 2.3, 2.5, 2.6 behind `requireTeacher`
- [x] 2.8 Unit tests: start window, extend/end before and after the start, attendance effects on `openTestsOf`, column creation/rename/deletion guard, question paths refusing offline tests

## 3. Handouts

- [x] 3.1 Handout path resolution against `filesMap` with `normalizeCorpusPath`; the "resolves" flag in every test and sitting answer (D5)
- [x] 3.2 Teacher API for the picker: every Markdown file with folder path and the "readable by the class" flag (D5)
- [x] 3.3 `permission-context.js`: the `handoutViews` Symbol; `utils.js` `hasRoles` honours it (student view, `#exam` granted, `#practice` refused, `#answer` per flag) (D4)
- [x] 3.4 `renderHandout(path, req, { answer })` beside `sanitizeAndParseMarkdown`: first-line directive stripped unevaluated, `preParse` with `embedDefaults`, no attachment grants recorded (D6)
- [x] 3.5 Student route `/exam/my/sittings/:id/handout`: authorization from the database (open, participant, present, group, resolving path), module not-found on every refusal, wrapped by `wrapInPage` (D6)
- [x] 3.6 Teacher routes for preview and solution deck (`splitForReveal`/`wrapInReveal`) behind `teacherPage`, refused in student view; `hasAnswers` textual check for the button (D6)
- [x] 3.7 Attachment route: `registerHandoutAttachmentCheck` and `handoutMayServe` after the grant and `mayServeAttachment`, deciding the reference under the override (D7)
- [x] 3.8 Tests: `#exam`/`#practice`/`#answer` and `@@@ teacher` on the handout; the override not reachable by query, header or preference and not leaking to other pages; refusals for absent, other group, non-participant, before the start, after the window; attachment served during the window and refused right after closing, unticking and regrouping; solution refused to a student and to a teacher in student view

## 4. Views

- [x] 4.1 Picker dialog (`exam/client/`): corpus tree, case-insensitive file-name search, class warning, choose/remove for A and B
- [x] 4.2 Test page and course list: kind marker, handout paths (red when unresolved), preview and solution buttons, offline-test create/edit form with duration and gradebook kind
- [x] 4.3 Offline sitting page: attendance table with present toggle, A/B buttons and group tint, Matura highlighting; Start / Extend / End / View for the class; start disabled with the reason while a handout is red (D8)
- [x] 4.4 `liveSnapshot`/change events carry `kind`, `startedAt`, `present`, `group`; class screen for offline sittings without counts, with "not started" before the start (D8)
- [x] 4.5 Exams page: offline entry with time left and the handout link; handout page replaces its content when the sitting closes (D3, D6)
- [x] 4.6 `css/exam.css` (group colours, red path, light/dark) and i18n keys in `i18n/de.json` and `i18n/en.json` (BabelEdit format)

## 5. Documentation and verification

- [x] 5.1 A handout fixture under `@@@ teacher` in `md/` with `#exam`, `#practice`, `#answer`, a `@@@ teacher` block, an image and a downloadable file
- [x] 5.2 Browser tests in `test/exam.test.js`: create an offline test with two handouts, assign groups, start, a student sees their handout and not the other, late tick, extend, class screen updates, the window closes and the handout and its attachment are refused, solution deck for the teacher
- [x] 5.3 `docs-exam-module.md` (offline tests, attendance, handouts, live rendering), `docs-permissions.md` (the handout as the one exception to file-level gating and the exam view), `AI/architecture.md`
- [x] 5.4 Run `npm test` and compare failures against HEAD (see memory `flaky-content-checks`)
