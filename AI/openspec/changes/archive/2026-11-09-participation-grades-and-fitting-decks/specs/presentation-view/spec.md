## ADDED Requirements

### Requirement: Every slide fits the screen

A deck is shown on a projector or a classroom monitor, so every slide SHALL fit wholly on the screen it is shown on. A slide whose content is larger than the space the deck has SHALL be scaled down, its proportions kept, until all of it is visible: text, images, code, tables and embedded documents alike. Nothing on a slide SHALL be cut off or need scrolling. The application SHALL NOT split a slide into several. This SHALL hold for every deck the application renders: a presentation of the corpus, a handout's solution deck and a test's board solution. It SHALL follow a change of the window's size, and it SHALL hold for a slide revealed step by step with all its steps shown.

#### Scenario: A question with a large image on the board

- **WHEN** a teacher opens the board solution of a test whose question holds an image taller than the screen
- **THEN** the question's slide shows the heading, the whole image, every answer and the share answered correctly, without anything running off the screen

#### Scenario: A smaller window

- **WHEN** a deck is open on a slide that just fits and the window is made smaller until it no longer would
- **THEN** the slide shrinks with it and still fits wholly

#### Scenario: Stepwise reveal

- **WHEN** a slide's fragments are revealed one by one and, with all of them shown, the content is taller than the screen
- **THEN** the slide is scaled so that it fits with all fragments shown, and does not change its size from step to step

#### Scenario: Printing

- **WHEN** a deck is exported to PDF
- **THEN** each slide fits on its page as it does on the screen

### Requirement: A slide that fits today looks as it does today

The fit SHALL only ever shrink a slide that would otherwise not fit. A slide that fits the screen without it SHALL be shown exactly as before this rule: same size, same font size, same layout and position, neither shrunk nor enlarged. The reference is the corpus presentation `md/presentations/Quarkus/JPA - Basics (1).md` as secureLectures serves it (https://htl.dev/md/presentations/Quarkus/JPA%20-%20Basics%20(1).md), whose slides are already laid out for the classroom board and fit it today; it SHALL look the same after the change as before it, on the same screen.

#### Scenario: The reference deck is unchanged

- **WHEN** `JPA - Basics (1)` of the Quarkus course is opened before and after the change on the same screen, at 1920×1080, 1280×800 or 1024×768
- **THEN** every slide that fits that screen before the change looks the same after it, at the same size and in the same place

#### Scenario: A short slide

- **WHEN** a slide holds a heading and three short bullets
- **THEN** it is shown at the size it has today, neither shrunk nor enlarged
