Source: AI/open-proposals.md

## Why

Markdown in `md/` never leaves the server raw: every `.md` is rendered and filtered against the session's roles before anything is sent. The files a page embeds do not get that treatment. `app.use("/md", checkAuthenticated, express.static(...))` hands any attachment in the corpus to any logged-in session that knows its path. A picture or a PDF that only appears inside `@@@ teacher` is therefore one URL away from every student, and the URL is not hard to guess: Obsidian names pasted images `Pasted image <timestamp>.png`, and the neighbouring images on a visible page give the timestamp range away.

This is not hypothetical in the production corpus (secureLectures, counted 2026-10-17). It holds 806 distinct attachment names, 567 `![[…]]` embeds, and 399 attachment names that no page references at all. Among those unreferenced files are 244 `.java` files, most of them under `exercises/POSE3OO/*/final-code/`, that is, the solutions to the exercises. `md/assets/` also holds oral-exam protocols and assessment templates. All of them can be fetched today by anyone with a session.

Two things make this the right moment. The planned operating tier 1 (`AUTH=none`, see `AI/exam-module-plan.md`, section 3) would publish the same mount with no login in front of it at all, so this has to be closed before that tier exists. And the rule a teacher expects is already settled: an attachment is as visible as the most visible place it is used.

## What Changes

- An attachment under `/md` SHALL be served only to a session that may see **at least one** place in the corpus that references it. A place is visible when the session may see its file (the whole-file directive, its time windows included) and the `@@@` block around the reference, if there is one (its roles, time windows and the view pseudo-roles `#exam`/`#practice`/`#answer`, after the student-view downgrade). An image that sits on a teacher page, in a `4bhif` block and on an unrestricted page is therefore served to everyone. One that sits only on the teacher page is served to teachers only.
- An attachment that no page in the corpus references SHALL NOT be served. **BREAKING** for anyone who links such a file from outside the corpus, for example a bookmark to a `final-code` solution. That is the intended effect.
- A refused attachment SHALL be answered exactly like a path where no file exists, so a refusal does not confirm that the file is there.
- The corpus index SHALL record, for every Markdown file, the attachments it references and where in the file each reference sits. The record is rebuilt by the same scan, initial or automatic, that rebuilds the rest of the index, and is carried forward for unchanged files like the rest of the entry.
- A reference SHALL be resolved to a file the same way the renderer resolves it, through one shared implementation. In particular, a `![[name]]` whose basename exists in several folders and that does not name a full path resolves to nothing, as it renders to nothing today.
- Only corpus files SHALL make an attachment servable. Markdown from any other source must not, since anything a session writes into it could otherwise name any attachment. Today that source is `/convert`, which the separate change `remove-convert-route` removes. The rule holds whether that change lands first or later.
- After every scan, initial or automatic, the application SHALL log the unreferenced attachments: one line per path and one with the count, so they can be removed from the repository. The same list SHALL be held in process with the time of its scan, ready for a later teacher admin page (a backlog entry in `AI/open-proposals.md`, not part of this change).
- Attachment responses SHALL be marked as private to the requesting browser, so that no shared cache hands an attachment one session was allowed to see to another.

## Capabilities

### New Capabilities

- `attachment-access`: which session is served which attachment under `/md`. Covers the at-least-one-visible-reference rule, unreferenced attachments and their report, the shape of a refusal, the exclusion of non-corpus Markdown, and caching.

### Modified Capabilities

- `deployment-surface`: "Only the files a page needs are served as static assets". Its first scenario says an image a rendered page references is served. That becomes conditional on `attachment-access` for the `/md` mount. Stylesheets, fonts, icons and the client script under `/assets`, `/css` and the single-file routes are unchanged.
- `corpus-index`: "The index holds what is needed to choose candidates, and no decision" now also holds each file's attachment references with their positions. As with blocks, it records the references as written and no conclusion about who may see them. The decision to serve an attachment still reads the referencing file.

## Impact

- **`obsidian.js`:** `readCorpusFile`/`scanFiles` derive and carry each file's references. The attachment resolution inside `replaceObsidianImageLinks` (basename via `filesMap`, full-path disambiguation) moves into one function that both the renderer and the index call. Plain Markdown images and links (`![](…)`, `[…](…)`) and raw `<img src>` pointing into `/md` are recognised as references too, with relative paths resolved against the page's URL as a browser resolves them. A new attachment decision reuses `resolveFileVisibility` and `filterForbiddenSegments`, the way `answerFromFile` does for search.
- **`app.js`:** the `/md` static mount is preceded by the attachment gate. A refusal falls through to the catch-all exactly as a missing file does.
- **Cost per request:** an attachment request resolves the session's permission context, which today costs one uncached account lookup at Keycloak. A page with 20 images would cost 21 lookups instead of one. `design.md` deals with this through grants recorded at render time, with the full decision as fallback.
- **Production corpus:** 399 attachment names become unreachable, deliberately. Every scan logs them by path plus their count, so the effect is visible in the log when the change ships, and the list is what to clean out of the repository.
- **Tests:** server harness (`test/`) for each case of the rule, run against fixture pages in `md/`, plus a content-verification check that every attachment a rendered page references is served to the session that rendered it.
- **Not affected:** `/assets` (fonts, logos), `/css`, the client script, PlantUML/Mermaid (rendered inline, no attachment), the Obsidian plugin.
- **Tier 1 (`AUTH=none`, own change):** the rule carries over unchanged, with `READER_ROLES` as the role set. Render-time grants need a session, so whether tier 1 keeps an anonymous session is for that change to decide. The fallback works without one.
