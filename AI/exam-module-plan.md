# Exam Module — Plan

Status: **proposed as one OpenSpec change, `exam-module`** (`AI/openspec/changes/exam-module/`), not one change per phase; the phases below are its task groups. Worked out in an explore session on 2026-10-16, operating tiers and embedding added on 2026-10-17. Operating tier 1 is the separate change `publishing-without-keycloak`.

## 1. Goal

Short online multiple-choice tests, written and graded inside safeLearn, feeding a per-course gradebook that proposes the semester grade. A typical test is 4 questions in 10 minutes, written in class.

In scope:

- a shared question pool, imported once from Moodle XML and maintained afterwards in an online editor
- tests assembled from the pool in a question browser, scheduled per course with a visibility window and an attempt duration
- automatic, server-side grading against one global grading scale
- a gradebook per course: online tests, manually entered tests, participation (+/−), homework, weighted into a semester grade proposal the teacher can override
- a page per student showing their own results live
- a teacher-only "solution on the board" view

Out of scope:

- the written programming tests in `md/tests/` (paper/GitHub Classroom). They stay as they are
- the Matura and the `examParticipant` role. That is a different process
- `essay` questions
- export back to Moodle XML

## 2. Decisions

| Topic | Decision |
| --- | --- |
| Where it runs | Inside the safeLearn process, as a separate router (e.g. `/exam/*`) plus elements embedded into pages, behind a feature switch (`EXAM_MODULE=on`). Tier 3 of section 3. On in secureLectures, off in the WYSIWYG container |
| Storage | **SQLite**, one file under `/app/data` (the volume already mounted for the directory cache). Plain SQL, so a later move to Postgres is not a rewrite |
| Source of truth for questions | **The database.** Moodle XML is imported once, by hand (by Claude), from `htl-claude/moodle-quiz-questions/`. After that questions change through the online editor and Markdown imports, which only add questions (`exam-question-import`). No re-import from Moodle, no export |
| Pool ownership | One pool shared by all teachers |
| Question types | `multichoiceset` (all-or-nothing), `multichoice` (single answer) and `truefalse`, all graded all-or-nothing. `essay` is dropped on import |
| Points | **1 point per question**, regardless of Moodle's `defaultgrade` |
| Language | Per course. The pool holds a DE original and an EN translation per question |
| Course | **Class × subject × school year.** No technical owner: teachers coordinate among themselves |
| Student identity | The **LDAP username**, not the Keycloak user id. A federated account that loses its LDAP link is deleted on read and gets a new UUID when it is reimported (seen on 2026-09-13). The username survives that |
| Roster | Created at the start of the school year: the class's LDAP OU is offered as a checklist and the teacher ticks who actually attends. This matters for 5th-year classes, where the OU also holds former students. Students can be added and removed during the year |
| Test assembly | Questions picked by hand in the question browser. Every student gets **all** selected questions |
| Shuffling | **Per student**: question order and answer order are both shuffled |
| Window | The window controls visibility. Each test has an **attempt duration**, which must be shorter than the window |
| Deadline | `min(start + duration, window end)`. When the deadline passes the attempt is submitted automatically, using the last autosave, and the test is hidden |
| Make-ups | Another sitting with its own window and the same duration, for selected students |
| Grading scale | One global scale, in percent: ≥ 88 % → 1, ≥ 75 % → 2, ≥ 63 % → 3, ≥ 50 % → 4, below → 5 |
| Arithmetic | Everything stored and computed as a fraction `0…1` (double). Each online test counts the same |
| Semester proposal | For each category (online tests, manual tests, +/−, homework) compute a fraction, take the weighted mean, then map it through the grading scale |
| Weights | Set once per course on its **config sheet**, fixed for the semester |
| Override | Stored separately from the proposal, plus a free-text teacher comment |
| What the student sees | A live view of the truth: the proposal while no override exists, the override as soon as one does. After a test the student sees only points and grade, **never the correct answers** |
| Solution | The teacher may show the solution in the next lesson, on the board only, through a teacher-only view |

## 3. Operating tiers

One image, three configurations. Each tier contains the one below it. The WYSIWYG container that authors run locally keeps working, and production keeps running normally while the exam module is built, because the module ships switched off until a phase is done (dark launch).

| Tier | Configuration | What it provides |
| --- | --- | --- |
| **1 Publishing** | `AUTH=none` | No login. Every reader holds the roles listed in `READER_ROLES` (e.g. `teacher,examParticipant,4bhif`), and nothing else. Without the variable a reader holds no role, so every restricted section stays hidden. Preferences (`config`) and the last visited page live in browser storage. The ones the server needs while rendering (`vt`, `ve`, …) must travel in a cookie, not `localStorage`. The toggles stay visible whenever the reader roles allow them, so with `teacher` an author can still switch the exam/practice/answer views. Directory routes are not registered. **Its own change**, not part of this plan: specified and implemented by `publishing-without-keycloak` (2026-10-20), capability `anonymous-publishing`; the cookies are `safelearn_config` and `safelearn_last`, and a reader holding `teacher` starts in the student view as a fresh session does |
| **2 Roles** | `AUTH=keycloak` (today) | Login, roles and the teacher/admin views. LDAP federation is optional: roles may also be plain client roles, as on the demo realm. The directory service is optional on top and is active only with `DIRECTORY_SERVICE_*` |
| **3 Database** | additionally `EXAM_MODULE=on` | SQLite, `/exam/*` and the embedded elements of section 4 |

