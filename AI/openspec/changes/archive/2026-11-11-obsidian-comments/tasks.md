## 1. Reference behavior

- [x] 1.1 Confirm in Obsidian's reading view (`/usr/bin/obsidian`) how it handles an inline comment, a block comment, two comments on one line, an unclosed `%%` (D3), `%%` in inline and fenced code, and a comment spanning a fenced block; record the result in design.md and adjust the spec before coding if Obsidian differs

## 2. The function

- [x] 2.1 `stripComments(markdown)` in `obsidian.js` per D2/D4: marks found in `maskCode(markdown)`, paired left to right by D3 (a line-start mark closes at the next mark or runs to the end; any other mark closes on its line or stays text), ranges cut from the original; exported. A new `test/comments.test.js` covers every scenario of the first two spec requirements (inline, block, block across blank lines, two per line, unclosed block, unpaired inline, format string, inline code, tilde fence, Mermaid, code inside a comment, stray backtick across a blank line, text without `%%` returned identical) and passes with `npm run test:unit`
- [x] 2.2 Register the test and its source in `test/coverage-map.json`; the coverage check passes

## 3. Every read site

- [x] 3.1 `sanitizeAndParseMarkdown` and `renderHandout` (`app.js`) call `stripComments` after the directive line is decided and dropped, before `preParse` (D1); verify with a fixture `md/test-comments.md` (visible to students; inline, block and unclosed comments with marker words such as `KOMMENTARNOTIZ`, a `---` inside a block comment, a `@@@ teacher … @@@` inside a comment, `%%` in a Java block, in inline code and in a Mermaid block, and `![[test-attachment-comments.png]]` only inside a comment) that the student sees none of the marker words in the page, document and presentation views, the code shows `%%`, the Mermaid diagram is drawn, and the presentation has no slide break inside the comment
- [x] 3.2 Second fixture `md/test-comments-gated.md`: `@@@ teacher` on line 1, a comment opening on line 2; verify the student is refused and the file is absent from navigation and search
- [x] 3.3 `answerFromFile` and `referencesVisibly` (`obsidian.js`) strip after the directive, before `filterForbiddenSegments`; `readCorpusFile` strips everything after a directive line and keeps that line (D5), or the whole body when there is none; verify a search for a marker word returns no result, a snippet next to a comment does not quote it, and `test-attachment-comments.png` is refused to the student
- [x] 3.4 The browser and content checks from 3.1-3.3 live in a new `test/checks/comments.js` imported by `test/content.test.js`, registered with its fixtures in `test/coverage-map.json`; `npm run test:changed` passes

## 4. Docs

- [x] 4.1 Add the step to `docs-render-pipeline.md` (between steps 4 and 5, and in the PlantUML activity), to `docs-search.md` and to the Obsidian document (`docs-obsidian`), in English, every `%%` shown in code; open the three pages in the browser and verify they render in full
- [x] 4.2 Note in `AI/architecture.md` that comments are removed at every read; remove item 1 from the backlog entry in `AI/open-proposals.md` and renumber the rest

## 5. Corpus and wrap-up

- [x] 5.1 Run `stripComments` over `safeLearn/md`, secureLectures `md/` and `~/nextcloud/secureLectures`; list every file where it removes something, with the removed character count, and review the list with Gerald before deploying (Risk 2)
- [x] 5.2 Full `npm test` once at the end; then rerun only the checks that failed
