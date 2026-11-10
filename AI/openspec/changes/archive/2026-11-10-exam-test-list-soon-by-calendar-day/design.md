## Context

`testTiming(test, at)` in `exam/client/test-timing.js` decides the state of a row; it is DOM-free so `test/exam-test-timing.test.js` loads the very file the browser does. "soon" is currently `Date.parse(opensAt) - at < SOON_MS` with `SOON_MS = 7 × 24 h`. `exam/client/periods.js` already has `viennaLocal(instant)`, which returns an instant's Vienna calendar day as `YYYY-MM-DD`, and is likewise DOM-free and served from `/exam/assets/`.

## Goals / Non-Goals

**Goals:** count whole Vienna calendar days between today and a sitting's opening day; amber at a difference of at most 6 (negative included).

**Non-Goals:** no change to "open", "done", "later", to colours, tones, ordering, or to the live view.

## Decisions

**D1 - Calendar days in Vienna, via `viennaLocal`.** The difference is `dayIndex(viennaLocal(opensAt).date) - dayIndex(viennaLocal(at).date)`, where `dayIndex` turns `YYYY-MM-DD` into whole days via `Date.UTC(y, m-1, d) / 86400000`. Because both dates are wall-clock dates parsed as UTC midnights, DST changeovers do not shift the count. "soon" iff the difference is `<= SOON_DAYS` (6). Alternative considered: keep milliseconds and subtract the time since local midnight - fragile around DST and harder to read. Alternative considered: the browser's local time zone - rejected, the app counts every date in Europe/Vienna (`locale-formats`).

**D2 - Replace `SOON_MS` by `SOON_DAYS = 6`.** The only importer of `SOON_MS` is the unit test; it switches to explicit dates. Past-time offline sittings yield a negative difference and stay "soon" without a special case.

**D3 - Label "within the next 6 days".** Today plus six days; it names the threshold the rule uses. Alternative "this week" rejected: on a Thursday it would be wrong (Thursday to Wednesday).

## Risks / Trade-offs

- [The browser loads `periods.js` from `test-timing.js` as an extra module] → it is already served and cached for the sittings form; a relative import `./periods.js` works the same in Node and the browser.
- [Label "6 Tage" may read oddly to teachers used to "7 Tage"] → legend sits right above the list; easy to reword in i18n alone.
