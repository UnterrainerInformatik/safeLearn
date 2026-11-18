## 1. Oracle table first (red)

- [ ] 1.1 Write `test/block-grammar.test.js` with the shared table of documents and expected block line ranges (`from`, `to`, `closed`). Rows:
  - `@@@` mid-line inside a block (the incident sentence) and outside one
  - `@@@` in inline code
  - marker lines in closed ```` ``` ```` and `~~~` fences, outside and inside a block
  - a closer inside a fence within a block
  - an unclosed fence followed by a `@@@ #exam` block
  - a stray closer
  - an opener inside an open block
  - an unclosed block
  - indented markers in a list
  - CRLF
  - the full incident shape (teacher note with `` `@@@ #exam` ``, six question/solution pairs)
  - a file-level first line

  Run it against the server resolver and the plugin's `resolveBlocks`. Verify: it runs, and the server rows for mid-line `@@@`, fences and the unclosed block fail on current code.
- [ ] 1.2 Add render checks to `test/obsidian-syntax.test.js`. A `3bhif` student renders the incident shape and sees every question, no solution, and no `#exam` or `@@@` text. A fence example shows as code to everyone. An unclosed `@@@ teacher` hides to the end for a student and shows without the directive line for a teacher. A nested `@@@ #exam` line is never shown. Verify: these fail on current code.
- [ ] 1.3 Add a search check (a word only inside the incident's solutions gives no student match) and an attachment check (an image referenced only in such a solution is refused to a student). Verify: both fail on current code.

## 2. Server resolver

- [ ] 2.1 Implement `resolveInlineBlocks(md)` in `obsidian.js` as designed (D1–D4): line scan, fence pairing with unpaired fences dropped, stray closers and inner openers ignored, unclosed blocks to the end, and the offsets so a well-formed block's output is byte-identical to today's. Export it for the tests. Verify: the server half of `test/block-grammar.test.js` passes.
- [ ] 2.2 Rebuild `extractInlinePermissionBlocks` and `filterForbiddenSegments` on the resolver and delete `inlinePermissionRegex`. Drop inner directive lines from a shown body. Verify: 1.2 and 1.3 pass, and the existing `test/obsidian-syntax.test.js`, `test/attachments.test.js` and search checks still pass.
- [ ] 2.3 Replace the substring check in `exam/handout.js` with "some resolved block's entries name `#exam` or `#answer`". Verify: a new case in `test/exam-offline.test.js` (mention only in running text → no exam blocks) passes, and the existing handout cases stay green.
- [ ] 2.4 Log `[Blocks] unclosed: <path>:<line>` once per unclosed block when the index is built (D6). Verify: a check with an unclosed fixture captures the line.

## 3. Plugin

- [ ] 3.1 Pull `AI/plugin` to origin/master. Add the fence pairing (same rule as the server, unpaired fences protect nothing) to `resolveBlocks` and to the reading view's marker detection in `main.ts`, and build `main.js`. Verify: the plugin half of `test/block-grammar.test.js` passes, so the whole table is green on both sides.
- [ ] 3.2 Run `npm run test:obsidian` with `SAFELEARN_OBSIDIAN_APP=/usr/bin/obsidian`. Verify: the decoration and hidden-tag checks pass, including a fence example showing no frame.

## 4. Corpus impact

- [ ] 4.1 Write a one-off script in the scratchpad that renders every file of `md/` and of `/home/psilo/nextcloud/secureLectures/` with the old and the new resolver, as a student holding the file's classes and as a teacher with the exam view, and lists the files whose output differs. Verify: the list exists. Both POSE3-OO Test 1 variants are on it with solutions now hidden. Report every other entry to Gerald (file names only), and change no file.

## 5. Docs

- [ ] 5.1 `docs-permissions.md`: state the grammar: whole-line markers, mid-line `@@@` is text, fences are code, a stray closer is ignored, an opener inside a block opens nothing, an unclosed block hides to the end. Verify: the content suite's doc checks pass.
- [ ] 5.2 `AI/architecture.md`: remove the closing-`@@@` part of the mid-line divergence observation (side-by-side markers stay), and describe the resolver and the oracle in the pipeline section. Verify: no remaining text claims the server closes `@@@` mid-line.

## 6. Ship

- [ ] 6.1 Run the full `npm test` once. Verify: it is green (re-run only failing checks after fixes).
- [ ] 6.2 Release the plugin: version in three places, push, tag, GitHub release with `main.js`, `manifest.json`, `styles.css`. Verify: the release is listed as latest.
- [ ] 6.3 Commit and push safeLearn, then merge into secureLectures and push. Verify: a deploy run starts for HEAD in secureLectures.
