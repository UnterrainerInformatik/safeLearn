## ADDED Requirements

### Requirement: A page writing in full screen is framed in violet

While a student's own attempt is open and the page is in full screen, the page SHALL show a violet frame around the whole screen. The frame SHALL be there for as long as both hold, and SHALL disappear the moment the page leaves full screen, without a reload. It SHALL come back when the page returns to full screen during the attempt.

The frame SHALL NOT be shown behind "Start the test in full screen" or "Continue in full screen", on the result page after the attempt has been submitted, on any page without an open attempt, or on the handout page of an offline test.

A teacher's preview of a test SHALL show the same frame while it shows the test in full screen. Once the preview has ended, by Submit or at the end of its countdown, the frame SHALL be gone.

The frame SHALL be drawn in the same violet in the light and the dark theme. It SHALL NOT take clicks, and SHALL NOT prevent reading, answering or submitting.

#### Scenario: Writing in full screen

- **WHEN** a student presses "Start the test in full screen" and the questions are shown in full screen
- **THEN** a violet frame runs around the whole screen

#### Scenario: Leaving full screen

- **WHEN** a writing student presses Esc
- **THEN** the frame disappears and the "Back to full screen" bar is shown
- **AND** pressing "Back to full screen" shows the frame again

#### Scenario: Behind the gate

- **WHEN** a student reloads the page during an attempt and sees "Continue in full screen"
- **THEN** no frame is shown until the page is in full screen again

#### Scenario: After submitting

- **WHEN** the student submits, or the server submits at the deadline
- **THEN** the page leaves full screen and shows the result without a frame

#### Scenario: A teacher's preview

- **WHEN** a teacher presses "Start the test in full screen" in the preview of a test
- **THEN** the violet frame is shown while the preview is in full screen, and it is gone once the preview has ended

#### Scenario: An offline sitting's handout

- **WHEN** a present student opens their handout during an offline sitting
- **THEN** no frame is shown, whether or not the browser is in full screen

#### Scenario: The frame does not block the page

- **WHEN** the frame is shown
- **THEN** every answer and the Submit button near the edges of the screen can still be clicked
