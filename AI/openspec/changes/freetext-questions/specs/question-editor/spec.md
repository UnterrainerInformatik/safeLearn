## MODIFIED Requirements

### Requirement: Teachers edit both languages of a question side by side

A teacher SHALL be able to create a question and edit any existing one, with the German and the English version side by side: short title, question text, every answer's text, which answers are correct, the type and the category. Answers SHALL be edited as pairs: one German and one English text per answer, with one correct flag that holds for both. A teacher SHALL be able to add and remove answers. The editor SHALL NOT offer to reorder them, because every attempt shuffles them. For a `freetext` question the editor SHALL show, in place of the answers, the model solution in German and English side by side. Changing the type to `freetext` SHALL hide the answers, and saving SHALL drop them; until the save, changing the type back SHALL show them unchanged. Question texts, answer texts and model solutions SHALL be edited as formatted text offering at least bold, italic, inline code, a code block, bulleted and numbered lists, and images. The editor SHALL NOT require the teacher to write markup.

#### Scenario: Correcting a wrong flag

- **WHEN** a teacher marks a different answer as correct in a `multichoice` question and saves
- **THEN** the pool's question has the new answer as its only correct one in both languages

#### Scenario: Adding an answer

- **WHEN** a teacher adds a fifth answer with German and English text to a `multichoiceset` question and saves
- **THEN** the question has five answers in both languages, in the order the editor showed

#### Scenario: Writing a model solution

- **WHEN** a teacher creates a `freetext` question and writes a model solution with a code block in German and in English
- **THEN** the editor shows both model solutions side by side and no answers, and the saved question holds both with the code block

#### Scenario: A choice question becomes a free-text question

- **WHEN** a teacher changes a `multichoiceset` question with four answers to `freetext`, writes a model solution in both languages and saves
- **THEN** the question is a `freetext` question without answers

### Requirement: A question is saved only if it is complete in both languages and fits its type

A save SHALL be refused, and nothing stored, unless all of the following hold:

- The short title and the question text are present in German and in English.
- Every answer has text in both languages.
- A `multichoice` question has at least two answers and exactly one correct one.
- A `multichoiceset` question has at least two answers and at least one correct one.
- A `truefalse` question has exactly the two answers true and false, with one of them correct.
- A `freetext` question has its model solution in German and in English.
- A question is not changed to `freetext` while an online test that has not begun holds it.
- The question belongs to an existing category.

A refusal SHALL name every problem it found, with the answer it concerns, and for a change to `freetext` the online tests that hold the question.

#### Scenario: An English answer missing

- **WHEN** a teacher saves a question whose third answer has German text and no English text
- **THEN** the save is refused, the editor names the third answer's missing English text, and the stored question is unchanged

#### Scenario: Two correct answers in a single-choice question

- **WHEN** a teacher saves a `multichoice` question with two answers marked correct
- **THEN** the save is refused and the editor says that exactly one answer may be correct

#### Scenario: A model solution missing in English

- **WHEN** a teacher saves a `freetext` question whose model solution has German text and no English text
- **THEN** the save is refused, the editor names the missing English model solution, and the stored question is unchanged

#### Scenario: Changing the type of a question planned for an online test

- **WHEN** a question is part of the online test `HTTP caching`, whose sitting opens next week, and a teacher changes its type to `freetext` and saves
- **THEN** the save is refused, the editor names `HTTP caching`, and the question and the test are unchanged

#### Scenario: Changing the type of a question of a written test

- **WHEN** a question appeared only in an online test that was written last semester, and a teacher changes it to `freetext` and saves
- **THEN** the save succeeds, and the written test keeps its version of the question with its answers
