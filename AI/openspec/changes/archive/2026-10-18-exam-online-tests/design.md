## Context

See `proposal.md` for the motivation. The domain decisions (threats and countermeasures, all-or-nothing, snapshots) are in `AI/exam-module-plan.md`, sections 5 and 7. The module's architecture (dynamic import, `node:sqlite`, migrations, embed blocks, vanilla custom elements, the teacher gate and its student-view downgrade, grades computed on read, content-controlled rollout) is in `exam-module`'s design, D1–D7 and D12, and is not repeated here. This change moves `exam-module`'s D8 (attempts) and D9 (live view) here as D6 and D7, adjusted to what was built since.

What exists today and shapes this change:

- **Schema 5.** `assessment` (kinds `test`, `plusminus`, `homework`, with a `CHECK`) and `manual_entry` hold the manual columns. `question`, `answer`, `image` and `question_category` hold the pool. `question_usage` already references `test (id)`, a table that does not exist yet. SQLite resolves that reference only when a row is written, and nothing writes one before this change.
- **`courseEntries`** in `exam/gradebook.js` is the single place the proposals read results from. Its comment already says online tests add theirs there.
- **`studentMaySeeImage`** in `exam/pool.js` answers `false` and waits for attempts.
- **The bar** (`exam/bar.js`, `renderBar`, `teacherShell`) is server-rendered on every teacher page from a context of year, class, course and semester. The pool page passes an empty context today.
- **The weights** know the category `onlineTests`, and the sheet's client lists it, with no `+`.
- **Production** runs with `EXAM_MODULE=on` and real data. Every step of this change is deployed with the switch on, so each one must leave a course without tests behaving exactly as before.

## Goals / Non-Goals

**Goals:**

- A first graded online test in January 2027, after a pilot sitting.
- No change to any proposal of a course that has no online test.
- The bar's buttons usable from the first task on, before any test exists.

**Non-Goals:**

- Restricting a sitting to the school network by client IP, and make-up sittings that swap questions. Both remain open questions of `exam-module` and would be additive to `online-test`.
- Editing a single online-test result by hand. A teacher who disagrees with a result overrides the semester grade, as for everything else.
- The board solution (P6), which reads this change's data and stays in `exam-module`.
- Deciding whether an empty category, such as online tests before the first test, shows its heading in the sheet. That is a backlog item of its own (`AI/open-proposals.md`, Notenbuch: Spaltenüberschriften …).

## Decisions

### D1 — P3 moves out of `exam-module` whole

`exam-module`'s tasks section 5, its spec `online-test` and its design D8/D9 move here. In `exam-module` the section becomes a pointer, the spec directory is removed, its proposal lists `online-test` as moved, and D8/D9 become pointers. `exam-module` stays the change that owns the backlog entry and still carries P6, P7 and P5. This avoids two changes defining the same capability: when this change is archived, `online-test` lands in `openspec/specs/`, and P6 builds on the archived spec.

*Alternative:* leave the tasks in `exam-module` and only add the bar buttons as a small change. That keeps P3 planned against the gradebook as it was before the sheet, and it delays `online-test`'s spec until P5 is done, months later.

### D2 — Snapshot tables, and images referenced instead of copied

Migration `006-online-tests.sql` adds:

- `test` (course, name, created_at), and `test_question` / `test_answer` holding the snapshot: type, both texts, the original position, the correct flag, and the pool question the snapshot came from (for usage and the image check). A snapshot is never written again once an attempt exists.
- `test_image (test_id, image_id)`, referencing the pool's `image` rows with `ON DELETE RESTRICT`. The snapshot's HTML keeps its `/exam/api/images/:id` references. Copying the BLOBs would double them for nothing: a used question is retired, never deleted (`question-editor`), and the restriction makes the database itself refuse to drop an image a test still shows. P7's editor must therefore add new images on an edit and not overwrite old ones; that is noted for its tasks.
- `sitting` (test, opens_at, closes_at, duration in seconds, makeup flag) and `sitting_participant (sitting_id, username)`.
- `attempt` (test, sitting, username, started_at, deadline, submitted_at, score, question_count, device_hash, focus_count, focus_ms, away_since) with `UNIQUE (test_id, username)`, which is the "one attempt per student and test" rule as a constraint.
- `attempt_question (attempt_id, test_question_id, position)` and `attempt_token (attempt_id, token, test_answer_id, position)`: the permutation and the token map. `response (attempt_id, test_answer_id)` is the chosen set; saving a question replaces its rows.
- `refused_device (attempt_id, at)` for the live view.

