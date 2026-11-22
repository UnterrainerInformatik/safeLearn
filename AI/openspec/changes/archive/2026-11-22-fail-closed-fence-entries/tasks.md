## 1. Entry parsing

- [x] 1.1 `obsidian.js` `parsePermissionWindow`: return the `INVALID` sentinel for an unreadable window and for a window with any unreadable end; keep `null` only for "no bracket" (design D1)
- [x] 1.2 `parsePermissionEntry`: an unmatched non-empty token becomes an entry with `window: INVALID`; empty tokens stay dropped
- [x] 1.3 `isPermissionEntryActive` false for `INVALID`; `hasTimedWindow` false for `INVALID` (D4)
- [x] 1.4 Log `[Permissions] unreadable window: <file>:<line> <entry>` once per scan, beside `[Blocks] unclosed`

## 2. Decision

- [x] 2.1 Replace `getActivePermissionRoles` with a function returning `{ active, wroteRoles }`; closed or invalid `#` entries stay in `active` as an unsatisfiable marker (D2)
- [x] 2.2 `filterForbiddenSegments` and `resolveFileVisibility` pass `wroteRoles` through `hasSomeRoles`; keep the "outside-window" reason for a whole-file directive whose written roles are all closed
- [x] 2.3 `utils.js` `hasRoles`: with `wroteRoles` and no active non-`#` entry, return `false` before the admin short-circuit
- [x] 2.4 `hasRoles`: combine markers with AND, unknown still returns `false` at once (D3); update the comments
- [x] 2.5 Check every other caller of `hasSomeRoles` with directive entries (attachments, handout `hasSolution`, search) reaches the new path; confirm the corpus index is in-memory only

## 3. Tests and corpus

- [x] 3.1 Unit tests for every scenario of the `role-resolution` delta (marker AND in both orders, both variants, handout flags, closed class window + marker, one of two roles open, admin and closed directive, misspelled window, half window, `[]`, all windows unreadable as file directive, window on a marker)
- [x] 3.2 `test/directive-grammar.test.js`: half window and unmatched token parse the same in server and plugin
- [x] 3.3 Test corpus page in `md/` with a combined-marker block and a timed class + marker block; extend the live browser checks for teacher and student
- [x] 3.4 Run the affected checks, then the full `npm test` once

## 4. Plugin

- [x] 4.1 `AI/plugin/main.ts`: mirror D1 in the window parser; mark a discarded window's entry as closed; mark `#variant-private` + `#variant-public` as the "hides from everyone" error (`plugin-editor-decorations` delta)
- [x] 4.2 Plugin tests; run `test:obsidian` (with `SAFELEARN_OBSIDIAN_APP` and `AI/plugin` on origin/master)
- [x] 4.3 Plugin release

## 5. Docs and rollout

- [x] 5.1 `docs-permissions.md`: combining markers (AND, the teacher-only solution `#variant-private, #optional`), roles OR, what a broken or closed window does; `AI/architecture.md` observations
- [x] 5.2 Commit, push, merge into secureLectures and push; confirm the deploy run started for HEAD
