## MODIFIED Requirements

### Requirement: A test can be changed only until it is first written

Until the first attempt of a test has started, a teacher SHALL be able to rename it, change its questions and delete it. Changing the questions SHALL take the pool's current version of the chosen ones, and SHALL accept a retired question the test already holds. Deleting SHALL remove its usage records and its sittings. Once an attempt has started, the test's questions SHALL NOT change and the test SHALL NOT be deleted; renaming SHALL remain possible.

If rescheduling or deleting sittings leaves a test with no attempt and no sitting that has opened, the test SHALL drop its snapshot, take the pool's current version of its questions and follow the pool again. A question deleted from the pool in the meantime SHALL no longer be part of the test.

Discarding the test while its first sitting is open (`exam-record-maintenance`) SHALL leave it with no attempt and no sitting. It SHALL then follow the pool again in the same way, and the teacher SHALL again be able to rename it, change its questions, delete it and schedule a new sitting for it, as for a test that was never started.

#### Scenario: Deleting a written test

- **WHEN** a teacher deletes a test of which one student has started an attempt
- **THEN** it is refused, and the test, the attempt and the gradebook are unchanged

#### Scenario: Correcting a test before the sitting

- **WHEN** a teacher swaps one question of a test whose sitting has not yet opened
- **THEN** the test holds the new question as the pool has it, and the swapped-out question no longer shows that usage

#### Scenario: A sitting set again with all its attempts

- **WHEN** an admin reschedules the only sitting of a test to next week, deleting its attempts, and a question of the test was edited in the pool after the sitting had opened
- **THEN** the test shows the edited question and follows the pool again until the new sitting opens

#### Scenario: A make-up rescheduled while the first sitting has attempts

- **WHEN** a teacher reschedules a make-up sitting of a test whose first sitting has submitted attempts
- **THEN** the test keeps its snapshot

#### Scenario: A discarded test is editable again

- **WHEN** a teacher discards a test whose open sitting has two attempts, and then swaps one of its questions and renames it
- **THEN** both changes are saved, the test holds the new question as the pool has it, and the test has no sitting

#### Scenario: A discarded test follows the pool

- **WHEN** a question of a test was edited in the pool after the test's sitting had opened, and the teacher then discards the test
- **THEN** the test shows the edited question

#### Scenario: A discarded test can be deleted

- **WHEN** a teacher deletes a test they have just discarded
- **THEN** the test is gone, together with its usage records
