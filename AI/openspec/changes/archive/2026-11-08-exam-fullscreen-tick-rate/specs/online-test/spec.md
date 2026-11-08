## ADDED Requirements

### Requirement: An attempt is written in full screen

An online test SHALL only be started with one button, labelled "Start the test in full screen". The button SHALL put the page into full screen and then start the attempt. There SHALL be no other way to start an attempt, and this SHALL hold for every sitting, with no setting to turn it off. Before the button the student SHALL read that they are to stay in full screen and not switch tabs until they have finished and submitted, as anything else may look suspicious. The teacher SHALL NOT need to announce full screen, and the live view SHALL NOT ask them to.

A resumed attempt SHALL show its questions only after the student has pressed "Continue in full screen". The remaining time SHALL keep running in the meantime, as the server owns the deadline. When the page leaves full screen during an attempt, it SHALL show a bar with a "Back to full screen" button. The bar SHALL NOT cover the questions or prevent answering or submitting.

If the browser refuses full screen, the attempt SHALL start or resume anyway, and the attempt SHALL be flagged as **full screen not available**. A teacher trying their own test SHALL go through the same button, and nothing SHALL be recorded.

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

### Requirement: The tick rate of the writing page is measured and shown

While an attempt is open, the writing page SHALL measure two rates and send them with each heartbeat: the animation frames drawn and the timer ticks run. The server SHALL keep the attempt's **tick rate** as a percentage of the student's own baseline, which it SHALL take from the attempt's first normal heartbeats. The baseline SHALL NOT be a fixed frame rate, because displays run at different rates. When the tick rate is below the threshold, the stretch SHALL count as **Tickrate Down!**, with a count and a total time. A stretch the focus log, hidden by timing or the time out of full screen already counts SHALL NOT also count as tick rate down.

The threshold SHALL be half of the student's own rate. A browser switched into an energy-saving mode during an attempt may read as tick rate down. That is accepted, because the signal only flags the row for the teacher.

The live view SHALL show the tick rate in its own column: the current percentage while writing, and the red warning "Tickrate Down!" with count and total time when it was down. After the attempt the column SHALL show the figures as they stood when it ended. A total time SHALL be formatted like the time away. The tick rate SHALL NOT change the grade, SHALL NOT end, lock or delay the attempt, and SHALL NOT be shown to the student or on the view for the class.

#### Scenario: A normal attempt

- **WHEN** a student writes the whole attempt in full screen without leaving it
- **THEN** the tick-rate column shows a percentage around 100 % and no warning

#### Scenario: The rate drops

- **WHEN** a writing student's page draws at a fifth of its baseline for 40 seconds and then recovers, without leaving full screen or the page
- **THEN** the tick-rate column shows "Tickrate Down! 1×, 40 s" for that student, and the focus figures are unchanged

#### Scenario: A tab switch is not counted as a drop

- **WHEN** a student switches to another tab for 30 seconds
- **THEN** the focus log counts the absence, and the tick rate counts nothing for it

#### Scenario: A different display

- **WHEN** two students write on displays running at 60 Hz and at 144 Hz
- **THEN** both are shown at around 100 %

## MODIFIED Requirements

### Requirement: Signs of a hidden page are flagged beside the focus log, never penalized automatically

While an attempt is open, the writing page SHALL check whether the browser's visibility and focus properties (`document.visibilityState`, `document.hidden`, `document.hasFocus`) are still the browser's own. If one has been replaced or overridden, the page SHALL report it and the server SHALL keep it with the attempt as a **manipulated browser** finding. The finding SHALL name the properties found, and once recorded SHALL stay for the rest of the attempt.

While an attempt is open, the writing page SHALL also send the server a heartbeat every few seconds. The server SHALL decide from the heartbeats, independently of what those properties report, when the page was not visible. Such a stretch SHALL be counted as **hidden by timing**, with a count and a total time, but only while the focus log does not already count the student as away. No stretch SHALL be counted in both. While an attempt is open and no heartbeat has arrived for more than 20 seconds, the attempt SHALL be shown as **without heartbeat**, together with the time since the last one.

While an attempt is open, the server SHALL also keep how often and how long the page was **out of full screen**, but only for stretches the focus log and hidden by timing do not already count. Reloading the page counts as out of full screen until the student continues in full screen. An attempt whose browser refused full screen SHALL carry the **full screen not available** finding instead, which SHALL stay for the rest of the attempt.

Teachers SHALL see these signs in the live view during and after the sitting, as one signal separate from the focus figures. They SHALL NOT change the grade, SHALL NOT end, lock or delay the attempt, and SHALL NOT be shown to the student or on the view for the class. A total time hidden by timing or out of full screen SHALL be formatted like the time away (seconds below one minute, minutes and seconds from then on).

#### Scenario: An extension keeps the page "visible"

- **WHEN** a student's browser runs an extension that makes `document.visibilityState` always answer `visible`, and the student starts an attempt
- **THEN** the live view shows that student's browser as manipulated, naming `visibilityState`, and the focus figures are unchanged

