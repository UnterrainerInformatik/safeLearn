## MODIFIED Requirements

### Requirement: A question has a type, two languages and correct flags

A question SHALL be one of `multichoiceset` (several correct answers), `multichoice` (exactly one correct answer), `truefalse` or `freetext` (an answer the student writes). It SHALL carry its short title and its text in German and in English, a category, and any images it embeds. A question of the first three types, a choice question, SHALL carry each answer's text in German and in English and a correct flag per answer. A `freetext` question SHALL carry no answers and no correct flags. It SHALL carry a model solution in German and in English. A question SHALL count in a test with the weight that test gives it (`online-test`, `offline-test-questions`). In an online test, a choice question SHALL be graded all-or-nothing by the module. In a test on paper, every question SHALL be graded by a teacher with a grade from 1 to 5.

#### Scenario: A multichoice question with two correct answers

- **WHEN** a question of type `multichoice` is saved with two answers flagged correct
- **THEN** it is refused, because a `multichoice` question has exactly one

#### Scenario: A free-text question

- **WHEN** a teacher saves a `freetext` question "Erkläre den Unterschied zwischen PUT und PATCH" with its English text and a model solution in both languages
- **THEN** the pool holds it as a `freetext` question without answers, with both model solutions

#### Scenario: One question, two weights

- **WHEN** a question has the weight 1 in one test and the weight 3 in another
- **THEN** the pool holds one question, and each test counts it with its own weight
