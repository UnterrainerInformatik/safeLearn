## 1. Data and scope

- [x] 1.1 Add migration `exam/migrations/026-class-teachers.sql`: table `class_teacher (class_id, username)` with the composite primary key, `ON DELETE CASCADE` to `class`, an index on `username`, and no closed-year triggers (D1)
- [x] 1.2 Move the duplicated `isTeacher` from `exam/roster-source.js` and `exam/photos.js` into one shared helper (D6)
- [x] 1.3 Add `classScope(req)` to `exam/gate.js`, memoized per request: `{ all: true }` for `actsAsAdmin`, otherwise the class ids of `class_teacher` for the session's username (D2)
- [x] 1.4 Add the teacher-entry functions in `exam/classes.js`: list, enter (directory teacher only, else `InvalidInputError`), remove. Publish an internal event on removal and class deletion (D5)

## 2. Scope every lookup and every list

- [x] 2.1 Make the record loaders in `exam/classes.js` (class, course, roster) take the scope and throw `NotFoundError` outside it
- [x] 2.2 Do the same for the loaders in `exam/tests.js`, `exam/attempts.js`, `exam/gradebook.js`, `exam/paper-grades.js`, `exam/participants.js`, `exam/makeups.js`, `exam/teacher-notes.js`, `exam/handout.js` and `exam/live.js`, along the chain sitting → test → course → class
- [x] 2.3 Add one SQL scope helper and apply it to every list: the year overview, the bar's class and course choices, the global `/tests` listing, the course lookup, and the evaluations
- [x] 2.4 Pass `classScope(req)` from every teacher route in `exam/routes-*.js` into the loaders and lists, and answer pages outside the scope as a path with nothing behind it
- [x] 2.5 Render embedded module elements (`safelearn-gradebook`, `safelearn-live`, …) for a record outside the scope as for a missing record
- [x] 2.6 Show only visible tests in the question pool's usage list, plus a count of uses elsewhere, with i18n keys (D9)
- [x] 2.7 Check the scope when a live stream opens, and close a user's streams for a class on the removal/deletion event (D5)

## 3. Admin-only class lifecycle

- [x] 3.1 Gate class creation, rename and delete with `requireAdmin`. Delete also removes the class's teacher entries, through the cascade
- [x] 3.2 Add the routes to list, enter and remove a class's teachers (admin only, `400` for a non-teacher) and a directory-teacher picker route
- [x] 3.3 Year change: gate the class step with `requireAdmin`, offer the previous class's teachers pre-ticked beside the directory's other teachers, and enter only the confirmed ones
- [x] 3.4 Add `teacherCount` per class to the year overview payload for an admin only, and sort classes without teachers first with a marker (D8)

## 4. Photos

- [x] 4.1 Photo route: keep `403` without `student-images`. For a scope that is not `all`, answer `404` unless a roster entry (left included) of the username lies in a class of the scope (D4)
- [x] 4.2 Check that every list payload carrying a photo version comes from a scoped list, so foreign rows cannot occur. Add a test that asserts it

## 5. Client

- [x] 5.1 Class page: show the entered teachers to everyone who sees the class, with add/remove controls and the teacher picker for an admin only
- [x] 5.2 Bar: offer "new class" to an admin only, and hide rename/delete of a class for non-admins
- [x] 5.3 Bar: preselect a class or course position that has exactly one choice and nothing chosen. Cascade to the right, and do not preselect after the user followed a position's link (D7)
- [x] 5.4 Year overview: show the teacher count and the no-teacher marker for an admin
- [x] 5.5 Year-change dialog: teacher checklist beside the roster checklist
- [x] 5.6 Add all new strings to `i18n/de.json` and `i18n/en.json` with the same keys (BabelEdit format)

## 6. Tests and docs

- [x] 6.1 Seed class entries for the demo teacher accounts in the test fixtures and the demo realm data, so existing checks keep seeing their classes
- [x] 6.2 Add a test that walks every registered teacher route as a teacher of another class and expects `404` or an empty list. Add the entries in `test/coverage-map.json`
- [x] 6.3 Extend `test/exam-photos.test.js`: own class `200`, foreign class `404`, admin with role `200`, admin without role `403`, teacher without role `403`
- [x] 6.4 Add tests for the admin-only routes (`403` for a teacher), the closed-year teacher entry, the year-change carry-over and the bar's preselection (one class/one course, one class/several courses, several classes, link back to the class)
- [x] 6.5 Update `docs-exam-module.md` and `docs-permissions.md`, including the rollout note (enter teachers right after the deploy) and the accepted roster-photo trade-off
- [x] 6.6 Run the affected checks, then the full `npm test` once at the end
