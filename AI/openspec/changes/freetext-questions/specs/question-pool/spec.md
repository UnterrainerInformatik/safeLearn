## MODIFIED Requirements

### Requirement: A question has a type, two languages and correct flags

A question SHALL be one of `multichoiceset` (several correct answers), `multichoice` (exactly one correct answer), `truefalse` or `freetext` (an answer the student writes). It SHALL carry its short title and its text in German and in English, a category, and any images it embeds. A question of the first three types, a choice question, SHALL carry each answer's text in German and in English and a correct flag per answer. It SHALL be worth one point and SHALL be graded all-or-nothing. A `freetext` question SHALL carry no answers and no correct flags. It SHALL carry a model solution in German and in English. It SHALL NOT be graded by the module; a teacher grades it.

#### Scenario: A multichoice question with two correct answers

- **WHEN** a question of type `multichoice` is saved with two answers flagged correct
- **THEN** it is refused, because a `multichoice` question has exactly one

#### Scenario: A free-text question

- **WHEN** a teacher saves a `freetext` question "Erkläre den Unterschied zwischen PUT und PATCH" with its English text and a model solution in both languages
- **THEN** the pool holds it as a `freetext` question without answers, with both model solutions

### Requirement: Teachers browse the pool by category with a preview

A teacher SHALL be able to browse the pool by its category tree, search question texts, narrow the shown questions to one type with a type selector, and open a preview showing the question in either language. The preview SHALL mark a choice question's correct answers and SHALL show a free-text question's model solution. The type selector SHALL offer every type and all types together, SHALL default to all types, and SHALL combine with the search and the category chosen. Every question in the list SHALL show its type. Students SHALL have no access to the pool, its preview or its images outside a test they are writing.

#### Scenario: A student requests the pool

- **WHEN** a student requests the question browser or a question's preview
- **THEN** the request is refused

#### Scenario: Only free-text questions

- **WHEN** a teacher chooses `freetext` in the type selector while the category "HTTP und REST" is chosen
- **THEN** the list shows only the free-text questions of "HTTP und REST" and its subcategories

#### Scenario: Previewing a free-text question

- **WHEN** a teacher previews a free-text question in English
- **THEN** the preview shows its English text and its English model solution, marked as the model solution, and no answers
