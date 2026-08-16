## 1. Settle who reveals a page

- [ ] 1.1 Confirm design's premise before acting on it: search `css/` for any rule setting `display` on `body` (design Open Questions). Record what you find — it decides whether Decision 2 corrects a live bug or removes a latent one.
- [ ] 1.2 In `obsidian-page.js` `init()` (`:279`), change `document.body.style.display = "block"` to `""` (design Decision 2), and comment that this is the one place a page view is revealed and why the value defers to the stylesheets.
- [ ] 1.3 In `getAutoReloadScript` (`obsidian.js:1750-1867`), remove every write to `document.body.style.display` — the `DOMContentLoaded` hide (`:1828`) and all four reveals (`:1843`, `:1852`, `:1856`, `:1863`). The position restore stays; only the visibility writes go.
- [ ] 1.4 Confirm the restore still runs before the reveal in the page and document views: `init()` cannot resolve before the document holding its `<script>` tag has parsed, so `DOMContentLoaded` precedes it. Verify against a running instance with a saved scroll position rather than reasoning about it alone.
- [ ] 1.5 Leave the inline `style="display: none;"` in `wrapInPage` (`:1883`) and `wrapAsDocument` (`:1927`) as it is, and comment at one of them what the hidden period is for — preferences that would otherwise flash — and who ends it.

## 2. Make the deck follow the same rule

- [ ] 2.1 Give `wrapInReveal`'s `<body>` (`obsidian.js:1979`) the same inline `display: none` the other two wrappers use (design Decision 3).
- [ ] 2.2 Reveal the deck from Reveal's own readiness, in the deck's inline script beside `Reveal.initialize` — not from the reload script, which no longer writes the property in any view. The slide restore the reload script performs must have run by then; confirm the ordering against a deck that was hot-reloaded mid-presentation.
- [ ] 2.3 Remove the branch-local one-second timer at `obsidian.js:1851-1853`; group 3 replaces it with a bound that covers every view.
- [ ] 2.4 Run `npm test`. The presentation checks read a deck's rendered slides, so a deck that never reveals fails them — which is the intended signal, not a flake.

## 3. Bound the wait

- [ ] 3.1 Arm a timer at bootstrap in each view's owner (design Decision 4): if the page has not been revealed by then, reveal it and log a message naming what it was waiting for. Seconds, not milliseconds — it exists to survive a request that never answers, not to race a slow one.
- [ ] 3.2 Make sure the timer cannot reveal a page twice or fight the owner: clearing it is part of revealing.
- [ ] 3.3 Assert the bound in `test/checks/rendering.js`: with `/userattributes` made to hang — refused or delayed through the harness's request interception, which already refuses hosts and the reload stream — the page still becomes visible and the message is on the console.
- [ ] 3.4 Run `npm test`.

## 4. Turn the workarounds into assertions

- [ ] 4.1 Rewrite the comment and the wait in `test/checks/rendering.js:105-112`: it no longer waits for "either script may have won", it asserts the page is revealed once and that the property holds the value Decision 2 names.
- [ ] 4.2 Rewrite the comment at `test/smoke.test.js:31-35` for the same reason. Keep `textContent` if it is still the honest read; say why in one line instead of describing a race that no longer exists.
- [ ] 4.3 Add the cross-view assertion the spec asks for: the same corpus file opened as page, document and deck each becomes visible exactly once. Put it where the view it covers is already exercised rather than inventing a fourth check module.
- [ ] 4.4 Record the new coverage in `test/coverage-map.json` — `obsidian-page.js` is already guarded by `test/checks/rendering.js` and `test/checks/presentation.js`; extend the `what` of each to name the bootstrap rule.
- [ ] 4.5 Run `npm test`.

## 5. Measure the stream, then repair what the measurement shows

- [ ] 5.1 Establish where connections can honestly be counted (design Open Questions): the server's `clients` map (`app.js:174-190`) and the browser's own accounting are both candidates, and the harness refuses the stream inside the page on purpose (`test/harness.js:375-399`). Try both and record which one reports the truth.
- [ ] 5.2 Walk a session through a series of pages in one tab — forward, then back, so the back/forward cache is exercised — and record how the count moves with the number of pages visited. Write the numbers into this task.
- [ ] 5.3 If connections accumulate: close the `EventSource` on `pagehide` and open a new one on `pageshow` (design Decision 5), then repeat 5.2 and record the numbers again. If they do not accumulate, change nothing here and say so — the finding is the deliverable.
- [ ] 5.4 Independent of 5.3, fix the reconnect: `connectSSE` (`obsidian.js:1752`, `:1824`) registers a `DOMContentLoaded` listener on every call and retries on a fixed three-second timer. Register the listener once, and back off increasingly so an unavailable server does not collect one request per client every three seconds.
- [ ] 5.5 Assert the retry behavior where it can be asserted from a run — that a page whose stream is refused does not open a new connection every three seconds indefinitely. If the harness cannot observe it, record the gap in `docs-testing.md` under "What the corpus demonstrates but a run cannot assert".
- [ ] 5.6 Run `npm test`.

## 6. Settle the observations

- [ ] 6.1 Strike the `body.style.display` Observation in `AI/architecture.md` section 9, naming this change and the owner it settled on for each view.
- [ ] 6.2 Settle the server-sent-events Observation according to 5.2's result: struck with the repair if connections accumulated, or struck as a measured non-finding with the numbers if they did not. Do not leave it open with a note.
- [ ] 6.3 Record in the same section what the deck's second owner is and why it is not the same script as the other two views — a reader should find the decision, not rediscover the difference.
- [ ] 6.4 Run `npm test` one final time, with every group applied.
