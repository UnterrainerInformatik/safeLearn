## Context

See proposal.md — Why. What matters for the approach:

The plugin's editor half is a single CodeMirror `ViewPlugin` that rebuilds its whole decoration set per document change, plus a Markdown post-processor for the reading view. Both live in one file in the companion repository; the harness that observes them lives here. Thirteen defects are confirmed in that file, and they are not thirteen independent bugs — most of them come from four structural properties:

1. **Extents are computed rather than taken from what matched.** The scan finds a tag with `indexOf` and then derives the end from an assumed spelling of that tag. Where the assumption and the text disagree, the decoration is wrong.
2. **Recognition is a fixed sequence of special cases.** Which branch fires depends on the order the branches are written in, so the rule for "this is a tag" cannot be stated independently of the code — and three defects are disagreements between the intended rule and the order.
3. **Block state is a pair of integer cursors with no error case.** An opening marker sets one; only a well-formed closing marker clears it. Anything else leaves it set for the rest of the document, and everything after it is lost.
4. **The rule for what a tag is was re-invented instead of taken from the renderer.** The plugin's whole purpose is to show a teacher what the server will do with the document. Where its recognition and the server's disagree, the marking is not merely imprecise — it is misleading, which is worse than no marking.

Patching the thirteen sites individually leaves all four properties in place. The specs are written against behavior, and each property is what makes a whole class of that behavior unreachable — so the design addresses the properties.

Two constraints bound the work. The corpus in `md/` is the fixture set for the authenticated suite as well, so it cannot absorb test material. And `obsidian.js` is the authority on what a tag means; its rules were read for this design rather than inferred, and they are recorded in Decision 2.

## Goals / Non-Goals

**Goals:**

- Make the four structural properties above impossible to hold, rather than fixing their current symptoms.
- Take the plugin's reading of each tag form from the renderer, for the forms the plugin already handles.
- Extend the harness only as far as the specs require, and leave the corpus untouched.

**Non-Goals:**

- Rewriting the reading-view post-processor. It is `plugin-render-hide-tags`. This change removes the editor's reach into rendered output and leaves the post-processor as it is, defects included — except for its recognition rule, which Decision 2 unifies because a second rule in the same plugin is what created the divergence.
- Giving the file-level directive or any other unrepresented tag form a *look*. That is `plugin-edit-tag-support`. Here the line-1 form stops corrupting the document; it gains no marking of its own.
- Full agreement with the renderer on every edge of every form. Decision 2 draws the line and names what is deliberately left divergent.
- Incremental decoration maintenance. Rebuilds stay whole-document; see Risks.
- Converting the plugin to a typed or tested project of its own. Its verification stays here.

## Decisions

### Decision 1: Extents come from the match, never from a computed length

Every decoration's start and end are taken from the matched text — the match position and the matched text's own length — so that no arithmetic on an assumed tag spelling exists to be wrong. This removes the over-wide `##fragment` decoration structurally rather than by correcting the constant: with no constant, a tag that ends a line and a tag followed by a space produce correctly-sized decorations from the same code path.

*Alternative considered:* correct the length calculation to branch on which form matched. Rejected — it keeps a computed extent, so the next tag form added (time windows, in `plugin-edit-tag-support`, whose spelling varies by content) reintroduces the same defect. The extents there are not expressible as constants at all.

### Decision 2: The recognition rule per tag form is taken from the renderer, and the divergences that remain are named

`obsidian.js` is the authority, and it was read rather than guessed. What it does:

| Form | The renderer's rule |
| --- | --- |
| `##fragment` | `/##fragment(?=\s|$)/g` — case-sensitive, anywhere in the line, **every** occurrence, valid wherever whitespace or the end of the text follows |
| `##side-by-side-start` … `##side-by-side-end` | matched as one non-greedy block by plain substring, case-sensitive; not anchored to a line |
| `##separator` | split only *inside* such a block; one standing outside is deliberately left alone |
| `@@@ roles` … `@@@` | `/^[ \t]*@@@(.*?)\n([\s\S]*?)@@@/gms` — line-anchored, leading tabs and spaces allowed |
| first line `@@@ roles` | split off the document before any of the above runs, and interpreted on its own |

