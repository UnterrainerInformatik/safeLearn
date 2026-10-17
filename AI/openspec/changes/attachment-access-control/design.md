## Context

See proposal.md, "Why", for the motivation. The current state that shapes the approach:

- **Every attachment lives under `md/`** and is reached through `app.use("/md", checkAuthenticated, express.static(...))` in `app.js`. `.md` requests never get there, because the page handler before it answers every path ending in `.md`.
- **How pages reference attachments.** In the production corpus almost every reference is a wiki embed, `![[name]]` or `![[name|300x200]]`. `replaceObsidianImageLinks` (`obsidian.js`) resolves the embed by basename through `filesMap`. Where a basename exists more than once (76 times in production), it needs the full path or emits nothing. The output is an `<img>`, `<video>`, `<audio>` or `<a>` with an absolute URL `serverUrl/md/<path>`. Plain Markdown images and links and raw `<img src>` occur only in the test corpus (`![…](/md/assets/test-local-image.jpg)`), but marked renders them just as well. Wiki *links* `[[x.pdf]]` resolve against `mdFilesMap` only, so they never address an attachment.
- **The rendered body is the session's view.** `sanitizeAndParseMarkdown` (`app.js`) applies the whole-file directive and `removeForbiddenContent`, runs marked and `manipulateHtml`, then DOMPurify. Every attachment URL in its output is one the session was just allowed to see. The page view, the document view (`?document`) and the Reveal view (`?reveal`) all go through it. So does `/convert` while it exists. Its input is not part of the corpus, and the change `remove-convert-route` removes it.
- **The index already holds what a re-decision needs.** `readCorpusFile` keeps each file's text, its whole-file directive and its `@@@` block boundaries. `answerFromFile` (search) shows the pattern: candidates from the index, then read the file, `resolveFileVisibility`, `filterForbiddenSegments`, and decide only from what survives.
- **A permission question costs a Keycloak call.** `getPermissionContext` is lazy and built at most once per request, but building it calls `fetchAccount`, an uncached lookup for the view preferences. Its comment states explicitly that an image request "pays for no lookup at all". Deciding every image request from scratch would turn one lookup per page view into one lookup per page view plus one per attachment on it.
- **Sessions are in process memory** (`deployment-surface`), on a single instance.
- **Time windows** are watched by `runVisibilityChecks`, which calls the callback registered through `registerVisibilityChangeCallback` whenever a window opens or closes anywhere in the corpus.

## Goals / Non-Goals

**Goals:**
- The rule in `specs/attachment-access/spec.md`, decided by the same block filtering the renderer uses, never by a second copy of the rule.
- Ordinary page views cost no more Keycloak lookups than today.
- A shared or bookmarked attachment URL keeps working for a session that may see a referencing place but has not just rendered it.

**Non-Goals:**
- `/assets`, `/css`, the single-file routes and fonts. Their allowlist stays as it is.
- Making a leak through the *contents* of a visible page impossible. A session that may see a place sees the attachment, and the rule is meant that way.
- Byte-range or streaming changes for video. `express.static` keeps serving the file once the gate has let the request through.
- Tier 1 (`AUTH=none`). It inherits the rule, and the anonymous-session question belongs to that change.

## Decisions

### 1. Two paths to a yes: a render-time grant, or the full decision

An attachment request is served when either path says yes. Both are needed.

**(a) Grant.** When the page handler renders a **corpus file** for a session, it scans the sanitized body it is about to send for same-origin URLs under `/md/` that are not `.md` (`src`, `href`, `<source src>`, `poster`). It records each in the session as a grant `{ path → { expiresAt, epoch } }`. An attachment request whose path holds a live grant is served without building a permission context, so the common case, a page loading its own images, costs nothing extra. The grant is exactly right by construction: the browser requests what the session was just shown, nothing more.

