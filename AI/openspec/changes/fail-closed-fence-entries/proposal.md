Origin: AI/open-proposals.md — "Fences verschachteln oder kombinieren", the security half. The backlog entry is retired by `nest-permission-blocks`, not by this change.

## Why

A directive must never show a block to more readers than its author wrote. Three things in the current resolution break that: an unreadable time window is kept as *no* window, so an entry meant to open for a fortnight opens forever; a role entry whose window is closed or unreadable drops out of the directive, and if only a view marker remains, the marker alone decides — `@@@ 4ahif[closed], #optional` is shown to everyone with optional blocks on; and when a fence names several view markers, each one overwrites the verdict of the one before, so `@@@ #variant-private, #optional` is decided by `#optional` alone. Nobody combines markers in the corpus yet (306 marker lines, every one a single marker), so the rules can be fixed before anyone relies on the wrong ones, and before `nest-permission-blocks` makes combining something we recommend.

## What Changes

- An entry whose bracketed window cannot be read, in whole or in part, is kept and never matches anyone. It is no longer read as an entry without a window.
- An entry whose window is closed or unreadable counts as closed for what it names: for a role or a person, nobody is admitted through it; for a view marker, the marker cannot be satisfied and the block is hidden.
- When a directive names roles or persons, at least one of them SHALL be open and held by the session. A directive whose written roles are all closed is refused, whatever its view markers say. Roles stay OR among themselves.
- Several view markers in one directive are combined with AND, in any order. `#variant-private, #variant-public` therefore hides its block from everyone.
- Empty entries (`, ,`) stay ignored; they name nobody and cannot widen anything.
- An admin keeps passing every role test, and keeps being subject to the view markers, as today.
- Obsidian plugin: a discarded window is marked as one that closes its entry (not as one that makes it permanent), and a directive naming both variant markers is marked as hiding its block from everyone. A plugin release follows.

## Capabilities

### New Capabilities

### Modified Capabilities
- `role-resolution`: new requirements for how view markers combine, for written roles that are all closed, and for closed or unreadable windows on any entry.
- `plugin-editor-decorations`: "A window the server discards is marked as discarded" changes meaning (the entry is closed, not permanent); a directive naming both variants is marked as withheld from everyone.

## Impact

- `obsidian.js`: `parsePermissionWindow` / `parsePermissionEntry` (unreadable window kept as an invalid window), `getActivePermissionRoles` and its two callers `filterForbiddenSegments` and `resolveFileVisibility` (pass on whether roles were written).
- `utils.js` `hasRoles`: marker AND, refusal when written roles are all closed.
- Plugin (`AI/plugin`): window marking and the both-variants error; release.
- `docs-permissions.md`, `AI/architecture.md`; tests in `test/permission-context.test.js`, `test/directive-grammar.test.js`, `test/view-markers.test.js`; test corpus pages for combined and timed fences.
- Content: none affected; the scan of `md/` and the secureLectures share found no combined fence and no unreadable window.
