## Why

Seventeen checks in the content suite fail on `master`, and have since two changes landed one after the other. Neither is wrong on its own; the combination is.

`sharpen-the-page-a-reader-reads` made a page view serve `<body style="display: none">` so a reader never sees the default appearance flash before their own preferences arrive. The body is shown by `revealPage()` in `obsidian-page.js`, which runs when `init()`'s request for `/userattributes` answers — or when its five-second bound expires, whichever comes first. That is the right behaviour for a reader and `page-bootstrap` has the requirement for it.

`walk-the-search-results-with-the-keys-the-query-was-typed-on` added `test/checks/search-keyboard.js`, which drives the search field the way a reader does: `page.click("#searchField")`, then typing.

`render()` in `test/harness.js` returns as soon as `#markdown-content` appears in the DOM. That happens while the body is still hidden. A hidden element has no box, so every element on the page measures zero by zero, and Puppeteer refuses to click one:

```
bodyDisplay: "none"
field:   { display: "inline-block", visibility: "visible", w: 0, h: 0 }
sidebar: { display: "block", w: 0 }
```

Sixteen of the seventeen fail with `Node is either not clickable or not an Element`. They are a race, not a deterministic break: `enter opens what following the node with a pointer opens` passes in the same run its neighbours fail, because the preference request happened to answer first. A suite that fails differently from one run to the next is worse than one that fails every time — it trains the reader of the output to discount it.

The seventeenth is `the document view is the content without the page shell` in `test/checks/presentation.js`, which compares the text of two views and reads one of them before it is shown.

This is not a gap in what the harness is specified to do. `browser-verification` already says `render()` exists so that a caller gets a rendered page "without repeating navigation, view selection and **the application's own reveal-on-init behavior** in every check". The requirement is written; the harness does not honour it.

That the workaround is what a caller reaches for is visible in `test/checks/legibility.js`, where three checks added by `ship-the-bold-and-italic-a-page-asks-for` each wait for `document.body.style.display === ""` by hand after calling `render()`. Three copies of one line, in one file, working around one omission.

## What Changes

- **`render()` waits for the page to be shown**, not merely rendered, before it returns. Measured: this alone takes the content suite from 23 failures to 6, and the remaining 6 are `test/checks/directory-search.js` against a local `.env` whose `DIRECTORY_SERVICE_CLIENT_ID`/`_SECRET` are invalid for the real realm — an environment fact, not a code one, and out of scope here.

- **The wait is bounded and fails by saying what it was waiting for.** `init()`'s own bound is five seconds, after which it shows the page and logs why; a harness that waited forever would turn a bounded application behaviour into an unbounded test hang. A page that is never shown fails the check naming the path, the view, and the fact that the body stayed hidden — the same shape as `render()`'s existing failure for a page that never appears.

- **The presentation view is not subject to it.** A deck loads no `obsidian-page.js` and has no `init()`; it is revealed by the script at the end of its own body. Waiting on `document.body.style.display` there would wait on something with a different owner. `page-bootstrap`'s "The three views follow the same rule" governs the application; this is about which of them `render()` can observe the same way.

- **The three hand-rolled waits in `test/checks/legibility.js` come out**, because the harness does the thing they were compensating for.

No check's assertions change. Nothing in `obsidian.js`, `obsidian-page.js` or `css/` changes: the application is behaving as its spec says, and it is the harness that does not.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `browser-verification`: the requirement "The harness fetches a rendered page by path and view" already names the application's reveal-on-init behavior as something a caller should not have to repeat. Its scenarios are tightened to say what "rendered" means — shown, not merely present in the DOM — and a scenario is added for the page that is never shown, so the obligation is asserted rather than implied by a sentence in the requirement's prose.

## Impact

- `test/harness.js` — `render()`, and the failure it raises when the page is not shown in time.
- `test/checks/legibility.js` — three `waitForFunction` calls that become redundant.
- `test/checks/search-keyboard.js`, `test/checks/search.js`, `test/checks/presentation.js` — expected to pass again; not otherwise edited.
- `AI/openspec/specs/browser-verification/spec.md` — through the delta above.
- `docs-testing.md` — if it describes what `render()` guarantees.

Not in scope: the six `test/checks/directory-search.js` failures. They are the invalid local directory-service credentials recorded in `AI/open-proposals.md`, they fail identically before and after this change, and fixing them is a matter of a working `.env` rather than of code.

Not in scope either: making `revealPage()` faster or changing when a page is shown. The application's behaviour here is correct and specified; only the harness's reading of it is wrong.
