## 1. Repair the role check in `utils.js`

- [x] 1.1 In `hasRoles`, after the Keycloak client roles are merged into `r` and before any directive is inspected, canonicalize the plural role names the way `getLdapGroups` does (`teachers` → `teacher`, `students` → `student`), then set `r.teachers` from `r.teacher`. Leave a comment stating that any future source of roles must be merged above this point (design Decision 2).
- [x] 1.2 Replace `isAdmin` and `isTeacher` with derivations from the session's role set alone — the directive's list takes no part (design Decision 1) — and delete the mid-check `r.teachers = true` side effect that 1.1 replaces.
- [x] 1.3 In the downgrade branch (`allowOverride && a.vt == 0`), delete `teacher`, `teachers` and `admin` from `r`, alongside the existing `isAdmin = isTeacher = false` (design Decision 3).
- [x] 1.4 Confirm by reading the function that the downgrade still runs before the `#exam`/`#practice`/`#answer` rules, so a teacher in the student view fails the exam gate (design Decision 4).
- [x] 1.5 Remove the unused first `getClientRoles(req)` call assigned to `ccr`; keep the second one (design Decision 7).

## 2. Give the corpus what the checks need

- [x] 2.1 Add `md/test-perms-teacher-alias.md` demonstrating the plural alias: a short introduction that stays visible to everyone, and a `@@@ teachers` block whose text appears nowhere else in the corpus. No whole-file directive on the first line.
- [x] 2.2 Leave `md/test-md-file.md` and `md/test-perms.md` untouched — the `@@@ admin` block ("Admins only!!!") is the demonstration the admin check reads (design Decision 6).

## 3. Prove it in the suite

- [x] 3.1 In `test/checks/permissions.js`, assert the `@@@ admin` block of `md/test-md-file.md` in both directions, deriving the expectation from `roles(session)` via `carried.has("admin")` like the existing block checks (design Decision 5).
- [x] 3.2 Add the `@@@ teachers` block of `md/test-perms-teacher-alias.md` to the same block-driven checks, expected exactly for the sessions carrying `teacher`. Both demo accounts exercise it, one per direction.
- [x] 3.3 Extend the existing downgrade check (3.5, "a teacher who drops the teacher view…") so that with `vt: 0` the `teachers` block is gone as well, and returns when the view is switched back on. Keep it inside that check's `try`/`finally` rather than writing preferences from a new test.
- [x] 3.4 Register `md/test-perms-teacher-alias.md` as a corpus file of `test/checks/permissions.js` in `test/coverage-map.json`, and update that entry's `what` to mention the admin and alias directives.
- [x] 3.5 Run `npm test` and confirm the whole suite passes — permissions, views, rendering, navigation, presentation and the coverage record.
- [x] 3.6 Confirm by hand, or by a temporary check, that a student session with `ve: 1` no longer reaches a block addressed `@@@ admin, #exam`. The corpus carries no such directive and none is added; this is the third consequence in the source proposal and it is verified once, not left to inference.

## 4. Bring the documentation in line

- [x] 4.1 In `docs-testing.md`, "What the corpus demonstrates but a run cannot assert": remove the entry claiming a `@@@ admin` block is visible to everyone, and replace it with the gap that actually remains — no demo account holds `admin`, so only the denied side of the rule is exercised, as with the `5bhif` block above it.
- [x] 4.2 In `docs-testing.md`, "What it checks", extend the `test/checks/permissions.js` row to name the admin and alias directives.
- [x] 4.3 In `docs-permissions.md`, state that `teachers` is an alias of `teacher` and that a directive naming a role never grants that role to the reader. Leave the "a teacher sees everything" and `Students` → `students` lines alone — they belong to the `initial-repairs` proposal (design Non-Goals).
- [x] 4.4 In `AI/architecture.md` §9 Observations, delete the `@@@ admin` observation, which the change resolves. Review the wording of the `#practice` observation for accuracy and leave its behavior untouched.
- [x] 4.5 In `AI/architecture.md` §7 Permission Model, correct "`teacher` additionally gets the alias `teachers`" to say where the alias is applied, and correct the student-view downgrade paragraph to name all three roles it strips.

## 5. Close the change

- [x] 5.1 Re-read the delta spec in `specs/role-resolution/spec.md` against the implementation and confirm every scenario is either asserted by a check or explicitly recorded as an unexercised side in `docs-testing.md`.
- [x] 5.2 Note in the commit message that deployed documents using `@@@ admin` or `@@@ teachers` change what their readers see (design Migration Plan).
- [x] 5.3 Move `AI/proposals/fix-role-check-self-grant.md` into the archived change when the change is archived, so the request and its resolution stay together.
