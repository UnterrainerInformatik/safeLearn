## 1. Content list per request

- [x] 1.1 In `obsidian.js`, make `makeContentMap(html, req)` store the heading list on `req` and `getContentListing(req)` read it from there, escaping each heading text with `escapeHtmlAttribute` (design D1, D2); pass `req` through `manipulateHtml`. Verify: `git grep -n contentMap` shows no module-level variable, export or reset in `scanFiles()` any more.
- [x] 1.2 In `getSideBar()`, omit the Content title and list when `req` carries no heading list. Verify: `/exam/gradebook` and `/admin/attachments` render without `.sidebar-title-content`/`.sidebar-anchors`, a corpus page still with them.
- [x] 1.3 Add harness checks to `test/checks/navigation.js`: (a) a corpus page with headings, then a module page in the same session → no Content section and none of those headings; (b) two different corpus pages requested concurrently (`Promise.all`) → each page's Content list matches its own `h1–h6` ids; (c) a heading containing `&lt;b&gt;` appears as text, not markup. Verify: the new checks fail on HEAD and pass after 1.1–1.2.
- [x] 1.4 Check the permission case with a corpus page that has a teacher-only section: the student's Content list omits that heading (extend an existing fixture in `md/` only if none exists). Verify: a harness check in `test/checks/permissions.js` or `navigation.js`.

## 2. Module table headings keep their case

- [x] 2.1 In `css/exam.css`, replace the two ineffective `text-transform: none` rules (`.sl-exam-sheet .sl-exam-column-head`, `.sl-exam-sheet .sl-exam-category`) with `#markdown-content .sl-exam-table th { text-transform: none; }` (design D3). Verify: the computed `text-transform` of a gradebook column head is `none`, and that of a Markdown table's `th` on a corpus page is still `capitalize`.
- [x] 2.2 Add a browser check to the gradebook checks in `test/exam.test.js`: a test or column named "Quiz: HTTP and databases" shows that exact `innerText` in its column head. Verify: fails on HEAD, passes after 2.1.

## 3. ☰ folds the sidebar on desktop

- [x] 3.1 In `obsidian-page.js`, split `toggleSidebar()` by `matchMedia("(max-width: 1024px)")`: the overlay path stays as it is, otherwise toggle `sl-sidebar-folded` on `#wrapper`; the burger rotation runs in both (design D4). Verify: one click at 1600 px changes what is visible.
- [x] 3.2 In `css/sidebar.css` (inside `@media (min-width: 1025px)`), style `#wrapper.sl-sidebar-folded #sidebar` as folded (`max-width: 0`, `padding: 0`, `opacity: 0`, `overflow: hidden`, existing transitions) and set `#markdown-content` padding-left to 0 and `.sl-wide` to 20 px. Make the ☰ button visible at every width (`.topbar-burger` was `opacity: 0` above 1024 px in `css/topbar.css`; the `opacity: 1` override in `css/media.css` goes). Verify: at 1600 px after one click the sidebar's width is 0, the gradebook table's left edge is ≤ 30 px, a reading page's column is centred (left and right gaps within 2 px).
- [x] 3.3 Add a harness check (in `test/checks/legibility.js` beside the 390 px one, or `navigation.js`) at 1600 px: fold, check widths as in 3.2, click again and check the sidebar is back at its width; then load another page and check it opens unfolded. Verify: the new check passes and the existing 390 px burger check in `legibility.js` still passes unchanged.

## 4. Whole suite and bookkeeping

- [x] 4.1 Run `npm test` and confirm it is green. Rerun known flaky checks (reload backoff, 390 px viewport, individual exam-harness checks) once before treating them as failures.
- [x] 4.2 Take a screenshot of the gradebook at 1600 px with the sidebar folded and of `/admin/directory` (no Content section) for review.
- [x] 4.3 Remove the three "Darstellungsfehler" entries from `AI/open-proposals.md` when archiving (the change carries `Source: AI/open-proposals.md`), and update `AI/architecture.md` where it describes the sidebar or the `contentMap`. Verify: `grep -n "Darstellungsfehler" AI/open-proposals.md` is empty after the archive.