Rules:

1. **`AUTH=none` is opt-in only and never a fallback.** If `keycloak.json` is missing and `AUTH=none` is not set, the server refuses to start, as it does today. A configuration mistake in production must never quietly publish the site.
2. **Tier 3 requires tier 2.** `EXAM_MODULE=on` together with `AUTH=none` aborts the start with a message. Grades without an identity make no sense, and safeLearn will not handle logins or store passwords itself.
3. **`READER_ROLES` is trusted.** Whatever it lists, every reader gets. We rely on no teacher publishing a tier-1 instance with `teacher` in it. The WYSIWYG template's `.env` ships `READER_ROLES=teacher`. The code itself defaults to no roles, so a missing variable hides content instead of revealing it.
4. **The deployment tests assert `AUTH=keycloak` for secureLectures.** `test/deployment-config.test.js` already reads the compose file.
5. **The harness runs every tier.** In tier 1 without `READER_ROLES`, every restricted part of the corpus must be missing. In tier 2 without the module, all existing checks pass and `/exam/*` answers 404.

Tier 3 in detail:

- With the switch off, the module's code is not even loaded (dynamic `import()`), no database is opened and no router is mounted.
- Failures stay inside the module. If the database cannot be opened, a migration fails or the volume is read-only, the module logs it and switches itself off. The reader keeps running. A database error never takes the process down.
- `node:sqlite` is built into the image's `node:24-alpine`, so the database adds no native dependency.

## 4. Embedding into pages

The module's elements are **embedded into the `md/` pages**, not only shown on pages of their own under `/exam/*`. Candidates: "start test" in a lecture page, the student's own results, a course's gradebook on a teacher page, the live view of a sitting, the board solution inside the Reveal view.

