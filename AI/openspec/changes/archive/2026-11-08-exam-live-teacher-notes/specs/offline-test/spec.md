## ADDED Requirements

### Requirement: The attendance table holds the teacher's note

The attendance table of an offline sitting SHALL hold the same teacher note per participant as the live view of an online sitting (`online-test`, "Teachers note participants in the live view"), with the same limits, the same visibility to teachers only and no effect on any calculation. The note SHALL be independent of presence and group: marking a participant present, absent or moving them to another group SHALL leave their note as it was.

#### Scenario: A note at the attendance table

- **WHEN** a teacher marks a student present in group A and enters "Phone on the desk, taken away at 10:12"
- **THEN** the note is saved and shown in that student's row

#### Scenario: Presence does not touch the note

- **WHEN** a student with a note is marked absent and then present again
- **THEN** their note is unchanged
