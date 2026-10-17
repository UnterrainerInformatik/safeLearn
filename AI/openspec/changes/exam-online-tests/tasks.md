Each section ends deployable to secureLectures, where `EXAM_MODULE=on` already runs, and leaves a course without online tests computing exactly as before (design D8).

## 1. The bar's buttons

- [ ] 1.1 `exam/bar.js`: a right-hand group with **Question pool** and **Online tests**, links built from the bar's context (D4), the current page's button marked; CSS in `css/exam.css` for both themes and narrow screens
- [ ] 1.2 The pool page reads year/class/course from its query and renders the bar with it; `/exam/tests` exists as a page listing the chosen course's or year's tests (empty until section 2)
- [ ] 1.3 Harness checks: both buttons on every teacher page, the context kept across them, no bar and no button in student view or on the student's results page

## 2. Tests from the pool

- [ ] 2.1 Migration `006-online-tests.sql` per D2: test, snapshot tables, `test_image` with `ON DELETE RESTRICT`, sitting, participant, attempt with `UNIQUE (test_id, username)`, attempt question, token, response, refused device; unit test that schema 5 with a filled gradebook and pool migrates with every proposal unchanged
- [ ] 2.2 `exam/tests.js`: create a test from question ids for a course (refuse empty, retired, unknown), snapshot both languages, answers, flags and image links, write `question_usage`; rename; change questions and delete only while no attempt exists; unit tests incl. "edited pool question leaves the snapshot unchanged"
- [ ] 2.3 Routes for tests behind `requireTeacher`; assembly in the question browser when a course is in context (tick boxes, name, Create test); test page with the snapshot in the course's language and correct answers marked for the teacher
- [ ] 2.4 Harness checks: assembly with and without a course in context, usage shown in the browser, student refused on every test route, deleting a started test refused

## 3. Sittings and writing

- [ ] 3.1 Sittings and make-ups: create, change and delete while not yet opened; window, duration < window, participants from the current roster (whole or selected), make-up with the test's duration; UI on the test page
- [ ] 3.2 `exam/attempts.js`: start per D5 (transaction, permutation, tokens, deadline), resume, the student's open tests across courses; unit tests for deadline = min(start + duration, window end), one attempt across sittings, make-up participant only
- [ ] 3.3 Writing payload in the course's language with tokens and `remainingMs`, nothing else; save per question with the type's limit; refuse after the deadline or submission; explicit submit
- [ ] 3.4 `studentMaySeeImage`: yes only for images linked to the test of an attempt the student has open; unit test and harness check for during/after
- [ ] 3.5 Client: `safelearn-test` element (with `test:` or bare = all open tests) and the student page `/exam/my/tests`, linked from the results page; autosave per change with saved/refused state, server-time countdown, resume on reload, submit with confirmation, post-submission view with points and grade only
- [ ] 3.6 Sittings stay unavailable in the UI until section 4 is merged (D8 risk); remove that guard in 4.4

## 4. Deadline, device and focus

- [ ] 4.1 Finalization per D6: lazy on access, a 30 s sweep, one run at start-up; all-or-nothing scoring; unit tests incl. the `multichoiceset` "one correct missed" case and an away still open at the deadline
- [ ] 4.2 Device binding: `sl-attempt-<id>` cookie (`httpOnly`, `SameSite=Strict`, `Secure` behind the proxy, path `/exam/`), hashed secret on the attempt, refused-device record, teacher release
- [ ] 4.3 Focus log: away/back reports and `sendBeacon` on `pagehide`, aggregated count and duration; never read by scoring
- [ ] 4.4 Enable sittings in the UI
- [ ] 4.5 Harness checks: no response of a writing session contains a correct flag, an original position or a snapshot id; late write refused; reload resumes with remaining time; second browser refused, recorded, released, then resumes; a restarted server keeps the attempt; auto-submit at the deadline with the page closed; questions and images unretrievable after submission; focus losses counted, grade unchanged

## 5. Online tests in the gradebook

- [ ] 5.1 `courseEntries` adds submitted attempts as `onlineTests` entries, one column per test with a sitting, dated by the first sitting's start in `Europe/Vienna` (D3); unit tests: course without tests unchanged, absent participant without result, make-up in the other semester counting in the first sitting's
- [ ] 5.2 Overview columns of online tests marked read-only with a link to the test; the sheet renders them as text, arrow keys skip them, no delete; the student's own results show the test by name and date
- [ ] 5.3 Harness checks: a submitted attempt appears in the sheet and in the proposal, its field cannot be typed into, arrows pass over it

## 6. Live view

- [ ] 6.1 Extract the event-stream setup of `/hot-reload` in `app.js` into a helper used by both, without changing hot-reload's behavior; existing hot-reload checks stay green
- [ ] 6.2 In-process emitter per sitting fed by start, save, submit, focus, refusal, release and the sweep; `GET /exam/api/sittings/:id/live` snapshot; `GET /exam/api/sittings/:id/events` per D7 with heartbeat and session re-check before each event
- [ ] 6.3 `safelearn-live` element and page `/exam/sittings/:id/live`: status, remaining time, focus losses, refused devices, release button; reconnect, fallback to 5 s polling after three failures, stream retry every minute; the student-view message
- [ ] 6.4 Check whether the reverse proxy in front of babylon5 serves HTTP/2 and buffers `text/event-stream`; record the result in design.md D7; send `X-Accel-Buffering: no` or configure the proxy if it buffers
- [ ] 6.5 Harness checks: stream refused without a session and for a student; a submission reaches the stream; no hot-reload message carries sitting data; a teacher switching to student view gets `refused`; the fallback keeps the view current

## 7. Load, pilot, wrap-up

- [ ] 7.1 Load check: a simulated class of 30 autosaving for 10 minutes against the real `DatabaseSync` setup; record response times in design.md
- [ ] 7.2 `docs-exam-module.md` (tests, sittings, embed syntax of `safelearn-test`/`safelearn-live`, what students and teachers see), `AI/architecture.md` (routes, tables, permissions)
- [ ] 7.3 `npm test` in both module configurations; record the result
- [ ] 7.4 Deploy to secureLectures and run a pilot sitting with one class; record what it showed (aggregates only) in `AI/open-proposals.md` under the exam-module entry
