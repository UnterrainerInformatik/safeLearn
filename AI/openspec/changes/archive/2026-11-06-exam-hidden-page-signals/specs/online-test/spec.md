## ADDED Requirements

### Requirement: Signs of a hidden page are flagged beside the focus log, never penalized automatically

While an attempt is open, the writing page SHALL check whether the browser's visibility and focus properties (`document.visibilityState`, `document.hidden`, `document.hasFocus`) are still the browser's own. If one has been replaced or overridden, the page SHALL report it and the server SHALL keep it with the attempt as a **manipulated browser** finding. The finding SHALL name the properties found, and once recorded SHALL stay for the rest of the attempt.

While an attempt is open, the writing page SHALL also send the server a heartbeat every few seconds. The server SHALL decide from the heartbeats, independently of what those properties report, when the page was not visible. Such a stretch SHALL be counted as **hidden by timing**, with a count and a total time, but only while the focus log does not already count the student as away. No stretch SHALL be counted in both. While an attempt is open and no heartbeat has arrived for more than 20 seconds, the attempt SHALL be shown as **without heartbeat**, together with the time since the last one.

Teachers SHALL see these signs in the live view during and after the sitting, as one signal separate from the focus figures. They SHALL NOT change the grade, SHALL NOT end, lock or delay the attempt, and SHALL NOT be shown to the student or on the view for the class. A total time hidden by timing SHALL be formatted like the time away (seconds below one minute, minutes and seconds from then on).

#### Scenario: An extension keeps the page "visible"

- **WHEN** a student's browser runs an extension that makes `document.visibilityState` always answer `visible`, and the student starts an attempt
- **THEN** the live view shows that student's browser as manipulated, naming `visibilityState`, and the focus figures are unchanged

#### Scenario: Another tab despite the extension

- **WHEN** such an extension suppresses every focus and visibility event, and the student spends 90 seconds in another tab in two stretches
- **THEN** the focus log still shows "never left", and the live view shows the student as hidden by timing 2×, 1 min 30 s

#### Scenario: A normal tab switch is not counted twice

- **WHEN** a student without any extension switches to another tab for 30 seconds
- **THEN** the focus log counts the absence, and nothing is counted as hidden by timing

#### Scenario: A clean browser shows no signal

- **WHEN** a student without any extension writes the whole attempt on the page
- **THEN** the live view shows no suspicious signal for them

#### Scenario: The heartbeat stops

- **WHEN** no heartbeat has arrived from an open attempt for 45 seconds
- **THEN** the live view shows that attempt as without heartbeat for 45 seconds, and the attempt goes on as before

#### Scenario: Nothing reaches the student

- **WHEN** a student whose attempt carries a manipulated-browser finding reads their attempt, their results or the view for the class
- **THEN** none of them mentions the finding, the time hidden by timing or the heartbeat

#### Scenario: After the sitting

- **WHEN** a sitting is over and a teacher opens its live view from the test's page
- **THEN** every participant's suspicious signal is shown as it stood when their attempt ended, with no heartbeat warning

## MODIFIED Requirements

### Requirement: Teachers follow a sitting live

A teacher SHALL be able to open a sitting's live view before it opens. During the sitting the teacher SHALL see, per participant: not started, writing (with remaining time), or submitted; focus losses; the suspicious signal (manipulated browser, hidden by timing, without heartbeat); and refused devices. The view SHALL be pushed to the teacher's browser as changes happen, over a stream that requires the teacher's authenticated session and is separate from the unauthenticated hot-reload channel. Exam data SHALL NOT be sent over the hot-reload channel. The stream SHALL be re-checked against the session while it is open and SHALL end when the session no longer acts as a teacher. When the stream cannot be kept open, the view SHALL keep updating by fetching snapshots, without reloading the page.

The participants SHALL always be ordered by status (not started first, then writing, submitted last). Within a status they SHALL be ordered by their net time out of focus plus their time hidden by timing (longest first), and then by name. There SHALL be no choice of order. The order SHALL follow the figures as they change, but SHALL NOT move the rows while the mouse is on a button in the table.

#### Scenario: Ordered by focus

- **WHEN** two students write, one of them away from the page for longer, and the others have not started
- **THEN** those not started are listed first by name, then the student away longer, then the other

#### Scenario: Hidden by timing counts for the order

- **WHEN** two students write, one of them away for 20 seconds by the focus log, the other never away by the focus log but hidden by timing for 3 minutes
- **THEN** the student hidden by timing is listed above the other

#### Scenario: Opened before the sitting

- **WHEN** a teacher opens the live view of a sitting that opens in ten minutes
- **THEN** every participant is shown as not started, and the first student who starts appears as writing without the page being reloaded

#### Scenario: A student submits

- **WHEN** a student submits during the sitting
- **THEN** the live view shows them as submitted within a few seconds, without the teacher's page asking for it

#### Scenario: The stream without a teacher session

- **WHEN** a request without a session, or from a student's session, opens a sitting's event stream
- **THEN** it is refused and no event is sent

#### Scenario: The hot-reload channel carries no exam data

- **WHEN** a sitting is running and a client is connected to the hot-reload channel
- **THEN** no message on that channel contains any data about the sitting or its attempts

#### Scenario: The teacher switches to student view during a sitting

- **WHEN** a teacher with an open live view switches to student view
- **THEN** the stream ends and the live view says that the student view is active

#### Scenario: The stream drops

- **WHEN** the stream cannot be re-established
- **THEN** the live view continues to update from snapshots and resumes the stream once it is available again
