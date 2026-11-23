## MODIFIED Requirements

### Requirement: A make-up sitting is offered, never required

A teacher SHALL be able to create a make-up sitting of an offline test. Its participants SHALL NOT be chosen. They SHALL be every student on the course's roster who has not left and who was not marked present in an earlier sitting of the test that was started, together with the students the teacher has marked to write the test again (retakes). Until the make-up is started, its participants SHALL follow the roster and the attendance of the earlier sittings as they stand. When it is started, they SHALL be fixed. A make-up SHALL use the test's handouts and duration and SHALL be started by its own button. A participant SHALL NOT be required to come, and the module SHALL NOT create a make-up by itself.

The form for a make-up SHALL say that it is for everybody who has not written the test yet, and SHALL list, by name, the students who were present in an earlier started sitting, each with a box that marks them as a retake. Retakes SHALL be changeable until the make-up is started. The attendance table of the make-up SHALL mark retakes as such. A participant's attendance and group SHALL be kept while they stay a participant before the start. The module SHALL NOT delete a retake's result: the teacher enters the result of the make-up over the earlier one in the test's column.

A make-up that was started before this rule applied SHALL keep its participants. A make-up still ahead SHALL get its participants by this rule.

#### Scenario: Two of three absent students

- **WHEN** three students were absent from the first sitting, the teacher creates a make-up without marking a retake, and only two of them come
- **THEN** all three were participants of the make-up, the third is marked absent in it, and nobody requires the third to get another make-up

#### Scenario: Not coming to the make-up

- **WHEN** a participant of a make-up is marked absent in it
- **THEN** they have no sitting left unless the teacher creates another make-up, and in that one they are a participant

#### Scenario: Marked present after the make-up was planned

- **WHEN** a make-up is planned and the teacher then corrects a student of the first sitting from absent to present
- **THEN** that student is no longer a participant of the make-up, and its form lists them as having written

#### Scenario: A retake on paper

- **WHEN** a student who was present in the first sitting is marked as a retake, is present at the make-up in group B, and the teacher types the make-up's points into their field
- **THEN** the field holds the new points, and their result counts with group B's factor

#### Scenario: Fixed at the start

- **WHEN** a make-up has been started and a student is then added to the roster
- **THEN** that student is not a participant of the make-up
