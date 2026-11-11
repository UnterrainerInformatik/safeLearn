## 1. Reference behavior and dependencies

- [x] 1.1 In Obsidian's reading view (`/usr/bin/obsidian`), check footnote numbering with named labels and `^[…]`, the `$` rules (`$5 und $10`, `\$`, `$x$5`), block markers on a paragraph, a list item and on their own line after a table, `[[Note#Heading]]` with nested `#`, a missing heading, and `![[Note#Heading]]` section bounds. Record any difference in design.md and adjust the specs before coding.
- [x] 1.2 Add `marked-footnote` and `katex` to `package.json` (`marked-katex-extension` was dropped during apply, see design D2). Verify `npm install` succeeds and `npm ls katex marked` shows no peer warning.

## 2. Heading anchors and links (note-anchors, page-navigation)

- [x] 2.1 Add an exported `slugify(text)` in `obsidian.js` per the rule in `note-anchors`. `makeContentMap` uses it with per-render de-duplication instead of `uuidv4()` (D3). Unit tests cover the umlaut, punctuation, whitespace and three-duplicates scenarios, and `npm run test:unit` passes.
- [x] 2.2 `parseWikiLink` returns `fragment` (heading, or block with `^`, last nested segment), and `preReplaceObsidianFileLinks` emits `url#slug`, `url#block-id` and same-page `#…` with the default text `Note > Heading` (every segment, see design "Reference behavior") (D4). Verify with unit tests for every scenario of "A wiki link can name a heading or a block", including that the attachment gate still reads `[[handout.pdf]]` as before (`test/attachments.test.js` passes).
- [x] 2.3 Verify the sidebar Content list jumps to each heading via its new anchor in the existing `md/test-content-list.md` checks. Add the scenario "An entry and a wiki link agree".

## 3. Block references

- [x] 3.1 Add the block-marker preParse step and the placeholder-to-id step in `manipulateHtml` (D5). Unit tests cover the paragraph, list item, table-with-own-line, code and `2^10` scenarios, and the output contains no `data-block-anchor`.
- [x] 3.2 Add the presentation step at the end of `splitForReveal`: rewrite same-page `#x` to `#/x` (D4, as changed during apply). Verify with a structural check that `[[#Summary]]` in a deck shows the Summary slide.

## 4. Footnotes

- [x] 4.1 Register `marked-footnote` on a `marked` instance built per render in `app.js` (D1), and add the `^[…]` preParse step with a balanced bracket scan (D1). Unit tests cover numbering by use, shared references, inline between referenced, a missing definition, code, and `^[see [[Note]]]`.
- [x] 4.2 Add the presentation step that moves each note to the slide of its first reference and drops the original list (D1). Verify the "Notes in the presentation" scenario structurally.

## 5. Math

- [x] 5.1 Add `mathExtension` (KaTeX, `throwOnError: false`, `htmlAndMathml`) and register it on every `marked` instance. Serve `katex/dist` like `mermaid/dist`, and link `katex.min.css` in all three wrappers (D2). Unit tests cover the inline, display, prices, `\$`, code and error scenarios, plus a test that `sanitizeHtml` leaves the KaTeX output unchanged.
- [x] 5.2 Run the corpus diff script (D2) in the scratchpad over `safeLearn/md`, secureLectures `md/` and the Nextcloud vault. List every page that gains a formula or a footnote section, or that embeds a note with relative image paths. Review the list with Gerald, and put `\$` in the sources he marks, before 5.3 is merged.
- [x] 5.3 Verify in the browser that a formula renders with KaTeX fonts in the page, document and presentation views, and that no request goes to another host.

## 6. Note embeds

- [x] 6.1 Add the embed preParse step directly after `removeForbiddenContent` (D5, D6): read, directive, filter, cut section or block, prefix footnote labels, recurse with depth ≤ 5 and a chain guard. Unit tests cover whole note, section, block, missing note, missing section, cycle, code, and attachment embeds unchanged.
- [x] 6.2 Add fixtures `md/test-embed-host.md` (unrestricted, embeds a whole note, a section, a block, a teacher-only note, a note with a `@@@ teacher` block, and a cycle) and the embedded notes they name. Verify as student and as teacher in the page and presentation views that each permission scenario holds, and that the refused embed reads the same as `![[Does not exist]]`.
- [x] 6.3 Verify with the fixtures that an image in an embedded unrestricted note is served to the student, and that a search for a phrase only in the embedded note lists that note and not the host.

## 7. Checks, docs, wrap-up

- [x] 7.1 Add a demo page `md/test-obsidian-syntax.md` that shows footnotes, math, block references and heading links. Put the per-feature checks in a new `test/checks/obsidian-syntax.js`, imported by `test/content.test.js`, and register them and their fixtures in `test/coverage-map.json`. `npm run test:changed` passes.
- [x] 7.2 Document the five features, their limits (KaTeX vs MathJax, footnotes outside an embedded section, relative paths in embedded notes) and item 6's resolution in `docs-obsidian.md`. Add the new steps to `docs-render-pipeline.md` (list and PlantUML), all syntax examples in code. Open both pages in the browser and verify they render in full.
- [x] 7.3 Note the anchors, the resolver and transclusion in `AI/architecture.md`.
- [x] 7.4 Run the full `npm test` once at the end, then rerun only the checks that failed.
