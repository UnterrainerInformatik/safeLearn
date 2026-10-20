Source: AI/open-proposals.md

## Why

The screenshot run of 2026-10-20 surfaced three display defects in the page chrome and the exam module. All three are visible on the teacher pages the last changes added (`/admin/*`, `/exam/*`, the gradebook), and one of them is not cosmetic: the sidebar's **Content** list is a single process-wide value, so a page without headings of its own shows the headings of whatever page *any* reader rendered last — including headings of sections that reader was permitted to see and the current one may not be.

## What Changes

- **The sidebar's Content list belongs to the page it is drawn on.** A corpus page lists its own headings, always, even while other readers' pages are being rendered at the same time. A page that has no rendered corpus content (the admin pages, the exam module's pages) shows no Content section at all instead of a stale one.
- **Table headings of the exam module show names as they were written.** A test called "Quiz: HTTP and databases" appears as exactly that in the gradebook's column head and in every other module table. Tables an author writes in Markdown keep their capitalised headings as today.
- **The ☰ button folds the sidebar at every width.** Above 1024 px the button now folds the navigation column away and the content takes the freed space (the wide module pages run to the left edge, the reading column centres itself); a second click brings it back. Below 1024 px nothing changes: the column stays an overlay the button opens and closes. The folded state is not remembered across page loads; every page opens with the column shown on desktop, as today.

## Capabilities

### New Capabilities
- `page-navigation`: the sidebar of the page view — its Content list reflecting only the page it is drawn on, and the ☰ button showing and hiding it at every viewport width.

### Modified Capabilities
- `gradebook-sheet`: adds that the module's table headings show names and labels as they were entered, unaltered in case.

## Impact

- `obsidian.js`: the module-level `contentMap` goes; the heading list is produced per render and carried with the request to `wrapInPage`/`getSideBar`, which omit the Content section when there is none. `scanFiles` no longer resets it.
- `app.js`: `render` hands the heading list on with the request (no change to what is sent).
- `obsidian-page.js`: `toggleSidebar()` distinguishes the overlay (≤ 1024 px, unchanged) from folding the column (> 1024 px).
- `css/sidebar.css`, `css/markdown.css`, `css/exam.css`: a folded state for the column and the content's padding; an opt-out from `text-transform: capitalize` for `.sl-exam-table` headings that outranks the `#markdown-content table th` rule.
- Tests: harness checks in `test/checks/navigation.js` (Content list per page, none on module pages, fold at desktop width) and `test/exam-gradebook.test.js` (column head case). The existing 390 px burger check in `test/checks/legibility.js` must stay green.
