## Context

The exam module has no link between a teacher and a class today. `class-roster` states that "every teacher SHALL be able to see and edit every course". Every teacher route is gated only by `requireTeacher`/`teacherPage` in `exam/gate.js`. The photo route asks only `holdsStudentImages`, which reads the full role set and deliberately ignores the admin short-circuit. Records are found by id through loaders in `exam/classes.js` (`getCourse`, the class and year lookups), `exam/tests.js` and `exam/attempts.js`. Those loaders throw `NotFoundError`, which the routes answer with `404`. Lists such as the year overview, the bar's choices and `/tests` are plain SQL queries without any scope. Live views stream through `exam/routes-live.js` over `event-stream.js`.

Who counts as a teacher in the directory is already decided in two places, `isTeacher` in `exam/roster-source.js` and in `exam/photos.js`: the person has the role `teacher` or `admin`.

## Goals / Non-Goals

**Goals:**
- Make one place decide which classes a request sees, and route every record lookup and every list through it.
- Answer an invisible record exactly like a missing one, in status and body.
- Keep the photo rule a strict AND of the role and the class's visibility.

**Non-Goals:**
- No change to students' own pages, to the question pool's content or to the content pages' role directives.
- No sync of teacher entries from WebUntis or LDAP. The admin maintains them by hand.
- No per-course teachers. A teacher entered in a class sees all its courses.

## Decisions

### D1: A table `class_teacher (class_id, username)`, cascading with its class

Migration `026-class-teachers.sql` adds `class_teacher` with the primary key `(class_id, username)`, `class_id` referencing `class(id) ON DELETE CASCADE`, and an index on `username`. Unlike the other per-year tables, it gets **no** closed-year triggers (see the spec: the list is access control, not a record of the year). It only adds tables, and nothing is rebuilt.

*Alternative:* store teachers per course. Rejected, because the request is per class and the photo rule is per class too.

### D2: One scope per request, resolved once

`exam/gate.js` gets `classScope(req)`, memoized on the request. It returns `{ all: true }` for `actsAsAdmin`, and otherwise the set of class ids from `class_teacher` for `identityOf(req)`. It is cheap: one indexed query per request.

Every loader that resolves a record by id takes the scope and checks the record's class. The record's class is found along `course → class`, `assessment → course`, `test → course`, `sitting → test`, `attempt → sitting`, `question_grade/teacher_note/result_note → …`. A record outside the scope throws the same `NotFoundError` the loader throws for a missing id. Lists get the same filter in SQL (`JOIN class_teacher` or `class_id IN (…)`), applied through one helper so a list cannot forget it.

*Alternative:* `router.param` hooks per id name. Rejected as the only line of defence, because several routes take ids in bodies (`/photos/match`, bulk writes) and some lookups chain through other records. The loaders are the single path every handler already takes.

*As implemented:* the loaders keep their signatures, because they are called from each other and from the module's own reads, which need no scope. Instead every teacher route passes the id it names through `visibleRecord(db, scope, kind, id)` in `exam/classes.js` right before the loader. It resolves the record's class along the chain above and throws the loader's own `NotFoundError`, so the effect is the one described here. Ids in bodies are checked the same way where a route takes one. `barState` does the same for a page's context, so every page with the bar is covered as well.

To keep "a list cannot forget it" checkable, the coverage map (`test/coverage-map.json`) gets one entry per teacher route. A test walks every registered teacher route with a teacher of another class and expects `404` or an empty list.

### D3: Invisible means 404, never 403

A teacher must not be able to tell whether a class or a course exists. Pages answer as a path with nothing behind it, and APIs answer `404` with the same message key as for a missing id. The only `403`s are role refusals (not a teacher, not an admin, no `student-images`), which reveal nothing about records.

### D4: The photo route is role AND roster-in-scope

`GET /photos/:username`: no `student-images` → `403` (as today). Otherwise, for a scope that is not `all`, it requires that a `roster_entry` of the username (left entries included) exists in a class of the scope. If not, it answers `404`, the same as for a missing photo. The list payloads compute the photo version only when the session holds the role. Since a list only exists for a visible class, every row in it qualifies, and no per-row query is needed.

### D5: Live streams check on open and drop on removal

A live stream checks the scope when it is opened, through the same loader as the page. Removing a teacher from a class, or deleting the class, publishes an internal event, and the stream registry closes that user's open streams for that class. The client then reconnects and gets `404`. Every event a stream receives is about its own sitting, so there is no global fan-out to filter.

### D6: Admin-only class lifecycle

`POST /classes` (create), the rename and delete of a class, the year-change class step and the teacher-entry routes use `requireAdmin`. Course creation and roster maintenance stay with `requireTeacher` plus the scope. The class page shows the teacher list to everyone who sees the class. The add/remove controls are shown only to an admin. The teacher picker reads directory people through the existing directory cache, filtered by `isTeacher`. That helper moves to one shared place instead of its two copies.

### D7: Preselection lives in the bar's client

The bar already loads its choices per position. After loading the class position (or the course position) with nothing chosen and exactly one choice, it calls the same handler a user's choice calls. This cascades naturally. *As implemented:* it does so only on the module's start page (`/exam/` without a year named) and on a page reached by choosing a year or a class in the bar, or by the bar's own choice. A page reached any other way stays: a position's link, an emptied position, or an in-page link such as "to the roster". The page learns how it was reached through one `sessionStorage` entry naming its address. The server needs no change for this, because the choices are already scoped by D2.

### D8: The year overview shows teacher counts to an admin

The overview's payload gains `teacherCount` per class for an admin only. Classes with `0` sort first and carry a marker. This is what makes the rollout workable (see Migration Plan).

### D9: The question pool's usage list hides foreign tests

`question_usage` lists the tests a question was used in, across classes. For a teacher, the usage list shows only tests of visible classes, plus a count of uses elsewhere ("also used in 3 other tests"). This keeps the pool's edit rules (a used question follows its snapshot rules) intact without naming another class.

## Risks / Trade-offs

- [After the deploy no teacher sees any class until an admin enters them] → Deploy at a quiet moment. Gerald enters the teachers of every class on the overview, which lists classes without teachers first. The safeLearn demo realm is seeded with entries for the demo teacher accounts before the browser harness runs.
- [A route forgets the scope and leaks a class] → Loaders carry the check (D2), and the walking test over every teacher route fails on any `200` with foreign data.
- [An entered teacher adds an arbitrary directory student to their roster and so sees that student's photo] → Accepted. Roster maintenance is a teacher's legitimate act, and the photo then belongs to their class. Documented in `docs-permissions.md`.
- [The admin forgets to update entries when teaching assignments change mid-year] → The class page shows its teachers to everyone in it, so a wrong entry is visible. The year change carries entries over, pre-ticked, for confirmation.
- [An open live view keeps showing data after removal] → D5 closes the streams. Already rendered pages stay on screen until reload, which is acceptable.

## Migration Plan

1. Merge and deploy safeLearn (demo). Migration 026 runs with a backup before it, as every migration does.
2. Seed the demo realm's class entries for the shared demo teacher accounts, so `npm test` and the browser harness see their classes.
3. Merge into secureLectures and deploy. Gerald, as admin, enters the teachers of the current year's classes right away.
4. Rollback: revert the code. The `class_teacher` table can stay. Older code ignores it.
