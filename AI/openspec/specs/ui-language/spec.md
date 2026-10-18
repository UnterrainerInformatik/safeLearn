# ui-language Specification

## Purpose

Lets every user choose the language of the app's interface (English or German) and, independently of it, the format of dates, times and numbers, while page content and students' exam content keep their own language.

## Requirements

### Requirement: Language and format are two preferences of each user

Every signed-in user SHALL be able to choose, in the settings menu of the top bar, a **language** out of English and German and, independently of it, a **format** out of `en-GB` and `de-AT`. Both choices SHALL be stored with the user's other preferences, so they follow the user to every browser and device, and SHALL take effect on the next page load. Any combination SHALL be allowed, including English with `de-AT`.

#### Scenario: English texts with Austrian formats

- **WHEN** a teacher chooses English and `de-AT` and reloads the gradebook
- **THEN** all labels are English and a column dated 2026-10-20 reads `20.10.2026`

#### Scenario: The choice follows the user

- **WHEN** a teacher chooses German in one browser and then signs in from another browser
- **THEN** the interface there is German without choosing again

#### Scenario: The menu shows the current choice

- **WHEN** a user opens the settings menu
- **THEN** the language and the format currently in effect are marked as chosen

### Requirement: Without a choice, English with de-AT

A user who has stored no language SHALL see English, and a user who has stored no format SHALL see `de-AT`. A stored value outside the allowed ones SHALL be treated as not stored. Pages shown before sign-in SHALL use these defaults.

#### Scenario: A user who never chose

- **WHEN** a student who has never opened the setting loads a page
- **THEN** the interface is English and dates read like `20.10.2026`

#### Scenario: A stored value that is not allowed

- **WHEN** a user's stored language is `fr`
- **THEN** the interface is English

### Requirement: The whole app interface follows the language

Every text the app itself puts on screen SHALL be shown in the chosen language: the top bar, the settings menu, the sidebar and its search hint, pages and messages rendered by the server, and every page, bar, button, label, message and tooltip of the exam module, for teachers and students alike. The page SHALL declare the chosen language as its document language.

#### Scenario: Sidebar in German

- **WHEN** a user with German chosen opens any page
- **THEN** the sidebar's headings and the search hint are German

#### Scenario: Exam module in German

- **WHEN** a teacher with German chosen opens the list of online tests
- **THEN** the module's bar, the headings, the buttons and the empty-state message are German

#### Scenario: Document language

- **WHEN** a user with German chosen loads a page
- **THEN** the page's document language is `de`

### Requirement: Page content is never translated

The Markdown content of the pages, file and folder names in the navigation, and anything a teacher typed (names of tests, categories, courses, comments) SHALL be shown exactly as written, whatever language is chosen.

#### Scenario: A page written in German, read in English

- **WHEN** a user with English chosen opens a page written in German
- **THEN** the page's text is unchanged German and only the surrounding interface is English

### Requirement: Students' exam content follows the course's language

In the writing view and in the results, questions, answers and explanations SHALL be shown in the language of the course the test belongs to, whatever the student has chosen. Everything around them (buttons, timer, messages, headings) SHALL follow the student's own language.

#### Scenario: English interface, German course

- **WHEN** a student with English chosen writes a test of a German course
- **THEN** the questions and answers are German and the submit button and the timer are English

### Requirement: Every text has a translation or a fallback

The interface texts SHALL be kept in one catalog per language with identical keys, in a layout that BabelEdit opens and edits directly. A text missing from the German catalog SHALL be shown in English rather than left empty or shown as its key. The test suite SHALL fail when a text used by the app is missing from the English catalog, when the two catalogs do not have the same keys, or when a catalog holds a key that nothing uses.

#### Scenario: A missing German text

- **WHEN** the German catalog has no entry for a label the app shows
- **THEN** a user with German chosen sees the English label

#### Scenario: A new label without catalog entry

- **WHEN** code introduces a label whose key is in neither catalog
- **THEN** the test suite fails and names the key
