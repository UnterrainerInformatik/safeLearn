# Exam Module
Here you can find how the exam module is switched on, where it keeps its data, how that data is backed up, and how a page places one of its elements.

[Back](README.md) to the main page.

The module is being built in phases (`AI/exam-module-plan.md`). What exists today is its foundation (the switch, the database, backups, the teacher/student gate, the embedding syntax), classes and courses at `/exam/`, and the gradebook. Online tests and the question pool follow.

## The Switch
The module exists only when the instance's environment says `EXAM_MODULE=on`. Any other value, or none, and the instance is exactly the one it was before the module: its code is not loaded, no database file is opened or created, nothing answers under `/exam/`, and no page links to it.

| Deployment | Module |
| --- | --- |
| Production (`deploy/docker-compose.yml`) | Off until a deployment sets it (secureLectures has it on since 2026-10-17). The compose file passes `EXAM_MODULE` through to the container, and the pipeline fills it from the repository variable `EXAM_MODULE` (Settings → Secrets and variables → Actions → Variables). |
| WYSIWYG container | Always off. Its templates set no `EXAM_MODULE` and mount no data volume, and `test/deployment-config.test.js` keeps it that way. |
| Local `npm start` | Off unless your `.env` says `EXAM_MODULE=on`. |

The start-up log says which it is:

```
Exam module: disabled (EXAM_MODULE is not "on").
Exam module: active, database data/exam.sqlite
Exam module: disabled - the database data/exam.sqlite could not be opened: ...
```

**A module that cannot start never stops the reader.** If the database cannot be opened, the data directory is read-only, a migration fails or the database was written by a newer image, the log says why and the instance runs without the module. A request under `/exam/` that fails is answered with a `500` on its own; every other page and session carries on.

Everything under `/exam/` requires a login, exactly like the content. A teacher reaches it through the graduation-cap button in the top bar, which only a session acting as a teacher sees, and only on an instance with the module on. The module's pages use the whole width beside the sidebar rather than the reading column, so a gradebook fits on one screen. A teacher in student view is a student to the module as well: teacher pages and teacher-only elements disappear and teacher actions are refused, until the view is switched back.

## The Data
All state lives in one SQLite file, `data/exam.sqlite` relative to the working directory — `/app/data` in the image, the volume `deploy/docker-compose.yml` already mounts from `${DATA_DIR}` for the directory cache. It is opened with `node:sqlite`, which the image's Node 24 ships, so the module adds no dependency.

- **Migrations** are the numbered files in `exam/migrations/`, applied in order at start-up, one transaction each. `PRAGMA user_version` records the last one applied. A migration that fails is rolled back on its own and leaves the database at the last version that applied completely; the module is disabled for that run.
- **A downgrade** — an older image on a newer database — is refused: the module is disabled, the file is left untouched, and the log names both versions.
- **People are recorded by their directory username** (the Keycloak `username`, lowercased), never by the Keycloak user id, which changes when an account is deleted and re-imported.
- **Nothing in the data directory is served over HTTP**, by any path, with or without a session.

`EXAM_DB_PATH` overrides the location. It exists for the verification harness, which gives every run a database of its own; a deployment does not set it.

## Backups
The module writes consistent copies with `VACUUM INTO` into `exam-backups/` beside the database. Each copy opens as a database on its own.

| Copy | When | Kept |
| --- | --- | --- |
| `exam-pre-v<N>-<time>.sqlite` | Before the first pending migration away from version `N` | 90 days |
| `exam-daily-<time>.sqlite` | At start-up if the newest is a day old or missing, then once a day | The newest 14 |

They sit beside the database on purpose: a restore finds them right where it needs them. `VACUUM INTO` only reads the database, so taking a copy cannot damage it.

Getting the copies off the host is the operator's job, with whatever that host already backs up with. **Back up `exam-backups/`, not the live `exam.sqlite`:** a file-level backup can catch the database in the middle of a write, with part of it still in the `exam.sqlite-wal` file beside it, while every copy in `exam-backups/` is complete. A backup of the copies holds grades of minors, so wherever it goes, it has to be a place that may hold them.

**Restoring** means stopping the container, replacing `exam.sqlite` with a copy (and deleting `exam.sqlite-wal` and `exam.sqlite-shm` beside it), and starting again. A copy from an older schema version is migrated forward on start, as any older database is.

**Rolling back** the module itself means unsetting `EXAM_MODULE` and redeploying. The data stays in `exam.sqlite`, untouched, and switching the module back on resumes where it was.

## Classes And Courses
Teachers manage these at `/exam/`. Everything here belongs to teachers. A student, or a teacher in student view, finds no page there, and every request is refused.

