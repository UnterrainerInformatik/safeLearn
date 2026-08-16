## Context

See proposal.md — Why. What shapes the approach is that the three wrappers already disagree, and that the hidden period exists for two different reasons that arrive at different times.

**What each wrapper serves.**

| | `wrapInPage` (`:1870`) | `wrapAsDocument` (`:1914`) | `wrapInReveal` (`:1949`) |
| --- | --- | --- | --- |
| initial `body` | `style="display: none;"` (`:1883`) | `style="display: none;"` (`:1927`) | no style (`:1979`) |
| `obsidian-page.js` | yes (`:1898`) | yes (`:1934`) | **no** |
| `init()` called | yes (`:1905`) | yes (`:1941`) | no |
| hot-reload script | end of body (`:1900`) | end of body (`:1936`) | **in `<head>`** (`:1976`) |

So in two of three views the reload script's `DOMContentLoaded` handler re-applies a hiding that is already in place, and in the third it introduces one that was never there.

**What the hidden period is for.** Two things, and they are not the same thing:

1. *Preferences that would otherwise flash.* `init()` fetches `/userattributes` and applies font size, theme and dark mode to the already-parsed DOM (`obsidian-page.js:262-280`). Until that returns, the page would be visible in the wrong font and the wrong theme. This waits on a network round trip.
2. *A restored position.* The reload script puts back a scroll offset or a Reveal slide index saved before a hot reload (`obsidian.js:1830-1864`). Until that is applied, the page would be visible at the top and jump. This waits on `DOMContentLoaded`, and for Reveal on the deck being ready — with a one-second timer as the escape hatch (`:1851-1853`).

Reason 1 applies to every page load; reason 2 applies only to the load that follows a hot reload, which is the only time `sessionStorage` holds a saved position. Today both are expressed as writes to the same property from two scripts that do not know about each other.

**Why `""` and `block` look the same.** Nothing in `css/` sets `display` on `body` — `css/body.css:1` opens a `body` rule, and the block-level default is what `""` falls back to. So the two values are interchangeable *right now*, and a `body { display: flex }` added to a stylesheet in a year would turn the race into a visible layout bug that appears on some loads and not others. The value being unowned is the defect; the values being equal is luck.

**What the verification suite already records.** `test/checks/rendering.js:107-110` waits for `display !== "none"` and says in a comment that either script may have won. `test/smoke.test.js:33` reads `textContent` because `innerText` returns empty on a hidden body. Both are honest workarounds for the current state and both should become assertions once there is a rule.

**What is known about the stream, and what is not.** Known: the script is emitted by all three wrappers unconditionally; `EventSource` is created once per page load (`:1786`); the server drops a client when the request closes (`app.js:186`); on error the script closes its own handle and calls `connectSSE` again after three seconds (`:1821-1825`), and each such call registers another `DOMContentLoaded` listener (`:1827`) — after the first one has fired these never run, but they are retained for the life of the page. Not known: whether connections actually accumulate across navigations in a real browser. A normal navigation tears down the document and its connections; a back/forward-cache restore does not, and that is the plausible mechanism behind the recorded observation — but it has not been observed here.

## Goals / Non-Goals

**Goals:**

- Exactly one script decides when a page becomes visible, with one value.
- All three views follow the same rule, or differ only where design says why.
- A page cannot stay hidden because something it was waiting for never arrived.
- The per-page stream's real cost is known and written down.
- A reconnect does not leave anything behind.

**Non-Goals:**

- Removing the hot-reload stream from production pages. The timed-permission scheduler broadcasts over it (`app.js:250`), so a page without it would not notice a permission window opening. Making it conditional on `NEXT_AUTOSCAN` would silently break that.
- Changing what `/hot-reload` emits, or where it sits relative to `checkAuthenticated` — settled elsewhere and deliberately unchanged.
- Rewriting the position-restore logic. It works; it just must not be the thing that owns visibility.
- Introducing a client-side framework or a bundler to sequence two scripts. Two script tags in a known order is the mechanism this project has.

## Decisions

### Decision 1: `obsidian-page.js` owns the reveal; the reload script stops touching `display`

`init()` is the only code that knows when the page is *ready to be looked at* — it has applied the preferences that decide how it looks. It sets one value and it is the only writer. The reload script's five writes go away.

Reason 2's restore still has to happen before the page is seen — and it does not do so on its own. This design first assumed the ordering was free, because `init()` cannot resolve before the document containing its `<script>` tag has parsed, so `DOMContentLoaded` would precede the `/userattributes` response. A run says otherwise. `DOMContentLoaded` also waits for the deferred `<script type="module">` that `getMermaidScriptEntry` emits and for the Mermaid graph it imports, and that outlasts the preference round trip: measured against a running instance, `/userattributes` answered at 289 ms, the body was revealed at 313 ms with the saved offset still in `sessionStorage`, `DOMContentLoaded` fired at 365 ms and the restore scrolled at 370 ms. The deck goes the same way and worse — Reveal reports ready before `DOMContentLoaded`, so the restore lands after the deck is already on screen. Tasks 1.4 and 2.2 hold the numbers.