The plugin is aligned to the first row and to the last, because that is where the divergence has consequences today: the corpus itself contains `- ##fragment two`, which the renderer treats as a fragment marker, and the plugin's two halves disagree with the renderer in opposite directions — one case-insensitively with a word-boundary test, the other with a "stands alone on its line" heuristic. Both are replaced by the renderer's expression, used from one place for the editor and the reading view alike. This also answers the second and third structural properties for this form: every occurrence is found because the rule says every occurrence, and no branch ordering remains to disagree with.

**Deliberately left divergent:** the plugin keeps requiring the side-by-side and closing `@@@` markers to be a line of their own, where the renderer would accept them mid-line. A block marker inside running text has no sensible marking to draw, and aligning to it would mean marking a block whose boundary sits inside a sentence. The divergence only applies to documents nobody writes, but it *is* a divergence, so it is recorded in `AI/architecture.md` as an observation rather than left for the next reader to rediscover as a bug.

*Alternative considered:* align every form exactly, including mid-line block markers. Rejected as above — and it would widen a decoration change into a change of what a block *is*, which the specs here do not cover.

### Decision 3: The library sorts the decoration set, not the plugin

The set is assembled as an array of ranges and handed to `Decoration.set(ranges, /* sort */ true)` rather than pushed into a `RangeSetBuilder` after a hand-written sort. The ordering contract includes the side at which a range starts, which is a property of the decoration type — a plugin-side comparator has to reproduce library internals to satisfy it, and the current one does not try. Letting the library sort makes the contract impossible to violate, which matters because violating it throws and costs the entire set rather than one decoration.

*Alternative considered:* extend the comparator to sort by position and then by an explicit rank per decoration type (line before mark). Rejected — it works only as long as the rank mirrors the library's own side values, which is an undocumented coupling that no check would catch when it drifts.

### Decision 4: Rebuild on text change, viewport change and selection change

The update hook takes the full update object and rebuilds when the document changed, the viewport changed, or the selection changed. All three are required by the specs, and the third is the one that cannot be substituted: a check that types would also satisfy an implementation that only reacts to text.

### Decision 5: Block state is resolved over the whole document; decorations are produced for the visible range

Decision 4 makes rebuilds much more frequent, including on every cursor move. But block decorations depend on context that may lie above the viewport — a block opened three screens up still governs the visible lines — so the visible range alone is not enough to know what to draw.

The scan therefore walks the document to resolve block state, and emits decorations only for lines within the visible ranges. Walking lines is cheap relative to constructing decorations, and this keeps correctness independent of scroll position, which is what the specs require.

*Alternative considered:* scan only the visible range and accept wrong block marking near its edges. Rejected — it contradicts the requirement that a scrolled-to tag is marked correctly. *Also considered:* maintain block state incrementally across updates. Rejected as premature; see Risks.

### Decision 6: The first line is a file-level directive by position, because that is how the renderer reads it

The renderer splits the first line off before the block-form regex ever runs, and interprets it on its own. So the plugin treats a first line beginning with `@@@` as the file-level form unconditionally — it opens no block — and applies block logic from the second line onward. No look-ahead for a matching closing marker, because the renderer does none: a rule the plugin invented would make the plugin disagree with the server on a document the server accepts.

This is the split between this change and `plugin-edit-tag-support`: here the line-1 form stops being read as an unclosed block, so the tags after it are marked. It gets no marking of its own until that change decides what it should look like.

### Decision 7: Unbalanced markers are recovered from, not carried

An opening marker is only an opening marker if it names something; a bare closing marker with nothing open is ignored rather than treated as an opening one. An unterminated block ends at the end of the document and marks what it covered rather than suppressing everything after it. Each of these is a local decision, which is what the "costs only itself" requirement asks for.

### Decision 8: The dead preview branches are deleted, not repaired

