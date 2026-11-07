## Context

The list of tests (`TestList` in `exam/client/tests.js`) receives each test with its sittings and their server-side state (`scheduled`, `open`, `over`; `sittingState` in `exam/tests.js`). An offline sitting not yet started stays `scheduled` past its planned time, until the teacher starts it.

## Decisions

### D1: The state is decided in the browser, from the sittings it already has

`testTiming(test, at)` is computed from the list's payload, so the API does not change. It lives in its own module without the DOM, so a unit test loads the same file the browser does (as `periods.js` does).

In order of precedence:
1. **open**: any sitting is `open`. This holds even beside sittings that are over or still to come, because a test being written right now matters most.
2. **later**: no sitting at all.
3. **done**: every sitting is `over`.
4. **soon**: a sitting that is not over opens less than 7 days from now. A planned offline sitting past its time counts here, since it is still waiting to be started.
5. **later**: otherwise.

A make-up still to come keeps a test from being done.

### D2: Colour is never the only carrier

Every row has a tinted background and a 5 px stripe at its left edge, and its `title` names the state. A legend above the tables shows the four states with their colours. The marked row's blue background takes precedence over the tint, while the stripe stays visible. Dark mode has its own values.

### D3: Newest first by the first sitting

A test is dated by the start of its first sitting, as in the gradebook and the question pool. A later make-up does not move it. Tests without a sitting have no date. They go on top, ordered by when they were created, newest first, because they are usually the ones just assembled. The order is applied in SQL (`courseTests`), so every scope (course, class, year) gets it.

## Non-Goals

- Sorting by a column the teacher picks, or filtering by state.
- A configurable look-ahead. Seven days is fixed.
