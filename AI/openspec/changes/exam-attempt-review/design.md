## Context

An attempt keeps everything a review needs:
- `attempt_question` holds the attempt's order of questions.
- `attempt_token` holds each question's order of answers (`position`).
- `response` holds the answers chosen.
- `test_question`/`test_answer` hold the snapshot's texts and correct flags.
- `attempt.score` and `question_count` hold the result.

Today two places read these:
- `writingView` (`exam/attempts.js`) reads them for an open attempt, without correct flags.
- `resultView` reads only the score for a submitted one.

The board solution (`solutionSlides` in `exam/routes-tests.js`) already shows correct and wrong answers (`sl-board-correct`/`sl-board-wrong`, ✓/✗). It does so in reveal.js, styled in `css/reveal.css`, for teachers only.

A student's results (`ResultsView`) and a teacher's student page (`GradebookStudent`) both list entries through `resultsTable` in `exam/client/gradebook.js`. An online test's entry comes from `onlineEntries` in `exam/gradebook.js` with the id `attempt-<id>`. `resultsOf` copies an explicit list of fields to the student, and `studentRecord` passes entries whole.

A sitting is over once `sitting.closes_at` lies in the past. `endSitting` sets `closes_at` to now, and `extendSitting` moves it later. Once the window closes, the sweep has submitted every attempt of the sitting at its deadline. An attempt names its sitting (`attempt.sitting_id`), so a make-up attempt belongs to the make-up's sitting.

Images are served by `/exam/api/images/:id`. For a student, `studentMaySeeImage` (`exam/pool.js`) allows only images of an open attempt.

## Goals / Non-Goals

**Goals:**
- One review, read by one server function and rendered by one element, for both the student and the teacher.
- The student's access hangs on one rule: the attempt is submitted and its sitting is over. The rule is checked on the server for the review and for its images.
- Nothing about correctness reaches a student while their sitting is open.

**Non-Goals:**
- A release by the teacher, or hiding the review again. Gerald decided against both.
- Holding back the review while a make-up or a parallel sitting of the same test is still ahead. This risk is accepted.
- Reviewing offline tests or tests in a teacher's preview.
- Live updates. A link that has become available appears the next time the results are loaded.
- A presentation (reveal.js) form of the review.

## Decisions

### D1 — One rule decides when a student may review

`reviewOpen(db, row, at)` in `exam/attempts.js` answers true when `row.submitted_at` is set and the attempt's sitting has `closes_at <= at`. The API, the image rule (D5) and the results' link flag (D4) all ask this one function, or the same SQL condition, so they can never disagree.

Alternative considered: opening the review when the test's last sitting is over. That would close the make-up gap, but Gerald decided against it ("sobald der Durchgang, in dem er geschrieben hat, vorbei ist").

### D2 — The review payload is read like `writingView`, but with flags and without tokens

`reviewView(db, row)` answers the following:
- `{ attempt, name, language, score, questionCount, grade }`
- `questions: [{ n, type, text, scored, answers: [{ text, chosen, correct }] }]`

It walks `attempt_question` in `position` order and each question's answers in `attempt_token.position` order. It picks the course's language as `writingView` does. It sends no tokens and no snapshot ids, because the review sends nothing back.

`scored` is computed by the same rule `scoreAttempt` applies. That rule moves into a small helper (`questionScores(db, attemptId)` → Map of question id → 0/1), which both `scoreAttempt` and `reviewView` use. The review's ✓/✗ per question then cannot drift from the stored score. `score` itself is the stored `attempt.score`. An admin's `removeWrittenQuestion` deletes the question's `attempt_question` rows and rescores, so the removed question disappears from the review and from the score together.

### D3 — Two API routes and two pages, one element

The student and the teacher have different gates and different surroundings. Each gets its own route, and both answer `reviewView`.

**Student:** `GET /exam/api/attempts/:id/review` sits in `exam/routes-attempts.js` behind `requireStudent`. A teacher in student view is a student there.
- `ownAttempt` makes a foreign attempt look like a missing one.
- While the attempt's sitting is still open, the request is refused with 409 and `exam.errors.attempts.reviewNotYet`. That covers an unsubmitted attempt too, because its sitting is still open.
- There is no device check. `checkDevice` lets a submitted attempt through anyway, and the review may be opened on any browser.
- The page `/exam/my/attempts/:id` is served like `/exam/my`: no bar, `wrapInPage`. It carries the element `safelearn-attempt-review` with `{ attempt }` and a link back to `/exam/my`.

