## Why

Source: `AI/architecture.md` section 9, Code-level observations — the `body.style.display` bullet and the per-page server-sent-events bullet. No file in `AI/proposals/` corresponds to this change.

A rendered page comes up hidden and is revealed by whichever script gets there first, and it holds a server-sent-events connection for as long as it lives. Both are the same subject — how a page boots in the browser — and both are currently decided by accident rather than by design.

**Two scripts reveal the body, with two different values.** `wrapInPage` and `wrapAsDocument` serve `<body style="display: none;">` (`obsidian.js:1883`, `:1927`) and then load two things that both undo it. `obsidian-page.js`'s `init()` — called inline at the end of the body (`:1905`, `:1941`) — fetches the user's preferences and, when that resolves, sets `display = "block"` (`obsidian-page.js:279`). The hot-reload script, injected into the same page, sets `display = "none"` on `DOMContentLoaded` and then back to `""` along four different paths (`obsidian.js:1828`, `:1843`, `:1852`, `:1856`, `:1863`). Which value the element ends up with depends on which finishes last: `init()` waits on a network round trip, the reload script waits on `DOMContentLoaded` and, in one branch, on a one-second timer. `""` and `block` happen to render the same today because nothing in `css/` gives `body` a different `display` — so the visible symptom is not a broken layout but a page that can be hidden again after it was shown, and a reveal that nobody owns. The verification suite already works around it: `test/checks/rendering.js:107` waits for `display !== "none"` because either script may have won, and `test/smoke.test.js:33` reads `textContent` rather than `innerText` because the body may still be hidden.

The presentation view makes the disagreement plain. `wrapInReveal` serves `<body>` with no inline style and does not load `obsidian-page.js` at all (`obsidian.js:1979`) — so there, a page that starts visible is *hidden* by the reload script on `DOMContentLoaded` and revealed again afterwards. The same script performs opposite roles in the two page types, and neither page type says which is intended.

**Every page holds a stream for its whole life.** `getAutoReloadScript()` is emitted by all three wrappers (`obsidian.js:1900`, `:1936`, `:1976`), unconditionally — including in deployments where `NEXT_AUTOSCAN` is off and no file watcher exists. The connection is not pointless there: the timed-permission scheduler broadcasts over the same channel when a window opens or closes (`app.js:250`). But it is never closed, and on error the script reconnects on a fixed three-second timer that also registers a further `DOMContentLoaded` listener each time round (`obsidian.js:1821-1827`). The recorded consequence — connections accumulating against the browser's per-host limit until navigations queue behind them — has not been measured, and the first thing this change owes is a measurement rather than a repair.

## What Changes

- **One script reveals the page, and it is named.** The reveal moves to a single owner with a single value. The other script stops touching `display`. Which script owns it is settled in design.md, along with what the hidden-until-ready period is actually for — preferences that would otherwise flash, and a restored scroll or slide position.
- **The presentation view is made consistent with the other two.** Either it starts hidden like them and is revealed by the same owner, or all three start visible and the flash protection is expressed some other way. It does not stay as two rules for the same script.
- **A page that is never revealed becomes a failure, not a blank screen.** The one thing worse than a flash is a page that stays at `display: none` because the reveal was waiting on a request that never came back. Whatever owns the reveal gets a bound.
- **The stream's cost is measured before it is changed.** The per-host claim is checked against a real browser walking real pages, and the finding is recorded whether or not it justifies a repair. What the change then does — closing on `pagehide`, backing off instead of retrying on a fixed timer, not stacking a listener per reconnect — follows from what the measurement shows.
- **The reconnect stops accumulating listeners.** That one is a defect regardless of what the measurement says: `connectSSE` registers a `DOMContentLoaded` handler on every call, and it calls itself on every error.
- Not touched: that `/hot-reload` answers before authentication (deliberate, recorded in `deployment-surface` and confirmed by the author), what the endpoint emits, the reload decision the client makes from a payload, and the timed-permission scheduler that broadcasts over the same channel.

## Capabilities

### New Capabilities

- `page-bootstrap`: how a rendered page comes up in the browser — the period it is deliberately not shown, which script ends that period and with what, that the period is bounded, and the live connection a page holds while it is open. Covers all three views, which today disagree.

### Modified Capabilities

None. `presentation-view` governs what the deck is built from and what it may contact; `deployment-surface` governs the endpoint's position relative to authentication. Neither says anything about when a page becomes visible or how long it holds a stream.

## Impact

- `obsidian.js` — `getAutoReloadScript` (`:1750-1867`): the `display` handling, the reconnect, and the listener registration. The three wrappers (`:1870`, `:1914`, `:1949`) as far as the initial `body` style and script order go.
- `obsidian-page.js` — `init()` (`:262-281`), which reveals the page today as a side effect of having read preferences.
- `app.js` — only if the measurement leads to a change in how `clients` are held or dropped (`:168-251`). Expected to be untouched.
- `test/checks/rendering.js` and `test/smoke.test.js` — both carry a comment describing the race as it stands. Once one script owns the reveal, both comments and at least one of the waits become wrong, and the checks should assert the rule rather than tolerate either outcome.
- `test/checks/presentation.js` — the deck's own bootstrap, which is the divergent case.
- `test/coverage-map.json` — the new assertions.
- `AI/architecture.md` — two Observations in section 9 resolve, or one resolves and one is restated as a measured decision.
- `docs-testing.md` — if the measurement finds something a run cannot assert.
- No dependency is added or removed. No configuration changes.
