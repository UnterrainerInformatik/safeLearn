Source: phase P5 of the change `exam-module` (tasks section 8), split out on 2026-10-20 at Gerald's request so that `exam-module` can be archived. The decisions recorded in design.md (delete after the retention period, close by a button, period from the deployment) were taken with Gerald on the same day.

## Why

The exam module has been live in secureLectures since 2026-10-17, and everything it records belongs to one school year. Nothing yet ends a year. Its courses stay writable forever, and the next year has to be built by hand: every class, every roster, every course with its config sheet. The records of students who have left are never removed, although they are personal data of minors that the school only has to keep until the re-sit exams after a year are over. The first year change is due before September 2027. The rest of `exam-module` is finished, and splitting P5 off lets it be archived now instead of in a year.

## What Changes

- **Closing a school year.** Once a year's end date has passed, a teacher can close it with a button on the year's overview, after a confirmation. A closed year stays readable to its teachers and to the students it holds records of. The database refuses every change to its classes, rosters, courses, gradebook columns, results, overrides, tests, sittings and attempts, whatever route the change comes through. A closed year cannot be reopened.
- **Starting the next year from the old one.** After a new school year is created, its overview offers each class of the previous year one level up (`3AHIF` → `4AHIF`; a fifth-year class has no successor). For each, the teacher sees last year's roster pre-ticked beside the directory's current members of the new class, and confirms the roster before the class is created. The class's courses can be copied with language, weights and winter share, without columns, results or tests.
- **Retention.** Records of a student who is on no roster of the current year are kept for the retention period after the end of the last year they were on a roster, and then deleted: results, overrides, attempts, sitting participations, roster entries and the student record itself. The year change reports how many students and how many records it is about to delete, and deletes only after the teacher confirms. The period comes from the deployment (`EXAM_RETENTION_YEARS`, default 2).

## Capabilities

### New Capabilities

- `school-year-change`: closing a school year, starting the next one from the previous one, and deleting the records of students who have left once the retention period has passed. The spec moves here unchanged in intent from `exam-module` and gains the decisions above.

### Modified Capabilities

None. The read paths of `class-roster`, `gradebook` and `online-test` stay as they are. A write to a closed year is refused with a new error, like any other refusal.

## Impact

- **Server:** a migration adds `closed_at` to `school_year` and the triggers that refuse writes to a closed year. `exam/classes.js` gets closing, the next-year proposal and course copying. A new `exam/retention.js` computes and performs the deletion. New routes under `/exam/api/years/:id/…`, behind `requireTeacher`.
- **Client:** the year's overview gets the **Close school year** button, the next-year proposal and the retention report, each with a confirmation. Every write control in a closed year is disabled.
- **Deployment:** `EXAM_RETENTION_YEARS` reaches the container through `deploy/docker-compose.yml`. `test/deployment-config.test.js` knows the variable. secureLectures needs no value as long as two years is right.
- **Personal data:** this change is what removes students' data. The deletion is irreversible apart from the daily backups, which age out after 14 days.
