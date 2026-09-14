## Why

SafeLearn has no way to find anything. A teacher who knows a topic was covered somewhere, and a student looking for the exercise that went with a lesson, both have only the navigation tree. The production corpus in `secureLectures` is 279 files across 25 top-level folders; the tree is not a search.

The reason this has not been built is the fear that a search leaks. It is a justified fear, and it is the whole design problem: a hit tells the reader that a word occurs somewhere, and "somewhere" may be a file whose first line is `@@@ teacher`, or a block addressed to one named student out of the ~45 the corpus addresses by name. The corpus carries 544 opening directives — 137 whole-file, 407 inline.

Measurement removes the second fear, the one about runtime. The whole corpus is **1.41 MB of Markdown text**. Reading all 279 files from disk takes 15 ms; a brute-force substring pass over all of it takes 5 ms cold and under 1 ms against a copy already held in memory. A search service is not warranted at this size, and `architecture.md` names "no database" as one of the three properties that shape the whole design. That calculus changes at roughly a hundred times this corpus; it grows by one school year per year.

What the search actually costs is permission checks, not string comparisons — about 540 per query against the production corpus, multiplied by every keystroke of an incremental search. That is why this change depends on `resolve-the-session-once-per-request`, which makes a check free.

## What Changes

**The central rule: the index proposes, the file decides.** `corpus-index` already states it — the navigation tree may answer from the index, but *"where the application decides whether to hand over content, it SHALL read the file"*. A search result hands over content. So the in-memory index is used only to decide **which files to open**; every result's visibility and every snippet are derived from a fresh read of that file, through the existing `resolveFileVisibility` and the existing block filter. A stale index can then cost a missed or a spurious candidate. It can never leak.

- **Search is answered over filtered text only.** For each candidate file: the whole-file directive is resolved first, then the inline blocks the session may not see are removed, and only the text that survives is matched, ranked and quoted. This is the same filtering the rendered page performs, reached through the same implementation — `hasSomeRoles` is reused, never re-stated. A search that decided visibility for itself would be the second implementation that `corpus-index` and `role-resolution` were written to prevent, except that this one would drift silently instead of visibly.
- **Substring matching**, case-insensitive. No stemming: German compounds make stem-based matching worse here, not better, and a reader searching `Vererbung` should find `Vererbungshierarchie`.
- **Incremental**, as the reader types, debounced. Every keystroke is a fresh authorization.
- **Ranking puts headings and file names above body text.** A hit in a file name or in a heading outranks a hit in a paragraph.
- **A result is a document.** It carries the document's name and path, and it can be expanded to the list of headings inside it that contain hits. The reader either opens the document or clicks one of those headings and lands on it.
- **A new authenticated route** serves queries; the search UI lives next to the navigation tree.
- **A result always opens the page view.** The print and presentation renderings are two other ways of displaying the same Markdown source, selected by query parameter — not separate content and not separate search targets. So the corpus is searched once, a hit belongs to the file rather than to one of its renderings, and following it is always a scroll to a heading, never a slide index.
- **A hit is jumped to after the page is revealed, by the script that already does this.** Linking *to a document* already works — `preReplaceObsidianFileLinks` resolves `[[wiki-links]]` to absolute URLs, and ordinary Markdown links are passed through untouched. What does not work is landing on a *position inside* a document: `makeContentMap` (`obsidian.js:1165`) assigns a fresh `uuidv4()` to every heading on every render, so a heading's `id` is only valid within the render that produced it.

  The fix is not to make those ids stable. A native `#fragment` would not work here anyway, and the reason is written into `page-bootstrap`: a page view is served with its body hidden, and *"a hidden body has no scroll height, so scrolling it would land at the top"*. The browser resolves a fragment during load, while the body is still hidden. That is the same problem the hot-reload path already solved — `window.safeLearnRestorePosition` (`obsidian.js:1967`) is called by the view's owner immediately after the reveal, in the same task, so the browser paints once and the first frame the reader sees is already at the right position.

  A search result therefore carries **which heading**, not which anchor, and the jump is a second caller of that same pattern. The heading is identified by its text plus its occurrence within the document, because a corpus of exam questions repeats headings like `## Question` and `## Answer`. The occurrence is counted over the *filtered* content, which is the content the same session is about to be served. This also disposes of the fixed-header offset that `obsidian-page.js` currently corrects after the fact with a `hashchange` listener and a `scrollBy(0, -50)`: a jump performed in script applies the offset instead of repairing it.

  A jump target names nothing the reader may not see, and a hand-written one cannot be used to probe: the script searches the rendered DOM, which is already filtered, and a target that is not there is a silent no-op — indistinguishable from a target that is there but empty.

