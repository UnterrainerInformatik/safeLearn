Source: AI/open-proposals.md — **Prüfungsmodul: Online-MC-Tests und Notenbuch**

## Why

Short multiple-choice tests (typically 4 questions in 10 minutes) and the per-course gradebook currently live outside safeLearn, in Moodle and in spreadsheets, so lecture material, tests and grades are three systems with three logins. safeLearn already knows who a reader is, which class they are in and whether they teach. What it lacks is any place to keep state. The WS 2026/27 grade entry closes on **05.02.2027**, and a gradebook that proposes the semester grade is useful by then even before the first online test runs.

The full plan, with every decision and its reasoning, is `AI/exam-module-plan.md`. This change implements all of it as one change, phase by phase in the plan's order, except two parts that have changes of their own: operating tier 1 (`publishing-without-keycloak`) and access control for attachments (`attachment-access-control`).

## What Changes

- **Operating tier 3.** A switch, `EXAM_MODULE=on`, adds a SQLite database and everything built on it. Without the switch the module's code is not loaded, no database is opened, no route exists, and the instance behaves exactly as it does today. This is the case in the WYSIWYG container. A database failure switches the module off and leaves the reader running. Production ships with the switch off until a phase is ready (dark launch).
- **Embedding into pages.** A Markdown block marks where a module element goes inside an `md/` page. The renderer gets a hook per kind of element. Blocks pass through the permission filter like any other content. With the module off they render to nothing, or to a quiet hint for teachers. With it on, a client-side element mounts into the page and talks to `/exam/api/*`. The page itself stays server-rendered.
- **Classes and courses (P1).** School years, class rosters chosen from the class's LDAP OU as a checklist (this matters for 5th-year classes, whose OU also holds former students), courses as class × subject × school year with a language and a config sheet of weights. Students are identified by their LDAP username, not by the Keycloak id.
- **Gradebook (P4).** A global grading scale, manual entries (tests, +/−, homework), a weighted semester grade proposal, a teacher override with a comment, a course overview for teachers, and a page where each student sees their own live results. This is usable without any online test.
- **Question pool (P2).** A one-time import of the Moodle XML pool (DE original plus EN translation, paired by position and verified), a question browser with preview, selection and usage history.
- **Online tests (P3).** Tests assembled from the pool and snapshotted, sittings with a visibility window and an attempt duration, make-up sittings, a writing page with per-student shuffling, autosave, a server-side deadline and automatic submission, the anti-cheating countermeasures of the plan, and a teacher live view.
- **Board solution (P6).** A teacher-only presentation of a written test in the existing Reveal view.
- **Question editor (P7).** Creating and editing questions online, DE and EN together, with categories and images.
- **Year change (P5).** Closing and archiving a school year and preparing the next one.

## Capabilities

### New Capabilities

- `exam-foundation`: the switch, start-up behaviour, self-disabling on failure, the database's location, migrations and backup, the teacher/student gate and the identity the module keys on.
- `exam-embedding`: the Markdown block that places a module element in a page, how it renders with the module off and on, and how it relates to the permission filter and page bootstrap.
- `class-roster`: school years, classes, rosters drawn from the directory, courses and their config sheets.
- `gradebook`: the grading scale, manual entries, the semester grade proposal, overrides and what teachers and students see of it.
- `question-pool`: the one-time import, the question model with its two languages, the question browser and usage history.
- `online-test`: tests, sittings, make-ups, attempts, grading, deadlines, the anti-cheating countermeasures and the teacher live view.
- `board-solution`: the teacher-only solution presentation.
- `question-editor`: creating and editing pool questions online.
- `school-year-change`: closing a school year and starting the next.

### Modified Capabilities

- `deployment-surface`: a deployment switches the module on through its environment and keeps the database on the persistent data volume. The database file is never retrievable over HTTP.
- `browser-verification`: a verification run proves the instance with the module both off and on, the latter against a throwaway database, so the run stays repeatable.

## Impact

- **Code:** a new module directory loaded by dynamic `import()` from `app.js` and registered after `checkAuthenticated`. A placeholder pass in `obsidian.js` `preParse`, after `removeForbiddenContent`. New client script(s) and stylesheet mounted through the static allowlist. `wrapInReveal` is reused for the board solution.
- **Dependencies:** none new for storage, because `node:sqlite` ships with the image's Node 24. An XML parser may be needed for the one-time Moodle import. The import runs as a tool script, not in the server.
- **Deployment:** `EXAM_MODULE` must reach the container through `deploy/docker-compose.yml`'s `environment:` block. `test/deployment-config.test.js` already fails when a variable the code reads reaches no deployed instance. The database lives under `/app/data`, the volume already mounted for the directory cache. secureLectures switches the module on. The WYSIWYG container does not.
- **Keycloak:** the roster reads class OUs and members through the existing read-only directory service. No new realm rights are needed.
- **Tests:** a second harness configuration with the module on and a temporary database. The existing suite runs unchanged with the module off.
- **Personal data:** grades, attempts and focus logs are personal data of minors, stored on babylon5. Retention is settled in P5 (see design.md, Open Questions).
