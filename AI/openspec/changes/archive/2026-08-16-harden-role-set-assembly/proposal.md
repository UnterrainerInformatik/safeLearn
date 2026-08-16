## Why

`fix-role-check-self-grant` stopped a directive from answering its own question, but it left the other end of the same problem open: the role set a directive is measured against is still assembled from something that is not a role. `hasRoles` writes the user's display name into the role namespace (`r[name] = true`, `utils.js:132`), and the canonicalization block that change introduced now runs over it — so a session whose display name is `teachers` is handed the `teacher` role, and one whose name is `admin` reaches the admin short-circuit. The display name as a permission role is a documented feature (`docs-permissions.md:16`), so the namespace has to be defended rather than the feature removed.

The same change also made `student` and `students` behave unlike `teacher` and `teachers`: `r.students` is folded into `student` and deleted, but nothing sets it back, so `@@@ students` now matches nobody and does so silently. Alongside these two, `hasRoles` carries an argument its callee does not declare, a 47-line function nobody calls, and an error path that returns `null` where the success path is careful to normalize `null` to `false`.

## What Changes

- A display name that collides with a reserved role name (`admin`, `teacher`, `teachers`, `student`, `students`) is no longer added to the session's role set, and the collision is logged. Every other display name keeps working exactly as documented.
- `student` and `students` become symmetric with `teacher` and `teachers`: both spellings address the same readers, in both directions. This restores `@@@ students`, which the previous change had silently turned into a directive that matches nobody.
- **BREAKING for deployed content**: a document using `@@@ students` starts matching students again. Blocks that had become invisible to everyone become visible to the group the author originally addressed — which is the intent of the wording, but it is a visible change for any content written since the previous change shipped. Before deploying, grep the deployed `md/` tree for `@@@` lines naming `students`.
- `hasRoles` fails closed: the `catch` returns `false` instead of `null`, matching how the success path already normalizes an undecided result.
- `getClientRoles(req, normalizedClientRoles)` drops the second argument, which the signature `getClientRoles(req)` never declared. The call currently reads as though the requested roles feed role resolution — the exact impression the previous change set out to remove.
- `hasClientRoles` (`utils.js:48-94`) is deleted. It has no caller anywhere in the repository.
- `docs-permissions.md` is corrected on two points it already gets wrong today: it claims the LDAP unit `Students` maps to `students` (the code produces `student`) and states "There is no role `student`" (there is). The `student`/`students` alias is documented next to the existing `teachers` rule.

## Capabilities

### New Capabilities

None. This change tightens behavior the `role-resolution` capability already describes.

### Modified Capabilities

- `role-resolution`: the requirement that a session's roles come from the session alone gains the reserved-name rule for display names; the teacher-alias requirement is generalized so that `student`/`students` behaves the same way; a new requirement states that role resolution denies access when it fails.

## Impact

- `utils.js` — `hasRoles` (name guard, `student` alias, `catch` return, `getClientRoles` call site) and the removal of `hasClientRoles`. No other file in the repository calls into either.
- `docs-permissions.md` — the `Students` → `student` mapping, the "no role `student`" claim, and the new alias rule.
- `test/checks/permissions.js` and `test/coverage-map.json` — coverage for the reserved-name guard and for `@@@ students`.
- `md/` — a fixture demonstrating the `student`/`students` alias, in the manner of `md/test-perms-teacher-alias.md`.
- `AI/architecture.md` — Observations records the `docs-permissions.md` divergence about `student` as open; it is resolved here.
- `AI/proposals/initial-repairs.md` overlaps on exactly that one documentation point (its bullet 5). Nothing else in that proposal is touched.
- No API, dependency, or deployment surface changes.
