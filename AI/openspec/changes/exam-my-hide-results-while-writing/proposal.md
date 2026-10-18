Source: AI/open-proposals.md, entry **Schüler-Seite "Exams" (`/exam/my`): Ergebnisse während des Schreibens** (decided by Gerald on 2026-10-18).

## Why

Since 2026-10-18 the student's Exams page (`/exam/my`) shows the open tests above the student's results. When a student starts a test, the writing view replaces the list of open tests, but the results stay underneath it. While a test is written they are of no use and only distract, and on a phone they make the page twice as long. The first pilot sitting with a real class is on 2026-10-19, so the page students see while writing matters now.

## What Changes

- While the student on `/exam/my` has an attempt running (started there or resumed on reload), the **Results** heading and the results list are hidden.
- As soon as the attempt ends, by the student's submission or by the server's submission at the deadline, the page shows the results again, already holding the result of the attempt that was just written.
- Only the page of `/exam/my` changes. A content page that places a `safelearn-test` block next to a `safelearn-results` block keeps showing both, because the author decided where each one goes.
- A teacher's preview of a test (`preview=1`) is not an attempt and changes nothing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `online-test`: a new requirement: the student's Exams page hides its results while the student's attempt runs and shows them again after submission. `online-test` is still a delta of the unarchived change `exam-online-tests`. This change therefore states its requirement as ADDED and is archived after `exam-online-tests`.

## Impact

- `exam/routes-attempts.js`, route `GET /exam/my`: the results heading and placeholder are wrapped in one section the page can hide.
- `exam/client/attempt.js`, `WriteTest`: it announces when writing starts and ends (one window event). A small handler on the `/exam/my` page hides and shows the section and reloads the results when they are shown again.
- `test/exam.test.js`: a harness check for the hidden and restored results.
- `docs-exam-module.md`: one sentence on the student page.
- No API, database or catalog change. The existing heading texts are reused.