All timestamps are ISO strings in UTC; deadlines are compared on the server's clock only.

### D3 — Online results are derived from attempts, not copied into `manual_entry`

`courseEntries` adds, beside the manual columns, one entry per submitted attempt: category `onlineTests`, value `score / question_count`, the test as its column, and the column's date the start of the test's first sitting, as a date in `Europe/Vienna`. `assessment` and its `CHECK` stay as they are.

*Alternative:* write an `assessment` row per test and a `manual_entry` per attempt. It would make the sheet's code see only one kind of column, but it needs a table rebuild to widen the `CHECK`, it stores the result twice, and a make-up or a release would have to keep both in step. Computing on read is how the module already treats proposals (`exam-module` D7).

The overview answers online-test columns with `readOnly: true` and a link to the test; the client renders their fields as text and its arrow-key movement skips them.

### D4 — Pages, context and the bar's buttons

- `renderBar` gets a right-hand group with two links, built from the same context as the positions: `/exam/pool?course=<id>` (or `?year=`/`?class=` for whatever is chosen) and `/exam/tests?course=<id>` or `?year=<id>`. `teacherShell` passes a `current` marker for the page being shown.
- The pool page reads that context from the query and renders the bar with it. With a course in context, the browser shows tick boxes and "Create test"; without, it stays as today.
- Teacher pages: `/exam/tests` (a year's or a course's tests), `/exam/tests/:id` (snapshot, sittings, make-ups, editing while unwritten), `/exam/sittings/:id/live`.
- Student entry: the `safelearn-test` block. With `test: <id>` it shows that test; without parameters it shows every test the reader has open right now, across their courses. That makes one page with a bare block work for every class, without per-class slugs. A student module page `/exam/my/tests` shows the same, and the student's results page links to it. Neither carries the bar.

### D5 — Starting and writing

- **Start.** On first open within an open sitting the student participates in, one transaction inserts the attempt with `started_at` and `deadline = min(started_at + duration, closes_at)`, shuffles the questions and each question's answers with `crypto.randomInt` (Fisher–Yates), and generates a 128-bit token per answer (`crypto.randomBytes(16)`, base64url). The `UNIQUE` constraint turns a double click into one attempt.
- **Payload.** The writing page receives the questions in permuted order with text in the course's language, the answers' texts with their tokens, the type, and `remainingMs`. No ids of the snapshot, no positions, no flags. A check in the harness walks every response of a writing session for `correct`, original positions and snapshot ids.
- **Saving.** `PUT /exam/api/attempts/:id/questions/:n` with the chosen tokens replaces that question's response, accepted only while `now < deadline` and not submitted. A `truefalse`/`multichoice` question accepts at most one token.
- **Countdown.** The client counts down from `remainingMs` and refreshes it from every save's answer, so a wrong client clock never matters.

### D6 — Finalization, device binding, focus log (was `exam-module` D8)

- **Finalization.** An attempt past its deadline is finalized (scored, `submitted_at` set to the deadline) on the next request that touches it, and by a sweep every 30 s, which also runs once at start-up. Scoring compares the chosen set with the correct set per question. An explicit submit finalizes at once.
- **Device binding.** At start the server sets an `httpOnly`, `SameSite=Strict`, `Secure` (behind the proxy) cookie `sl-attempt-<id>` with a random secret, path `/exam/`, and stores its SHA-256 on the attempt. A request without the matching cookie is refused and recorded in `refused_device`. The binding is to the cookie, not to the express session, because sessions are in memory and die with a restart. A teacher's release clears the hash; the next browser to open the attempt binds anew.
- **Focus log.** The page reports `visibilitychange`/`blur` (away) and `focus` (back) as small `POST`s, and `navigator.sendBeacon` on `pagehide`. The server counts each away and adds the time from `away_since` to the return; an away still open at finalization counts up to the deadline.

### D7 — Live view over SSE (was `exam-module` D9)

