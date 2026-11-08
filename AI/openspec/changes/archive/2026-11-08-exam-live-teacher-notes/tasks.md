## 1. Fix the red exam harness checks (D5)

- [x] 1.1 Run the three checks on `28e968f` and on `757c494`, and note for each one which commit breaks it
- [x] 1.2 Tick-share percent: make sure the live view formats the share through `format.percent`. Fix the app or the check, depending on which one is wrong
- [x] 1.3 Sort check: find the cause of the timeout at `tbody tr:last-child`, then fix `sort()` or raise the timeout to the value of the other live checks. If the order rule itself turns out wrong, extend the `online-test` delta first
- [x] 1.4 Handout link: restore `.sl-exam-attempt-offline … .sl-exam-handout-link` on `/exam/my` for a present student, as a fix in the app
- [x] 1.5 Run `test/exam.test.js` three times in a row, and each time all three checks must be green

## 2. Data model (D1)

- [x] 2.1 Migration `exam/migrations/018-teacher-notes.sql`: table `teacher_note` with `UNIQUE (test_id, username)`, a length check of 1–4000 and an index on `username`
- [x] 2.2 Closed-year triggers for insert, update and delete (delete with the `purge_in_progress` exception), following `016-result-notes.sql`
- [x] 2.3 Deleting a test removes its teacher notes (`exam/tests.js`, next to the `result_note` delete)

## 3. Server (D2, D4)

- [x] 3.1 Read and write functions for teacher notes in the exam module (upsert, delete on empty or white space, refuse over 4000 characters)
- [x] 3.2 Route `PUT /exam/api/tests/:testId/teacher-notes/:username`, teachers only, 403 for students and anonymous requests, closed year refused with its message
- [x] 3.3 Teacher snapshot and stream: `teacherNote` per participant (online and offline), a `note` event to every open sitting of the test after a write
- [x] 3.4 The snapshot for the view for the class (`screen=1`) carries no notes
- [x] 3.5 `exam/retention.js`: count and delete `teacherNotes` as a separate kind, and show it in the report of the year change

## 4. Client (D3)

- [x] 4.1 `exam/client/live.js`: a multi-line note field in each row of the participant list and of the attendance table, saved as it changes, with the markings saving / saved / refused
- [x] 4.2 The rows hold still while a note field has the focus. A field that has the focus is not overwritten by a `note` event while it is being typed in
- [x] 4.3 In a closed year the field is disabled
- [x] 4.4 i18n keys (label, placeholder, refused reason, retention line) in the BabelEdit JSON for en and de

## 5. Checks

- [x] 5.1 `test/exam.test.js`: write a note with a line break and verify it is shown, and that the row does not move
- [x] 5.2 A second teacher's view gets the note without being reloaded
- [x] 5.3 The same note shows in a make-up sitting and after the sitting is over
- [x] 5.4 No response to the student (attempt, `/exam/api/my/tests`, results) contains the marker text, and the view for the class shows no note
- [x] 5.5 The sheet and the student's results show only the cell note, the live view only the teacher note
- [x] 5.6 Empty / white space deletes, 4001 characters is refused, a student / anonymous write gets 403
- [x] 5.7 The attendance table of an offline sitting: the note survives present → absent → present
- [x] 5.8 Closed year: the field is disabled and the write is refused. The retention purge counts and deletes `teacherNotes` separately
- [x] 5.9 Full `npm test` green (apart from the known flaky checks)

## 6. Wrap-up

- [x] 6.1 Add the teacher note to `docs-exam-module.md` and `AI/architecture.md`
- [x] 6.2 Remove the entries "Lehrer-Notizen in der Live-Ansicht" and "Drei Exam-Harness-Checks scheitern stabil auf HEAD" from `AI/open-proposals.md` when archiving
