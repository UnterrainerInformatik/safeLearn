Source: AI/open-proposals.md

## Why

The full `npm test` is red again, and only some of the red checks point at the working tree. On 2026-11-18, while `board-solution-answer-counts` was being verified, the full run reported 1171 pass and 2 fail. Neither failure was in the board deck:

- "the review opens once the sitting is over …" times out when it clicks the review link. It is **also red on the baseline without the change**, so it is a real finding.
- "the attendance table holds the teacher's note …" times out in some runs only.
- Several runs of `test/exam.test.js` alone had 4–7 red checks that changed from run to run (gradebook, tree drag, question editor), also on the baseline.

The `browser-verification` capability promises that consecutive runs of the exam checks are green without repeats, and that a red check is evidence against the working tree. That has not held since 2026-11-11. While the suite can be red for reasons unrelated to the change, every apply step costs a manual triage, and real regressions such as the review link get lost in the noise.

A second gap showed up while this proposal was being written. Filtering `test/exam.test.js` down to the review check (`--test-name-pattern`) cancels the whole "online tests: writing" describe: its `before` hook reads a class (`9xgb`) that only an earlier describe creates, and fails with `Cannot read properties of null (reading 'id')`. A red check therefore cannot be re-run on its own, even though the convention is to re-run only the checks that were red.

## What Changes

- **Find out why the review-link check is red.** Find out whether the application regressed (the link or the results page) or whether the check itself is wrong, and fix whichever side is wrong. The check stays as strict as it is: it is not loosened until it passes.
- **Find out why the other exam checks are unstable, and fix the causes.** Covers "attendance table holds the teacher's note" and the changing set of gradebook, tree drag and question editor checks. Each cause is named and fixed where it lives: a check that does not wait for a state the page reaches asynchronously, state that leaks between checks over the shared demo accounts, or an application race the checks expose. No retries and no longer global timeouts.
- **A failing browser check leaves evidence.** When a browser check fails, the harness keeps what is needed to tell a timing problem from a real one: the URL, a screenshot, the relevant DOM and the page's console errors. These go to a gitignored location, so that a red run can be diagnosed without being reproduced.
- **Every describe of the exam checks can run on its own.** A describe sets up or looks up what it depends on in its own `before` hook, instead of relying on records an earlier describe left behind. Re-running a single red check with a name filter then reaches that check.
- **Stability is proven, not assumed.** The change is done only when `test/exam.test.js` has run several times in a row without a red check, and the full `npm test` has run once without a red check.
- Close the open proposal "Instabile Checks in der vollen Suite" by removing its entry from `AI/open-proposals.md`, and update the "Wackelige Checks" memory with what was found.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `browser-verification`: the requirement "A browser check does not depend on the rendering timing of the page" gains a scenario for navigating to a page that the client script fills or reveals after loading. New requirements: a failing browser check leaves diagnostic evidence, and a group of checks can run on its own without the groups before it.
- `exam-attempt-review`: affected only if the review-link failure turns out to be an application regression. In that case the existing requirement is restored, not changed. A delta is added only if the diagnosis shows that the spec itself is ambiguous.

## Impact

- **Tests:** `test/exam.test.js`, mainly the describes "online tests: writing" (review link), attendance, gradebook, tree drag and question editor, plus `test/harness.js` (failure evidence, possibly a navigation helper that waits for the page to be shown).
- **Application:** only where the diagnosis finds a real race or regression, most likely in the exam client (`exam/client/`) around the results page and the review link.
- **Tooling:** a gitignored output directory for failure evidence. If a navigation helper is introduced, possibly a convention check similar to the existing one against direct clicks.
- **No change** to the demo realm, the accounts or the deployment.