**Teacher:** `GET /exam/api/courses/:id/students/:username/attempts/:attempt` sits in `exam/routes-gradebook.js` behind `requireTeacher`.
- It checks that the attempt belongs to a test of that course and to that student.
- It refuses an unsubmitted attempt with 404.
- The page `/exam/courses/:id/students/:username/attempts/:attempt` goes through `teacherShell` and has a way back to the student's page.

Alternative considered: one route that branches on the role. It was rejected because the module keeps teacher and student routes apart (`requireTeacher`/`requireStudent`), and a shared route would make the gate easy to get wrong.

Alternative considered: unfolding the review inline under the row of the results table. It was rejected because a test of 20 questions with images would blow up the table. A page of its own can also be opened again by its address, and it reads well on a phone.

### D4 — Online entries say whether and where they can be reviewed

`onlineEntries` adds two fields to each entry:
- `attemptId`
- `reviewOpen`: the D1 condition, joined from `sitting.closes_at` against now.

`resultsOf` copies both into the student's answer, and `studentRecord` passes them on as it passes everything.

`resultsTable(entries, { reviewHref })` takes a function that returns the address of an entry's review, or null:
- The student's results pass `entry.reviewOpen ? /exam/my/attempts/<attemptId> : null`.
- The teacher's page passes the teacher's address for every online entry, because a teacher's entry only exists once the attempt is submitted.

The link sits in the result cell after the points and reads "Ansehen" / "Review". Its `aria-label` names the test.

### D5 — The image rule gains the review case

`studentMaySeeImage` also answers true when the student has a submitted attempt at a test whose `test_image` holds the image and whose sitting has `closes_at <= at`. The existing condition for an open attempt stays as it is. Teachers already see every image.

### D6 — The element and its look

The new client module `exam/client/review.js` defines `attempt-review` and is imported by `exam/client/exam-client.js`. The element loads the student's or the teacher's route depending on its params (`attempt` alone, or `course` + `student` + `attempt`). It then renders the following:
- A header with the test's name and "3/4 · Note 2".
- One section per question with "Frage n", a ✓/✗ for scored, and the stored question text, inserted like the writing page's `storedMarkup`.
- The answers as a list. Each answer has a choice mark (☑/☐ for `multichoiceset`, ●/○ for single choice) with the text "deine Wahl" for assistive technology. It also has the board's correctness coding: correct answers highlighted green with ✓, wrong ones dimmed with ✗, each with an `aria-label`.

The styles go in `css/exam.css` as `.sl-exam-review-*`. They mirror the meaning and the colours of `.reveal .sl-board-correct`/`-wrong`, set on the page's own tokens for light and dark, not copied from the moon theme. The class names stay separate from the board's, because `reveal.css` scopes those to `.reveal`.

### D7 — The writing payloads stay as they are

`writingView` and `resultView` do not change. The page after Submit still shows only points and grade, even when a student submits after the window closed: the review stays a separate place. This keeps the rule "nothing during the sitting reveals correctness" easy to check. Only one route, `/review`, ever carries a correct flag to a student.

## Risks / Trade-offs

- [The first sitting sees the solutions while a make-up or a parallel sitting of the same test is ahead] → Gerald accepts this (2026-11-09). The teacher watches out during the make-up. With parallel groups (A 8:00–8:50, B 9:00–9:50), group A can show its solutions to group B in the break. The teacher can avoid this by scheduling both groups in one sitting.
- [A correct flag leaks to a student during the sitting] → Only the review route carries correct flags, and it checks D1 on the server. A unit check asserts the refusal while the window is open, also after an early submission.
- [Images open to more students for longer] → They are only the images of the student's own attempt's test, and only after the sitting. A unit check covers foreign students and the time before the sitting is over.
- [Ending a sitting early opens the reviews at once] → Intended: ending means the sitting is over. Extending moves `closes_at` and with it the opening of the reviews.

## Migration Plan

No migration. The new routes and fields are additive. A rollback removes the links and routes; nothing is written.

## Open Questions

None. The decisions are Gerald's from 2026-11-09 (`AI/open-proposals.md`).