**(b) Full decision.** No live grant means: look up the referencing files for the requested path in the index, then for each candidate read it, apply `resolveFileVisibility`, run `filterForbiddenSegments`, extract the references from the surviving segments with the shared extractor (decision 2), and resolve them. Served if any resolves to the requested path. Candidates are decided concurrently and stop at the first yes. This costs one context build, so one Keycloak lookup, and it is the path a bookmark, a shared link or an expired grant takes.

*Alternatives considered:*
- *Full decision only.* Simplest, but a page with 20 images costs 21 Keycloak lookups instead of one, and it contradicts what `getPermissionContext` promises about images. Rejected.
- *Grants only.* No Keycloak cost ever, but any URL not rendered within the last few minutes breaks, including a link to a PDF a student opens later from their notes. Rejected.
- *Cache the permission context per session across requests.* Fewer lookups everywhere, but it changes `role-resolution`'s "the evaluation context is fixed for the duration of a request" and the freshness of preferences for every route. Too broad for this change.
- *Signed URLs* (HMAC over path and expiry in the query). Works without a session, which tier 1 might like, but it leaks grants through copied URLs and logs, and it changes every rendered URL. Rejected for now. Tier 1 can revisit.

### 2. One resolver, one extractor

The attachment resolution inside `replaceObsidianImageLinks` (strip `md/` and `/md/`, basename lookup in `filesMap`, full-path disambiguation, otherwise nothing) moves into `resolveAttachment(name)`. The renderer and the index both call it, so "resolves the way it renders" holds by construction.

`extractAttachmentReferences(markdown)` returns `{ raw, kind, offset }` for `![[…]]` (minus the `|size` suffix), Markdown images and links whose target is a relative or `/md/` path, and raw `<img|video|audio|source|a>` attributes pointing at the same. Relative targets are kept relative and resolved against the referencing file's folder, which is what the browser does against the page URL `/md/<folder>/<page>.md`. External URLs and `.md` targets are ignored.

*Over-approximation, accepted:* the extractor works on Markdown text, so a `![[x.png]]` inside a code block counts as a reference. That can only make an attachment servable to a session that may already see the place that mentions it, so the rule is not loosened in a way the spec cares about. Making the extractor code-block-aware is cheap, though, and the task list includes it.

### 3. What the index holds

`readCorpusFile` adds `references: extractAttachmentReferences(text)` to the entry. It is carried forward with the rest when the mtime is unchanged. After every scan, `scanFiles` builds a reverse map `attachmentPath → Set<mdFullPath>` by running `resolveAttachment` over every entry's references. This uses the fresh `filesMap`, so an attachment added between scans is picked up without reopening pages (`corpus-index` scenario). The map holds paths only, no conclusion. The same pass counts the attachments in `filesMap` with no entry in the reverse map and logs that number once (`attachment-access`, "The scan reports…"). Files under `md/` that `scanFilesInternal` records as fonts are attachments like any other, but they are served from `/assets`, so they are out of scope.

### 4. Grant lifetime and invalidation

A grant lives for **10 minutes** at most. It is also dropped:
- for **all sessions**, when a scan completes or a time window changes visibility. Both bump a global `grantEpoch`, and a grant from an older epoch is treated as absent. No session walk is needed, because the in-memory session store is not enumerated.
- for **one session**, when it writes its preferences (`POST /userattributes`). Switching between teacher and student view or toggling the exam view must not leave grants from the other view behind (`attachment-access`, "A teacher in student view").

After invalidation, the next request falls through to the full decision, which reads the files, so a dropped grant never denies a session something it may see. The 10 minutes bound the one case nothing invalidates: an edit that tightens a reference on a deployment with automatic scanning switched off. That bound is what `attachment-access` states.

*Alternative:* invalidating grants per file on scan (only those whose page changed). This would need a reverse map per session. The global epoch costs one fallback per attachment after a scan, which is cheap and rare. Rejected as unnecessary.

### 5. Non-corpus Markdown issues no grant

