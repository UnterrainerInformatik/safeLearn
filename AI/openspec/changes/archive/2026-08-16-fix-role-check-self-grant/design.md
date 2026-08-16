## Context

See `proposal.md` — Why. The defect lives entirely in `hasRoles` in `utils.js`, the single place where a `@@@` directive meets a session. `app.js` and `obsidian.js` reach it only through `hasSomeRoles`, so there is one code path to repair and no caller to migrate.

Four facts shape the approach:

- **The role set is a plain object of truthy keys.** `hasRoles` builds `r` per request from `req.user.rolesCalculated` (the LDAP units, already normalized by `getLdapGroups`), the Keycloak client roles, and the user's own name. Access is then `some`/`every` over `r`. Writing into `r` mid-check — which is what `r.teachers = true` does — mutates the set every later directive in the same request is measured against.
- **`getLdapGroups` sees only LDAP.** It already maps `Teachers` → `teacher`. The `teacher` role can also arrive as a Keycloak client role, which never passes through that function, so the alias cannot be centralized there without missing that source.
- **The suite has two accounts, `student` and `teacher`, and neither is an admin.** The permitted side of an `admin` rule is therefore not directly provable — the same situation `docs-testing.md` already records for the `5bhif` block.
- **`content-verification` constrains how the corpus may grow**: a demonstration the corpus lacks is added as a new file, and existing corpus files are not edited in a way that changes what a human reading them sees.

## Goals / Non-Goals

**Goals:**

- One place, and only one, decides which roles a session holds; directive text never reaches it.
- The `teachers` alias is a property of the session, so it behaves identically whether it is named first, last, or alongside `teacher`.
- Every behavior the repaired rule adds or removes is provable by `npm test`, except the admin-permitted side, whose absence is recorded rather than worked around.

**Non-Goals:**

- **The `#practice` finding.** `#practice` is granted by `ve == 0` with no role in the rule; a student who turns the exam view on ends up with neither variant. It is a separate observation, asserted as it is in `test/checks/views.js`. Only the wording of the observation in `AI/architecture.md` is reviewed here, never the behavior.
- **`docs-permissions.md`'s claim that a teacher "sees everything (except for admin-only)".** No such wildcard exists in the code today either — a teacher does not match `@@@ 5chif` — and the `Students` → `students` line in the same document is wrong in the same way. Both belong to the `initial-repairs` proposal, which already collects the documentation divergences.
- Time-windowed entries, whole-file directive discovery, and the SSE visibility timer. The change does not touch them, and the new capability spec does not claim them.
- Introducing an admin account, in Keycloak or in the harness. See Decision 5.

## Decisions

### 1. Derive `isAdmin` / `isTeacher` from the role set only

```js
let isAdmin   = !!r.admin;
let isTeacher = !!r.teacher;
```

The directive's own list drops out of both. Everything downstream — the `admin` short-circuit, the downgrade condition, the `#exam` gate — keeps working unchanged, because all three were always meant to read "what does this session hold".

*Alternative considered:* keep the shape and intersect against the session (`normalizedClientRoles.includes("admin") && r.admin`). Rejected: it reads as if the directive still had a say, and it is exactly the phrasing that hid the defect for so long. The `admin` short-circuit is not conditional on the directive naming `admin` — an admin sees a `@@@ 5bhif` block too — so tying it to the directive would be a second, quieter defect.

### 2. Make the alias part of role-set assembly

Right after the client roles are merged into `r`, and before any directive is looked at:

- canonicalize the plurals the same way `getLdapGroups` does, so a client role literally named `teachers` or `students` lands on `teacher` / `student`;
- then set `r.teachers` from `r.teacher`.

Placing it after the merge is what makes it independent of the source: LDAP unit, client role, or both. `getLdapGroups` keeps its own mapping — it feeds `rolesCalculated`, which is stored on the session and read elsewhere, so removing it there would be a wider change than this one.

*Alternative considered:* centralize everything in `getLdapGroups`. Rejected: it never sees Keycloak client roles, so a teacher whose role comes from Keycloak would silently lose the alias.

*Alternative considered:* resolve the alias on the directive side instead — rewrite `teachers` to `teacher` when parsing the directive. Rejected: it is the same class of construct as the defect, working on the requested list rather than the held one, and it would have to be repeated in every place a directive is parsed.

### 3. The downgrade removes all three keys