- **School years** are named like `2026/27`. Each has a start date, the first day of the summer semester and an end date. The first year created becomes the current one. A later year can be created in advance and made current when it starts, and exactly one year is current at a time.
- **A class** belongs to one school year and is named like `5AHIF`. When you create it, the module lists every member of the class's directory unit as a checklist, and nobody is ticked. On an LDAP realm that unit is the class's OU; on a realm that grants classes as client roles, it is that role. Only the people you tick form the roster. This is what keeps former students out of a 5th-year class whose OU still holds them. Teachers are never offered and can never be added.
- **The roster** changes only when a teacher changes it. A student who joins the directory unit later is listed under "Add students" but is not added on their own. You can also add someone from the whole directory, or by username when the directory is not available on the instance or is still loading. Removing a student keeps their entry, marked as left, so what is recorded for them stays theirs. "Refresh names" updates names from the directory and never changes who is on the roster.
- **A course** is a class, a subject and the class's school year, and exists once per class however the subject is capitalized. It has no owner, so every teacher sees and edits every course. Its language (German or English) decides how its tests are presented. Its config sheet weighs the gradebook's four categories (online tests, manual tests, participation, homework) in whole percentages that add up to 100. A new course starts at 25 % each.

## The Gradebook
Each course has a gradebook, reached from the course's and the class's page (`/exam/courses/<id>/gradebook`). Like classes and courses it belongs to teachers, with one exception: every student sees their own results.

- **Every result is a fraction** from 0 to 1. A manual test or a homework is entered as points out of a maximum (`17` of `24`, kept and shown as `17/24`) or as a percentage; a participation mark is `+` (1) or `−` (0). Every entry has a date, which decides its semester, and an optional note. **The student sees the note.** Entries can be edited and deleted by any teacher. "Record an entry for the class" enters one test for every student at once; students left empty get nothing.
- **The proposal** for a semester is computed whenever it is shown, never stored. Each category (online tests, manual tests, participation, homework) is the mean of its entries; the proposal is the mean of the categories weighted by the course's config sheet, and the grading scale turns it into a grade. A category without entries is left out and the other weights are scaled up, so a course without online tests yet grades by the other three. The winter semester counts the entries dated in it; the summer semester's grade is the year grade and counts every entry of the school year.
- **The grading scale** is one for all courses, at `/exam/scale`: from 88 % a 1, from 75 % a 2, from 63 % a 3, from 50 % a 4, below a 5, to begin with. A result exactly on a threshold gets the better grade. A change applies to every proposal at once.
- **An override** replaces the proposal for one student's semester, with an optional comment. Teachers keep seeing the proposal beside it; removing the override makes the proposal the grade again. The comment reaches the student only when "The student sees the comment" is ticked.
- **The overview** lists one row per student on the roster for the chosen semester — each category, the proposal, the override and the grade — and students who left the roster separately, with what was recorded for them.
- **A student's own results** are at `/exam/results`, or wherever a page places a `safelearn-results` block: per course their entries, the category fractions and the grade. While no override exists that is the proposal; once one does, the student sees the override and no longer the proposal. The year grade appears once the summer semester has begun. No request can name another student: the route answers about the session's own identity only.

## Placing An Element In A Page
A page places an element with a fenced block whose info string is `safelearn-<kind>`, with the element's parameters as `key: value` lines:

````
```safelearn-test
test: http-caching-1
```
````

The kinds are `test`, `results`, `gradebook` and `live`. `test` and `live` arrive with the online tests; until then a placed one says that it is not available on this instance yet.

| Kind | Parameters | Shows |
| --- | --- | --- |
| `results` | `subject` (optional) | The reader's own results, in the current school year, for that subject or for all their courses |
| `gradebook` | `class` and `subject`, optionally `year` (like `2026/27`, the current year otherwise); or `course` (its id) | A course's overview for teachers, with the entry form. Teacher-only |

A block naming a course by class and subject keeps working from one school year to the next: next year it shows next year's course of that name.

````
```safelearn-gradebook
class: 4BHIF
subject: WMC
```
````

- **The block goes through the permission filter like any other content.** One inside `@@@ teacher` is gone for a student before it is ever looked at. That is presentation, not protection: every request an element makes is decided by the module on the server again.
- **Teacher-only kinds** (`gradebook`, `live`) render nothing for a session that does not act as a teacher, wherever they sit.
- **With the module off**, a block renders to a short notice for teachers — "only available on an instance with the exam database" — and to nothing for everyone else. The notice carries no data and makes no request. This is what the WYSIWYG container shows.
- **With the module on**, a block renders to a placeholder, and the module's script (`/exam/assets/exam-client.js`, loaded only by pages that carry one) mounts the element into it. The page is server-rendered and revealed as always; the element shows its own loading and error state.
- **The presentation and document views** render every block as they would with the module off.
- **A block of an unknown kind** renders nothing. A block written inside a longer fence — an example of the syntax, like the one above — stays text.

In Obsidian, the blocks show as ordinary code blocks.
