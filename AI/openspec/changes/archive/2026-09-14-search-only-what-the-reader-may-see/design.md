## Context

See `proposal.md` — Why. What matters for the approach is what already exists and what it costs.

The corpus is 1.41 MB across 279 files. Reading all of it from disk takes 15 ms; a substring pass over it takes under 1 ms against memory. The expensive part of a query is not string comparison but the permission checks — about 540 against the production corpus — which `resolve-the-session-once-per-request` has just made free of I/O.

Three pieces of existing machinery decide the shape of this:

- `scanFiles` (`obsidian.js:570`) already carries per-file data forward by modification time. `lastFilePermissions` maps a path to `{mtime, permissions}` and is rebuilt each scan from the files that scan actually read. `getPermissionsFor` (`obsidian.js:430`) opens a read stream and closes it after the first line.
- `removeForbiddenContent` (`obsidian.js:807`) filters inline blocks out of raw Markdown. It collects every `@@@` match, resolves them concurrently against one request context, and replaces each forbidden block with `""`. It is not exported.
- The reveal sequence `page-bootstrap` governs: the body is served hidden, one script reveals it, and `window.safeLearnRestorePosition` (`obsidian.js:1982`) is called by the revealer in the same task, so the browser paints once and the first frame is already in position. `makeContentMap` (`obsidian.js:1180`) assigns a fresh `uuidv4()` to every heading on every render, so no heading has an identity that survives a render.

## Goals / Non-Goals

**Goals:**

- Close each leak channel by construction rather than by a check that could be forgotten — in particular the seam channel, which no test would notice losing.
- Keep one implementation of the permission rules. The search reaches `resolveFileVisibility` and `hasSomeRoles`; it restates neither.
- Keep a query's cost proportional to the number of files that could match, not to the corpus.
- Leave `makeContentMap`, heading ids, and `utils.js` untouched.

**Non-Goals:**

- Stable heading identifiers. The jump is solved without them, and introducing them would change a rendering path this change has no other reason to touch.
- Rendering anything during a search. A result is derived from Markdown; nothing goes through Shiki, Mermaid or JSDOM to answer a query.
- Any index that answers a question about visibility. The index answers only "which files are worth opening".

## Decisions

### Filtering yields segments, and the seam never exists

`removeForbiddenContent` grows a sibling that returns the surviving passages **as a list** rather than joined into one string. `removeForbiddenContent` itself becomes the caller that joins them, so the rendered page is unchanged. The search matches within each segment separately.

This is the whole of the seam rule. A match cannot span a removed block because the two sides of a removal are never in the same string to begin with. The alternative — join first, then check whether a match straddles a recorded boundary — was rejected: it computes the leak and then suppresses it, so every future caller has to remember the check, and an off-by-one in the boundary arithmetic is a silent disclosure rather than a visible bug.

The segments carry their offset in the original file, so a heading can be located and a snippet quoted against the document as written.

### The index proposes with text, the answer reads the file

Two passes per query:

1. **Candidates.** A case-insensitive substring pass over the text the index holds, in memory. At 1.41 MB this is under a millisecond and touches no disk and no permission check.
2. **Answers.** Each candidate file is read from disk, its whole-file directive resolved through `resolveFileVisibility`, its inline blocks filtered through the segment function above, and only then matched, ranked and quoted.

Pass 2 is what makes pass 1 safe to be stale, and it is why the index may hold text at all. A file whose text has changed since the scan is proposed and then contributes nothing; a file that has become restricted is proposed and then refused. Neither outcome is distinguishable from a file that simply does not match.

Rejected: dropping pass 1 and reading all 279 files per query. It is only 15 ms, but it multiplies by every keystroke, and the saving pass 1 buys is not the disk read — it is the permission checks on files that cannot match.

Rejected: skipping pass 2 for files the index recorded as unrestricted. That is exactly the rule `corpus-index` exists to state, and the staleness window is precisely where it would fail.

### The index grows where it already carries forward

`lastFilePermissions` becomes `{mtime, permissions, text, blocks}`, where `blocks` holds each inline directive's boundaries and its parsed entries. The carry-forward condition is unchanged: same path, same mtime, reuse everything; otherwise derive it all from one read.

