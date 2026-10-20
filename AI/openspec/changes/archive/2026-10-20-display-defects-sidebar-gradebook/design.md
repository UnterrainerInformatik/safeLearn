## Context

**Content list.** `obsidian.js` holds the heading list in a module-level `let contentMap`. `makeContentMap()` (called by `manipulateHtml()` inside `render()` in `app.js`) overwrites it on every render. `getSideBar()` → `getContentListing()` reads it later inside `wrapInPage()`. `render()` and `wrapInPage()` both await in between (`i18nOf`, `getTopBar`, the directory listing), so another request's render can overwrite it in that gap. Module pages (`admin/index.js`, `exam/bar.js`, `exam/routes-*.js`) call `wrapInPage()` without rendering any Markdown, so they always show the last value. Permission filtering happens in `preParse()` before Markdown is rendered, so a page's own list never contains what its reader may not see. Only a *foreign* list can. `scanFiles()` also resets the value, and nothing outside `obsidian.js` imports it.

**Title Case.** `css/markdown.css` sets `#markdown-content table th { text-transform: capitalize }`. `css/exam.css` tries to opt out with `.sl-exam-sheet .sl-exam-column-head` and `.sl-exam-sheet .sl-exam-category`, but specificity (0,2,0) loses to (1,0,2). The opt-out has never taken effect. Every module table carries the class `sl-exam-table`.

**Sidebar toggle.** `toggleSidebar()` animates `max-width` and toggles `width-reveal`. Below 1024 px `css/media.css` starts the column at `max-width: 0; opacity: 0`, which makes the button an overlay toggle. Above that the column has no `max-width`. The first click therefore "reveals" what is already visible (no visible change). The second click sets `max-width: 0` but leaves `padding-left: 10px` on the column and the content's fixed `padding-left` (250 px reading, 280 px `.sl-wide`), which leaves an empty strip. The 390 px behaviour is covered by `test/checks/legibility.js` and must not change.

## Goals / Non-Goals

**Goals:**
- No shared mutable state between requests for the heading list.
- One rule that makes every module table heading case-faithful.
- A single click always changes something, at every width.

**Non-Goals:**
- Remembering the folded state (per session or per browser). It can follow later as a reader preference.
- A heading list for module pages (they have no corpus headings to list).
- Changing the 1024 px breakpoint or the overlay behaviour below it.
- The Markdown tables' `capitalize`. Authors' tables keep it.

## Decisions

**D1 — The heading list travels with the request.** `makeContentMap(html, req)` stores the list on `req` (e.g. `req.contentListing`), and `getContentListing(req)` reads it from there. `getSideBar()` omits the Content title and list when `req` carries none. The module-level `contentMap`, its export and its reset in `scanFiles()` are removed.
*Alternatives:* returning `{ html, contents }` from `render()` would change its return type for every caller (page, reveal and document view in `app.js`, plus the tests). A `WeakMap` keyed by `req` is the same as a property, just less visible. Passing the list through `wrapInPage(…, options)` would make every caller thread it through. The request is already passed everywhere it is needed.

**D2 — Escape the heading text while touching it.** `getContentListing()` interpolates `header.textContent` unescaped into the sidebar. `textContent` decodes entities, so a heading written as `&lt;b&gt;` becomes markup in the sidebar. It goes through the existing `escapeHtmlAttribute` (which escapes `&<>"'`) as it moves.

**D3 — Case opt-out at ID specificity, on the module's table class.** `#markdown-content .sl-exam-table th { text-transform: none; }` in `css/exam.css`, which replaces the two ineffective per-class rules. Keyed on `sl-exam-table` because every module table already carries it, and embedded exam pages (`exam-embedding`) sit inside `#markdown-content` without `.sl-wide`. The `.sl-wide` page class would miss them.

**D4 — Two toggles, chosen by the breakpoint at click time.** `toggleSidebar()` asks `matchMedia("(max-width: 1024px)")`. When it matches, the existing overlay path runs unchanged. Otherwise the click toggles the class `sl-sidebar-folded` on `#wrapper`. CSS inside `@media (min-width: 1025px)` gives the folded column `max-width: 0; padding: 0; opacity: 0` (with the existing transitions) and sets the content's `padding-left` to 0 (reading column, still centred by `margin: auto`) or 20 px (`.sl-wide`). The burger's rotation class is toggled in both paths as today.
*Alternative:* one class meaning "flipped from the default" for both widths. That would make a desktop fold turn into an open overlay when the window is narrowed. Two states keyed to their own media query cannot leak across the breakpoint.

**D5 — No persistence.** The class lives on the DOM only, so every page load starts unfolded on desktop (proposal, What Changes).

## Risks / Trade-offs

- [The folded column still catches clicks or shows the resize handle] → `padding: 0` and `overflow: hidden` as in the narrow rule. The check clicks the left edge after folding.
- [A missed caller relied on `contentMap` being set] → `git grep contentMap` must be empty after the change except for the new per-request property. The navigation checks render a corpus page and a module page in sequence.
- [`text-transform: none` at ID specificity overrides a deliberate capitalisation inside a module table] → there is none. Module labels come from the i18n catalogs already in their intended case.
