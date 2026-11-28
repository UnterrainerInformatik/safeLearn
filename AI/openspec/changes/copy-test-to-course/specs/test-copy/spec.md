## Purpose

Defines how a teacher copies a test, online or offline, into a course as a new test that has not begun, so the same test or a variant of it can be given to another class without assembling it again.

## ADDED Requirements

### Requirement: A teacher copies a test into a course

The page of every test SHALL offer to copy it to a course, in every state of the test: not begun, begun, over or discarded. This covers online tests, offline tests with questions and offline tests with handouts or with neither. Copying SHALL ask for:

- the target course, from the courses of every class the session sees (`class-teachers`), in school years that are not closed. The source's own course SHALL be among them.
- the name of the new test, preset to the source's name.
- for an offline test, the gradebook category, offering only the categories the target course uses, as creating an offline test does (`offline-test`), preset to the source's when the target uses it.

The bar's choice SHALL preset the target course when a course other than the source's is chosen there. A target course in a closed school year, or one the session does not see, SHALL be refused, as for any write to it, and nothing SHALL be created. A copy of an offline test SHALL be refused while the target course uses neither category, and the refusal SHALL say so. After copying, the teacher SHALL land on the new test's page, with the target course chosen in the bar.

#### Scenario: The TLS test for another class

- **WHEN** a teacher entered in 5AHIF and 5CHIF opens the test `TLS` of `NVS 5CHIF`, which was written last week, copies it to `NVS 5AHIF` and keeps the name
- **THEN** `NVS 5AHIF` has a new test `TLS` with no sitting, the teacher is on its page with `NVS 5AHIF` chosen in the bar, and `TLS` of `NVS 5CHIF` is unchanged

#### Scenario: A class the teacher is not entered in

- **WHEN** a teacher not entered in 5BHIF sends a copy request naming a course of 5BHIF as the target
- **THEN** it is answered with `404`, and no test is created

#### Scenario: A closed year

- **WHEN** a teacher copies a test of a closed school year into a course of the current year
- **THEN** the new test is created in the current year's course, and the source test stays as it was
- **AND** a course of the closed year is not offered as a target, and a request naming one is refused with the message that the school year is closed

#### Scenario: A category the target does not use

- **WHEN** a teacher copies an offline test counted as a short test into a course that weighs short tests at 0 % and tests above 0 %
- **THEN** the dialog offers only "counts as a test", and a request for the short-test category is refused

### Requirement: A copy is a new test that has not begun and follows the pool

The copy SHALL be a test of the target course that has not begun, as if it had just been assembled there. It SHALL have no sitting, attempt, grade, result, or teacher's note. Its questions SHALL be taken from the pool as the pool holds them at the moment of copying, not from the source's snapshot. From then on it SHALL follow the pool until it begins, like any test (`online-test`, `offline-test-questions`). Copying SHALL record each copied question's usage for the target course. The source test SHALL NOT change: not its questions, snapshot, sittings, attempts, grades or usage records.

The copy SHALL keep:

- the kind: online, on paper, or offline with handouts.
- per group, the source's questions in the source's order. A test on paper keeps group B, and a question in both groups stays in both.
- each question's weight, and for each free-text question of a test on paper its answer lines.
- for an offline test: its duration, its handouts A and B, and the values of the handout variables a teacher set. Variables the module fills itself (`exam-handout`) are filled for the new test as for any test.

An offline test's gradebook column SHALL be created in the target course for the chosen category, named by the new test, as creating an offline test does.

#### Scenario: Weights and group B kept

- **WHEN** a teacher copies the test on paper `Quickie REST` with three questions in group A, weighted 1, 3 and 1, a free-text question with 10 answer lines, and four questions in group B
- **THEN** the copy holds the same three questions in group A in the same order with weights 1, 3 and 1 and 10 answer lines, and the same four questions in group B

#### Scenario: A question corrected in the pool after the source was written

- **WHEN** a question of the written test `TLS` was corrected in the pool after `TLS` was written, and the teacher copies `TLS`
- **THEN** the copy shows the corrected question, and `TLS` still shows the version its students wrote

#### Scenario: Changing the copy before its sitting

- **WHEN** the teacher removes one question from the copy, adds another from the browser and plans a sitting
- **THEN** the copy holds the changed questions, the source test is unchanged, and the removed question's usage lists the source test but not the copy

#### Scenario: Usage recorded

- **WHEN** a teacher copies a test from `NVS 5CHIF` to `NVS 5AHIF`
- **THEN** each copied question shows in the browser both the use in `NVS 5CHIF` and the use in `NVS 5AHIF`

#### Scenario: A long test with handouts

- **WHEN** a teacher copies an offline test with handout A, handout B, 100 minutes and the teacher-set variable `ROOM` = `E07`
- **THEN** the copy has the same handouts, 100 minutes and `ROOM` = `E07`, its column in the target course is named by the copy, and it can be scheduled

### Requirement: A question that cannot be copied is left out and named

A question of the source SHALL be left out of the copy when the pool no longer holds it, when it is retired, or, for an online test, when it has become a free-text question. The answer to the copy SHALL name each left-out question with the reason, and the new test's page SHALL show that list once after copying. If a group is left with no question, it SHALL be handled as when its last question is removed (`offline-test-questions`): an emptied group B leaves one group, and an emptied group A while group B holds questions makes B's questions A's. If neither group is left with a question while the source had questions, the copy SHALL be refused, naming the left-out questions, and nothing SHALL be created. A source with handouts or with neither SHALL be copied without questions.

#### Scenario: A retired question

- **WHEN** one of the five questions of `TLS` has been retired since, and the teacher copies `TLS`
- **THEN** the copy holds the other four, and the teacher is told that the retired question was left out

#### Scenario: Every question gone

- **WHEN** every question of a test has been deleted from the pool, and the teacher copies it
- **THEN** it is refused with the names of the left-out questions, and no test or gradebook column is created

### Requirement: Copying is a teacher's

Copying SHALL be offered only to a session acting as a teacher, and a teacher in student view SHALL NOT be offered it. A copy request from any other session SHALL be refused and SHALL create nothing. The source SHALL be a test of a class the session sees, and a request naming another source SHALL be answered with `404`.

#### Scenario: A student asks for a copy

- **WHEN** a student sends a copy request for a test
- **THEN** it is refused, and no test is created
