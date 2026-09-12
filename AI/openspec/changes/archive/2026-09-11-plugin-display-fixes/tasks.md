## 1. Closing-marker-at-EOF bug (reading view)

- [x] 1.1 In `test/obsidian/plugin.test.js`, add a reading-view test for a document whose file ends exactly at a block's closing `@@@` with no trailing newline, asserting the closing marker's characters do not appear anywhere in what is shown (the existing test around line 1989 only compares chip headings, not marker absence). Confirm it fails before fixing anything.

  **Outcome:** the test (`"the reading view hides a closing marker at the file's true end"`, added after the existing "both views" test) passes against unmodified code — it does not fail. Tried 6 document shapes, including the exact repro from `AI/open-proposals.md` (bare directive immediately followed by a bare closing marker, no trailing newline). Diagnostic instrumentation (since reverted) confirmed `ctx.getSectionInfo(el)` always returns valid, non-null info for the closing-marker section in this Obsidian version (1.13.7) — the `stripTagText`-on-null fallback path `design.md` names as the suspected cause is never reached. Gerald confirmed (2026-09-11) he can no longer reproduce it either and will file a fresh bug with a concrete example if it recurs. Tasks 1.2/1.3 are dropped for this change; the new test stays as regression coverage.
- [x] ~~1.2 In `AI/plugin/main.ts`, find and fix the actual cause the failing test points at (starting point: `hideTags`/`resolveBlocks`/the `stripTagText` fallback around lines 1893-2066), so the closing marker is hidden in this case exactly as it is when a trailing newline is present.~~ Dropped — no reproducible bug to fix (see 1.1 outcome).
- [x] ~~1.3 Confirm the fix doesn't regress the Live Preview editor's handling of the same true-EOF case (already covered, e.g. `plugin.test.js:596,777,843,1262,1287,1303`).~~ Dropped — no fix was made; existing Live Preview EOF coverage is untouched.

## 2. Drop the written-in heading from generated per-name sections

- [x] 2.1 In `AI/plugin/main.ts`, `insertSectionsPerName` (around line 3000-3011): stop writing the `\`${heading} ${name}\`` line into each generated section; each section becomes the directive line, a single blank line, and the closing marker.
- [x] 2.2 Remove `headingLevelForSections` and any other code that becomes unused once the heading is no longer generated.

  **Note:** `headingPattern()` also became unused once `headingLevelForSections` was removed (it had no other caller), so it was removed too. The `"the heading level follows the heading above the insertion point"` test (`plugin.test.js`, previously after the "heading stands inside the block" test) exercised exactly this removed function and was removed along with it, in addition to the two tests named in 2.3/2.4.
- [x] 2.3 Update `test/obsidian/plugin.test.js:2276` ("a section is written for each name...") to assert the new heading-free output.
- [x] 2.4 Update or remove `test/obsidian/plugin.test.js:2319` ("the heading of a generated section stands inside the block"), since the behavior it locks in no longer exists.

  **Outcome:** removed entirely — nothing is left to assert once no heading is written at all.

## 3. Build and verify

- [x] 3.1 Run the plugin's test suite and confirm everything passes, including the new/updated tests from sections 1 and 2.

  **Outcome:** `node --test --test-concurrency=1 "test/obsidian/plugin.test.js"` — 125/125 pass.
- [x] 3.2 Run `npm run build` in `AI/plugin` to regenerate `main.js` from `main.ts`.

  **Outcome:** built cleanly, no errors.
- [x] 3.3 Manually confirm in Obsidian: a document ending at `@@@` with no trailing newline renders with no visible marker in the reading view; "insert sections per name" produces sections with no `### <Name>` heading, still correctly addressed per the existing frame heading.

  **Outcome:** confirmed by Gerald (2026-09-11).
