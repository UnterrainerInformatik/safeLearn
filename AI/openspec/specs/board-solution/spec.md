# board-solution Specification

## Purpose
Defines the teacher-only presentation of a written test's solution, shown on the board in the lesson after the test.

## Requirements

### Requirement: A teacher presents a test's solution as a deck

A teacher SHALL be able to open a written test as a presentation in the presentation view: one question per slide in the test's original order and the course's language, with the correct answers marked, and for each question the share of submitted attempts that answered it correctly, followed by three absolute counts over the submitted attempts: how many answered it correctly, how many answered it wrong and how many left it blank. An attempt counts as correct when it chose exactly the correct answers - the rule the grade uses; as blank when it chose no answer for the question; and as wrong otherwise, a partly correct choice included. The three counts SHALL add up to the number of submitted attempts. Beside every answer option the slide SHALL show how many submitted attempts chose it. The deck SHALL show no student's name or individual answer.

#### Scenario: Presenting

- **WHEN** a teacher opens the solution of a test submitted by 24 students, of whom 18 answered question 2 correctly, 4 wrong and 2 left it blank
- **THEN** the slide for question 2 marks its correct answers and shows 75 % with 18 correct, 4 wrong and 2 blank

#### Scenario: A partly correct choice counts as wrong

- **WHEN** a submitted attempt chose one of the two correct answers of a multiple-answer question and nothing else
- **THEN** that attempt is counted as wrong for the question, and the chosen answer's count includes it

#### Scenario: How often each option was chosen

- **WHEN** 7 of the submitted attempts chose a wrong option of question 3
- **THEN** that option on the slide for question 3 shows 7

#### Scenario: Open attempts do not count

- **WHEN** an attempt is still being written while the teacher opens the solution
- **THEN** it is in none of the counts and none of the options' counts

#### Scenario: A test nobody has written yet

- **WHEN** a teacher opens the solution of a test without any submitted attempt
- **THEN** the slides show the correct answers and no share, no counts and no option counts

### Requirement: The solution is never available to students

The solution deck and every request it makes SHALL be refused to any session without the teacher or admin role, including a teacher in student view, who is treated as a student like everywhere in the module.

#### Scenario: A student opens the solution URL

- **WHEN** a student requests the solution deck of a test they wrote
- **THEN** the request is refused
