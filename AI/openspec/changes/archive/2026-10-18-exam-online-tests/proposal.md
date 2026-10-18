Source: phase P3 of the change `exam-module` (tasks section 5), split out on 2026-10-17 at Gerald's request, together with his wish for a button in the module bar that leads to the question pool and the online tests. The backlog entry **Prüfungsmodul: Online-MC-Tests und Notenbuch** stays with `exam-module`, which still carries P6, P7 and P5.

## Why

P0, P1, P4 and P2 of the exam module are live in secureLectures since 2026-10-17: the gradebook runs and the question pool holds 94 questions. What is missing is what the pool is for, short multiple-choice tests written in safeLearn and graded on the server, so that the first online test can be written in January before the WS grade entry closes on 05.02.2027. P3 is the largest phase of the plan (8–11 days) and the first one that lets students write into the database. Since the gradebook became a sheet (`exam-navigation-and-grid`), P3 also has to fit a gradebook that `exam-module`'s planning did not yet know. A change of its own gives P3 its own review, its own specs against the archived sheet and bar, and its own archive date, without waiting for P6, P7 and P5.

At the same time the pool is only reachable today by typing `/exam/pool`: the module bar offers school year, class, course and gradebook, but no way to the pool, and there will be none to the tests either.

## What Changes

- **The module bar gets two buttons** at its right end: **Question pool** and **Online tests**. The pool button works as soon as this change's first task is done. The tests button opens the tests of the chosen course, or of the chosen school year when no course is chosen. The pool page carries the bar too, so the course chosen there is the course a new test is assembled for.
- **Tests assembled from the pool.** In the question browser, with a course chosen in the bar, a teacher ticks questions and creates a test with a name. The test copies the questions with both languages and correct flags (snapshot) and records the usage the browser already shows.
- **Sittings and make-ups.** A test is written in one or more sittings, each with a window and a duration shorter than the window, for the whole roster or for selected students. A make-up keeps the duration.
- **Writing a test.** A `safelearn-test` block in a page and a module page show the test in the course's language, questions and answers shuffled per student, answers identified by random per-attempt tokens. Every change is saved at once, the countdown runs on server time, a reload resumes the attempt, and at the deadline the server submits whatever was saved, whether the page is open or not.
- **Nothing to steal.** No response a student receives contains correct flags or the original order. After submission the student sees points and grade only, and the test's questions are no longer retrievable.
- **Device binding and focus log.** An attempt is bound to the browser that started it by an `httpOnly` cookie, survives a server restart, and is released to another device only by the teacher. Leaving the page is counted and timed, shown to the teacher, and never changes the grade.
- **Teacher live view** of a sitting over its own authenticated event stream (SSE), with a snapshot fallback: who has started, who is writing with how much time left, who has submitted, focus losses, refused devices, and the release button.
- **Online tests in the gradebook.** Each test is a column of the online-test category of its course's sheet, dated by its first sitting. Its results are the attempts' fractions, shown but not editable in the sheet.
- **`exam-module` gives up P3.** Its tasks section 5, its `online-test` spec and its design decisions D8 and D9 move here. What stays there points to this change.

## Capabilities

### New Capabilities

- `online-test`: tests, sittings, make-ups, attempts, grading, deadlines, the anti-cheating countermeasures and the teacher live view. Moved from `exam-module`, where it was planned but never implemented, and brought in line with the sheet and the bar.

### Modified Capabilities

- `exam-navigation`: the bar gains the buttons to the question pool and the online tests, and the pool and test pages carry the bar.
- `gradebook-sheet`: the online-test category gets its columns from the course's tests; those columns and their results are read-only in the sheet.

## Impact

- **Code:** `exam/` only, plus `css/exam.css`. A migration adds test, test question and answer snapshots, sittings with participants, attempts, responses and the answer-token map, and resolves `question_usage`'s forward reference to `test`. New `exam/tests.js`, `exam/attempts.js`, `exam/live.js` and their routes; `courseEntries` in `exam/gradebook.js` adds the attempts' results; `studentMaySeeImage` in `exam/pool.js` gets its real check; `exam/bar.js` gets the two buttons. New client elements for assembly, sittings, writing and the live view. The `/hot-reload` stream setup in `app.js` is extracted into a helper both streams use, without changing hot-reload.
- **APIs:** routes for tests, sittings, attempts (start, save, focus, submit), the live snapshot and the live event stream, all under `/exam/api/`, all behind `checkAuthenticated` and the module's gates.
- **Gradebook:** proposals now include online tests where they exist. A course without tests computes exactly as before.
- **Proxy:** whether the reverse proxy in front of babylon5 serves HTTP/2 and passes `text/event-stream` unbuffered is checked as part of this change.
- **Tests:** harness checks for every countermeasure, the live stream's refusals, the bar's buttons, and a load check with a simulated class of 30.
- **Personal data:** attempts, answers and focus logs of minors are stored on babylon5, next to the grades already there. Only aggregates are logged. Retention is still settled in P5 (`exam-module`).
- **Rollout:** secureLectures already runs with `EXAM_MODULE=on`. Nothing reaches a student until a teacher schedules a sitting (`exam-module` design D12). A pilot sitting with one class comes before the first graded test.
