## ADDED Requirements

### Requirement: The page around an attempt offers no way off it

While the student's own attempt is open, the page SHALL NOT show the sidebar (nav tree, search, Home), the button that opens and closes it, the top bar's buttons on the right (Exams, the switch between teacher and student view, the presentation view and the settings), or the settings menu. The top bar SHALL keep the page title. This SHALL hold for the whole attempt: from its start, behind "Continue in full screen" after a reload, and while the page is out of full screen. A page reloaded during the attempt SHALL be shown without them from the start, so they never appear for a moment. On a content page that places the test element, they SHALL be hidden from the moment the attempt is shown.

While the attempt is open, a corpus change that would reload the page by hot reload SHALL NOT reload it, and the page SHALL NOT reload for it after the attempt either, so the result shown after submitting stays. The page SHALL be current again with the next page the student opens.

Once the attempt has been submitted, by the student or by the server at the deadline, all of them SHALL be shown again, without a reload. When no attempt of the student is running, the page SHALL show them as before. A teacher's preview of a test SHALL NOT hide anything.

#### Scenario: Starting a test

- **WHEN** a student on `/exam/my` starts an open test
- **THEN** neither the sidebar nor the buttons on the right of the top bar nor the settings menu are shown, and the top bar shows the page title

#### Scenario: Out of full screen

- **WHEN** a writing student presses Esc
- **THEN** the "Back to full screen" bar appears, and the sidebar and the buttons stay hidden

#### Scenario: Reloading during the test

- **WHEN** a student reloads `/exam/my` while their attempt is running
- **THEN** the page is shown without the sidebar, the buttons and the settings menu from the start, behind "Continue in full screen"

#### Scenario: A corpus change during the test

- **WHEN** the nav tree changes while a student writes
- **THEN** the writing page is not reloaded, and after submitting the result stays on the page

#### Scenario: After the test

- **WHEN** the student submits, or the server submits at the deadline
- **THEN** the sidebar, the buttons on the right of the top bar and the settings are shown again, without a reload

#### Scenario: A teacher's preview

- **WHEN** a teacher tries their own test
- **THEN** the sidebar and every button of the top bar stay as they are

## MODIFIED Requirements

### Requirement: An attempt is written in full screen

An online test SHALL only be started with one button, labelled "Start the test in full screen". The button SHALL put the page into full screen and then start the attempt. There SHALL be no other way to start an attempt, and this SHALL hold for every sitting, with no setting to turn it off. Before the button the student SHALL read that they are to stay in full screen and not switch tabs until they have finished and submitted, as anything else may look suspicious. The teacher SHALL NOT need to announce full screen, and the live view SHALL NOT ask them to.

A resumed attempt SHALL show its questions only after the student has pressed "Continue in full screen". The remaining time SHALL keep running in the meantime, as the server owns the deadline. When the page leaves full screen during an attempt, it SHALL show a bar with a "Back to full screen" button. The bar SHALL NOT cover the questions or prevent answering or submitting.

If the browser refuses full screen, the attempt SHALL start or resume anyway, and the attempt SHALL be flagged as **full screen not available**. A teacher trying their own test SHALL go through the same button, and nothing SHALL be recorded.

Once the attempt has been submitted, by the student or by the server at the deadline, the page SHALL leave full screen by itself and show the result. A page that is not in full screen at that moment SHALL stay as it is. A teacher's try SHALL NOT leave full screen by itself, as it is never submitted.

#### Scenario: Starting a test

- **WHEN** a student opens the Exams page during an open sitting
- **THEN** the only control for the test reads "Start the test in full screen", with the request to stay in full screen above it
- **AND** pressing it shows the questions in full screen

#### Scenario: Reload during the attempt

- **WHEN** a student reloads the page during an attempt
- **THEN** the page shows "Continue in full screen" instead of the questions, and the remaining time has gone on
- **AND** pressing it shows the saved answers in full screen

#### Scenario: Leaving full screen

- **WHEN** a writing student presses Esc
- **THEN** a "Back to full screen" bar appears above the questions, the questions can still be answered, and pressing the button returns to full screen

#### Scenario: A browser without full screen

- **WHEN** a student's browser refuses full screen
- **THEN** the attempt starts and the live view flags it as full screen not available

#### Scenario: Submitting leaves full screen

- **WHEN** a student writing in full screen submits the attempt
- **THEN** the page leaves full screen and shows the points and the grade

#### Scenario: The time runs out

- **WHEN** the deadline passes while the student writes in full screen
- **THEN** the page leaves full screen as soon as it shows the result