**Leak rules, stated as rules because each one is a channel that has to be closed separately:**

- No result reveals a file the session may not see — not its content, not its name, not its path, not its existence.
- No snippet contains text from a block the session may not see.
- Any count shown is a count of what is shown. There is no global hit count and no "N more", because the difference between them is a measurement of the hidden corpus.
- No query suggestion, completion or correction is derived from content the session may not see. This is the channel that arrives free with most search libraries and leaks a vocabulary.
- A match never spans the place where a hidden block was cut out. Removing a block makes its neighbours adjacent, and a substring found across that seam is a match on text that never existed.

**Why an index keyed by roles is not an option**, recorded here so it is not re-proposed: the audience of a block is not a role set but a predicate over roles, the current time, and three per-user view preferences. `#practice` is defined in `role-resolution` as the exact complement of `#exam` — switching a privilege *on* removes content. The system is not monotone, so a filter of the form "the roles this session holds intersect the roles this document allows" cannot express it. `#exam`, `#practice` and `#answer` together account for 274 of the corpus's 544 directives.

**Out of scope:** searching attachments (the corpus holds a PDF, a docx, 30 images), fuzzy or typo-tolerant matching, phrase operators, and any ranking signal beyond heading/file-name weighting. Shipping the filtered corpus to the browser for client-side search was considered and rejected: it is leak-free, but it hands every reader a complete offline copy of everything they may see, which is the thing the server-side rendering exists to prevent.

## Capabilities

### New Capabilities

- `corpus-search`: what a search may return and what it may never reveal — that results are derived from filtered content through the existing permission implementation, that matching is substring and case-insensitive, how headings and file names are weighted, the document-with-expandable-headings shape of a result, each of the leak channels above closed by name, and that following a hit lands on the heading it was found under, applied after the page is revealed rather than through a document anchor.

### Modified Capabilities

- `corpus-index`: what a scan puts in the index grows. Today it holds per-file metadata and the whole-file directive, read as a single line and carried forward by modification time. To answer which files are worth opening, the index additionally holds the file's text and the boundaries of its inline `@@@` blocks with their parsed directives — offsets and parsed directives, never a decision about who may see them. The existing requirement that a scan reads only what changed continues to hold, and the existing rule that content is handed over only after reading the file is what makes this safe rather than a second source of truth.

`role-resolution` is deliberately **not** modified. The search reuses it exactly as the rendered page does.

## Impact

**Depends on** `resolve-the-session-once-per-request`. Without it, one incremental query costs roughly 540 Keycloak `/account` requests, and every keystroke costs another.

**Code**

- `obsidian.js` — `scanFiles` and the index entry shape; the block-filtering pass is reused, not duplicated. `makeContentMap` is **not** touched, and neither is the form of a heading's `id`.
- `app.js` — the search route, authenticated like every other route.
- `obsidian-page.js`, `css/` — the search field next to the tree, the result list, the expand affordance; and the jump, alongside the existing reveal-then-restore sequence. The `hashchange`/`scrollBy(0, -50)` correction at the top of the file stays for hand-written hash links.
- `utils.js` — untouched. That is the point.

**Risks**

- The jump rides on the reveal sequence `page-bootstrap` governs, which is already load-bearing and already has two callers racing to reveal first. A third participant in that sequence has to leave the existing guarantee intact: the page is painted once, already in position.
- A heading is addressed by text and occurrence, so a document that is edited between the search and the click can land the reader on a neighbouring heading of the same name. That is a wrong scroll offset, never a wrong permission — but it is the failure mode to expect, and it argues for making it a silent miss rather than a guess.
- Incremental search re-authorizes per keystroke. The debounce interval is a real security-relevant parameter, not only a UI one, because it sets how fast a reader can probe.

**Verification**

- `npm test` drives the Puppeteer harness against the shared demo accounts of the Keycloak demo realm, and the `md/` demonstration corpus is the source of the checks (`content-verification`). The leak rules need cases there, one per channel: a student searching a term that occurs only in a `@@@ teacher` file, only in a `@@@ teacher` block, and only in a block addressed to another person by name — each of which must return nothing, and must return nothing in a way that does not distinguish itself from a term that occurs nowhere.
- The teacher/student toggle is the sharpest test available: the same session, the same query, and the result set must change exactly as the rendered pages do.
