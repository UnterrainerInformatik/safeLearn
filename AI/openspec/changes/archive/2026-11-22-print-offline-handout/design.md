## Context

See proposal.md for the motivation. The pieces are all there already:

- `renderHandout` (`app.js`) renders a handout for a student, with a choice of views and a `vars` map. It returns only HTML. The three routes in `exam/routes-handout.js` (participant, preview, solution) wrap that HTML with `wrapInPage`.
- `wrapAsDocument` (`obsidian.js`) is the print view of a corpus page (`?document`): main.css, fonts, KaTeX and Mermaid, but no top bar and no navigation. It takes its `<title>` from `req.file.name`, which a module route does not have.
- `variablesFor(db, testId, sittingId)` fills `CLASS` and `DATE`. Without a sitting it uses `previewSitting`, the first started sitting or else the first planned one. `testVariables` gives `{ name, value, auto, missing }`, where `missing` is never true for `DATE`, because a start always has its own date.
- `handoutVariableNames(test)` gives the union over A and B. `handoutsOf(test)` gives `{ group, path, resolves, hasSolution }` per handout. The test's payload and the sitting's live snapshot both carry it.
- The module's error handler answers a named refusal (`ConflictError`, …) with JSON and the status, in the reader's language. A 404 on a page route falls through to the unmatched path, so it reveals nothing.

## Goals / Non-Goals

**Goals:**
- One printable document per handout, and per solution, from the test's page and from a sitting's page, each with the right `DATE`.
- No paper copy with a missing value.

**Non-Goals:**
- A and B combined in one document, or copies built into the document. The browser's print dialog sets the copies.
- Opening the print dialog automatically, print-specific CSS (page breaks, margins) beyond what `?document` already has, and a PDF export on the server.
- Changing the start's rule. The start keeps refusing on the union of both handouts' variables.

## Decisions

### D1 Four print routes beside the existing ones

`GET /tests/:id/handouts/:group/print` and `/tests/:id/handouts/:group/solution/print` render like the preview and like the solution, with `variablesFor(db, test.id)`. `GET /sittings/:id/handouts/:group/print` and `/sittings/:id/handouts/:group/solution/print` do the same with `variablesFor(db, test.id, sitting.id)`. The sitting must exist and its test must be offline, otherwise the route throws `NotFoundError`. All four are behind `teacherPage`, as preview and solution are, and they reuse `teacherHandout` and the `rendered` wrapper. The solution's print throws `NotFoundError` when the handout has no solution, so the URL behaves like the missing button.

*Alternative:* a `?print` parameter on the preview and solution routes. Rejected: the sitting's date needs a sitting in the path anyway, and separate paths keep each route a straight line.

### D2 `wrapAsDocument` takes a title and no properties

`wrapAsDocument(html, req, { title })` uses `options.title` when given, and otherwise `req.file.name` as before. The print routes pass the same title as the preview or solution page (`exam.handouts.previewTitle` / `solutionTitle`). They pass no `properties`, as the preview passes none, so frontmatter header and footer stay out of the handout here too. The HTML is wrapped in the same `<div class="sl-exam-handout">` as on screen, so existing handout styles apply.

*Alternative:* a separate module wrapper. Rejected: `?document` is the one print view, and it already brings fonts, KaTeX and Mermaid.

### D3 The missing check is per handout

`handoutVariableNames` is split, so that one file can be scanned alone (`variableNamesOf(corpusPath)`), and the union is built from it. `handoutsOf` adds `variables: [names]` to each handout entry. A new `printBlockers(db, test, group, sitting)` in `exam/tests.js` returns the names of that handout whose value is `null`. Unlike `missing`, it includes `DATE` when there is no sitting, so it takes the values from `testVariables` and not the `missing` flag. A non-empty list throws `ConflictError("exam.errors.handouts.printVariablesMissing", { names })`, and the error handler answers 409 with the readable message.

The check is per handout because a print is of one handout: a missing `SUBMISSION_LINK_B` must not stop group A's paper. The start keeps the union, since it opens both handouts.

*Alternative:* render an error page for the refusal instead of JSON. Rejected: the buttons are disabled in that state, so only a stale tab or a typed URL ends up there. The module's plain refusal is enough, and it names the variables.

### D4 The client disables from data it already has

On the test's page, a handout's print buttons are disabled when one of `handout.variables` has, in `test.variables`, a `value` of `null`. That covers both a missing value and a `DATE` without a sitting. The names are shown beside the buttons in red (`sl-exam-variable-name is-missing`, as elsewhere). On the sitting's page, `DATE` always has a value, so the snapshot's `missingVariables` filtered to `handout.variables` gives the same answer. The buttons on the sitting's page sit on the handout line (`handoutLine`), beside each path. They are link buttons opening a new tab, like preview and solution.

## Risks / Trade-offs

- [Values change after the page was drawn] → the server checks again on every print. A stale button gets the 409 with the names.
- [`wrapAsDocument` runs `init()` of `obsidian-page.js`, built for corpus pages] → the browser check asserts that the print shows the handout's text and has no top bar. The handout's embedded module elements already render their defaults (`embedDefaults`).
- [The test's page date and the make-up's date differ] → intended: each page prints its own sitting's date, and the spec names both.