- The renderer gets **several hooks**: a directive in the Markdown becomes a placeholder, and a module registers a handler for each kind of placeholder. Which hooks exist exactly, and what the directive looks like (it must also be understood by the Obsidian plugin's grammar mirror), is decided in P0.
- Placeholders go through the permission filter like any other content. One inside `@@@ teacher` is rendered for teachers only. That is presentation, not protection: every `/exam/api/*` call checks the caller's rights on the server again.
- With the module off (tier 1 or 2), a placeholder renders to nothing. Teachers see a quiet hint that the element is only available on a server with the database.
- With the module on, a client-side element mounts into the placeholder and talks to `/exam/api/*`. The page around it stays server-rendered.

## 5. Data model (sketch)

```
SchoolYear ─< Class ─< RosterEntry >─ Student (ldapUsername, names)
                 │
                 └─< Course (subject, language, config sheet: weights)
                        │
                        ├─< Test ─< TestQuestion (snapshot of question + answers)
                        │     └─< Sitting (window from/to, duration, participants)
                        │            └─< Attempt (student, startedAt, deadline, submittedAt,
                        │                   │      session binding, focus log)
                        │                   └─< Response (chosen options → 0 | 1)
                        │
                        ├─< ManualEntry (kind: test | plusminus | homework, value 0…1, date, note)
                        └─< SemesterGrade (student, proposal, override?, comment)

Category (tree, e.g. "HTTP und REST / Caching") ─< Question ─< Answer
Question: type, text DE/EN, correct flags, usage history
GradingScale (global): thresholds in percent
```

The questions are **snapshotted into the test** when it is created, so editing a question later never changes the grades of a test that has already been written.

## 6. Source data

`/mnt/data/nextcloud/htl-claude/moodle-quiz-questions/`. Two files, `WMC - Fragenpool - thematisch.xml` (DE, original) and `WMC - Question Pool - by topic (EN).xml`. Measured on 2026-10-16:

- 103 questions in 22 categories, two levels deep (`$course$/top/<area>/<topic>`)
- 77 `multichoiceset` (1–8 correct answers), 14 `multichoice`, 3 `truefalse`, 9 `essay` (dropped)
- `idnumber` is empty everywhere. DE and EN names differ, so the two files are paired **by position**. Today all 103 positions match in type and in the correct-answer pattern, and the import must verify that again and refuse to pair a mismatch
- the question text is Moodle HTML (`<p dir="ltr" style=…>`) and must be sanitized (DOMPurify is already in the stack)
- 7 questions embed images as `@@PLUGINFILE@@` with base64 blobs (one `essay` alone is 1.2 MB). These must be resolved on import
- by convention the text states how many answers are correct ("(2 richtige Antworten)"). That hint matters for all-or-nothing and must survive shuffling

## 7. Preventing cheating

Franklyn does **not** run for these short tests, and there is no Safe Exam Browser (no Linux support) and no JavaScript copy protection (cosmetic, bypassed in seconds). So the server has to make sure there is nothing to steal, and the teacher has to be able to see what happens.

**Built into P3:**

| Threat | Countermeasure |
| --- | --- |
| Reading answers from the page (DevTools, page source) | Correctness never leaves the server. Grading is server-side only |
| Option ids revealing the original answer order | Shuffled on the server. Options carry **random per-attempt tokens**, and only the server knows the mapping |
| Copying from the neighbour | Question and answer order shuffled per student |
| Submitting after time, tampering with the timer | The deadline lives on the server, late writes are rejected, and the last autosave before the deadline counts |
| Reloading to reset the timer, a second attempt | One attempt per student and test. The start time is recorded on first open, and a reload resumes the attempt |
| Someone else writing from home with the student's password | The attempt is bound to the session that started it. A second device is refused until the teacher releases it in the live view |
| Switching to a search engine or chatbot | **Focus log**: the page reports `visibilitychange`/`blur`. The live view shows e.g. "left 3×, 47 s". It informs the teacher and never penalizes automatically |
| Passing questions on afterwards | The test is hidden after submission and correct answers are never shown to students |

**Teacher live view during a sitting:** who has started, who has submitted, the remaining time per student, focus losses, refused devices.

**Optional, needs a spike first:** restrict a sitting to the school network by client IP. `app.js` already sets `trust proxy`. Whether safeLearn on babylon5 sees the real client IP (a reverse proxy in front setting `X-Forwarded-For`) has not been verified. Make-up sittings at home would switch the restriction off.

**What remains:** pool wear. Everyone gets the same questions, make-ups get the same questions, and the solution is shown on the board, so questions will spread over the years. Mitigations: let a make-up sitting swap individual questions, show in the question browser how often and when a question was used, and grow the pool through the editor.

## 8. Phases and effort

Effort is in working days of about 6 focused hours, including harness tests and documentation.

| Phase | Content | Days |
| --- | --- | --- |
| **P0 Foundation** | Tier model and start-up validation (section 3), SQLite access and migrations, feature switch with lazy loading and self-disabling on failure, embedding hooks and directive (section 4), backup, teacher/student gate, page shell in safeLearn's look, a temporary test database per harness run, harness runs with and without the module | 4–6 |
| **P1 Classes & courses** | School year, class roster from LDAP OU as checklist, maintenance during the year, course with language and config sheet | 3–4 |
| **P4 Gradebook** | Grading scale, manual entries (tests, +/−, homework), weighted proposal, override, comment, teacher course overview, student page | 5–7 |
| **P2 Pool** | One-time import (DE/EN pairing with consistency check, categories, images, sanitizing), question browser with preview, selection and usage history | 3–5 |
| **P3 Exam** | Tests, sittings, make-ups, writing page with per-student shuffle, autosave, server deadline, auto-submit, all countermeasures from section 7, live view | 8–11 |
| **P6 Board solution** | Teacher-only presentation of a test (one question per slide, correct answers marked, anonymous share of the class that got it right), built on the existing Reveal view | 1–2 |
| **P7 Question editor** | Create and edit questions with DE and EN together, categories, image upload | 3–5 |
| **P5 Year change** | Close and archive a school year, remove students who have left, retention, create the next year | 2–3 |
| | **Total** | **29–43 days** |

The gradebook (P4) deliberately comes before the exam (P3). The hard deadline is the WS grade entry on **05.02.2027**, and the gradebook is useful without online tests: manual tests, +/− and homework are entered anyway. Online tests have no deadline.

## 9. Timeline

At 3 h a day on weekdays that is about **2.5 working days a week**, so the whole plan takes **11–17 weeks**. Holidays are not included.

Example with a start on 2026-10-19:

```
 Oct ─────── Nov ─────────── Dec ──────── Jan ──────────── Feb ──── … summer
 P0 ─ P1 ─── P4 ──┤▲ gradebook ready (end Nov / mid Dec)
                   P2 ── P3 ────────────┤▲ first online test (mid/end Jan)
                                          ▲ 05.02. WS grades from the gradebook
                                          P6 ─ P7 ──────┤ (Feb–Mar)
                                                               P5 before Sept 2027
```

WS 2026/27 is therefore a pilot. The gradebook is in time, and with luck there are one or two online tests in January. Everything is in full use from the SS on. A break over Christmas moves everything after P4 by about two weeks. The February deadline still depends only on the gradebook.

## 10. Open points

- Retention: how long grades and attempts are kept after a student leaves, and what the year change deletes versus archives (P5)
- The client-IP spike for the school-network restriction (section 7)
- Whether a make-up sitting may swap questions (pool wear)
- Editor details: who may delete a question that has already been used (snapshots protect the grades, but the usage history would lose its target)
- Follow-ups that the database enables, not part of this plan: learning-route progress per student, and moving preferences and `lastVisitedUrl` out of Keycloak user attributes
