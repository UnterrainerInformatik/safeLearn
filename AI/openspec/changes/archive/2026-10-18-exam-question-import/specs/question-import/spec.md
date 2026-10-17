## Purpose

Lets teachers add batches of new pool questions, written in both languages in a Markdown file that a Claude can produce from one format description, and find those questions again to review them before they go into a test.

## ADDED Requirements

### Requirement: Only a session acting as a teacher reaches the import

The import page, the format description, and every request that checks, imports, takes back or marks as reviewed SHALL be available only to a session acting as a teacher. A student, and a teacher in student view, SHALL be refused, and a refused request SHALL change nothing.

#### Scenario: A student uploads a file

- **WHEN** a student sends a request that would import a question file
- **THEN** it is refused and the pool is unchanged

#### Scenario: A teacher in student view opens the import page

- **WHEN** a teacher who has switched to student view opens the import page
- **THEN** the page is not shown

### Requirement: The import file is Markdown in the format safelearn-questions/1

An import file SHALL be a UTF-8 Markdown file that declares the format `safelearn-questions/1` in a front matter at its top. Its content SHALL be read as follows:

- A level-1 heading starts a category. Its text is the German path, segments separated by " / " (slash with a space on each side). The next line SHALL be `en: ` followed by the English path, with the same number of segments.
- A level-2 heading starts a question in the category above it. Its text is the German short title. The next lines SHALL be `en: ` with the English short title and `type: ` with one of `multichoiceset`, `multichoice` or `truefalse`. A `truefalse` question SHALL instead of answers carry a line `solution: true` or `solution: false`.
- Below them, a level-3 heading `de` and a level-3 heading `en` each hold that language's question text, followed - except for `truefalse` - by the answers as a task list: `- [x]` for a correct answer, `- [ ]` for a wrong one.
- Texts and answers SHALL be formatted in Markdown: paragraphs, bold, italic, inline code, code blocks, bulleted and numbered lists. They SHALL be stored sanitized like every other pool text.

A file SHALL be accepted only up to 1 MB and up to 200 questions.

#### Scenario: A file without the format declaration

- **WHEN** a teacher uploads a Markdown file that has no front matter naming `safelearn-questions/1`
- **THEN** the check refuses it, says that it is not a question file in this format, and nothing is stored

#### Scenario: Code in an answer

- **WHEN** a file's answer reads ``- [x] `PUT /users/7` ``
- **THEN** the imported answer shows `PUT /users/7` as inline code in that language

### Requirement: The format description tells a Claude everything it needs

The import page SHALL offer the format description as a Markdown file for download. It SHALL contain the syntax with a complete example of every question type, every rule the check applies, the pool's conventions, and the pool's category tree as it stands at download, in German and English, so that new questions are filed under existing categories. It SHALL tell the writer:

- to prefer questions with several correct answers (`multichoiceset`);
- to end the question text of every `multichoiceset` question with the number of correct answers, "(N richtige Antworten)" in German and "(N correct answers)" in English, with "(1 richtige Antwort)" and "(1 correct answer)" for one;
- to end the question text of every `multichoice` question with "(1 richtige Antwort)" / "(1 correct answer)" as well, although the check does not require it there;
- that answers are shown shuffled, so no answer may refer to another one or to its position ("all of the above", "A and C");
- to write both languages with the same meaning and the same correct answers in the same order;
- that images cannot be imported.

#### Scenario: Downloading the description

- **WHEN** a teacher downloads the format description while the pool has the category "HTTP und REST / Caching"
- **THEN** the file lists "HTTP und REST / Caching" with its English path, and states the rule for the number of correct answers

### Requirement: The check refuses a file that does not fit, naming every problem with its line

