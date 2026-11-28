## Why

Today every teacher sees every class, every course and, with the role `student-images`, the photo of every student in the school. Photos are personal data, and a teacher only needs the faces of the classes they teach. The same holds for grades, rosters and tests: a teacher has no reason to see a class they are not entered in.

## What Changes

- **New:** a class has a list of teachers entered in it. Only an admin maintains this list, per class and school year, choosing from the directory's teachers.
- **BREAKING:** a session acting as a teacher sees only the classes it is entered in, and everything under them: courses, gradebooks, tests, sittings, live views, paper correction, student pages, evaluations. The other classes do not appear in any list, in any overview or in the module's bar. Their routes answer as a path with nothing behind it (`404`), and their APIs answer `404` too, so a teacher cannot even confirm that a class exists.
- **BREAKING:** a photo is served only to a session that holds `student-images` **and** is entered in a class whose roster holds that student. A session that acts as an admin and holds `student-images` gets every photo. An admin without the role still gets none.
- An admin sees every class, entered or not. Creating, renaming and deleting a class, and entering or removing its teachers, becomes admin-only. Entered teachers keep maintaining the class's roster and its courses as before.
- Starting the next school year carries a class's teachers over to the class one level up, and the admin confirms them along with the roster.
- When a bar position offers exactly one choice to the session (one class in the chosen year, one course in the chosen class), that choice is chosen at once, and the page for it opens.
- **BREAKING (rollout):** existing classes have no teachers after the migration. Until an admin enters them, teachers see no class. The admin's class page lists classes without teachers first.

## Capabilities

### New Capabilities
- `class-teachers`: which teachers are entered in a class, who maintains that list, and how it decides what a teacher sees in the module.

### Modified Capabilities
- `student-photos`: the photo route and the lists show a photo only for students of a class the session is entered in. A session acting as an admin with the role still sees every photo.
- `class-roster`: classes are created, renamed and deleted by an admin. A course is no longer visible to every teacher, only to the teachers of its class.
- `exam-navigation`: the bar offers only the session's visible classes and their courses, and preselects a position that has exactly one choice. Creating a class is offered only to an admin.
- `school-year-change`: moving a class up offers its teachers for the new class, along with its roster.
- `exam-record-maintenance`: renaming and deleting a class become admin-only.

## Impact

- Database: new migration `026-class-teachers.sql` with a table `class_teacher (class_id, username)`. Nothing is rebuilt.
- Server: one visibility check in `exam/gate.js`, applied to every route under `exam/routes-*.js` that names a year's classes, a class, a course, an assessment, a test, a sitting, an attempt or a student page. This includes `event-stream.js` for live views and the global `/tests` listing. The photo route in `exam/routes-photos.js` and every list payload that carries a photo version use the same check.
- Client: the bar in `exam/client/` (choices and preselection) and a teacher list on the class page for an admin.
- i18n: new keys in `i18n/de.json` and `i18n/en.json`, in BabelEdit format.
- Docs: `docs-exam-module.md`, `docs-permissions.md`.
- Tests: `test/exam.test.js` and `test/exam-photos.test.js` need demo teachers entered in demo classes. The browser harness logs in with the shared demo accounts, so their classes must be seeded.
- Deployments: safeLearn (demo) and secureLectures (htl.dev). After the deploy, an admin has to enter the teachers of every class before teachers can work again.
