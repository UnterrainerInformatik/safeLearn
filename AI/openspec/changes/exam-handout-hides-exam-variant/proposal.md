## Why

The handout of an offline test shows its `@@@ #exam` blocks to every present participant. Teachers put solutions into `#exam` blocks on purpose: a student can switch the answer view on for themselves, but never the exam view, so `#exam` is the one place on an ordinary page that a student cannot open. The handout turns that around. A test file with its solutions in `#exam` blocks, used as a handout, hands every participant the solutions. A colleague saw this on a student's screen during a 4AHIF test on 2026-11-16. The handout is the assignment, and it must not contain anything a student is not shown on an ordinary page.

## What Changes

- **BREAKING**: The handout rendering for a participant, and a teacher's preview of it, hides the exam variant and shows the practice variant, exactly as an ordinary page does for a student. The answer variant stays hidden, whatever the participant's stored preference. The whole-file directive is still set aside, and inline blocks are still decided by the participant's roles.
- The handout's attachments follow the same views: a file referenced only inside an `#exam` block is no longer served to a participant through the handout.
- The solution deck shows the handout as the teacher's solution: exam variant and answer variant shown, practice variant and `@@@ teacher` blocks hidden. It is offered for a handout that contains at least one `#exam` or `#answer` block.
- `role-resolution` no longer makes the handout an exception to "the exam view is reserved for teachers and admins". The handout rendering now only fixes the student view and hides the answers for a participant. The exam view in a solution deck stays reserved to teachers.
- A teacher still sees the solutions on the file's own page with the exam view on, as before. Nothing about ordinary pages changes.

## Capabilities

### New Capabilities

### Modified Capabilities
- `exam-handout`: a participant's handout and its preview show the practice variant and hide the exam variant; attachments follow; the solution deck shows the exam and answer variants and is offered for `#exam` or `#answer` blocks.
- `attachment-access`: an attachment referenced only inside a handout's exam variant is no longer served to a participant through it.
- `role-resolution`: the handout rendering stops granting the exam view to participants. The exam view is granted only to teachers and admins, and in a teacher's solution deck. The practice view is the exact counterpart everywhere, the handout included.

## Impact

- `utils.js` (`hasRoles`): the `#exam`/`#practice` branches under `req[handoutViews]` follow a flag the module sets, instead of always showing the exam variant.
- `exam/handout.js`, `exam/routes-handout.js`: the views each rendering sets (participant, preview, solution deck, attachment check); the solution button offered for `#exam` or `#answer` blocks.
- `exam/client/tests.js` if the button's condition is read from the server's flag under a new name.
- `test/exam-offline.test.js`, `test/checks/permissions.js`, the handout fixtures `md/test-exam-handout*.md`.
- `docs-exam-module.md`, `docs-permissions.md`, `AI/architecture.md`, and the Obsidian plugin docs if they describe the handout's views.
- Content: test files whose solutions sit in `#exam` blocks become safe to use as handouts without editing them.
