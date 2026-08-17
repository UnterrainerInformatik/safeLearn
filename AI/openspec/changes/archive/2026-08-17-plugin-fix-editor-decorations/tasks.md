The order below is deliberate: the instrument is extended first, then every defect is pinned by a check that fails, and only then is the plugin touched. A repair written before its check is a repair nobody can distinguish from a coincidence — and this change makes thirteen of them in a file with no type checking.

## 1. Confirm the ground the design stands on

- [x] 1.1 Confirm `Decoration.set(ranges, /* sort */ true)` sorts by position *and* start side against the `@codemirror/view` version the plugin actually has installed, by building a set that mixes a line decoration and a mark decoration at the same position — the case that throws today. Design Decision 3 rests on this; if it does not hold, fall back to the explicit-rank comparator and record the coupling before continuing.
- [x] 1.2 Establish what the ordering defect does today rather than assuming it. Run `npm run test:obsidian` and capture what the renderer logs while a corpus document with both a permission block and a fragment is opened. Note whether an error is raised, and if so its text — this is the baseline the new error-collecting check asserts against, and if nothing is raised, the defect is milder than the design assumes and 1.1's urgency changes.
- [x] 1.3 Read the renderer's own recognition rules once more at implementation time and record them in the change as a table: `preprocessFragments`, `preprocessSideBySide`, `inlinePermissionRegex`, and the first-line split. Design Decision 2 has them, but they were read at planning time — a divergence introduced since would be inherited silently.

## 2. Extend the harness so the repair can be observed

Everything here is in this repository, under `test/obsidian/`. None of it changes the plugin.

- [x] 2.1 Collect what the renderer raises. Subscribe to the page's error and console channels for the lifetime of a run, record entries with the document and action that were in progress, and expose them to a check together with a way to assert that nothing was raised. Spec: "A run observes an error raised by the editor framework" — including its second scenario, so that a clean run is positively establishable and not merely unreported.
- [x] 2.2 Add a cursor move and a scroll as actions distinct from typing, and have each report the document text before and after so a check can establish that no text changed. `placeCursorAfter` exists but sets a cursor without waiting for a decoration rebuild; typing is the only action that currently waits for one. Spec: "A run can drive the editor without changing the document".
- [x] 2.3 Add writing a document into the assembled vault, for a check that needs a tag combination the corpus does not carry. It writes into the disposable vault only; assert in the harness that the path it writes to is inside the run's vault, so the corpus cannot be reached by a mistake in a check. Spec: the modified "The fixtures are this repository's corpus".
- [x] 2.4 Extend what `markers()` reports with the position of each marker in the document, not only its text and length. "The decoration is still on its own tag after an edit" is not decidable from text alone — two identical tags on different lines are indistinguishable by text. Spec: "A decoration stays on its tag while the document is edited".
- [x] 2.5 Prove the additions before relying on them: a check that the error channel actually reports a raised error (provoke one), and a check that the constructed document is present in the vault and absent from `md/` after a run.

## 3. Pin every defect with a check that fails

At the end of this section the run is red, deliberately and in a known number of places. A repair in section 4 that does not turn one of these green is a repair of something else.

- [x] 3.1 Rewrite the two `DEFECT:` checks to assert the repaired behavior: a bare `##fragment` at end of line is covered exactly, ten characters and not eleven, with nothing reaching into the following line; and after typing on a tag's line the marking still covers exactly that tag at its new position (using 2.4). Their current messages say what to do when they turn red — follow them, and keep the coverage rather than deleting the checks. Design Decision 11.
- [x] 3.2 Rewrite the file-level-directive check against a constructed document (2.3): a first line holding a file-level directive, then a permission block, a fragment and a side-by-side block below it. Assert that all of those are marked. This is the check the repair of Decision 6 exists for, and the reason it needs a constructed document at all: no corpus file combines the two, so the present check passes both before and after and proves nothing.
- [x] 3.3 Add a check per remaining requirement of `plugin-editor-decorations`, each on a corpus document where one carries the case and on a constructed one where none does:
  - a tag scrolled to for the first time is marked, with no edit (2.2)
  - the cursor entering a tag updates what is shown for it, with no edit (2.2)
  - an unclosed block, and an orphaned closing marker, each leave the tags after them marked
  - no error is raised while any corpus document is opened, edited and scrolled (2.1) — this is the ordering defect's only observable
  - the same line examined twice gives the same answer, and a line with two `##fragment` tags has both marked
  - recognition matches the renderer: `- ##fragment two` is marked; `##FRAGMENT` and `##fragment.` are not