Grants are recorded by the corpus page handler only, after `sanitizeAndParseMarkdown` returns for a file read from `md/`. No other caller of the renderer records any. The full decision reads candidates from the index only, which holds corpus files only. Markdown from outside the corpus can therefore not contribute a reference by either path. The one such caller today is `/convert`, which `remove-convert-route` deletes. Both orders of landing are safe: if this change lands first, `/convert` simply records no grant. If the removal lands first, there is nothing left to exclude, and the rule stays as a guard for later renderers.

### 5a. The unreferenced report

The reverse map built after every scan (decision 3) already decides which attachments are unreferenced: those in `filesMap` with no entry in it. The same pass produces the report, so the report and the gate's verdict come from one computation and cannot drift apart.

- `unreferencedAttachments()` in `obsidian.js` returns `{ scannedAt, paths }`, with `paths` sorted and relative to `md/`. It is replaced as a whole after each scan, never mutated in place, so a reader always sees one scan's complete result.
- The scan logs one line `[Attachments] unreferenced: <path>` per entry, then `[Attachments] <n> unreferenced attachment(s)`. Every line ends in `\n`, because `docker logs` holds back output without a newline (see `AI/memory/docker-logs-newline-buffering.md`).
- The log names corpus file paths only. They are part of the repository anyway. No session, no person, no role.
- A later teacher admin page reads `unreferencedAttachments()`. That page, its route and its gate are a backlog entry ("Admin-Seiten für Lehrer im Menü"), not part of this change.

*Alternative:* log only on the initial scan. Rejected: with autoscan on, the WYSIWYG author is the one who cleans up, and they see the list shrink as they work.

### 6. Where the gate sits, and what a refusal looks like

A middleware `attachmentGate` is mounted on `/md` directly before the existing `express.static`. A request for a path with no live grant and no yes from the full decision calls `next("route")`-equivalent, i.e. skips the static mount and lands in the catch-all redirect to the start page. That is exactly what a missing file gets today (`deployment-surface`, "indistinguishable"). The gate sets `Cache-Control: private, no-cache` on what it lets through, so the browser revalidates with its ETag instead of re-downloading, and no shared cache stores it. Mermaid and PlantUML output is inline, and the hot-reload stream is not under `/md`, so neither is affected.

### 7. Paths are compared in one normal form

Grants, the reverse map and the request are all compared as the decoded, `/`-separated path relative to `md/`. The request path is decoded once and rejected if it contains `..` after normalization. Today `express.static` does that rejection, but the gate now decides before it does.

## Risks / Trade-offs

- [A reference shape the extractor does not know, so a rendered image breaks for a session that should see it] → The content check renders every corpus page for the test teacher and the test student and asserts that every attachment URL in each body is served by the **full decision** with grants switched off. If the grant path and the full decision ever disagree, that check finds it.
- [Grants grow a session's memory] → Bounded by the number of attachments in the corpus (806 names in production). Expired entries are pruned whenever a grant is written.
- [10 minutes of staleness after a tightening edit with autoscan off] → Documented in `attachment-access`. On deployments with automatic scanning (the WYSIWYG container sets it, production takes it from the `AUTOSCAN` secret, default `false`), the scan's epoch bump makes it immediate. Without it, a deployment's content only changes on redeploy, which restarts the process and drops every session and grant anyway.
- [The rollout makes 399 production attachment names unreachable, among them possibly files someone links from outside] → Intended. The scan logs the count, and the release notes say so. A file that should stay reachable gets a reference on a page with the right restriction.
- [The fallback costs a Keycloak lookup per attachment request without a grant, e.g. right after a scan] → One lookup per attachment, once per epoch and session. Today that page view costs one lookup anyway.
- [Range requests for video re-run the gate] → They hit the grant, so the cost is a map lookup.

## Migration Plan

1. Ship to safeLearn with the harness green, then sync to secureLectures in the usual order.
2. Check the production log after the first scan for the unreferenced count. It should be near 399 against the 2026-10-17 corpus.
3. Rollback is reverting the commit. No data is migrated, and grants live in memory only.
