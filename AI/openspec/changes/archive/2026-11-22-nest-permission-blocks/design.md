## Context

- `resolveInlineBlocks` (`obsidian.js`) is a line scanner with a single `open` slot. An opener inside an open block is recorded in `innerDirectives` and opens nothing; the first closing line closes the outer block. Each block carries `start`, `end`, `contentStart`, `contentEnd`, `entries`, `closed`, `innerDirectives`, `fromLine`, `toLine`.
- `filterForbiddenSegments` decides each block independently and cuts ranges: a hidden block whole, a shown block's opener, inner openers and closer. The cut loop already sorts and merges overlapping ranges (`carried = Math.max(carried, to)`), so a hidden outer block swallows anything inside it.
- The corpus index stores the block shapes (`extractInlinePermissionBlocks`) in memory; the attachment check, search and `exam/handout.js` `hasSolution` read blocks through the same grammar.
- The plugin (`AI/plugin/main.ts`) has its own block parser checked against the server through the shared grammar table.
- `fail-closed-fence-entries` is a prerequisite: it makes every single level narrow-only, so AND across levels keeps the whole nest narrow-only.

## Goals / Non-Goals

**Goals:**
- Bracket-style pairing with any depth, one grammar for server and plugin.
- No view that shows a nested block's content while hiding its parent.

**Non-Goals:**
- Distinguishable closers (`@@@@`, named closers). Plain `@@@` closes the innermost block; nothing in the use cases needs to close an outer block early.
- Nesting side-by-side blocks in permission blocks or vice versa beyond what already works.
- Repairing content outside `md/`; the three files found are listed in the proposal for Gerald to fix.

## Decisions

### D1: A stack in the scanner; blocks gain `depth` and `parent`

`open` becomes a stack. An opener pushes; a closer pops the innermost and emits it; at the end of the document every remaining entry is emitted, innermost first, with `end = md.length` and `closed = false`. Blocks are returned sorted by `start` and carry `depth` (0 for outermost) and `parent` (index into the returned array, or `null`). `innerDirectives` is removed: an inner opener is now its own block's `start..contentStart`.

*Alternative:* keep the flat list and compute nesting from range containment afterwards. Rejected: the scanner knows the pairing for free, and a second derivation is a second place to get it wrong.

### D2: Effective visibility is computed once, top-down

`filterForbiddenSegments` still asks `hasSomeRoles` per block (each against its own directive, same request context), then sets `shown[i] = own[i] && (parent === null || shown[parent])` in `start` order. The cut logic is unchanged apart from dropping `innerDirectives`; overlapping cuts already merge. Every consumer that needs a per-block verdict (the attachment check, search segments) takes `shown`, never `own`.

*Alternative:* concatenate the ancestors' entries into one directive. Rejected: roles OR within a level but AND across levels, which one flat entry list cannot express, and window/role-group rules (`fail-closed-fence-entries` D2) apply per level.

### D3: Marker detection looks at every level

`hasSolution` and the module's check for `#variant-private` / `#optional` blocks walk all returned blocks, whatever their depth.

### D4: Plugin frames by depth

The plugin's parser adopts D1. Frames are drawn per block; the shade is chosen by `depth % 2`. An unclosed block gets the warning class (yellow) from its directive line to the last line of the document, at whatever depth. Inner frames are inset so the outer frame's edges stay one vertical line (existing frame requirement).

### D5: Corpus check for unclosed blocks

A check in the content suite runs `resolveInlineBlocks` over every file of `md/` and fails on `closed === false`, naming file and `fromLine`. The server's existing `[Blocks] unclosed` log line covers content outside `md/`.

## Risks / Trade-offs

- [A forgotten inner closer hides the rest of the page] → Accepted (2026-11-22). Plugin marks it yellow while writing; the corpus check and the server log catch it after.
- [Existing content where an inner opener was swallowed changes meaning] → Scan of 2026-11-22: one occurrence left in secureLectures (EN `MOB 01`), caused by a closing line with a non-breaking space; it only gets more restrictive. Re-run the scan before deploying.
- [Plugin and server disagree during rollout] → The plugin is an editor aid only; the server decides. Release the plugin with the server deploy.

## Migration Plan

Fix the listed content files, deploy safeLearn after `fail-closed-fence-entries`, merge into secureLectures, release the plugin. Rollback: revert; the in-memory index is rebuilt on start.
