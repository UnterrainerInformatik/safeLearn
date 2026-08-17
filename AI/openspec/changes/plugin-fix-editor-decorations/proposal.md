Source proposal: `AI/proposals/plugin-fix-editor-decorations.md`

## Why

The companion plugin (`AI/plugin`) is the surface a teacher writes SafeLearn tags on, and its editor half misplaces them: decorations shift while text is typed. A teacher who marks a block as belonging to one class and watches the marking sit on the wrong text cannot use the marking to check their own work — which is the only thing the plugin is for, since it enforces nothing.

Until now this could not be judged from here, because the behavior only exists inside a running Obsidian. The change `plugin-setup-obsidian-harness` built that observation: `npm run test:obsidian` drives a real Obsidian against a vault assembled from this repository's corpus, and it already carries two checks named `DEFECT:` that assert today's wrong behavior on purpose, so that repairing it turns them red. The instrument is in place; this change is the repair it was built for.

It comes first among the remaining plugin proposals because `plugin-edit-tag-support` requires it explicitly, and because two of the causes below — a `/g` regex misused with `.test()`, and a reading-view rewrite driven from the editor — reappear in `plugin-render-hide-tags`. Fixing them once serves both.

## What Changes

**The seven causes the source proposal named are all confirmed in `main.ts`:**

- **A decoration range built from the wrong token length.** The end of a `##fragment` decoration is computed as `from + "##fragment ".length` — always 11 — even for the bare ten-character token. On a line ending in `##fragment`, the range reaches past the end of the line. This is the shifting the proposal set out from, and the corpus holds three such lines.
- **A sort that does not satisfy `RangeSetBuilder`.** Decorations are sorted by `from` alone. The builder requires `from` *and* `startSide`, and the block decorations (`from == to`) are pushed only when a block closes, so they arrive out of order and collide with marks at the same position. This does not degrade gracefully: the builder throws and the whole decoration set is lost.
- **A rebuild that ignores viewport and cursor.** The set is rebuilt on `docChanged` only. In Live Preview a tag must become visible when the cursor enters it, and Obsidian's editor is virtualized, so scrolling brings lines into the document that no rebuild has looked at.
- **A `/g` regex used with `.test()`.** `lastIndex` persists between calls, so every second call answers falsely. This alone explains tags that disappear sometimes and not others.
- **A view-mode check against a class Obsidian does not set.** `cm-preview` is not an Obsidian class, so `isPreview` is always false and all five `Decoration.replace` branches are dead code.
- **The reading view rewritten from the editor.** On every document change, the view plugin walks `document.querySelectorAll(".markdown-preview-view")` and writes into already-rendered DOM. It is the wrong mechanism in the wrong place; the reading view's own repair belongs to `plugin-render-hide-tags`, so this change removes the editor's reach into it rather than rebuilding it here.
- **A file-level directive read as an unclosed block.** Line 1 of a gated file (`@@@ teacher`, no closing `@@@`) opens a block that never closes, and every decoration after it is lost.

**Six more found while reading, which the source proposal did not name:**

- **The "tag stands alone" rule is not enforced.** The scan looks for `##fragment ` with a trailing space before it checks for the bare form at end of line, so a tag with text after it is decorated while the same tag without the space is rejected. The corpus already has both.
- **Only the first tag on a line is found**, because the scan uses `indexOf` rather than walking the line. Nothing in the corpus yet puts two on one line, so this is latent rather than visible.
- **An orphaned `@@@` opens a block.** The opening test is `startsWith("@@@")`, which a bare closing marker also satisfies, so a stray one turns the rest of the document into a block.
- **An unclosed `##side-by-side-start` silently suppresses the rest**, the same failure shape as the file-level directive.
- **Every keystroke rebuilds over the whole document**, not the viewport. A correctness question only for long documents, but it is the same loop being fixed.
- **The plugin's rule for what counts as a tag is not the renderer's rule.** The renderer accepts `##fragment` wherever it is followed by whitespace or the end of the text, case-sensitively, every occurrence. The plugin looks for a form standing alone on its line, and its reading-view half matches case-insensitively with a different boundary. So `##FRAGMENT` and `##fragment.` are marked by the plugin and ignored by the server, while `- ##fragment two` — a form the corpus itself uses — is handled by neither consistently. This is the defect the plugin exists to prevent, in the plugin: a teacher trusting the marking is misled about what the server will do.

**And the instrument needs three additions to make the repair provable:**

- **Errors the editor framework raises must be observed.** The sort defect surfaces as a thrown exception, not as a missing class — a check that only counts markers reads it as "decorated nothing" and cannot tell the two apart.
- **A cursor move and a scroll without an edit must be expressible.** The rebuild defect appears in no other way; the harness can type today, which always changes the document.
- **A check must be able to put a tag combination into the vault.** No corpus file carries a line-1 directive *and* later tags, so the block-recognition repair produces the same empty result before and after. Without this the fix is not observable at all — see design.

The two `DEFECT:` checks and the file-level-directive check are written to assert today's behavior, and all three are rewritten here to assert the repaired behavior.

## Capabilities

### New Capabilities
- `plugin-editor-decorations`: What the plugin marks in the editor and how — that a decoration covers exactly the tag it belongs to, that it follows an edit, a cursor move and a scroll, that an unterminated or malformed tag costs only itself rather than the rest of the document, and that the editor does not reach into rendered output.

### Modified Capabilities
- `plugin-verification`: Three requirement-level additions to what a run can observe and construct — a framework error as an observable outcome, a cursor move and scroll as inputs distinct from typing, and a bounded exception to the corpus-only fixture rule for tag combinations the corpus does not hold.

## Impact

- **Two repositories.** The plugin's `main.ts` (and `styles.css` if the marking changes) live in the companion repository reached through `AI/plugin`; the harness, the checks and the documentation live here. Neither half is verifiable without the other, and the two commits are separate.
- **In this repository**: `test/obsidian/harness.js`, `test/obsidian/plugin.test.js`, `docs-testing.md`, and section 9 of `AI/architecture.md`.
- **The corpus is not touched.** `md/` is the fixture set for the authenticated suite as well, and a file added there would change what `npm test` asserts against. The vault a plugin run assembles is a disposable copy, and that is where a constructed combination goes.
- **`npm test` must be unaffected** — it collects `test/*.test.js`, and nothing added here may join it.
- **Left over from the previous change**: the plugin repository's `README.md` carries an uncommitted verification section describing `npm run test:obsidian`. It belongs to `plugin-setup-obsidian-harness` and is committed as part of the first plugin-side commit here.
- **Not in scope**: the reading view's own repair (`plugin-render-hide-tags`), and any tag form the plugin does not handle today — time windows, pseudo-roles, and the *presentation* of the file-level directive (`plugin-edit-tag-support`). This change makes the line-1 form stop corrupting the rest of the document; it does not give it a look.
