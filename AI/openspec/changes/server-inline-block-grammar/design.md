## Context

`obsidian.js` finds inline blocks with `inlinePermissionRegex = /^[ \t]*@@@(.*?)\n([\s\S]*?)@@@/gms`. The opener must stand at a line start, but the body ends lazily at the next `@@@` substring anywhere. Two functions run it: `extractInlinePermissionBlocks`, which feeds the corpus index and through it the attachment check, and `filterForbiddenSegments`, which feeds `removeForbiddenContent`, search and the attachment grants. Filtering runs in `preParse` *before* `preMarkCode`, so code is not protected. `exam/handout.js:51` has its own substring check, `/@@@[^\n]*#(?:exam|answer)\b/i`.

The plugin (`AI/plugin/main.ts`, `resolveBlocks`) walks lines:
- `opensPermissionBlock` is `/^[ \t]*@@@[ \t]*\S/`.
- `closesPermissionBlock` is `/^[ \t]*@@@[ \t]*$/`.
- An opener inside an open block is content.
- A stray closer is ignored.
- An unclosed block runs to the end.

It knows nothing about code fences. `AI/architecture.md` records the mid-line closer as a deliberate divergence. Measured on 2026-11-18 against the secureLectures `tests/` folder: 2 of 7 files with `#exam` blocks leak every solution (see proposal).

## Goals / Non-Goals

**Goals:**
- One block grammar, implemented once on each side and held together by one oracle table.
- Fail closed wherever a document is malformed: an unclosed block, an unclosed fence.
- No change in output for well-formed documents (opener line removed with its newline, closer text removed, its newline kept, exactly as today).

**Non-Goals:**
- Nesting blocks. The grammar still has none.
- Markers inside callouts or block quotes (`> @@@ …`). Neither side reads them as markers today, and this change leaves that alone.
- Indented (four-space) code blocks. Indentation is how markers sit inside list items, and both sides keep reading indented marker lines as markers.
- Changing `##side-by-side-*` or `##separator`. Their mid-line divergence stays recorded as it is.
- Touching any corpus file.

## Decisions

**D1: A line scanner replaces the regex, and one resolver serves every caller.** `resolveInlineBlocks(md)` walks the text line by line and returns, for each block:
- `start`: the offset of the opener line
- `end`: the end of the closer's text, or the end of the document
- `contentStart` and `contentEnd`
- `entries`: the parsed directive
- `closed`
- `innerDirectiveLines`: the offsets of openers inside the block

`extractInlinePermissionBlocks` maps it into the index shape. `filterForbiddenSegments` uses it in place of the regex, and `exam/handout.js` asks it whether any block's entries name `#exam` or `#answer`. Patching the regex with lookaheads was the alternative. Line boundaries, fences and an unclosed block's end-of-document are not expressible readably in one expression, and a second hand-written variant is exactly how this bug arose.

**D2: Line endings.** Lines are split on `\n`. A trailing `\r` is ignored when a line is classified, so `@@@\r` closes. The body offsets keep the `\r` bytes, so CRLF output stays byte-identical to today's for well-formed blocks.

**D3: Fences follow CommonMark's opening and closing rule, except that an unclosed fence protects nothing.**
- A fence opens on a line that starts (after spaces or tabs) with three or more backticks or three or more tildes.
- It closes on a line of at least as many of the same character with nothing else.

CommonMark lets an unclosed fence run to the end of the document. Here that would turn every later `@@@ #exam` into code text that `marked` then shows to everyone, which is the leak in a new form. So the resolver first pairs fences and drops an unpaired opening fence. The plugin uses the identical rule. Alternative considered: ignoring fences altogether, as the plugin does today. Rejected by the user, because syntax examples in code blocks would open real blocks.

**D4: An opener inside an open block opens nothing, and its line is dropped from the body.** That is what the plugin frames (one block, governed by the outer directive), and the plugin's reading view already hides every marker line (`withoutTags`). The server drops the inner directive line in the same way, so the directive text never shows as text on a page. Alternative considered: deciding the block by both directives (AND). Rejected, because the teacher's view in Obsidian would then frame a block the server decides differently. The spec's guarantee is that the plugin shows what the server does.

**D5: The oracle is a table of documents with expected block line ranges.** A new `test/block-grammar.test.js` runs each row through the server resolver (exported for the test) and through the plugin's `resolveBlocks` via `test/obsidian/harness.js` `pluginFunction`, as `test/directive-grammar.test.js` does for directive entries. Rows are stated as line ranges (`from`, `to`, `closed`), because that is the unit both sides share. The rendering consequences (what a student sees, search, attachments, handout detection) are checked separately in `test/obsidian-syntax.test.js` and `test/attachments.test.js` against the server only.

**D6: The scan logs unclosed blocks.** When the index is built, each block that reaches the end of the document is logged once as `[Blocks] unclosed: <path>:<line>`, next to the existing `[Attachments] unreferenced` lines. It is fail-closed now, but an author should learn that a forgotten `@@@` hides the rest of the page.

## Risks / Trade-offs

- [A document that relied on a mid-line `@@@` to close a block now reads as unclosed, and everything below is hidden from those not addressed] → Before deploying, a one-off diff renders every file of `md/` and of the secureLectures corpus (Nextcloud) with the old and new resolver, as a student holding the file's classes and as a teacher with exam view. It lists every file whose output changes. Each is checked by hand. D6 keeps such cases visible later.
- [The plugin and the server drift again] → The oracle table fails the content suite on any difference. The `architecture.md` divergence entry for `@@@` is removed so nobody relies on it.
- [Old plugin versions in other vaults still frame code-fence markers] → They frame *more* than the server for a while. That is a cosmetic over-marking, not a leak. The plugin release goes out with this change (see Migration).
- [Performance] → One linear pass per document instead of a regex scan. Negligible next to rendering.

## Migration Plan

1. Implement the resolver and the plugin rule, and make the oracle and render checks pass.
2. Run the corpus diff (Risks), and look at every listed file.
3. Release the plugin (version in three places, tag, GitHub release).
4. Push safeLearn, then merge into secureLectures and push (deploy path filter: check that a run starts for HEAD).
5. Rollback: revert the commit. The resolver has no stored state, and the index is rebuilt on the next scan.
