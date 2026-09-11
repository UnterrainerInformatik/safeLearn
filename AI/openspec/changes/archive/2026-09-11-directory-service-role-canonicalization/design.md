## Context

See proposal.md — Why. `verifyCallerIdentity` (`middlewares/directory-service.js:42-76`) builds its role map from two sources: `deriveRoles(introspection.ldap)` (imported from `keycloak-middleware.js`, which already aliases `teachers` → `teacher` and `students` → `student` inline) and a second loop merging `introspection.resource_access[client.client_id].roles` that does not. `isAdmin`/`isTeacher` then read only the singular keys (`roles.admin`, `roles.teacher`), so a role held solely as the plural client role never sets the flag the second source ought to satisfy.

The codebase already has this exact aliasing duplicated twice — once in `deriveRoles` (`keycloak-middleware.js`), once inline in `hasRoles` (`utils.js:116-129`, which explicitly comments "Any future source of roles must be merged above this line, so that the canonicalization and the alias below cover it too") — and `verifyCallerIdentity` is a third place doing its own partial version that was never extended to cover this. This is the same shape of gap as the archived changes `fix-role-check-self-grant` and `plugin-role-check-wrong-client`: a role check reimplemented ad hoc instead of sharing the canonical one.

## Goals / Non-Goals

**Goals:**
- Make `verifyCallerIdentity`'s `resource_access`-derived roles canonicalize `teachers`/`students` the same way `deriveRoles` and `hasRoles` already do, so the three independent role-check implementations (session, plugin, directory-search backend) can never disagree on this input again.

**Non-Goals:**
- Not extracting a single shared `canonicalizeRole` helper used by all three paths. The inputs differ enough (a role array here, an `r` object being mutated in place in `utils.js`, a single string in `deriveRoles`) that forcing one signature over all three is a larger refactor than this fix warrants, and the codebase already tolerates the same few lines duplicated between `deriveRoles` and `hasRoles`. Worth revisiting only if a fourth path appears.
- Not touching the plugin (`main.ts`) — its `hasDirectoryRole()` already checks both spellings correctly; it was the backend that was behind.
- Not changing what "refused" looks like to the caller (`403`, collapsed with "not logged in" at the plugin) — that silence is `directory-search`'s and `plugin-directory-auth`'s existing, deliberate design, not part of this bug.

## Decisions

**Inline alias, mirroring `deriveRoles`.** Add the same two conditionals `deriveRoles` uses (`if (value === "teachers") value = "teacher"`, `if (value === "students") value = "student"`) to the `resourceRoles` merge loop in `verifyCallerIdentity`, before `roles[normalized] = true`. Smallest possible diff, same normalization rule, same place the bug lives.

*Alternative considered*: export `normalizeRole`/the alias block from `utils.js` and import it into `directory-service.js`. Rejected — `hasRoles`'s version mutates a role map `r` it already holds (`r.teachers` → `r.teacher`, deletes the plural, then re-derives both spellings back), which is shaped around that function's own control flow, not a clean pure function to lift out today. The inline duplication this change adds is exactly as large as the duplication that already exists between `deriveRoles` and `hasRoles`.

**Extract the role-decision itself into a small exported, pure function** — e.g. `resolveCallerRoles(ldap, resourceAccessRoles)` returning `{ isAdmin, isTeacher }` — called by `verifyCallerIdentity` after introspection succeeds. This is the same testability-driven split `fetchAllDirectoryUsers`/`fetchAllUserPages` already use in this file (see the comment at `fetchAllUserPages`'s definition): `verifyCallerIdentity` itself cannot be unit-tested without a live `client.introspect` call (`client` is populated only by `initKeycloak()` against a real Keycloak, and is an imported live binding this test process cannot substitute), but the plural-role decision this change fixes has nothing to do with introspection or networking — it is pure data in, pure flags out, and belongs in `test/directory-service.test.js` the same way pagination does, not in the live-realm suite (`test/checks/directory-search.js`), which cannot grant a shared demo account a plural-only role from test code.

## Risks / Trade-offs

[A future fourth role source repeats this gap again] → The delta spec's new requirement text calls out that the canonicalization must match "every other role check in the system", which is the standard `directory-search` is now held to at review time; no runtime guard is added since none of the three existing paths has one either.

## Migration Plan

No data migration. The fix widens who is authorized (a superset of the current behavior — no caller that was previously authorized loses access), so it is safe to deploy directly; no flag or staged rollout needed. Existing accounts whose teacher/admin grant is already spelled `teacher`/`admin` (singular) or arrives via LDAP `OU=` see no change.