- `GET /exam/api/sittings/:id/events` (`text/event-stream`), behind `checkAuthenticated` and `requireTeacher`. A full snapshot on connect, then one event per change: started, saved (remaining time only, never answers), submitted, away, back, refused device, released. A heartbeat comment every 25 s.
- The write paths of D5/D6 and the sweep notify an in-process `EventEmitter` keyed by sitting. No polling of the database.
- Before each event the server re-checks the session (still authenticated, still acting as teacher after the downgrade); if it fails, it sends `refused` and closes.
- `/hot-reload` is not touched beyond extracting its stream setup (headers, flush, cleanup on `close`) into a helper both use. Exam data never travels over it.
- Fallback: after three failed reconnects the client polls `GET /exam/api/sittings/:id/live` every 5 s and retries the stream every minute.
- Task 6.4 of this change checks whether the proxy in front of babylon5 serves HTTP/2 and passes `text/event-stream` unbuffered. With HTTP/2 the six-connection limit of HTTP/1.1 is moot; with buffering the stream sends `X-Accel-Buffering: no` or the proxy is configured.
- **Checked 2026-10-17 (task 6.4):** the proxy is Traefik (`~/scripts/traefik/` on babylon5); `htl.dev` routes straight to the secureLectures container, through the middlewares `www-remove` and `std-headers` (HSTS only) - no buffering or compression middleware. `https://htl.dev/` answers over HTTP/2. An SSE stream passes unbuffered: `/hot-reload` through the proxy delivered its headers after 78 ms and its first chunk after 80 ms while the stream stayed open. The proxy needs no change; the live stream still sends `X-Accel-Buffering: no`, which costs nothing and covers an nginx in front of another deployment.
- **Re-checking the session.** The check before each event and with each 25 s heartbeat reads the session from its store as a copy - never through `req.session`, which the long-lived request would write back over newer changes when it ends - and builds the permission context anew from it, which asks the identity provider for the view preferences. A token within 60 s of its expiry is not renewed by the stream: it sends `renew`, and the client reconnects through an ordinary request, which renews it.

### D8 — Order of work

Each step is deployed to production with the switch on, so each must be safe on its own: the bar buttons first (useful today, touch nothing else); then the migration and assembly (teachers only, no student sees anything); then sittings, writing and finalization behind a harness that proves the countermeasures; the gradebook columns; the live view; the load check; the pilot.

## Risks / Trade-offs

- [A test assembled and scheduled in production before the countermeasures are complete] → Sittings can be created only once writing, finalization and device binding are in (task order, D8). Until then the tests page offers assembly only.
- [Synchronous SQLite under 30 autosaving students] → Single-row writes in a transaction each; the load check (task 7.1) measures a simulated class for 10 minutes and records response times in this design before the pilot.
  - **Measured 2026-10-17** (`node tools/exam-load-check.mjs 30 10 5`: the module's router over HTTP on localhost, `DatabaseSync` in WAL mode, the 30 s sweep running, Gerald's workstation): 30 students, each changing an answer every 2.5-7.5 s for 10.1 minutes - 3530 saves, 331 resumes, 30 starts and submits, a live snapshot every 5 s. Saves p50 2.9 ms, p95 4.6 ms, p99 5.9 ms, max 12.3 ms; resumes p50 3.0 ms, max 9.7 ms; starts (shuffling, tokens, one transaction) p50 7.1 ms, max 86.6 ms while all 30 started within 30 s; submits max 4.7 ms; the live snapshot 1.0 ms p50, 2.4 ms max. No request refused, all 30 attempts submitted, the database grew to 420 KiB. A class is far below what blocks the event loop noticeably; babylon5 is slower than the workstation, but not by two orders of magnitude.
- [A student's clock or a closed laptop at the deadline] → The deadline is the server's; the last save before it counts; the sweep submits without the client.
- [A teacher in student view during a sitting loses the live view] → Intended (`exam-module` D5). The stream ends with `refused`, the page says the student view is active, and the sitting itself is unaffected.
- [Cookie lost (private window closed, cookies cleared)] → The student is refused like a foreign device, and the teacher releases the attempt in the live view; the answers and remaining time are kept.
- [P7 overwrites an image a snapshot shows] → `ON DELETE RESTRICT` on `test_image` makes the database refuse; P7's tasks get the rule to add images rather than replace them.
- [Personal data of minors: answers and focus logs] → Stored only in `exam.sqlite`, covered by the existing backups; logs carry counts, never usernames with answers ([[pii-handling-real-data]]). Retention is decided in P5.

## Migration Plan

1. Deploy the bar buttons. Nothing else changes.
2. Deploy migration 006 with assembly; the deploy writes the pre-migration copy as for every migration. Teachers can assemble tests; students see nothing.
3. Deploy sittings, writing, finalization, device binding and focus log, then the gradebook columns, then the live view.
4. Load check, then a pilot sitting with one class (ungraded, or graded with the teacher's override in reserve), then the first graded test.
5. Rollback: migration 006 only adds tables, but older code disables the module on a newer schema (`exam-foundation`). A rollback past 006 therefore restores the pre-migration copy and loses every test written since. Before the pilot that is nothing; after it, roll forward instead.
