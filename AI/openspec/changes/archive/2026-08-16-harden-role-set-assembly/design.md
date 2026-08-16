## Context

See proposal.md — Why. Two facts about `hasRoles` shape everything below.

**The role set is a flat namespace of truthy keys.** `r` is a plain object built per request from `req.user.rolesCalculated` (the LDAP units, already normalized by `getLdapGroups`), the Keycloak client roles, and the user's display name. Access is `some`/`every` over `r`. There is nothing in the shape of the object that distinguishes "this key is a role the identity provider issued" from "this key is what the person is called" — which is precisely why a name can act as a role, and why it is a documented feature (`docs-permissions.md:16`) rather than an accident.

**The canonicalization now runs over the whole set.** `fix-role-check-self-grant` placed the plural aliasing after the merge, deliberately, so it would cover every source of roles. The display name is one of those sources, and it was merged above that line. The hardening is therefore a consequence of the previous change, not a defect it introduced independently: before it, a display name of `teachers` matched only a directive spelling `teachers`; after it, that name becomes the `teacher` role and reaches the admin/teacher decision and the exam gate.

`r` is a throwaway — rebuilt on every call, nothing written into it outlives the request. Any guard placed here needs no migration and no state to undo.

## Goals / Non-Goals

**Goals:**

- Keep the addressed-by-name feature working for every name that is not a built-in role name.
- Make `student`/`students` indistinguishable to a directive author, the way `teacher`/`teachers` already is.
- Leave `hasRoles` with no call site, argument, or return value that misrepresents what decides access.

**Non-Goals:**

- Separating identity from roles structurally. A dedicated identity set, checked alongside `r`, would make the collision impossible rather than merely refused — see Decision 1 for why that is not this change.
- Reserving class names. Only the five built-in role names are protected; a display name colliding with a class such as `5bhif` stays possible (Risks).
- Anything else in `AI/proposals/initial-repairs.md`. Only its documentation point about `student` is resolved here, because this change settles that word's meaning.

## Decisions

### Decision 1: A reserved-name list, checked before the name enters the role set

`r[name] = true` becomes conditional on `name` not being one of `admin`, `teacher`, `teachers`, `student`, `students`, compared after the existing trim-and-lowercase. On a hit the name is dropped and `console.warn` records it.

The check sits at the assignment, not at the decision. That keeps the guarantee independent of what runs afterwards: the name never reaches the canonicalization, the admin short-circuit, the downgrade, or the exam gate, because it never enters the set at all. It also keeps the guard next to the line that creates the hazard, where the next person editing that line will see it.

The list names the canonical roles *and* their plurals, even though the plurals are folded away a few lines later. A name of `teachers` must be refused before it becomes `teacher`, so the pre-canonicalization spellings have to be in the list.

*Alternatives considered:*

- **A separate identity set.** `r` holds roles, a second set holds the name, and the directive check consults both. This makes a collision structurally impossible rather than refused, and is the design one would choose from scratch. Rejected for this change: it rewrites the access decision — every `some`/`every` over `r`, the downgrade deletions, and the tests that read the set — for a hazard the list closes completely. Worth doing when the resolution is next opened for a larger reason; noted here so the reasoning is not lost.
- **Moving `r[name] = true` below the canonicalization.** One line, and it does stop a name of `teachers` from becoming `teacher`. It does not stop a name of literally `admin` or `teacher` from matching that role, so it closes half the hole while looking like it closed all of it. Rejected: a half-guard in security code is worse than none, because it invites the reader to stop looking.

### Decision 2: The plural alias becomes symmetric, and both spellings survive in the set

`if (r.student) r.students = true;` joins the existing `if (r.teacher) r.teachers = true;`, so both directions hold for both roles. A session ends up carrying both spellings, whichever one its role arrived as, and a directive matches whichever the author wrote.

Keeping both keys — rather than canonicalizing to the singular and teaching the directive lookup to fold plurals — is what the teacher side already does, and the alias is then a property of the reader, which is the invariant `fix-role-check-self-grant` established. A lookup-side fold would move the aliasing back into the access decision, next to the code that change removed.

The student-view downgrade deletes `teacher`, `teachers` and `admin`. It does **not** delete `student` or `students`: the downgrade exists to make a teacher see what a student sees, so the student role is the thing it is downgrading *to*.

*Alternative considered:* declare the singular the only valid spelling and let `@@@ students` match nobody. Rejected by the user's decision, and it is the weaker option regardless — a directive that silently matches nobody gives the author no signal, and the plural is the spelling the LDAP unit itself uses.

### Decision 3: The error path returns `false`

`catch` returns `false` instead of `null`. The success path already normalizes an undecided `null` to `false` before returning, so `null` escapes only from the error path — the one place where the caller has the least information and the most reason to be refused. `false` is what every caller already treats as a refusal; no call site changes.

### Decision 4: The two cleanups go with this change, not a separate one

`getClientRoles(req, normalizedClientRoles)` loses its second argument, and `hasClientRoles` is deleted. Both are in the blast radius of the reader who comes to check the self-grant fix: the call site suggests the requested roles feed role resolution, and the dead function is a second, similar-looking implementation of the same check with no caller. Leaving either in place preserves the ambiguity this change exists to remove.

## Risks / Trade-offs

- **A display name colliding with a class role (`5bhif`, `4ahif`, …) is still possible.** → Out of scope by design: class roles are data, not a fixed list, so no list can cover them. The structural fix in Decision 1's first alternative is what actually closes it. The exposure is bounded — a class role grants class content, not teacher or admin — and unchanged by this change.
- **An account whose display name collides logs a warning on every role check, so once per directive per request.** → Accepted. The condition is rare, actionable (rename the account), and the alternative — logging once per process — needs state that `hasRoles` does not otherwise carry. If it ever becomes noisy in practice, that is the signal to rename the account, which is the intended outcome.
- **The reserved-name guard cannot be exercised end to end.** → No demo account is named after a role, and the harness authenticates against the shared public demo realm, so the case cannot be created without a Keycloak account this repository does not own. Recorded in `docs-testing.md` alongside the admin-permitted side, which is unexercised for the same reason. Not worked around with a mock: the harness's premise is that a real login is the part worth verifying.
- **The `catch` path cannot be exercised either.** → It needs fault injection the harness has no seam for. The change is one return value in a branch whose behavior is already fail-closed in practice; recorded rather than mocked.
- **`@@@ students` starts matching again.** → This is the intended fix, but it is a visible change for content written while the directive was dead. Handled in the migration plan.

## Migration Plan

1. Before deploying, grep the deployed `md/` tree for `@@@` lines naming `students`. Any such directive resumes matching students; confirm with the author that this is what they meant, since the directive has matched nobody since `fix-role-check-self-grant` shipped. Directives naming `student` are unaffected.
2. No action for the reserved-name guard unless the log shows a collision. If it does, rename the display name of that account in Keycloak; the account keeps every role the identity provider gave it either way, and only loses the ability to be addressed by that particular name.
3. Rollback is a revert. Nothing is persisted: `r` is rebuilt per request, and no stored attribute, token, or session field changes shape.

## Open Questions

- Whether the `student` demo account actually carries the `student` role is not asserted anywhere today, and it decides which direction of the alias the suite exercises against a live login. The tests derive their expectation from `roles(session)` rather than assuming it, so either answer yields a meaningful assertion — but the run's output should state which one it got, so an account that silently stops carrying the role does not quietly weaken the check.
