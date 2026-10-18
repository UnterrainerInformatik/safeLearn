## Context

`GET /exam/my` (`exam/routes-attempts.js`) renders two placeholders under two headings: `test` (element `WriteTest`, `exam/client/attempt.js`) and `results` (element `ResultsView`, `exam/client/gradebook.js`). Each element loads on its own. `WriteTest.load()` resumes a running attempt by asking `/api/my/tests` and, when one of the open tests carries an `attempt`, posting to its attempt route. It switches between the list of open tests, the writing view and the result view with `show()`. `WriteTest` already announces the number of open tests with a window event (`sl-exam-open-tests`) that the top bar listens to. The requirement is in `specs/online-test/spec.md`.

## Goals / Non-Goals

**Goals:** no results section during a running attempt on `/exam/my`, no flash of the results on a reload during writing, and the results back with the new result once the attempt is submitted.

**Non-Goals:** changing the results element itself, any content page with both blocks, the teacher's preview, and an API or database change.

## Decisions

**D1: The page marks the section; the element only announces its state.** The route wraps the results heading and placeholder in `<section class="sl-exam-my-results">`. `WriteTest` dispatches `sl-exam-writing` on `window`, with `detail.writing` true when it shows a writing view of a real attempt (not a preview) and false when it shows a result, shows the list, or is disconnected. A listener in `exam/client/exam-client.js` sets `hidden` on every `.sl-exam-my-results` from that event. Because only `/exam/my` carries that class, content pages are unaffected without `WriteTest` knowing where it is mounted.
*Alternative:* `WriteTest` looks for a sibling `sl-results` and hides it. Rejected, because it would also hide a results element an author placed on a content page, which the spec excludes, and it couples two elements.

**D2: A reload during writing starts hidden.** The route asks the same query `/api/my/tests` uses (`exam/attempts.js`, the open tests with their running `attempt`) whether the session's student has an attempt running. If one is running, it renders the section with `hidden`. Without this, the results would load and appear for the half second before `WriteTest` has resumed the attempt.
*Alternative:* client-only, with the results placeholder always rendered hidden until `WriteTest` reports. Rejected, because a failure of the test element would then hide the results for good.

**D3: Shown again means reloaded.** When the event switches from writing to not writing, the listener calls `reload()` on the `ResultsView` inside the section, so the result just submitted is in the list. Both ends of an attempt go through `WriteTest.resultPage()` (submit and `finish()` at the deadline), so dispatching there covers both.

**D4: A teacher's preview never dispatches `writing: true`.** `writingPage()` knows `preview`. A teacher's `/exam/my` has no running attempt, so D2 never hides anything for them either.

## Risks / Trade-offs

- [The attempt ends on the server while the page is closed] → The next load of `/exam/my` has no running attempt, so D2 shows the results, and they hold the result.
- [The route's extra query costs time on every `/exam/my` load] → It is the same indexed query `/api/my/tests` already runs once per load, and it is skipped for a teacher.
- [An event without a listener, on content pages] → Harmless, because nothing on those pages carries the class.

## Migration Plan

No data migration. Deploy as usual, safeLearn first and then secureLectures (`AI/memory/securelectures-sync-order.md`). Roll back by reverting the commit.
