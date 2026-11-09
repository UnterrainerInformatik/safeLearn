-- Participation takes a grade from 1 to 5 (participation-grades-and-fitting-
-- decks, design D2). Every participation result stored as a mark becomes a
-- grade once: `+` (value 1) the grade 1, `−` (value 0) the grade 5. Its
-- `value` becomes the band midpoint of that grade on the scale in force, as
-- for every other grade; it is recomputed on every read anyway. Column,
-- student, date and note stay as they were. A project's marks
-- (`projectmark`) are not touched.
--
-- The update reaches the results of closed school years too, so that a
-- closed year's participation shows as grades as well. Their update trigger is
-- lifted for this one statement and recreated unchanged; the migration runs
-- in one transaction, so it is never missing outside it.
DROP TRIGGER manual_entry_closed_year_update;

UPDATE manual_entry
SET grade = CASE WHEN value >= 0.5 THEN 1 ELSE 5 END,
  value = CASE WHEN value >= 0.5
    THEN ((SELECT min_percent FROM grading_scale WHERE grade = 1) + 100) / 200.0
    ELSE ((SELECT min_percent FROM grading_scale WHERE grade = 5) + (SELECT min_percent FROM grading_scale WHERE grade = 4)) / 200.0
  END
WHERE grade IS NULL
  AND assessment_id IN (SELECT id FROM assessment WHERE kind = 'plusminus');

CREATE TRIGGER manual_entry_closed_year_update BEFORE UPDATE ON manual_entry
WHEN EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = OLD.assessment_id AND y.closed_at IS NOT NULL)
  OR EXISTS (SELECT 1 FROM assessment a JOIN course k ON k.id = a.course_id JOIN class c ON c.id = k.class_id JOIN school_year y ON y.id = c.school_year_id WHERE a.id = NEW.assessment_id AND y.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'exam: school year closed'); END;
