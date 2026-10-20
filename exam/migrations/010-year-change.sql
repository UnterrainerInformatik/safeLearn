-- The year change (`school-year-change`, exam-year-change design D1-D3): a
-- school year can be closed, and from then on the database itself refuses
-- every change to what the year holds, whatever path the change comes
-- through. Only adds; no existing year is closed, so nothing changes until a
-- teacher closes one.

-- When the year was closed; NULL while it is open. Never cleared again.
ALTER TABLE school_year ADD COLUMN closed_at TEXT;

-- The one exception to the triggers below: while a row is in here, rows of a
-- closed year may be deleted (never inserted or changed). Written and removed
-- again within the one transaction that deletes the records of students who
-- have left (`retention.js`), so no other write ever sees it.
CREATE TABLE purge_in_progress (
  id INTEGER PRIMARY KEY CHECK (id = 1)
);

-- A closed year keeps its name, its dates and its mark. Making it or another
-- year current stays allowed, and a closed year is not deleted.
CREATE TRIGGER school_year_closed_update BEFORE UPDATE ON school_year
WHEN OLD.closed_at IS NOT NULL
  AND (NEW.id IS NOT OLD.id OR NEW.name IS NOT OLD.name OR NEW.starts_on IS NOT OLD.starts_on
    OR NEW.summer_starts_on IS NOT OLD.summer_starts_on OR NEW.ends_on IS NOT OLD.ends_on
    OR NEW.closed_at IS NOT OLD.closed_at)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER school_year_closed_delete BEFORE DELETE ON school_year
WHEN OLD.closed_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- Every table whose rows belong to a year gets three triggers that resolve the
-- row's year through its parents and abort when that year is closed: an
-- insert into it, an update in or out of it, and a delete from it unless a
-- purge is in progress. A table added later with a path to `school_year`
-- needs its three as well; `test/exam-year-change.test.js` fails without them.