Before anything is stored, the whole file SHALL be checked. It SHALL be refused if any question breaks a rule the question editor applies to a save (titles and texts in both languages, every answer's text in both languages, at least two answers, correct flags fitting the type), or any of the following:

- The German and the English section of a question differ in the number of answers or in which positions are correct.
- A `multichoiceset` question's German or English text does not end with the hint stating how many answers are correct, or the hint's number differs from the number of answers marked correct. A `multichoice` question that carries the hint SHALL state one.
- A text embeds an image, or the file contains anything the format does not know (a question outside a category, a missing `en:` line, an unknown type).
- The same file was imported before and that import has not been taken back.

A refusal SHALL list every problem it found, each with the line number in the file and the question's German title, so that the list can be handed back to whoever wrote the file. A refused file SHALL change nothing.

#### Scenario: A wrong count in the hint

- **WHEN** a `multichoiceset` question on line 42 ends with "(2 richtige Antworten)" and has three answers marked correct
- **THEN** the check refuses the file and names line 42, the question's title, and that the hint says 2 but 3 answers are marked correct

#### Scenario: The hint missing in English only

- **WHEN** a `multichoiceset` question's German text ends with "(2 richtige Antworten)" and its English text has no hint
- **THEN** the check refuses the file and names the missing English hint

#### Scenario: The languages disagree

- **WHEN** a question's German answers are marked `x - x -` and its English answers `x x - -`
- **THEN** the check refuses the file and names the question and both patterns

#### Scenario: Several problems at once

- **WHEN** a file has a missing English title in one question and a single-choice question with two correct answers in another
- **THEN** the refusal lists both problems with their lines, and nothing is stored

#### Scenario: The same file again

- **WHEN** a teacher uploads a file byte for byte identical to one imported before
- **THEN** the check refuses it and names the earlier import's date and teacher

#### Scenario: The same file after taking it back

- **WHEN** a teacher takes back an import and then uploads the identical file again
- **THEN** the check accepts it like a new file

### Requirement: A clean file is previewed before it is imported

A file that passes the check SHALL first be shown as a preview, without storing anything: the number of questions per category and per type, the categories that will be created, and every question whose German text equals that of a question already in the pool, with that question named. Such a question SHALL NOT refuse the file. The import SHALL happen only when the teacher confirms the preview.

#### Scenario: A new subcategory

- **WHEN** a clean file files two questions under "HTTP und REST / Statuscodes" and only "HTTP und REST" exists
- **THEN** the preview says that "Statuscodes" will be created under "HTTP und REST" and holds 2 questions

#### Scenario: A question the pool already has

- **WHEN** a clean file holds a question whose German text equals an existing question's
- **THEN** the preview names the existing question, and the file can still be imported

### Requirement: An import is all or nothing and only adds

Confirming the preview SHALL check the file again and import all of its questions in one step, or none of them. An import SHALL only add questions and categories. It SHALL NOT change, overwrite or merge into any existing question, category or test. A category SHALL be matched to an existing one by its German path, and created with both names where none exists. New questions SHALL be placed at the end of their category. The import SHALL be recorded with the teacher, the time, the file's name and the counts.

#### Scenario: Importing into an existing category

- **WHEN** a teacher imports a file with three questions under "HTTP und REST" and that category already holds ten
- **THEN** it holds thirteen, the ten unchanged, the three new ones last

### Requirement: Imported questions are marked as not reviewed until a teacher reviews them

Every question an import adds SHALL be marked as not reviewed. Questions that existed before this capability SHALL count as reviewed. The mark SHALL be cleared when a teacher marks the question as reviewed on its preview, or when a teacher saves the question in the editor. Clearing the mark SHALL NOT change the question otherwise.

#### Scenario: Marking as reviewed

- **WHEN** a teacher previews an imported question and marks it as reviewed
- **THEN** the question is no longer highlighted, and nothing else about it changes

#### Scenario: Saving in the editor

- **WHEN** a teacher corrects a typo in an imported question and saves
- **THEN** the question is saved and no longer marked as not reviewed

### Requirement: The browser highlights questions that are not reviewed

The question browser SHALL highlight a question that is not reviewed in its row, distinguishable from a question chosen for a test and from the question clicked last, in both themes. Its preview SHALL say that it is not reviewed, when and by whom it was imported and from which file, and offer to mark it as reviewed. The browser SHALL offer a filter that shows only questions not reviewed, with their number. After an import, the browser SHALL open with that filter on.

#### Scenario: Right after an import

- **WHEN** a teacher imports a file with 12 questions
- **THEN** the browser opens showing only the questions not reviewed, the 12 among them, each highlighted

#### Scenario: Highlighted and chosen

- **WHEN** a teacher with a course chosen in the bar chooses an unreviewed question for a test
- **THEN** its row shows both that it is chosen and that it is not reviewed

### Requirement: A test may hold unreviewed questions, and its assembly says so

Questions not reviewed SHALL be available for tests like any other. While questions are chosen for a test, the browser SHALL state how many of them are not reviewed.

#### Scenario: Assembling with an unreviewed question

- **WHEN** a teacher chooses four questions, one of them not reviewed
- **THEN** the assembly states that one of the four chosen questions is not reviewed, and a test can still be created

### Requirement: An import can be taken back while none of its questions is used

The import page SHALL list past imports with teacher, time, file name, the number of questions and how many of them are still not reviewed. An import SHALL be taken back on request, deleting all of its questions and every category it created that is empty afterwards, as long as none of its questions is in a test. Otherwise taking it back SHALL be refused, naming the questions in use. Questions of a taken-back import that were retired SHALL be deleted with it if unused. A taken-back import SHALL leave no record, so the same file can be imported again.

#### Scenario: Taking back a fresh import

- **WHEN** a teacher takes back an import whose questions are in no test
- **THEN** its questions are gone, the categories it created are gone if empty, and the pool is otherwise unchanged

#### Scenario: One of its questions is in a test

- **WHEN** a teacher takes back an import one of whose questions is in a test
- **THEN** it is refused, the question in use is named, and nothing is deleted