`teacher`, `teachers` and `admin` are deleted from `r` when `allowOverride` is set and `vt == 0`, alongside the existing `isAdmin = isTeacher = false`. Today only `teacher` is deleted, so a teacher in the student view still matches `@@@ teachers` — the alias outlives the downgrade that is supposed to have removed the role behind it. `admin` is deleted for the same reason: after Decision 1 the short-circuit is off, but `some(role => r[role])` would still match a directive naming `admin`, and "sees exactly what a student sees" has to mean all of it.

The deletions are safe to widen because `r` is a throwaway: `hasRoles` rebuilds it on every call from `JSON.parse(req.user.rolesCalculated)`, and the only writer of `rolesCalculated` is `getLdapGroups` in `middlewares/keycloak-middleware.js`. Nothing `hasRoles` deletes outlives the request, so switching the teacher view back on (`vt == 1`) restores every role on the next request without any state to undo. The alias is derived rather than stored for the same reason.

This is the one place where the repair removes access that was reachable on purpose rather than by accident, so it is called out as **BREAKING** in the proposal.

*Alternative considered:* leave `admin` in place and treat the downgrade as a teacher-only feature. Rejected by the user when the scope was settled: the downgrade is defined as "what a student sees", and a rule with an exception nobody can test is worse than one without.

### 4. `#exam` needs no edit, but it does need an ordering guarantee

The gate `clientAccess = a.ve == 1 && (isAdmin || isTeacher)` becomes correct the moment Decision 1 lands, and it is already evaluated after the downgrade branch. That ordering is what makes a teacher in the student view fail the gate, so the tasks keep the downgrade before the view rules and the spec states the dependency.

### 5. Assert the admin rule from the session, not from a new account

The check computes what it expects from `roles(session)` — `carried.has("admin")` — exactly as the existing block checks do. Today that exercises the denied side for both accounts and nothing else, and the entry in `docs-testing.md` moves from "`@@@ admin` is visible to everyone" to "the permitted side is not exercised", joining the `5bhif` entry it now resembles. If an account ever gains the role, the same check starts proving the other direction with no edit.

*Alternative considered:* an optional third harness role behind `SAFELEARN_TEST_ADMIN_USER`, skipped when unset. Rejected by the user when the scope was settled: the demo realm has no admin account, so the code would be dead on every run, and a check that is skipped by default is a check nobody notices breaking.

### 6. One new corpus file for the alias, none for `admin`

`md/test-md-file.md` already demonstrates `@@@ admin` with the "Admins only!!!" block — nothing about it needs to change; the check that was missing simply gets written. The corpus has no `@@@ teachers` demonstration at all, so a new file is added for it rather than a block being inserted into `md/test-perms.md`. Both follow `content-verification` directly.

The new file carries no whole-file directive, so it appears in the navigation tree for every session, which is what `test/checks/navigation.js` derives from the corpus on disk anyway. It must be registered in `test/coverage-map.json`, which `test/coverage.test.js` enforces.

### 7. Drop the duplicate role fetch while we are inside the function

`hasRoles` calls `getClientRoles(req)` twice — once into `ccr`, which is never read again, and once into `cr`. Each call reads and parses `keycloak.json` from disk synchronously, on every directive of every page. The dead call sits in the block being rewritten, so it goes with it. Called out here so it is not mistaken for scope creep in review: it removes a statement, and no behavior depends on it.

## Risks / Trade-offs

- **Content that was readable becomes unreadable.** → That is the point of the change, but it is invisible until someone opens a page. The rollout note in the tasks says it plainly: any deployment whose documents use `@@@ admin` or `@@@ teachers` should expect blocks to disappear for readers who were never meant to have them.
- **The admin-permitted side stays unproven.** → A rule that denied *everyone*, admins included, would pass the new check just as the current defect passes today's absent one. Mitigated only partly: the check derives from the session, so it converts to a real two-sided proof the day an admin account exists. Recorded in `docs-testing.md` so it is a known gap rather than a silent one.
- **The suite logs into shared public accounts and writes their preferences.** → The downgrade check already sets `vt` and restores it in a `finally`; the new alias assertions ride inside that same check instead of adding another preference-writing test, keeping the number of racy writes where it is.
- **The alias could be read as a second role rather than a projection of the first.** → The spec states it as a property of the role set, and the downgrade deletes both keys together. If a future change adds another source of roles, the alias must be applied after it — the code comment says so at the assembly point.

## Migration Plan

No data migration, no schema, no dependency. Deploying is restarting the application; rolling back is reverting the commit, which restores the old visibility exactly.

The one operational step is human: before deploying, grep the deployed `md/` tree for `@@@` lines naming `admin` or `teachers` and tell the authors of those documents what will change for their readers. Nothing in the repository's own corpus depends on the leak.