-- class: its year through school_year_id
CREATE TRIGGER class_closed_year_insert BEFORE INSERT ON class
WHEN EXISTS (SELECT 1 FROM school_year y WHERE y.id = NEW.school_year_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER class_closed_year_update BEFORE UPDATE ON class
WHEN EXISTS (SELECT 1 FROM school_year y WHERE y.id = OLD.school_year_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM school_year y WHERE y.id = NEW.school_year_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER class_closed_year_delete BEFORE DELETE ON class
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM school_year y WHERE y.id = OLD.school_year_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- roster_entry: its year through class_id (class)
CREATE TRIGGER roster_entry_closed_year_insert BEFORE INSERT ON roster_entry
WHEN EXISTS (SELECT 1 FROM class c JOIN school_year y ON y.id = c.school_year_id WHERE c.id = NEW.class_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER roster_entry_closed_year_update BEFORE UPDATE ON roster_entry
WHEN EXISTS (SELECT 1 FROM class c JOIN school_year y ON y.id = c.school_year_id WHERE c.id = OLD.class_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM class c JOIN school_year y ON y.id = c.school_year_id WHERE c.id = NEW.class_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER roster_entry_closed_year_delete BEFORE DELETE ON roster_entry
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM class c JOIN school_year y ON y.id = c.school_year_id WHERE c.id = OLD.class_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- course: its year through class_id (class)
CREATE TRIGGER course_closed_year_insert BEFORE INSERT ON course
WHEN EXISTS (SELECT 1 FROM class c JOIN school_year y ON y.id = c.school_year_id WHERE c.id = NEW.class_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER course_closed_year_update BEFORE UPDATE ON course
WHEN EXISTS (SELECT 1 FROM class c JOIN school_year y ON y.id = c.school_year_id WHERE c.id = OLD.class_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM class c JOIN school_year y ON y.id = c.school_year_id WHERE c.id = NEW.class_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER course_closed_year_delete BEFORE DELETE ON course
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM class c JOIN school_year y ON y.id = c.school_year_id WHERE c.id = OLD.class_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- assessment: its year through course_id (course)
CREATE TRIGGER assessment_closed_year_insert BEFORE INSERT ON assessment
WHEN EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = NEW.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER assessment_closed_year_update BEFORE UPDATE ON assessment
WHEN EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = OLD.course_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = NEW.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER assessment_closed_year_delete BEFORE DELETE ON assessment
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = OLD.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- manual_entry: its year through assessment_id (assessment)
CREATE TRIGGER manual_entry_closed_year_insert BEFORE INSERT ON manual_entry
WHEN EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = NEW.assessment_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER manual_entry_closed_year_update BEFORE UPDATE ON manual_entry
WHEN EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = OLD.assessment_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = NEW.assessment_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER manual_entry_closed_year_delete BEFORE DELETE ON manual_entry
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = OLD.assessment_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- semester_grade: its year through course_id (course)
CREATE TRIGGER semester_grade_closed_year_insert BEFORE INSERT ON semester_grade
WHEN EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = NEW.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER semester_grade_closed_year_update BEFORE UPDATE ON semester_grade
WHEN EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = OLD.course_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = NEW.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER semester_grade_closed_year_delete BEFORE DELETE ON semester_grade
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = OLD.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- test: its year through course_id (course)
CREATE TRIGGER test_closed_year_insert BEFORE INSERT ON test
WHEN EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = NEW.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_closed_year_update BEFORE UPDATE ON test
WHEN EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = OLD.course_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = NEW.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_closed_year_delete BEFORE DELETE ON test
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = OLD.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- test_question: its year through test_id (test)
CREATE TRIGGER test_question_closed_year_insert BEFORE INSERT ON test_question
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_question_closed_year_update BEFORE UPDATE ON test_question
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_question_closed_year_delete BEFORE DELETE ON test_question
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- test_answer: its year through test_question_id (test_question)
CREATE TRIGGER test_answer_closed_year_insert BEFORE INSERT ON test_answer
WHEN EXISTS (SELECT 1 FROM test_question q JOIN test t ON t.id = q.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE q.id = NEW.test_question_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_answer_closed_year_update BEFORE UPDATE ON test_answer
WHEN EXISTS (SELECT 1 FROM test_question q JOIN test t ON t.id = q.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE q.id = OLD.test_question_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test_question q JOIN test t ON t.id = q.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE q.id = NEW.test_question_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_answer_closed_year_delete BEFORE DELETE ON test_answer
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM test_question q JOIN test t ON t.id = q.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE q.id = OLD.test_question_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- test_image: its year through test_id (test)
CREATE TRIGGER test_image_closed_year_insert BEFORE INSERT ON test_image
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_image_closed_year_update BEFORE UPDATE ON test_image
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER test_image_closed_year_delete BEFORE DELETE ON test_image
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- sitting: its year through test_id (test)
CREATE TRIGGER sitting_closed_year_insert BEFORE INSERT ON sitting
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER sitting_closed_year_update BEFORE UPDATE ON sitting
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER sitting_closed_year_delete BEFORE DELETE ON sitting
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- sitting_participant: its year through sitting_id (sitting)
CREATE TRIGGER sitting_participant_closed_year_insert BEFORE INSERT ON sitting_participant
WHEN EXISTS (SELECT 1 FROM sitting s JOIN test t ON t.id = s.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE s.id = NEW.sitting_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER sitting_participant_closed_year_update BEFORE UPDATE ON sitting_participant
WHEN EXISTS (SELECT 1 FROM sitting s JOIN test t ON t.id = s.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE s.id = OLD.sitting_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM sitting s JOIN test t ON t.id = s.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE s.id = NEW.sitting_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER sitting_participant_closed_year_delete BEFORE DELETE ON sitting_participant
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM sitting s JOIN test t ON t.id = s.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE s.id = OLD.sitting_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- attempt: its year through test_id (test)
CREATE TRIGGER attempt_closed_year_insert BEFORE INSERT ON attempt
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER attempt_closed_year_update BEFORE UPDATE ON attempt
WHEN EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = NEW.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER attempt_closed_year_delete BEFORE DELETE ON attempt
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM test t JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t.id = OLD.test_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- attempt_question: its year through attempt_id (attempt)
CREATE TRIGGER attempt_question_closed_year_insert BEFORE INSERT ON attempt_question
WHEN EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = NEW.attempt_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER attempt_question_closed_year_update BEFORE UPDATE ON attempt_question
WHEN EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = OLD.attempt_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = NEW.attempt_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER attempt_question_closed_year_delete BEFORE DELETE ON attempt_question
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = OLD.attempt_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- attempt_token: its year through attempt_id (attempt)
CREATE TRIGGER attempt_token_closed_year_insert BEFORE INSERT ON attempt_token
WHEN EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = NEW.attempt_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER attempt_token_closed_year_update BEFORE UPDATE ON attempt_token
WHEN EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = OLD.attempt_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = NEW.attempt_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER attempt_token_closed_year_delete BEFORE DELETE ON attempt_token
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = OLD.attempt_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- response: its year through attempt_id (attempt)
CREATE TRIGGER response_closed_year_insert BEFORE INSERT ON response
WHEN EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = NEW.attempt_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER response_closed_year_update BEFORE UPDATE ON response
WHEN EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = OLD.attempt_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = NEW.attempt_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER response_closed_year_delete BEFORE DELETE ON response
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = OLD.attempt_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- refused_device: its year through attempt_id (attempt)
CREATE TRIGGER refused_device_closed_year_insert BEFORE INSERT ON refused_device
WHEN EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = NEW.attempt_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER refused_device_closed_year_update BEFORE UPDATE ON refused_device
WHEN EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = OLD.attempt_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = NEW.attempt_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER refused_device_closed_year_delete BEFORE DELETE ON refused_device
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM attempt t0 JOIN test t ON t.id = t0.test_id JOIN course k ON k.id = t.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE t0.id = OLD.attempt_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;

-- question_usage: its year through course_id (course)
CREATE TRIGGER question_usage_closed_year_insert BEFORE INSERT ON question_usage
WHEN EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = NEW.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER question_usage_closed_year_update BEFORE UPDATE ON question_usage
WHEN EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = OLD.course_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = NEW.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
CREATE TRIGGER question_usage_closed_year_delete BEFORE DELETE ON question_usage
WHEN NOT EXISTS (SELECT 1 FROM purge_in_progress)
  AND EXISTS (SELECT 1 FROM course k JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE k.id = OLD.course_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
