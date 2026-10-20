## MODIFIED Requirements

### Requirement: A test is assembled by hand and snapshots its questions

A teacher SHALL create a test for a course by choosing questions from the pool, in the question browser, with that course chosen in the module bar, and giving the test a name. A retired question SHALL NOT be offered. Creating the test SHALL record the question's usage for that course. A test without a question SHALL be refused at creation.

A test begins when its first sitting opens, or when its first attempt starts if that is earlier. Until it begins, the test SHALL show, preview and hand out its questions exactly as the pool currently holds them: texts, answers, correct flags and images in both languages. When it begins, the test SHALL fix a snapshot of its questions as they are at that moment. From then on, editing, retiring or deleting a pool question SHALL NOT change the test, its attempts or any grade derived from it. Make-up sittings SHALL use the same snapshot. Every student SHALL get all of the test's questions.

#### Scenario: A question is edited after the test

- **WHEN** a pool question is edited after a test containing it was written
- **THEN** the test, its attempts and their grades are unchanged

#### Scenario: A question is edited before the sitting

- **WHEN** a teacher corrects a question in the pool that is part of a test whose first sitting opens next week
- **THEN** the test's page and its preview show the corrected question at once, and the students write the corrected version

#### Scenario: An edit while the sitting is open

- **WHEN** a pool question is edited while the first sitting of a test containing it is open, before any student has started
- **THEN** the test keeps the version it had when the sitting opened, and every student, including those in a later make-up, writes that version

#### Scenario: Assembling for a course

- **WHEN** a teacher with `WMC 4BHIF 2026/27` chosen in the bar ticks four questions in the browser and creates the test `HTTP caching`
- **THEN** the course has the test `HTTP caching` with those four questions, and each of them shows the usage `WMC 4BHIF` in the browser

#### Scenario: No course chosen

- **WHEN** a teacher browses the pool with no course chosen in the bar
- **THEN** the browser offers no way to create a test

### Requirement: A test can be changed only until it is first written

Until the first attempt of a test has started, a teacher SHALL be able to rename it, change its questions and delete it. Changing the questions SHALL take the pool's current version of the chosen ones, and SHALL accept a retired question the test already holds. Deleting SHALL remove its usage records and its sittings. Once an attempt has started, the test's questions SHALL NOT change and the test SHALL NOT be deleted; renaming SHALL remain possible.

If rescheduling or deleting sittings leaves a test with no attempt and no sitting that has opened, the test SHALL drop its snapshot, take the pool's current version of its questions and follow the pool again. A question deleted from the pool in the meantime SHALL no longer be part of the test.

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

## ADDED Requirements

### Requirement: A test without questions cannot be scheduled or written

A test SHALL be allowed to lose its last question when that question is deleted from the pool before the test begins. Such a test SHALL remain, with its name and its sittings. Scheduling a sitting for it SHALL be refused. A student SHALL NOT be able to start it, and the refusal SHALL say that the test has no questions. The test's page and the course's list of tests SHALL show that it has no questions. Once a teacher gives it questions again, it SHALL behave like any other test.

#### Scenario: The only question deleted

- **WHEN** a teacher deletes from the pool the only question of a test that has a sitting next week
- **THEN** the test remains without questions, its page says so, and the sitting stays scheduled

#### Scenario: Scheduling an empty test

- **WHEN** a teacher schedules a sitting for a test without questions
- **THEN** it is refused with the notice that the test has no questions

#### Scenario: Starting an empty test

- **WHEN** a student opens the start of a test without questions during an open sitting
- **THEN** no attempt is created, and the student is told that the test has no questions

#### Scenario: Questions added again

- **WHEN** a teacher chooses two questions for the empty test before its sitting opens
- **THEN** students can start the test in that sitting and get both questions