The view-mode test is against a CSS class Obsidian does not set, so every branch behind it has never executed. There is no behavior anyone has seen that deleting them changes, and repairing them would build a second implementation of tag-hiding inside the editor — the mechanism `plugin-render-hide-tags` is about, in the wrong place.

Likewise, the editor's call into the rendered reading view is removed. The Markdown post-processor registered at load stays as it is apart from its recognition rule (Decision 2); it is the right mechanism and the next change rewrites it. What goes away is the editor rewriting rendered DOM on every keystroke.

### Decision 9: A check that needs a tag combination writes it into the run's vault

No corpus file carries a line-1 directive together with later tags, so the central repair of Decision 6 produces an empty result both before and after — the existing check asserting "nothing is decorated" would stay green through the fix and prove nothing. The harness gains the ability to write a document into the disposable vault it already assembles, and the check that relies on it carries the content inline so a reader sees the fixture and the assertion together.

*Alternative considered:* add a corpus file combining the forms. Rejected — `md/` is what the authenticated suite asserts against and what the corpus index is built from, so a file added for a plugin check changes the surface of an unrelated suite. The bounded exception is written into the `plugin-verification` delta rather than left as a convention.

### Decision 10: Errors from the editor are collected by the harness, not inferred

The harness subscribes to the renderer's error and console channels while a document is opened, edited and scrolled, and exposes what was raised. This is what makes Decision 3 provable: an ordering violation shows up as a thrown error with zero markers, which is indistinguishable from "correctly marked nothing" by any assertion over markers alone.

### Decision 11: The three checks that assert today's defects are rewritten in place

`plugin.test.js` deliberately asserts the wrong behavior in three checks, two named `DEFECT:`, so that a repair turns them red — and each says in its own message what to do when it does. They are rewritten to assert the repaired behavior at the same coverage, not deleted. A repair that removed its own check would leave the codebase with less verification than it started with.

## Risks / Trade-offs

- **A whole-document walk on every cursor move** → Line iteration is cheap and the corpus is small, but on a very large document this becomes noticeable. Accepted deliberately over incremental block state, which is materially harder to get right and would need its own verification. If it becomes visible, the fix is to cache block state per document version — recorded here so the next person does not rediscover the trade-off.
- **Aligning `##fragment` recognition changes what is marked, not only how** → Lines the plugin ignores today start being marked (`- ##fragment two`) and lines it marks today stop being (`##FRAGMENT`, `##fragment.`). That is the point — the renderer's answer is the correct one — but it is a visible change for anyone who has learned the current behavior, so it is stated in the plugin's readme rather than shipped silently.
- **Removing the editor's call into the reading view may reveal that the post-processor never worked alone** → The redundant call may have been masking a defect in the post-processor. A check in the reading view establishes what the post-processor does by itself; if it turns out to do nothing, that is a finding for `plugin-render-hide-tags` and is recorded rather than patched here by restoring the call.
- **`Decoration.set(ranges, true)` sorting is assumed, not yet observed** → Confirmed against the installed version as the first task, before the rest is built on it. If it does not hold, Decision 3 falls back to the explicit-rank comparator with its coupling documented.
- **Thirteen defects in one change, in a file with no type checking** → The harness is the mitigation and the reason this change comes after it. Each repair lands with the check that observes it rather than as one batch verified at the end.
- **A rewritten check could be weakened into passing** → The three checks in Decision 11 are the only ones whose assertions invert, so each is rewritten to assert the specific repaired property, and the run is confirmed to fail if the corresponding repair is reverted.
- **The plugin has no verification of its own** → Editing it from this repository without running the Obsidian suite is possible and would go unnoticed. Out of scope, but worth naming: the companion repository's `npm test` is still the scaffold's failing echo.

## Open Questions

- **A first line consisting of a bare `@@@` with no roles.** The renderer's expression matches it with an empty role list; what it then does with an empty list is not established here. The plugin follows the renderer either way — it opens no block, per Decision 6 — so this changes no decision above, only whether such a line eventually gets a marking of its own in `plugin-edit-tag-support`.