#### Scenario: Another tab despite the extension

- **WHEN** such an extension suppresses every focus and visibility event, and the student spends 90 seconds in another tab in two stretches
- **THEN** the focus log still shows "never left", and the live view shows the student as hidden by timing 2×, 1 min 30 s

#### Scenario: A normal tab switch is not counted twice

- **WHEN** a student without any extension switches to another tab for 30 seconds
- **THEN** the focus log counts the absence, and nothing is counted as hidden by timing or out of full screen

#### Scenario: Out of full screen beside the page

- **WHEN** a student leaves full screen with Esc and keeps writing on the page for 25 seconds before returning to full screen
- **THEN** the live view shows "out of full screen 1×, 25 s" in the suspicious signal, and the focus figures are unchanged

#### Scenario: A clean browser shows no signal

- **WHEN** a student without any extension writes the whole attempt on the page in full screen
- **THEN** the live view shows no suspicious signal for them

#### Scenario: The heartbeat stops

- **WHEN** no heartbeat has arrived from an open attempt for 45 seconds
- **THEN** the live view shows that attempt as without heartbeat for 45 seconds, and the attempt goes on as before

#### Scenario: Nothing reaches the student

- **WHEN** a student whose attempt carries a manipulated-browser finding reads their attempt, their results or the view for the class
- **THEN** none of them mentions the finding, the time hidden by timing, the time out of full screen, the tick rate or the heartbeat

#### Scenario: After the sitting

- **WHEN** a sitting is over and a teacher opens its live view from the test's page
- **THEN** every participant's suspicious signal is shown as it stood when their attempt ended, with no heartbeat warning

### Requirement: Teachers follow a sitting live

A teacher SHALL be able to open a sitting's live view before it opens. During the sitting the teacher SHALL see, per participant: not started, writing (with remaining time), or submitted; focus losses; the suspicious signal (manipulated browser, hidden by timing, out of full screen, full screen not available, without heartbeat); the tick rate; and refused devices. The view SHALL be pushed to the teacher's browser as changes happen, over a stream that requires the teacher's authenticated session and is separate from the unauthenticated hot-reload channel. Exam data SHALL NOT be sent over the hot-reload channel. The stream SHALL be re-checked against the session while it is open and SHALL end when the session no longer acts as a teacher. When the stream cannot be kept open, the view SHALL keep updating by fetching snapshots, without reloading the page.

The participants SHALL always be ordered by status (not started first, then writing, submitted last). Within a status they SHALL be ordered by the sum of their net time out of focus, their time hidden by timing, their time out of full screen and their time with tick rate down (longest first), and then by name. There SHALL be no choice of order. The order SHALL follow the figures as they change, but SHALL NOT move the rows while the mouse is on a button in the table.

#### Scenario: Ordered by focus

- **WHEN** two students write, one of them away from the page for longer, and the others have not started
- **THEN** those not started are listed first by name, then the student away longer, then the other

#### Scenario: Hidden by timing counts for the order

- **WHEN** two students write, one of them away for 20 seconds by the focus log, the other never away by the focus log but hidden by timing for 3 minutes
- **THEN** the student hidden by timing is listed above the other

#### Scenario: Full screen and tick rate count for the order

- **WHEN** three students write, one away for 20 seconds by the focus log, one out of full screen for 40 seconds, and one with tick rate down for 60 seconds
- **THEN** they are listed in the order: tick rate down, out of full screen, away by the focus log

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

### Requirement: The live view colours a participant's row by status

In the live view of an online sitting, the row of a participant who has submitted SHALL be coloured green (good), following the module's row colours (`exam-ui-conventions`). It SHALL no longer be shown faded. The rows of participants who have not started or are writing SHALL stay neutral. A participant's row that carries the suspicious signal (manipulated browser, hidden by timing, out of full screen, full screen not available, or without heartbeat) or a tick rate down SHALL show an amber stripe at its left edge, without a tint, on top of the colour of its status. The stripe SHALL only flag the row. It SHALL NOT change the order, the status or the grade, and SHALL NOT appear on the view for the class. A legend above the table SHALL name the green row and the amber stripe.

The colours of the list of tests (open right now red, within the next 7 days amber, later slate, done green) SHALL be the module's shared row colours.

#### Scenario: A submitted participant

- **WHEN** a participant submits during the sitting
- **THEN** their row turns green as the live view updates, and is not faded

#### Scenario: A suspicious participant

- **WHEN** a writing participant's page is hidden by timing
- **THEN** their row shows an amber stripe at its left edge and stays otherwise neutral
- **AND** once they submit, the row is green and keeps the amber stripe

#### Scenario: Tick rate down flags the row

- **WHEN** a writing participant's tick rate is down
- **THEN** their row shows the amber stripe

#### Scenario: The class does not see it

- **WHEN** the view for the class is shown on the projector
- **THEN** it shows no row colours of participants
