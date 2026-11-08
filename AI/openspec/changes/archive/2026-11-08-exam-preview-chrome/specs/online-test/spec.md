## MODIFIED Requirements

### Requirement: An attempt is written in full screen

An online test SHALL only be started with one button, labelled "Start the test in full screen". The button SHALL put the page into full screen and then start the attempt. There SHALL be no other way to start an attempt, and this SHALL hold for every sitting, with no setting to turn it off. Before the button the student SHALL read that they are to stay in full screen and not switch tabs until they have finished and submitted, as anything else may look suspicious. The teacher SHALL NOT need to announce full screen, and the live view SHALL NOT ask them to.

A resumed attempt SHALL show its questions only after the student has pressed "Continue in full screen". The remaining time SHALL keep running in the meantime, as the server owns the deadline. When the page leaves full screen during an attempt, it SHALL show a bar with a "Back to full screen" button. The bar SHALL NOT cover the questions or prevent answering or submitting.

If the browser refuses full screen, the attempt SHALL start or resume anyway, and the attempt SHALL be flagged as **full screen not available**. A teacher trying their own test SHALL go through the same button, and nothing SHALL be recorded.

Once the attempt has been submitted, by the student or by the server at the deadline, the page SHALL leave full screen by itself and show the result. A page that is not in full screen at that moment SHALL stay as it is.

A teacher's try SHALL ask for the same second confirmation on Submit as a student's attempt. Once confirmed, and when its countdown runs out, the try SHALL end without submitting, saving or grading anything. The page SHALL then leave full screen by itself. In place of a result, it SHALL show that the preview has ended and nothing was submitted, or that the time is up, together with a button to start the preview again. Starting it again SHALL show a freshly shuffled preview behind "Start the test in full screen".

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

#### Scenario: Submitting a teacher's try

- **WHEN** a teacher trying their own test in full screen presses Submit twice
- **THEN** the page leaves full screen and says the preview has ended and nothing was submitted, with a button to start it again
- **AND** no attempt, answer or result has been recorded

#### Scenario: The time of a teacher's try runs out

- **WHEN** the countdown of a teacher's try reaches zero while the page is in full screen
- **THEN** the page leaves full screen and says the time is up, with a button to start the preview again

#### Scenario: Starting a teacher's try again

- **WHEN** the teacher presses the button to start the preview again
- **THEN** the test is shown behind "Start the test in full screen" with a newly shuffled order and no answer chosen

### Requirement: The page around an attempt offers no way off it

While the student's own attempt is open, the page SHALL NOT show the sidebar (nav tree, search, Home), the button that opens and closes it, the top bar's buttons on the right (Exams, the switch between teacher and student view, the presentation view and the settings), or the settings menu. The top bar SHALL keep the page title. This SHALL hold for the whole attempt: from its start, behind "Continue in full screen" after a reload, and while the page is out of full screen. A page reloaded during the attempt SHALL be shown without them from the start, so they never appear for a moment. On a content page that places the test element, they SHALL be hidden from the moment the attempt is shown.

While the attempt is open, a corpus change that would reload the page by hot reload SHALL NOT reload it, and the page SHALL NOT reload for it after the attempt either, so the result shown after submitting stays. The page SHALL be current again with the next page the student opens.

Once the attempt has been submitted, by the student or by the server at the deadline, all of them SHALL be shown again, without a reload. When no attempt of the student is running, the page SHALL show them as before.

A teacher's preview of a test SHALL hide the same parts of the page while it shows the test: behind "Start the test in full screen", while the teacher writes, and while the page is out of full screen. A reload of the preview page SHALL show it without them from the start. Once the preview has ended, by Submit or at the end of its countdown, they SHALL be shown again, without a reload. Unlike a student's attempt, a corpus change SHALL still reload the preview page by hot reload, so a teacher who edits the test alongside sees the change.

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

- **WHEN** a teacher opens the preview of their own test, and again after pressing "Start the test in full screen"
- **THEN** neither the sidebar nor the buttons on the right of the top bar nor the settings menu are shown, and the top bar shows the page title

#### Scenario: Reloading a teacher's preview

- **WHEN** a teacher reloads the preview page
- **THEN** the page is shown without the sidebar, the buttons and the settings menu from the start

#### Scenario: A corpus change during a teacher's preview

- **WHEN** the corpus changes in a way that reloads pages by hot reload while a teacher's preview is shown
- **THEN** the preview page is reloaded and shows the test behind "Start the test in full screen", still without the sidebar and the buttons

#### Scenario: After a teacher's preview

- **WHEN** the teacher's preview ends by Submit or at the end of its countdown
- **THEN** the sidebar, the buttons on the right of the top bar and the settings are shown again, without a reload
