## Why

`hasRoles` in `utils.js` decides two of its three access questions against the wrong list. It computes

```js
let isAdmin   = r.admin   || normalizedClientRoles.includes("admin");
let isTeacher = r.teacher || normalizedClientRoles.includes("teacher");
```

where `r` is the role set of the session and `normalizedClientRoles` is the list written in the `@@@` directive. The second operand asks "does the directive say `admin`?" instead of "does the session hold `admin`?", so the directive answers itself. Measured against the running server with the `student` demo account, `@@@ admin` and `@@@ teacher, teachers` are visible to everyone, and `@@@ admin, #exam` hands a student the exam variant as soon as they flip their own `ve` preference in the gear menu. `@@@ admin` protects nothing today, which makes it worse than having no directive at all — an author reading `docs-permissions.md` believes the block is restricted.

## What Changes

- `isAdmin` and `isTeacher` are derived from the session's role set alone. The requested roles no longer take part in deciding who holds a role.
- The `teacher` → `teachers` alias moves out of the access decision into role-set assembly, where the `Teachers` → `teacher` LDAP mapping already lives. Today it is applied mid-check as a side effect (`r.teachers = true`), which is what lets `@@@ teacher, teachers` grant itself through the plural.
- The student-view downgrade (`allowOverride` with preference `vt == 0`) removes `teacher`, `teachers` and `admin` from the role set. Today it removes only `teacher`, so the `teachers` alias survives it.
- **BREAKING** (for content, not for an API): blocks that are visible today stop being visible. Any `@@@ admin` block becomes invisible to non-admins; any `@@@ teachers` block becomes invisible to sessions without the teacher role and to a teacher who has dropped the teacher view. Documents that were readable by accident will look different to their readers.
- A corpus file demonstrating the `teachers` alias is added, and the verification suite asserts on both `@@@ admin` and `@@@ teachers`. The `@@@ admin` block of `md/test-md-file.md` is asserted today by nothing at all, because the current behavior is the defect.
- `docs-testing.md`, `docs-permissions.md` and `AI/architecture.md` are brought in line with the repaired behavior; the recorded observation "a `@@@ admin` block is visible to everyone" is replaced by what a run can now prove.

## Capabilities

### New Capabilities

- `role-resolution`: how SafeLearn turns an authenticated session and a `@@@` directive into an access decision — where roles come from, that a directive can never grant itself, the `teacher`/`teachers` alias, the admin short-circuit, the student-view downgrade, and the hardcoded `#exam` gate.

### Modified Capabilities

None. `content-verification` already requires that a permission rule be proven in both directions and that a demonstration the corpus lacks be added as a new file; this change satisfies those requirements rather than altering them.

## Impact

- `utils.js` — `hasRoles`: the two role derivations, the alias side effect, the downgrade branch.
- `middlewares/keycloak-middleware.js` — `getLdapGroups` is where the alias belongs if it is centralized there.
- `md/` — one new corpus file demonstrating the `teachers` alias.
- `test/checks/permissions.js`, `test/coverage-map.json` — new checks on the `@@@ admin` and `@@@ teachers` blocks and on the downgrade.
- `docs-permissions.md`, `docs-testing.md`, `AI/architecture.md` — the documented behavior and the recorded observations.
- Deployed content: any document relying on the leak changes what its readers see. Nothing else in the application calls `hasRoles` other than `app.js` and `obsidian.js`, both through `hasSomeRoles`.
