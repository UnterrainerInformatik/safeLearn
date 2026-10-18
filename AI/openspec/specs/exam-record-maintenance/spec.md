# exam-record-maintenance Specification

## Purpose
Lets teachers correct and remove the module's school years, classes and courses, and react to a running sitting by ending it early or extending its window, without touching anything that results depend on.

## Requirements

### Requirement: School years, classes and courses can be renamed

A teacher SHALL be able to rename a school year, a class and a course at the record's own page head. The same rules as on creation SHALL apply: a school year's name SHALL be unique, a class's name SHALL be unique within its school year, and a course's subject SHALL be unique within its class. A refused name SHALL be shown at the field and leave the stored name unchanged. Renaming SHALL NOT change any result, roster entry, test or grade.

#### Scenario: Correcting a subject

- **WHEN** a teacher renames the course `WMx` of `4BHIF` to `WMC`
- **THEN** the bar, the class page and the gradebook show `WMC`, and every result of the course is unchanged

#### Scenario: A duplicate class name

- **WHEN** a teacher renames `4AHIF` to `4BHIF` in a year that already has `4BHIF`
- **THEN** it is refused at the field and the class keeps its name

### Requirement: Records are deleted only while nothing depends on them

A teacher SHALL be able to delete a school year that has no classes and is not the current year, a class that has no courses, and a course that has no gradebook columns, no recorded results or grades, and no tests. Deleting a class SHALL remove its roster. Deleting SHALL be confirmed by the module's two-click confirmation. A deletion that is not allowed SHALL be refused with the reason, shown at the delete button, and SHALL change nothing.

#### Scenario: An empty course

- **WHEN** a teacher deletes a course created by mistake that has nothing recorded
- **THEN** it is gone from the class page and from the bar

#### Scenario: A course with results

- **WHEN** a teacher tries to delete a course with one recorded result
- **THEN** it is refused, the reason names what still depends on the course, and nothing changes

#### Scenario: The current year

- **WHEN** a teacher tries to delete the current school year
- **THEN** it is refused

### Requirement: A running sitting can be ended or extended

In a sitting's live view, while the sitting is open, a teacher SHALL be able to end it now and to extend its window by a number of minutes. Ending SHALL set the window's end to the current server time and SHALL be confirmed by the module's two-click confirmation. Every running attempt SHALL then be submitted with its last saved answers, exactly as at a deadline. Extending SHALL move the window's end later. The deadline of each running attempt SHALL be recomputed as the earlier of its start plus the duration and the new end of the window. The duration of the attempts SHALL NOT change. Both SHALL be announced to the live view and to the students' pages like any other change of the sitting.

#### Scenario: Ending early

- **WHEN** a teacher ends a sitting while three students are writing
- **THEN** their attempts are submitted with their saved answers and the live view shows them as submitted

#### Scenario: Extending the window

- **WHEN** a student started a 10-minute attempt four minutes before the window closes, and the teacher extends the window by ten minutes
- **THEN** the student's deadline moves to the start of their attempt plus ten minutes

#### Scenario: Extending a sitting that is over

- **WHEN** a request extends a sitting whose window has already closed
- **THEN** it is refused
