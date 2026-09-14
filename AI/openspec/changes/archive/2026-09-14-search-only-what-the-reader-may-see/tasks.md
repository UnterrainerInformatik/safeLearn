## 1. Filtering that yields segments

- [x] 1.1 Split the body of `removeForbiddenContent` (`obsidian.js:807`) into a function that returns the surviving passages as a list — each with its offset in the original Markdown — and keep `removeForbiddenContent` as the caller that joins them. The rendered page must come out byte-identical, which is what the existing render checks already assert.
- [x] 1.2 Export the segment function. It is the only way the search is allowed to reach block filtering; nothing in the search restates `hasSomeRoles` or the directive parsing.
- [x] 1.3 Keep the early return for a document carrying no inline directive, so a file with nothing to decide still costs no permission context.

## 2. The index learns the text and the blocks

- [x] 2.1 Replace `getPermissionsFor`'s first-line stream (`obsidian.js:430`) with a whole-file read that yields the first-line directive, the file's text, and the boundaries and parsed entries of its inline `@@@` blocks, from that one read.
- [x] 2.2 Widen the carry-forward entry in `scanFiles` from `{mtime, permissions}` to `{mtime, permissions, text, blocks}` (`obsidian.js:640` ff.), leaving the carry-forward condition exactly as it is: same path and same mtime reuses everything, anything else derives everything.
- [x] 2.3 Confirm by hand that a scan after editing one file reads that file and no other — the property `corpus-index` already requires and the enlarged entry could quietly break.
- [x] 2.4 Record nothing in `blocks` but what the file says. A stored decision about who may see a block is a decision stored for one session; the review of this task is reading the entry shape and finding no role verdict in it.

## 3. The query

- [x] 3.1 Add the candidate pass: a case-insensitive substring scan over the text the index holds, returning paths only. No disk, no permission check.
- [x] 3.2 Add the answer pass: for each candidate, read the file, resolve the whole-file directive through `resolveFileVisibility`, filter through the segment function from 1.2, and match within each segment separately — never across two.
- [x] 3.3 Locate each match's heading by scanning its segment and the ones before it for ATX headings, skipping fenced code blocks, and count the occurrence of same-text headings over the filtered content only.
- [x] 3.4 Rank a document carrying a match in its file name or in a heading above one matching only in body text.
- [x] 3.5 Build the result shape: one entry per document with name and path, carrying the matching headings with their occurrence numbers. Derive both the headings and their order from the filtered content.
- [x] 3.6 Quote snippets from the filtered segments only, and make sure no snippet is assembled from two of them.

## 4. The route

- [x] 4.1 Add the authenticated search route in `app.js`, alongside the existing content routes and refusing an unauthenticated request the same way they do.
- [x] 4.2 Refuse a query below the minimum length, and settle that length and the debounce interval by measuring against the production corpus (the two open questions in `design.md`). Record the chosen values and why in a comment — both bound how fast a reader can probe.
- [x] 4.3 Return no count that was computed before filtering, and no indication of results beyond those returned.

## 5. The search UI

- [x] 5.1 Put the search field beside the navigation tree in `obsidian-page.js` and `css/`, with the result list and the expand affordance for a result's headings.
- [x] 5.2 Debounce the query at the interval settled in 4.2, and make every keystroke that does issue a query a fresh authenticated request.
- [x] 5.3 Offer no completion, suggestion or correction. If one is added later it has to be derived from filtered content only; there is nothing to build here, and the task is to leave it out deliberately.
- [x] 5.4 Have a result open the page view, whatever view the reader is currently in, and never the print or presentation rendering.

## 6. The jump

- [x] 6.1 Carry the heading text and occurrence on the URL a result links to.
- [x] 6.2 Add the jump script immediately after the `window.safeLearnRestorePosition` call in the revealer (`obsidian.js:2171`), in the same task, so the first painted frame is already in position.
- [x] 6.3 Find the *n*-th `.docanchor` heading whose text matches and scroll to it applying the fixed-header offset, rather than correcting it afterwards as the `hashchange` listener does. Leave that listener in place for hand-written hash links.
- [x] 6.4 Run the jump only when no saved scroll position is present, so a hot reload of a page opened from a search keeps the position the reader scrolled to.
- [x] 6.5 Make a target that is not found a silent no-op that leaves the page at its top, reporting nothing about whether it was absent or filtered away.
- [x] 6.6 Leave `makeContentMap` and the form of a heading's `id` untouched.

## 7. Verification

- [x] 7.1 Add corpus cases to `md/` for each leak channel, since the demonstration corpus is the source of the checks: a term occurring only in a `@@@ teacher` file, only in a `@@@ teacher` block, only in a block addressed to another person by name, and one that occurs only across the seam a removed block leaves behind.
- [x] 7.2 Assert that each of those returns nothing for a student session, and that the response is indistinguishable from the response to a term occurring nowhere in the corpus.
- [x] 7.3 Assert the seam case directly: the joined text contains the term, the answer does not report it.
- [x] 7.4 Assert against the teacher/student toggle that the same session running the same query before and after the switch sees its results change exactly as the rendered pages do.
- [x] 7.5 Assert that a file restricted after the last scan is not returned, and that a file relaxed after the last scan is — driving the staleness window rather than reasoning about it.
- [x] 7.6 Assert that no count in a response exceeds the number of results shown, for both a teacher and a student session over a corpus where they differ.
- [x] 7.7 Assert the jump: a result followed lands on its heading; a repeated heading lands on the occurrence the search found; a hand-written target naming a heading the session may not see leaves the page at its top.
- [x] 7.8 Assert that a query costs at most one permission context, which is the property `resolve-the-session-once-per-request` was built to give this change.
- [x] 7.9 Record the new check file and its guarded files in `test/coverage-map.json` — `test/coverage.test.js` fails on an unrecorded check file.
- [x] 7.10 Run `npm test` and confirm the Puppeteer harness is unchanged against the demo realm, including the existing rendering checks that 1.1 must leave byte-identical.

## 8. Documentation

- [x] 8.1 Describe the search in `docs-development.md`: the two passes, that the index only proposes candidates, and that visibility and snippets come from reading the file.
- [x] 8.2 Note in the render-pipeline document that block filtering now yields segments and that the joined form is one caller of it, so the next reader does not reintroduce the seam by joining early.
