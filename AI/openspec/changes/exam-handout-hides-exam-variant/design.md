## Context

`exam-offline-sittings` (design D4) gave the handout rendering a request-scoped override: `req[handoutViews] = { answer }`, a Symbol property only server code can set. `hasRoles` (`utils.js`) reads it in three places: under the override the role set is the student-view one, `#exam` is always granted (`handout !== null`), `#practice` is always refused, and `#answer` follows the flag. The module sets `{ answer: false }` for a participant and for the teacher's preview, and `{ answer: true }` for the solution deck and for a teacher's attachment check. `hasAnswers` (`exam/handout.js`) decides whether the solution button is offered, by a textual match on `@@@ … #answer`.

The assumption behind "the exam variant shown" was that `#exam`/`#practice` hold two versions of one question. In the content that is actually written, `#exam` is where teachers keep solutions, because it is the one view a student cannot switch on. See proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- A participant's handout shows exactly what an ordinary page shows a student with the exam and answer views off, the whole-file directive aside.
- The override stays a server-set, request-scoped Symbol. No new way for a request to reach it.
- A teacher can still present the solution from the test's page.

**Non-Goals:**
- No change to ordinary pages, to the exam/answer preferences, or to who may switch them.
- No new pseudo-role (`#solution` or the like). Existing content keeps working as written.
- No scan of the content for solutions, and no migration of files.

## Decisions

**D1 — The override carries the exam view as a flag, like the answer view.**
`req[handoutViews]` becomes `{ exam, answer }`. Under the override `#exam` is granted iff `exam === true`, `#practice` iff `exam !== true`, `#answer` iff `answer === true`. Participant and preview: `{ exam: false, answer: false }`. Solution deck and the teacher's attachment check: `{ exam: true, answer: true }`. A missing `exam` field reads as hidden, so any caller that sets the override without it fails closed. Alternative considered: drop the override's exam handling and let `ve` decide. That would hand a teacher's preview the teacher's own `ve` (the preview must show what a participant sees) and would tie the solution deck to a stored preference. Both are wrong, so the flag stays explicit.

**D2 — The solution deck shows `#exam` and `#answer` together.**
A teacher who writes solutions in `#exam` and one who writes them in `#answer` both get their solution in the deck. The practice variant is hidden in the deck, so `#exam`/`#practice` stays mutually exclusive in every rendering. `@@@ teacher` blocks stay hidden, because the deck keeps the student-view role set. It is for showing to the class.

**D3 — The solution button is offered for `#exam` or `#answer`.**
`hasAnswers` becomes a check for either pseudo-role in a `@@@` directive line (`hasSolution`), with the same textual match as today. The client keeps reading one boolean per handout, and the field is renamed with it.

**D4 — Attachments follow the same flags without extra code.**
`handoutAttachmentCheck` decides visibility by rendering under the override, so setting `{ exam: false, answer: false }` for participants removes references inside `#exam` blocks from what counts. The teacher's check uses `{ exam: true, answer: true }`, so an image inside an exam block stays servable to the teacher's deck.

## Risks / Trade-offs

- [A teacher who really wrote `#exam`/`#practice` as two versions for a handout now sees participants get the practice version] → Documented in `docs-exam-module.md`. On an ordinary page a student gets the practice version as well, so the handout now matches what they would see anyway.
- [Handouts already handed out before the fix showed solutions] → Cannot be undone. The fix takes effect on the next request, because handouts are rendered live from the file.
- [A test file currently relied on `#exam` to show something to participants] → None known. The two handout fixtures in `md/` are adjusted, and the browser and unit checks prove each variant present and absent.

## Migration Plan

Code only, no data migration. Deploy safeLearn, then sync to secureLectures as usual. Rollback is reverting the commit. No stored state depends on the views.
