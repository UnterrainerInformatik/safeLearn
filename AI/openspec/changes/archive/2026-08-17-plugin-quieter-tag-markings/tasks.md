## 1. Show a fragment as an icon

- [x] 1.1 Add `FragmentIconWidget` beside `DirectiveHeadingWidget`, carrying the icon as a character of its own rather than as stylesheet content, and comparing equal to every other one so a rebuild keeps the elements it has.
- [x] 1.2 In `buildDecorations`, replace the fragment's range with that widget while `isTouched` says nothing is in it, and mark its characters while something is. Ask it per tag, not per line.
- [x] 1.3 Take the frame, the tint and the `::before` off `.fragment-highlight`; leave it colour and weight, which is all a tag being edited needs to carry. Add `.fragment-icon`.
- [x] 1.4 Raise `--fragment-fg` in both themes: it used to sit on a tinted background and now sits on the page.

## 2. Draw both directive frames in one yellow

- [x] 2.1 Remove `--permission-file-bg` and `--permission-file-border`; point `.permission-file` and `.safelearn-read-file` at `--permission-bg` and `--permission-border`.
- [x] 2.2 Set that pair to the yellow the block's tint already was, on the edges as well as behind them, and more transparent than either frame was.
- [x] 2.3 Check both themes against a document holding both forms, as the existing frame rules are checked.

## 3. Say it in checks

- [x] 3.1 Add `fragment-icon` to the harness's frozen `markerClasses`, and a helper reporting where the icons stand — a tag at rest has no text to compare, so what a check about a fragment asks is where it is.
- [x] 3.2 Restate the extent check: the corpus writes `- ##fragment two`, so what stands there is the icon, a space and the word, and no tag's characters are on screen with the cursor elsewhere.
- [x] 3.3 Restate the end-of-line check, placing the cursor off the tags first — a cursor left where the document opens rests in a tag at offset zero and shows its characters.
- [x] 3.4 Turn `cursor-into-tag` around: it asserted that the cursor changes nothing about a fragment, which is the rule this change replaces. It now asserts both states and that the document text is untouched between them.
- [x] 3.5 Carry the remaining fragment checks over to the icon: the two typed-into documents, the scrolled-to block, the three malformed-tag documents, the decoration-ordering collision, and the two recognition checks.
- [x] 3.6 Leave `entry-and-line-markings` reading the characters: its selection runs across the whole document, so the fragment in it is touched and is a marking on characters — which is the state that check is about.

## 4. Close it out

- [x] 4.1 Run `npm run test:obsidian`; green — 70 of 70.
- [x] 4.2 Run `test/directive-grammar.test.js`; green. It transpiles `main.ts` and evaluates it against stubs, so a new widget class has to be answerable by them.
- [x] 4.3 Photograph the three states in both themes — a fragment at rest, a fragment with the cursor in it, and the two frames on one screen.
- [x] 4.4 Update the plugin's `README.md`: what a teacher sees changed.
- [x] 4.5 Nothing for `AI/architecture.md` §9 — this accepts no divergence from the renderer. What is recognized as a fragment is unchanged; only how it is shown is.
