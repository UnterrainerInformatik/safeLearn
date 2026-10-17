## 1. Shared resolution and extraction

- [x] 1.1 `obsidian.js`: extract `resolveAttachment(name)` from `replaceObsidianImageLinks` (strip `md/` and `/md/`, basename via `filesMap`, full-path disambiguation, `null` otherwise). The renderer calls it and renders exactly as before (design.md, decision 2)
- [x] 1.2 `obsidian.js`: `extractAttachmentReferences(markdown)` returns `{ raw, kind, offset }` for `![[…]]` (without the `|size` suffix), Markdown images and links with a relative or `/md/` target, and raw `img`/`video`/`audio`/`source`/`a` attributes into `/md/`. Ignores external URLs and `.md` targets. Skips fenced and inline code
- [x] 1.3 Relative targets are resolved against the referencing file's folder, normalized, and rejected if they escape `md/` (design.md, decision 7)
- [x] 1.4 Unit tests for both: embed with and without size, ambiguous basename gives `null`, relative path, `/md/` absolute path, external URL ignored, reference inside a code block ignored, `..` escape rejected
- [x] 1.5 `replaceObsidianImageLinks` leaves embeds inside `<pre>` and `<code>` as text, as Obsidian does, so renderer and extractor agree on code (design.md, decision 2). Unit test, plus a fixture in `md/test-attachments.md` that the content check walks

## 2. Index

- [x] 2.1 `readCorpusFile` adds `references` to the entry. `scanFiles` carries it forward with the rest of an unchanged entry
- [x] 2.2 After every scan, build the reverse map `attachmentPath → Set<mdFullPath>` from all entries through `resolveAttachment`, using the fresh `filesMap` (design.md, decision 3)
- [x] 2.3 From the same pass, build the unreferenced list: attachments in `filesMap` that the reverse map does not hold, sorted, relative to `md/`. Replace the held `{ scannedAt, paths }` as a whole (design.md, decision 5a)
- [x] 2.3a Log one `[Attachments] unreferenced: <path>` line per entry, then the count line, after the initial scan and after every automatic scan. Each line ends in a newline
- [x] 2.3b Export `unreferencedAttachments()` from `obsidian.js` for a later admin page. No route in this change
- [x] 2.4 Bump `grantEpoch` at the end of every scan and from the callback `registerVisibilityChangeCallback` already drives (design.md, decision 4)

## 3. Decision

- [x] 3.1 `obsidian.js`: `mayServeAttachment(req, path)` takes the candidates from the reverse map. For each it reads the file, applies `resolveFileVisibility`, runs `filterForbiddenSegments`, extracts and resolves the references of the surviving segments, and answers `true` at the first match. Concurrent, the `answerFromFile` pattern (design.md, decision 1b)
- [x] 3.2 Grant store on the session: `recordAttachmentGrants(req, html)` scans a sanitized body for same-origin `/md/` non-`.md` URLs in `src`/`href`/`poster` and records `{ expiresAt: now + 10 min, epoch }`. It prunes expired entries on write. `hasAttachmentGrant(req, path)` checks for a grant that has not expired and carries the current epoch
- [x] 3.3 `app.js` page handler: after `sanitizeAndParseMarkdown` returns for a corpus file, in all three views (page, `?document`, `?reveal`), call `recordAttachmentGrants` with the body. No other renderer call records grants. If `/convert` still exists when this lands, it records none (design.md, decision 5)
- [x] 3.4 `app.js` `POST /userattributes`: drop the session's grants after a successful write

## 4. Gate

- [x] 4.1 `app.js`: `attachmentGate` mounted on `/md` directly before `express.static`. It serves when a grant exists or `mayServeAttachment` answers yes. Otherwise it skips the static mount, so the catch-all answers as for a missing file (design.md, decision 6)
- [x] 4.2 Responses the gate lets through carry `Cache-Control: private, no-cache`
- [x] 4.3 Update the comment block above the static mounts in `app.js`, which says that what is left of the corpus under `/md` is served to anyone

## 5. Verification

- [x] 5.1 Fixture pages in `md/` for the harness: one attachment on an unrestricted page, one only in `@@@ teacher`, one in teacher, `4bhif` and unrestricted places, one only in a closed time window, one only in an exam-view block, one with an ambiguous basename, one unreferenced
- [x] 5.2 `test/checks/`: a new `attachments.js` check with the test teacher and the test student, covering every scenario of `specs/attachment-access/spec.md`. This includes refused versus missing (same status, headers apart from dates, and body), the teacher in student view after toggling, and `Cache-Control` on a served attachment. Probe "only the corpus grants" with `POST /convert` only if that route still exists when this lands. Otherwise cover it in the unit tests for `recordAttachmentGrants`' single caller
- [x] 5.3 Content check: for both test sessions, render every corpus page, collect the `/md/` attachment URLs of its body, and assert that each is served **with grants switched off**. This keeps the extractor and the renderer in step (design.md, risks)
- [x] 5.4 `test/checks/deployment-surface.js`: adapt the "a page's own assets are retrievable" check to the split scenarios of the modified requirement
- [x] 5.4a Unit tests for the report: a fixture corpus with two unreferenced attachments yields both paths sorted, the count line and `scannedAt`. Adding a referencing page and rescanning drops the path. Every path in the list is refused by the gate
- [x] 5.5 `npm test` green, apart from the known directory-service failures (see `AI/memory/directory-service-credentials-invalid.md`)

## 6. Documentation

- [x] 6.1 `docs-permissions.md`: attachments are as visible as their most visible reference, unreferenced ones are not served, and visibility changes take up to 10 minutes without autoscan
- [x] 6.2 `AI/architecture.md`: the route table entry for `/md`, the index entry's new field, the grant store in "Security-relevant observations", and the `getPermissionContext` comment about images, which is no longer true for a request without a grant
- [x] 6.3 After the production sync, compare the logged unreferenced count against the 399 from 2026-10-17 and note it in the change. Hand Gerald the logged list as the starting point for cleaning out the repository
  - Result 2026-10-17, first scan of the container built from 7cf98dc: `[Attachments] 560 unreferenced attachment(s)`. The log counts paths, the proposal counted names: the 560 paths carry 402 distinct names, against the 399 from the proposal. The difference is the same file name in several exercise folders, plus `.obsidian/` config files, which the scan now treats as unreferenced too and therefore no longer serves.
  - Breakdown by path: 426 under `exercises/POSE3OO/`, 16 under `presentations/Security & Keycloak/`, 14 under `.obsidian/`. By type: 312 `.java`, 98 `.png`, 41 `.gitignore`, the rest small (`.txt`, `.json`, `.xml`, `.csv`, `.sh`).
  - The full list was handed to Gerald outside the repository, because this repository is public and the list names files from the private corpus.
