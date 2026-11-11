## Context

Every path that reads a corpus file does the same two steps by hand, in the same order: drop the leading invisible marks, then read line 1 with `parseFirstLineForPermissions` and cut it off when it is a directive. The copies live in `sanitizeAndParseMarkdown` and `renderHandout` (`app.js`), and in `readCorpusFile`, `answerFromFile` and `referencesVisibly` (`obsidian.js`). The scan's index (`readCorpusFile`) also keeps the file's text, which `candidatePaths` uses to choose search candidates before `answerFromFile` decides on the file itself. `exam/handout.js:51` only regex-tests the raw text for `#answer` and is unaffected by a leading block. There is no YAML parser in the dependencies.

## Goals / Non-Goals

**Goals:**
- One function decides what frontmatter is and returns body and properties; every read site calls it in place of its own first step.
- The body every existing step sees is byte-identical to today's for files without frontmatter.

**Non-Goals:**
- Using any property other than `header` and `footer` for behavior (`lang`, dates, …).
- Writing or editing properties; the Obsidian plugin.
- Frontmatter in files outside `md/` or in uploaded question imports.

## Decisions

**D1 - `splitFrontmatter(text)` in `obsidian.js`, called first at every read site.** It drops the leading invisible marks (moving that step out of the callers), detects the block per the spec's rule (`/^---[ \t]*\r?\n/`, closing at the first `^---[ \t]*\r?$` line), and returns `{ body, properties }`, with `properties` an ordered list of `[name, value]` or `null`. Every site then reads line 1 of `body` exactly as it reads line 1 of the file today. Alternative: strip only in `sanitizeAndParseMarkdown`. Rejected: search, handouts and the attachment check would still see `---` on line 1 and disagree with the page about visibility - the very split the `corpus-index` spec forbids.

**D2 - Parse with the `yaml` package.** Obsidian writes standard YAML (quoted strings, lists, dates, numbers); a hand parser for "Obsidian's subset" would break on the first multi-line value. `yaml` has no dependencies and is the parser most projects use. It is parsed with `{ schema: "core" }` so `2026-11-10` stays the string the author wrote rather than becoming a `Date`. A result that is not a plain mapping counts as unreadable (spec: no properties, logged). Alternative: `js-yaml` - equivalent; `yaml` chosen for its maintained ESM build.

**D3 - Properties travel with the render, not on `req`.** `sanitizeAndParseMarkdown` returns `{ html, properties }` (its callers in `app.js` are three wrappers and the attachment grant), and `wrapInPage`, `wrapAsDocument` and `wrapInReveal` take `properties` in their `options`. Alternative: stash them on `req` like the handout views. Rejected: properties belong to one file, and an embed rendering another file inside the same request would overwrite them.

**D4 - Search: values become one extra passage, after the body.** In `readCorpusFile` the property values (list items one per line, names left out) are kept as `propertyText` next to `text`, and `candidatePaths` considers both. `answerFromFile` appends the values as one segment after the filtered body segments; it has no heading, so a hit there yields a snippet and no heading entry, and `prominent` is not set by it - "ranked like body text". The visibility decision is already made before any segment is built, so gated files cannot leak through their properties. Alternative: index properties as a heading-level hit. Rejected: the user asked for "interesting for search", not for promotion over headings.

**D5 - Page view: an info button in the top bar, the message as a dialog.** The button appears only when `properties` is non-empty, opens a `<dialog>` with a `<dl>` of names and values (lists as `<ul>`), built with text nodes / `escapeHtml` only. It reuses the existing top-bar button styling; label and title come from `i18n` (`page.properties.button`, `page.properties.title`). Alternative: a collapsible box above the content. Rejected: it would shift the content the page-bootstrap reveal measures and is in the way of reading.

**D6 - Header/footer.** Page and document views: a `<header class="sl-file-header">` before and a `<footer class="sl-file-footer">` after the rendered content, escaped text. Presentation view: reveal has no per-slide header/footer of its own, so the deck gets one fixed overlay element each inside `.reveal` (positioned top and bottom, outside `.slides`), which reveal's scaling leaves at the viewport edges, and therefore on every slide. Whether print-to-PDF repeats them per page is checked in the browser; if not, they are cloned into each slide in print mode only. Only string and number values count (spec).

## Risks / Trade-offs

- [A teacher's file starts with `---` meant as a slide break or rule and later has another `---`] → it is now read as frontmatter and the first slide disappears. Mitigation: unreadable YAML still strips (spec), so the effect is visible; a scan of both corpora (`safeLearn/md`, secureLectures `md/` and the Nextcloud vault) for files whose line 1 is `---` is a task, and any hits are reported before deploy.
- [Overlay header/footer covers slide content at the edges] → small font and padding in `css/reveal.css`; the "every slide fits the screen" check of `presentation-view` runs against the fixture.
- [Every read site must switch at once] → the content-verification suite gets a check that the fixture with frontmatter + `@@@ teacher` is refused, hidden from navigation and from search for a student, and that its handout and attachment checks agree.

## Migration Plan

No data migration. Existing files without frontmatter are unaffected. Rollback is a revert; files with frontmatter then show the block again, as today.
