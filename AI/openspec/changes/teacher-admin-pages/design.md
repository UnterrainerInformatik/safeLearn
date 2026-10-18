## Context

Both pieces of data already exist in process and are read-only:

- `unreferencedAttachments()` in `obsidian.js` returns `{ scannedAt, paths }` from the last scan. Its comment already names "a later teacher admin page" as the reader it was built for; nothing serves it yet (`attachment-access`, requirement "Unreferenced attachments are reported so they can be removed").
- `getDirectoryStatus()` in `middlewares/directory-service.js` returns `{ fetching, phase, done, total, startedAt, entries, builtAt, skipped }` from memory. It is served only by `GET /api/admin/directory/status`, registered ahead of `checkAuthenticated` and gated by an introspected bearer token (`verifyCallerIdentity`), because its caller is the Obsidian plugin, not a browser.

The web app's teacher check for pages lives in the exam module (`exam/gate.js`: `actsAsTeacher` = `hasSomeRoles(req, ["teacher"], true)` plus `identityOf(req)`), but that module is loaded only with `EXAM_MODULE=on`. Pages outside the corpus are rendered with `wrapInPage(html, startPage, req, { title, wide })`. The settings menu is `getTopdownMenu(req)` in `obsidian.js`; it already branches on `hasSomeRoles(req, ["teacher"], true)` for the exam switch.

`publishing-without-keycloak` (open) splits route registration into `registerRoutes(app, identity)` and adds `AUTH=none`, where every reader holds `READER_ROLES` and has no session.

## Goals / Non-Goals

**Goals:**
- Two read-only pages and their two session routes, independent of the exam module.
- One gate, shared by pages, data routes and the menu, so the button and the page never disagree.
- Nothing disclosed beyond what the existing bearer route and the server log already disclose to the same audience.

**Non-Goals:**
- Deleting attachments from the page, or any write at all. The repository is the place to remove a file; the page only produces the list.
- Starting or forcing a directory fetch from the page (see Open Questions).
- Naming skipped directory records. They stay in the server log only.
- An admin-only tier of pages. Admin passes the teacher gate as everywhere else.

## Decisions

### D1: A small `admin/` module of its own, not part of the exam module

`admin/index.js` exports `registerAdminRoutes(app, { startPage })` and the gate; `admin/client/attachments.js` and `admin/client/directory.js` draw the pages; `GET /admin/assets/**` serves only `admin/client/`. The gate, `actsAsTeacherWithIdentity(req)`, is `hasSomeRoles(req, ["teacher"], true)` and a non-empty `preferred_username`, the same rule as `exam/gate.js`. To keep one rule in one place, `identityOf` moves from `exam/gate.js` to `utils.js` and both import it.

*Alternative: put the pages under `/exam/admin`.* Rejected: the directory status and the attachments have nothing to do with exams, and an instance with `EXAM_MODULE` off (most instances) would lose the pages.

### D2: Paths `/admin/...`, registered after `checkAuthenticated`

Pages `/admin/attachments`, `/admin/directory`; data `/admin/api/attachments`, `/admin/api/directory/status`. All are mounted after `checkAuthenticated` and before the catch-all, like `/exam`. A page refused by the gate calls `next("router")` and lands in the catch-all (like `teacherPage`), so it does not reveal itself; a data route answers `403 { error: "Forbidden" }`.

The new session status route answers with `getDirectoryStatus()` unchanged. The bearer route keeps its place ahead of `checkAuthenticated`. Two routes over one function, rather than teaching the bearer route to also accept a session: the bearer route is deliberately outside the session chain (see the comment at its registration), and mixing the two proofs in one handler would make its refusal shape depend on which proof was tried first.

### D3: Student view counts as student

The gate uses `allowOverride = true`, so a teacher in student view gets neither the menu section nor the pages. This matches the exam module and the top bar's graduation-cap button, so the student view stays a faithful preview of what students see.

### D4: Disclosure

- **Attachments.** The paths are corpus file paths; they are in the repository and already in the server log. They are shown to teachers only. A path can hint at content (a file name like `test-solutions-4bhif.pdf`), and an unreferenced file has no page whose permission could narrow its audience, so "teachers" is the narrowest audience available and the same one that maintains the corpus. Nothing is served: the page shows names, never file content, and the gate on `/md/**` still refuses every one of these paths.
- **Directory.** The page shows exactly `getDirectoryStatus()`. `skipped` is a count; the records behind it are not named, as the existing spec requires and as the plugin shows it today. No entry, no name, no class list appears on the page. No PII is added to any answer.

### D5: Polling only while a fetch runs

The directory page reads the status once, and while `fetching` is true repeats every 2 seconds (the plugin's interval), stopping as soon as `phase` is `idle`. The route reads memory only and never starts a fetch, so polling cannot provoke work. The attachments page reads once; it has no live state to follow, and a reload after a rescan is enough.

### D6: Menu section as buttons

`getTopdownMenu` draws, for a session passing the gate, a labelled group **Administration** with two `sl-button`s (icon + text), below the format choice and above the print buttons. They are navigations, but per Gerald's guideline actions in the menu are buttons, and the menu's other entries are buttons too. The rule is the same function the routes use, evaluated once per render.

### D7: Tier 1

The routes are registered inside the identity branch. Once `publishing-without-keycloak` lands, that is `registerRoutes`' `keycloak` path only; `none` mode never calls `registerAdminRoutes`, and `getTopdownMenu` checks the identity as well as the role, so `READER_ROLES=teacher` does not draw the section. Even if the routes were registered, the gate would refuse them in tier 1, because `identityOf` is null without a session. Whichever of the two changes is applied second wires this; tasks name both orders.

### D8: Page layout

Both pages use `wrapInPage` with `title` and `wide`. The attachments page draws one block per folder (folder as heading, its file names below, `overflow-wrap: anywhere`), with the count, the scan time and the **Copy paths** button in the head, visible without scrolling. The directory page is a two-column list of label and value with a progress bar while fetching. Styles go into a new `css/admin.css`, using `sl-button`.

## Risks / Trade-offs

- [A large list of unreferenced attachments (399 at the time of `attachment-access-control`)] → grouped by folder, plain text, no thumbnails; a few hundred lines render instantly.
- [`navigator.clipboard` is unavailable on a non-secure origin (plain `http://` other than localhost)] → on failure, the button selects a read-only `<textarea>` holding the list, so it can be copied by hand; the harness covers the normal path only.
- [Moving `identityOf` to `utils.js` touches the exam module] → a re-export from `exam/gate.js` keeps every import there unchanged; the exam harness runs in both module configurations.
- [The two status routes drift apart] → both call the same `getDirectoryStatus()` and a harness check compares their answers for a teacher.

## Migration Plan

No data, no configuration. Deploy as usual (safeLearn, then the sync into secureLectures). Rollback is reverting the commit; nothing persists.

## Open Questions

- A **Refresh directory now** button on the directory page would need a write route that starts a fetch, which today only start-up and the TTL do. Left out; can be added later without changing these pages' read-only requirements beyond a new one.
- Whether a third page (for example the realm's admin-event summary) belongs into the same section can be decided when one is asked for; the section takes more buttons without change.
