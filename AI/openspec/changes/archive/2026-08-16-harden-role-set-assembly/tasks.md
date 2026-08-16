## 1. Defend the role namespace against the display name

- [x] 1.1 In `utils.js`, declare the reserved role names (`admin`, `teacher`, `teachers`, `student`, `students`) as a module-level `Set`, next to `hasRoles` rather than inside it, so it is rebuilt per module and not per request. Name it for what it protects, not for its contents.
- [x] 1.2 Make `r[name] = true` (`utils.js:132`) conditional on the trimmed, lowercased name not being in that set. On a hit, skip the assignment and `console.warn` the colliding name together with the fact that the account keeps every role the identity provider issued — the message has to tell whoever reads the log what to do about it (design Decision 1).
- [x] 1.3 Leave a comment at the assignment stating that the display name shares a namespace with the roles and must never be able to stand in for one, so the guard is not read as an oddity and removed.

## 2. Make the plural alias symmetric

- [x] 2.1 In the canonicalization block (`utils.js:146-156`), add `if (r.student) r.students = true;` beside the existing teacher line, so both spellings of both roles end up in the set whichever one the role arrived as (design Decision 2).
- [x] 2.2 Confirm the student-view downgrade still deletes only `teacher`, `teachers` and `admin`. `student` and `students` must survive it — the downgrade exists to reach the student view, not to leave it.

## 3. Remove what misrepresents the decision

- [x] 3.1 Drop the second argument from the `getClientRoles(req, normalizedClientRoles)` call (`utils.js:133`); the signature is `getClientRoles(req)` and the argument is discarded.
- [x] 3.2 Delete `hasClientRoles` (`utils.js:48-94`). Re-run the repository-wide grep for the name first to confirm it still has no caller.
- [x] 3.3 Change the `catch` in `hasRoles` (`utils.js:203-204`) to return `false`, matching the normalization the success path already performs. Leave the `console.error` in place.

## 4. Corpus and tests

- [x] 4.1 Add `md/test-perms-student-alias.md`, modeled on `md/test-perms-teacher-alias.md`: one block addressed `@@@ students`, one addressed `@@@ student`, and one naming both together, each with prose stating what it demonstrates.
- [x] 4.2 In `test/checks/permissions.js`, assert both directions of the student alias against that file, deriving the expectation from `roles(session)` the way the teacher-alias and `@@@ admin` checks already do — visible when the session carries `student`, absent when it does not.
- [x] 4.3 Make that check report which side it exercised, so a session that stops carrying `student` is visible in the run's output instead of silently reducing the assertion to its negative half (design Open Questions).
- [x] 4.4 Extend the downgrade check to assert that `student` and `students` remain addressable for a teacher viewing as a student, alongside the existing assertion that `teacher`, `teachers` and `admin` do not.
- [x] 4.5 Register `md/test-perms-student-alias.md` in `test/coverage-map.json` under the permissions entry.
- [x] 4.6 Run `npm test` and record the result. Every content check authenticates against the live demo realm, so a failure that names the login rather than an assertion is an environment problem, not a regression.

## 5. Documentation

- [x] 5.1 In `docs-permissions.md`, correct the LDAP mapping line: the unit `Students` produces `student`, not `students`.
- [x] 5.2 In `docs-permissions.md`, replace "There is no role `student`" — the role exists. State what is actually true: students hold `student` from the LDAP unit, and a session without `teacher` is what the teacher-facing rules mean by a student.
- [x] 5.3 In `docs-permissions.md`, document `students` as the alias of `student` next to the existing `teachers` rule, in the same wording, and note that a display name equal to a built-in role name does not grant that role.
- [x] 5.4 In `docs-testing.md`, record the two paths the suite cannot reach — the reserved-name collision (no demo account is named after a role) and the `catch` path (no fault-injection seam) — beside the existing note about the unexercised admin-permitted side.
- [x] 5.5 In `AI/architecture.md`, resolve the Observations entry about the `docs-permissions.md` / `getLdapGroups` divergence over `student`, and note in the permissions section that the display name cannot stand in for a built-in role.
- [x] 5.6 In `AI/proposals/initial-repairs.md`, mark its bullet about "There is no role `student`" as resolved by this change, so the remaining repairs proposal does not re-open it.

## 6. Verification

- [x] 6.1 Run `openspec validate harden-role-set-assembly --strict` and resolve anything it reports.
- [x] 6.2 Grep the repository's own `md/` corpus for `@@@` lines naming `students` and confirm nothing beyond the new fixture depends on the spelling either way.
- [x] 6.3 Write the deployment note for the release: deployed content using `@@@ students` resumes matching students (design Migration Plan, step 1).
