Source: AI/open-proposals.md — "Fences verschachteln oder kombinieren"

## Why

A section for one class that contains a note for one student of that class cannot be written today: an opener inside an open block opens nothing and is swallowed, so the inner restriction is silently lost and the inner text is shown to the whole class. Nesting lets an author narrow step by step (decided 2026-11-22), and because each level can only narrow what its parent shows, it adds no way to show anything to more readers than before. It builds on `fail-closed-fence-entries`, which makes each single directive narrow-only.

## What Changes

- **BREAKING** (grammar): an opening marker line inside an open block opens a nested block. A closing line closes the innermost open block. Previously the inner opener was swallowed and the next closing line ended the outer block.
- A nested block is shown to a session only if it and every enclosing block are shown to it (AND across levels; each level decided by its own directive as today).
- Blocks that are never closed all run to the end of the document. A forgotten inner closer therefore hides the rest of the document from everyone the outer block or the inner one does not admit — accepted as the fail-closed price (decided 2026-11-22).
- A stray closing line outside every block still closes nothing.
- Every reader of inline blocks — page, presentation and document views, handouts, embeds, search, the corpus index, the attachment check, the exam module's marker detection — follows the nesting.
- Obsidian plugin: nested blocks are framed per level with alternating shades; a block that is not closed is marked as open (yellow) down to the end of the document. A plugin release follows.
- A corpus check fails for any unclosed inline block in `md/`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `permission-block-grammar`: nested openers open blocks; unclosed blocks at every level run to the end; the shared table gains nesting rows.
- `role-resolution`: a nested block requires every enclosing block.
- `plugin-editor-decorations`: frames per nesting level, alternating shades, unclosed blocks marked to the end.
- `content-verification`: a check for unclosed blocks in the corpus.

## Impact

- `obsidian.js` `resolveInlineBlocks` (stack instead of a single open block; blocks carry depth and parent), `filterForbiddenSegments` and `removeForbiddenContent` (overlapping ranges), the corpus index's block shapes, corpus search segments, the attachment check, `exam/handout.js` `hasSolution`.
- Plugin (`AI/plugin/main.ts`): block parser, frame drawing, release.
- `docs-permissions.md` ("Where a block begins and ends"), `AI/architecture.md`; `test/block-grammar.test.js`, the shared grammar table, `test/checks/*`, test corpus pages.
- Content: the scan of both corpora (2026-11-22) found one inner opener left, in the EN copy of `MOB 01 - ERD + DBs on mobile + Room.md` (a closing line written with a non-breaking space), and unclosed blocks in the EN copy of `EAR 03 - SA + REST.md` and in `archive/24-25 - 5CHIF - WS.md`. They need fixing before this deploys; the DE copies are already fixed.