- [x] 3.4 Add a reading-view check recording what the Markdown post-processor does on its own, before the editor's call into it is removed. This is the design's stated risk: if the editor's call was masking a post-processor that never worked, this check is what makes it visible instead of turning it into a mystery in the next change.
- [x] 3.5 Run the suite and confirm each new and rewritten check fails for the reason it was written for, not because a harness addition is wrong. Record the count — it is what section 5 compares against.

## 4. Repair the plugin

All of this is in the companion repository reached through `AI/plugin`, in `main.ts`. Take them in this order: the recognition rule is what the others depend on being settled.

- [x] 4.1 Put the recognition rule for each tag form in one place, expressed as the renderer expresses it (1.3, Decision 2), and use it for the editor and the post-processor alike. Two rules in one plugin is what produced the case-sensitivity divergence. Keep the deliberate divergence — block markers stay line-anchored — as a named, commented exception rather than an omission.
- [x] 4.2 Derive every decoration's extent from the match, not from a length constant (Decision 1). This is the shifting defect the source proposal set out from, and after 4.1 it is a consequence of the rule rather than a separate calculation.
- [x] 4.3 Replace the hand-written sort and `RangeSetBuilder` with an array of ranges handed to `Decoration.set(ranges, true)` (Decision 3, confirmed in 1.1).
- [x] 4.4 Take the full update object in the update hook and rebuild on document change, viewport change and selection change (Decision 4). The narrow parameter type currently declared is part of why the other two were never considered — widen it to the framework's own type.
- [x] 4.5 Resolve block state over the whole document and emit decorations only for the visible ranges (Decision 5). Verify against a document whose block opens above the viewport that the marking is still right after scrolling.
- [x] 4.6 Treat a first line beginning with `@@@` as the file-level form: it opens no block, and block logic starts at the second line (Decision 6). It gains no marking of its own — that is `plugin-edit-tag-support`.
- [x] 4.7 Make an unbalanced marker local (Decision 7): an opening marker must name something, a bare closing marker with nothing open is ignored, and an unterminated block ends at the end of the document rather than suppressing what follows.
- [x] 4.8 Delete the dead preview branches and the view-mode test behind them, and remove the editor's call into the rendered reading view (Decision 8). The post-processor registration itself stays. Confirm with 3.4 whether the reading view still does what it did.
- [x] 4.9 While in the file: the load message is German (`"✅ SafeLearn Plugin geladen"`). The English-source convention is this repository's and does not formally reach the companion one, so this is an alignment rather than a fix — do it, and do not extend the convention's scope in the specs to justify it.

## 5. Prove it

- [x] 5.1 Run `npm run test:obsidian` and confirm every check from section 3 is green, and that the count matches what 3.5 recorded — a check that vanished rather than passing is not a pass.
- [x] 5.2 Revert each repair of section 4 individually and confirm the corresponding check goes red. This is the one step that establishes the checks test the repairs rather than running alongside them. Any repair without a check that notices its absence gets one here.
- [x] 5.3 Run `npm test` and confirm it collects the same files and still passes. Nothing in this change may reach the authenticated suite, and 2.3 wrote into a vault by design — confirm `md/` is unchanged with `git status`.
- [x] 5.4 Run the Obsidian suite twice in a row from a removed `test/.runtime/obsidian`. The previous change recorded one unexplained failure in about a dozen runs; if it recurs, capture the check name and the screenshot the wrapper leaves rather than re-running until green.

## 6. Write down what changed and why

- [x] 6.1 Record in `AI/architecture.md` the deliberate divergence from 4.1 (block markers line-anchored where the renderer accepts them mid-line) as an observation, and the whole-document-walk trade-off from Decision 5. Both are decisions a later reader would otherwise meet as bugs.
- [x] 6.2 Document the harness additions from section 2 in `docs-testing.md`, beside the existing description of the Obsidian run.
- [x] 6.3 In the plugin repository's `README.md`: state the recognition change from 4.1 — `##fragment` is now case-sensitive and valid anywhere whitespace follows, so some text that was marked no longer is and vice versa. Also commit the verification section already sitting uncommitted in that file; it belongs to `plugin-setup-obsidian-harness` and has been left dangling.
- [x] 6.4 Two commits in two repositories, each self-contained: the plugin's repair over there, the harness, checks and documentation here. Neither is verifiable without the other, so name the counterpart in each commit message.