This replaces `getPermissionsFor`'s first-line stream with a whole-file read for files that changed, and both the directive and the block boundaries are parsed from that one read. A full scan therefore costs the 15 ms measured above instead of 279 one-line reads; an incremental scan costs one read per changed file. That is the price of the change on the scan side, and it is paid once per edit rather than per query.

`blocks` records what the file says — offsets and parsed directives — and never who may see it. Storing a decision there would be storing it for one session, which is what `role-resolution` forbids by making the answer depend on the request.

### A hit is located by counting headings in the filtered Markdown

The heading a match belongs to is found by scanning the filtered segments for ATX headings ahead of the match's offset, skipping fenced code blocks so a `#` inside a fence is not mistaken for one. The occurrence number is the count of same-text headings that precede it **in the filtered content** — which is the content that session will be served.

The client repeats the same count against the rendered DOM, where the headings carry `class="docanchor"` and the same text in the same order, filtered the same way. The two counts agree because both run over the same session's filtered document.

Rejected: rendering each result and using `contentMap`. It is the accurate way to get an anchor, and it costs a full Shiki/Mermaid/JSDOM render per result per keystroke.

### The jump is a third participant in the reveal, not a fragment

A result carries heading text and occurrence in the URL. A script runs immediately after `safeLearnRestorePosition`, in the same task as the reveal, finds the *n*-th `.docanchor` heading whose text matches, and scrolls to it applying the fixed-header offset rather than correcting it afterwards.

A native `#fragment` cannot work here: the browser resolves it during load, while the body is still hidden, and `page-bootstrap` records that a hidden body has no scroll height. The existing `hashchange` / `scrollBy(0, -50)` correction stays for hand-written hash links; the jump does not use it.

**Precedence against the restore.** The two never want to scroll to different places in the same load, except after a hot reload of a page that was opened from a search. There the reader has scrolled since, so the saved position wins: the jump runs only when no saved position is present, and the page saves position afterwards as it always does.

A target that is not found is a silent no-op — the page stays at its top. That is what makes a hand-written target useless for probing: absent and present-but-filtered-away look identical.

### The route

One authenticated `GET` route beside the existing content routes, taking the query and returning the result list. The client debounces; the server additionally refuses a query below a minimum length, because a one-character query returns most of the corpus and is the cheapest probe available.

## Risks / Trade-offs

- **A scan now reads whole files.** → 15 ms for a full scan of today's corpus, one read per changed file incrementally. Measured, not estimated; it grows by one school year per year.
- **The index holds the corpus text in memory.** → 1.41 MB. The same growth argument applies, and `architecture.md`'s "no database" property is what this size buys.
- **Server and client must count headings identically.** → Both count over the same filtered document, and both skip fenced code. A disagreement lands the reader on the wrong heading of the same name — a wrong scroll offset, never a wrong permission. The failure is made silent rather than approximate: no nearest-match guessing.
- **The jump joins a load-bearing sequence that already has two callers racing to reveal first.** → It hangs off the existing revealer in the same task rather than adding a new reveal path, and it does nothing when there is no target, so a page not opened from a search follows exactly the sequence it follows today.
- **Incremental search re-authorizes per keystroke.** → The debounce interval and the minimum query length bound how fast a reader can probe. They are security-relevant parameters, not only UI ones, and are named as such in the tasks.
- **A document edited between the search and the click** → the named heading and occurrence no longer resolve, and the reader lands at the top rather than at a guess.

## Migration Plan

No data model, no schema, no stored state. The index is rebuilt at startup, so a deploy carries the enlarged entries in on its first scan; nothing needs to be migrated or backfilled.

Rollback is removing the route and the UI. The index enlargement is inert on its own — it makes scans read more and changes nothing that anyone can observe — so it can stay behind if only the search surface needs to be withdrawn.

## Open Questions

- The debounce interval and the minimum query length. Both are numbers to settle by measuring against the production corpus once the route exists; neither changes the specs, the approach, or the task breakdown.
- Whether the result list shows a snippet per heading or one per document. The specs require only that a snippet contain no hidden text; the choice is a UI one to make against a real corpus.