**So the sequence is performed, not assumed.** The reload script stops hanging the restore off an event of its own and offers it as `window.safeLearnRestorePosition()`; each view's owner calls it as part of revealing. The order inside the owner is *reveal, then restore*, which reads backwards and is not: a hidden body has no scroll height and no slide geometry, so a restore applied before the property is cleared would scroll to the top and lay the deck out against a zero-sized viewport. Both statements sit in one task, and the browser paints once at the end of it, so the first frame a session sees already carries the restored position. That is what the spec asks for — the page is not *shown* before the position has been restored — and it is now a property of the owner rather than of which event fires first.

This also settles half of Decision 5's reconnect repair before it is reached: the reload script no longer registers a `DOMContentLoaded` listener at all, so it cannot accumulate them.

*Alternatives considered.* **The reload script owns it** — it already runs in all three views, including the deck. But it reveals on `DOMContentLoaded`, before preferences are applied, which reintroduces exactly the flash the hidden body exists to prevent. **A third script that waits for both** is the correct shape for a page with a real bootstrap sequence and too much machinery for two scripts. **A CSS-only reveal** (`body:not(.booting)`) still needs someone to remove the class, so it renames the question.

### Decision 2: One value, and it is `""`

`init()` sets `display = ""` rather than `"block"`, so the element falls back to whatever the stylesheets say — which is what a page should do. `block` is a value the script has no business asserting, and it is the value that would break if `css/` ever gave `body` a different display.

The inline `style="display: none;"` in the wrapper stays: it must be in the markup, since a stylesheet-driven hide would need the stylesheet to have loaded, and an inline `display: none` is the only form that holds from the first byte.

### Decision 3: The deck starts hidden too, and reveals on Reveal's readiness

`wrapInReveal` gets the same inline `display: none`, and reveals when the deck reports ready — the point at which the deck has its slides and can be told which one to show. It then restores the saved slide the way Decision 1 describes, in the same task. The deck does not load `obsidian-page.js` and has no preferences to wait for, so its owner is the deck's own readiness, not `init()`.

This is a deliberate second owner for the third view, and it is why the spec speaks of *one owner per view* rather than one owner overall. What must not survive is a script that writes `display` in a view it does not own.

*Alternative considered.* Leaving the deck visible from the start and removing the hiding entirely. That is simpler and loses the slide-restore flash protection after a hot reload — acceptable in production, annoying in the WYSIWYG container, which is the deployment where hot reload matters most.

### Decision 4: The reveal is bounded

Whatever owns the reveal also arms a timer at bootstrap. If the owner has not revealed by then, the timer does, and logs why. A page that is visible with default preferences is a worse page; a page that is never visible is not a page. The existing one-second Reveal escape hatch (`:1851`) is this idea already, applied to one branch of one view — it becomes the general rule and the branch-local timer goes away.

The bound is generous — measured in seconds, not milliseconds — because it exists to survive a failed request, not to race a slow one.

### Decision 5: Measure the stream before repairing it

Before any change to how the connection is held, a run establishes what actually happens: walk a session through a series of pages in one tab, and read the number of connections the browser holds to the application and the number of clients the server has in its map. The harness already refuses the `/hot-reload` stream inside the browser page (`test/harness.js:375-399`), so the count comes from the server side or from the browser's own connection accounting — a task settles which.

If connections accumulate, the repair is to close the `EventSource` on `pagehide` and open a new one on `pageshow`, which is the pair that covers the back/forward cache. If they do not, that is recorded in `AI/architecture.md` as a measured non-finding and the observation is struck as such — a measurement that clears a suspicion is a result.

Independent of the outcome: the reconnect stops registering a `DOMContentLoaded` listener per attempt, and the fixed three-second retry becomes a backoff, so a server that is down does not collect one request per client every three seconds for as long as it stays down.

## Risks / Trade-offs

- **The reveal now depends on one request.** If `/userattributes` hangs, the page waits — which is why Decision 4 exists. Today, the reload script would have revealed it; that is a benefit of the current mess, and the timer is what replaces it deliberately rather than by accident.
- **Hiding the deck introduces a flash risk in the other direction.** A deck that fails to fire `ready` shows nothing until the timer. `Reveal.initialize` is called inline in the same document, so a failure there means the deck is broken anyway — but the timer must apply to the deck too, not only to the page views.
- **Changing what the checks tolerate will surface the race, not hide it.** Once the checks assert a single value, a run that fails tells us the ordering is not what design says. That is the point, and it may mean the first run after this change fails — the tasks treat that as information rather than as an obstacle.

## Open Questions

- Whether the browser or the server is the honest place to count connections, given that the harness deliberately refuses the stream inside the page. Settled in task 3.1 by trying both.
- Whether any deployment sets a `display` on `body` in a stylesheet that is not in this repository — the WYSIWYG containers mount their own `md/`, not their own `css/`, so this is expected to be no, but it decides whether Decision 2 is a correction or a formality.
