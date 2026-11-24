## MODIFIED Requirements

### Requirement: The review shows every question with every answer, marked chosen and correct

The review of a submitted attempt SHALL show the test's name, the attempt's points out of the test's total weight, and its grade. It SHALL show every question of the attempt in the order the attempt presented them, numbered from 1, in the course's language, with its weight where the test's questions do not all weigh 1, and with every answer of each question in the order the attempt presented them. Each answer SHALL be marked whether the student chose it and whether it is correct. Correct and wrong answers SHALL be coded like the board solution: a correct answer highlighted with ✓, a wrong one dimmed with ✗, each mark also given as text for assistive technology. Each question SHALL be marked whether it scored, by the rule that grades the attempt. Question texts, answer texts and images SHALL be those of the test's snapshot. A question removed from the written test SHALL NOT be shown.

#### Scenario: One correct answer missed

- **WHEN** a student reviews an attempt in which a `multichoiceset` question had correct answers A and C and they chose only A
- **THEN** the review shows A as chosen and correct, C as not chosen and correct, every other answer as wrong, and the question as not scored

#### Scenario: The student's own order

- **WHEN** a student saw question "Was cacht ein CDN?" as their question 3 while writing
- **THEN** their review shows it as question 3, its answers in the order they saw them

#### Scenario: Points and grade

- **WHEN** a student reviews an attempt with 3 of 4 questions correct, each weighing 1
- **THEN** the review shows 3/4 and the grade the scale gives 0.75, and no weight beside the questions

#### Scenario: Weighted questions

- **WHEN** a student reviews an attempt of a test whose questions weigh 1, 1, 1 and 3, with only the three of weight 1 scored
- **THEN** the review shows 3/6, and each question shows its weight
