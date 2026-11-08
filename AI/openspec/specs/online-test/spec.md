# online-test Specification

## Purpose
Defines the online multiple-choice test from its assembly to its grade: tests, sittings and make-ups, the attempt a student writes, how it is graded and timed, what keeps it from being cheated, and what the teacher sees while it runs.

## Requirements

### Requirement: A test is assembled by hand and snapshots its questions

A teacher SHALL create a test for a course by choosing questions from the pool, in the question browser, with that course chosen in the module bar, and giving the test a name. A retired question SHALL NOT be offered. Creating the test SHALL record the question's usage for that course. A test without a question SHALL be refused at creation.

A test begins when its first sitting opens, or when its first attempt starts if that is earlier. Until it begins, the test SHALL show, preview and hand out its questions exactly as the pool currently holds them: texts, answers, correct flags and images in both languages. When it begins, the test SHALL fix a snapshot of its questions as they are at that moment. From then on, editing, retiring or deleting a pool question SHALL NOT change the test, its attempts or any grade derived from it. Make-up sittings SHALL use the same snapshot. Every student SHALL get all of the test's questions.

#### Scenario: A question is edited after the test

- **WHEN** a pool question is edited after a test containing it was written
- **THEN** the test, its attempts and their grades are unchanged

#### Scenario: A question is edited before the sitting

- **WHEN** a teacher corrects a question in the pool that is part of a test whose first sitting opens next week
- **THEN** the test's page and its preview show the corrected question at once, and the students write the corrected version

#### Scenario: An edit while the sitting is open

- **WHEN** a pool question is edited while the first sitting of a test containing it is open, before any student has started
- **THEN** the test keeps the version it had when the sitting opened, and every student, including those in a later make-up, writes that version

#### Scenario: Assembling for a course

- **WHEN** a teacher with `WMC 4BHIF 2026/27` chosen in the bar ticks four questions in the browser and creates the test `HTTP caching`
- **THEN** the course has the test `HTTP caching` with those four questions, and each of them shows the usage `WMC 4BHIF` in the browser

#### Scenario: No course chosen

- **WHEN** a teacher browses the pool with no course chosen in the bar
- **THEN** the browser offers no way to create a test

### Requirement: A test can be changed only until it is first written

Until the first attempt of a test has started, a teacher SHALL be able to rename it, change its questions and delete it. Changing the questions SHALL take the pool's current version of the chosen ones, and SHALL accept a retired question the test already holds. Deleting SHALL remove its usage records and its sittings. Once an attempt has started, the test's questions SHALL NOT change and the test SHALL NOT be deleted; renaming SHALL remain possible.

If rescheduling or deleting sittings leaves a test with no attempt and no sitting that has opened, the test SHALL drop its snapshot, take the pool's current version of its questions and follow the pool again. A question deleted from the pool in the meantime SHALL no longer be part of the test.

#### Scenario: Deleting a written test

- **WHEN** a teacher deletes a test of which one student has started an attempt
- **THEN** it is refused, and the test, the attempt and the gradebook are unchanged

#### Scenario: Correcting a test before the sitting

- **WHEN** a teacher swaps one question of a test whose sitting has not yet opened
- **THEN** the test holds the new question as the pool has it, and the swapped-out question no longer shows that usage

#### Scenario: A sitting set again with all its attempts

- **WHEN** an admin reschedules the only sitting of a test to next week, deleting its attempts, and a question of the test was edited in the pool after the sitting had opened
- **THEN** the test shows the edited question and follows the pool again until the new sitting opens

#### Scenario: A make-up rescheduled while the first sitting has attempts

- **WHEN** a teacher reschedules a make-up sitting of a test whose first sitting has submitted attempts
- **THEN** the test keeps its snapshot

### Requirement: A test without questions cannot be scheduled or written

A test SHALL be allowed to lose its last question when that question is deleted from the pool before the test begins. Such a test SHALL remain, with its name and its sittings. Scheduling a sitting for it SHALL be refused. A student SHALL NOT be able to start it, and the refusal SHALL say that the test has no questions. The test's page and the course's list of tests SHALL show that it has no questions. Once a teacher gives it questions again, it SHALL behave like any other test.

#### Scenario: The only question deleted

- **WHEN** a teacher deletes from the pool the only question of a test that has a sitting next week
- **THEN** the test remains without questions, its page says so, and the sitting stays scheduled

#### Scenario: Scheduling an empty test

- **WHEN** a teacher schedules a sitting for a test without questions
- **THEN** it is refused with the notice that the test has no questions

#### Scenario: Starting an empty test

- **WHEN** a student opens the start of a test without questions during an open sitting
- **THEN** no attempt is created, and the student is told that the test has no questions

#### Scenario: Questions added again

- **WHEN** a teacher chooses two questions for the empty test before its sitting opens
- **THEN** students can start the test in that sitting and get both questions

### Requirement: A course lists its tests

Each course SHALL have a list of its tests, reachable from the module bar, showing per test its name, number of questions, its sittings with their windows and their state (scheduled, open, over), and how many participants have submitted. From the list a teacher SHALL open a test's sittings, the live view of any sitting in every state (scheduled, open and over), and the questions of its snapshot. The view for the class SHALL be linked only for a sitting that is not over. A student SHALL NOT reach the list.

The tests SHALL be listed newest first. Tests without a sitting SHALL come first, the most recently created first. All other tests SHALL follow, ordered by the start of their first sitting, latest first. A make-up SHALL NOT move a test.

Each test's row SHALL be coloured by where the test stands:
- **open right now** while any of its sittings is open (an offline sitting once started), whatever its other sittings are;
- otherwise **done** once it has sittings and every one is over;
- otherwise **within the next 7 days** while a sitting that is not over opens less than seven days from now, including a planned offline sitting past its time that has not been started;
- otherwise **later, or no sitting yet**.

The colour SHALL NOT be the only carrier: each row SHALL name its state in words (as its tooltip), and a legend above the list SHALL show the four states with their colours. The marked row SHALL keep its own highlight over the colour, and the row's colour SHALL still be visible at its edge.

#### Scenario: The course's tests

- **WHEN** a teacher opens the online tests of `WMC 4BHIF 2026/27`
- **THEN** every test of that course is listed with its sittings and the count of submitted attempts, and no test of another course appears

#### Scenario: A sitting that is over

- **WHEN** a teacher opens the online tests of a course whose test's only sitting ended yesterday
- **THEN** that sitting links its live view, and does not link the view for the class
- **AND** the test's row is marked as done

#### Scenario: Newest first

- **WHEN** a course has a test without a sitting, a test whose first sitting was last week and a later make-up next month, and a test whose first sitting is tomorrow
- **THEN** the list shows the test without a sitting first, then the test of tomorrow, then the test of last week

#### Scenario: A test being written right now

- **WHEN** one of a test's sittings is open and a make-up is scheduled for next week
- **THEN** its row is marked as open right now, not as within the next 7 days

#### Scenario: The next test

- **WHEN** a test's only sitting opens in three days
- **THEN** its row is marked as within the next 7 days
- **AND** a test whose only sitting opens in ten days is marked as later

### Requirement: A sitting sets the window and the duration

A test SHALL be written in one or more sittings. A sitting SHALL have a window (from, to), an attempt duration that is shorter than the window, and its participants: the whole roster for the first sitting, or selected students for a make-up. Only students on the course's roster who have not left SHALL be participants. A make-up sitting SHALL use the same duration. A student SHALL see a test only while a sitting they participate in is open, and only until they have submitted. The test SHALL be shown in the course's language.

#### Scenario: Duration longer than the window

- **WHEN** a teacher creates a sitting with a 10-minute window and a 15-minute duration
- **THEN** it is refused

#### Scenario: A make-up

- **WHEN** a teacher creates a make-up sitting for two students who were absent
- **THEN** only those two see the test during its window, with the same duration as the first sitting

### Requirement: One attempt per student and test, resumed on reload

A student SHALL have at most one attempt per test across all sittings. Opening the test SHALL start the attempt and record its start time on the server. Reloading or reopening the page SHALL resume the same attempt with its saved answers and the remaining time, never start a new one.

#### Scenario: Reload during the test

- **WHEN** a student reloads the page three minutes into a 10-minute attempt
- **THEN** the page shows their saved answers and about seven minutes remaining

#### Scenario: A second attempt

- **WHEN** a student who has submitted opens the test again in a make-up sitting they were added to by mistake
- **THEN** no new attempt is started

### Requirement: The server owns the deadline and submits automatically

An attempt's deadline SHALL be the earlier of its start plus the duration and the end of the window. The server SHALL accept answers only before the deadline. Every change of answer SHALL be saved to the server as it is made. When the deadline passes, the attempt SHALL be submitted with the last answers saved before it, whether or not the page is still open, and the test SHALL no longer be shown to the student.

#### Scenario: The page is closed

- **WHEN** a student closes the browser two minutes before the deadline
- **THEN** at the deadline the attempt is submitted with the answers saved before closing

#### Scenario: A late write

- **WHEN** a request to save an answer arrives after the deadline
- **THEN** it is refused and the submitted answers are unchanged

#### Scenario: Started late in the window

- **WHEN** a student starts a 10-minute attempt four minutes before the window closes
- **THEN** the deadline is the end of the window

### Requirement: Questions and answers are shuffled per student, and nothing on the client reveals correctness

The order of questions and the order of answers within each question SHALL be shuffled per attempt on the server. The client SHALL receive the question text and the answer texts in that order, each answer identified by a random token valid for this attempt only. No response to a student before or after submission SHALL contain correct flags, the original answer order, or anything from which either can be derived. The text stating how many answers are correct SHALL be preserved.

#### Scenario: Two neighbours

- **WHEN** two students write the same test
- **THEN** they see the questions in different orders with high probability, and the same answer carries different tokens for each

#### Scenario: Reading the page

- **WHEN** a student inspects every response the writing page received
- **THEN** none contains which answer is correct

### Requirement: Grading is server-side and all-or-nothing

At submission the server SHALL grade each question as 1 if the set of chosen answers equals the set of correct answers and 0 otherwise, and SHALL store the attempt's fraction (points over number of questions). That fraction SHALL be the student's result in the test's column of the online-test category of the course's gradebook (`gradebook-sheet`). The column SHALL be dated by the start of the test's first sitting, which decides its semester, including for results from a later make-up. A participant who never started an attempt SHALL have no result in the column, not a zero. After submission the student SHALL see their points and grade and SHALL NOT see which answers were correct.

#### Scenario: One correct answer missed

- **WHEN** a `multichoiceset` question has correct answers A and C and the student chose only A
- **THEN** the question scores 0

#### Scenario: After submission

- **WHEN** a student has submitted 3 of 4 correct
- **THEN** they see 3/4 and the grade for 0.75, and no answer is marked correct or wrong

#### Scenario: Into the sheet

- **WHEN** a student's attempt at `HTTP caching`, whose first sitting started on 2026-12-01, is submitted with 3 of 4
- **THEN** the course's sheet shows 0.75 for that student in the online-test column `HTTP caching` dated 2026-12-01, and the winter-semester proposal includes it

#### Scenario: Absent and no make-up

- **WHEN** a participant never opened the test and the sitting is over
- **THEN** their field in the test's column is empty, and their online-test category is computed without it

### Requirement: An attempt is bound to the device that started it

An attempt SHALL be bound to the browser that started it. A request for the same attempt from another browser SHALL be refused and shown to the teacher, until the teacher releases the attempt to a new browser in the live view. A restart of the server SHALL NOT, by itself, lock a student out of their own attempt.

#### Scenario: Someone at home logs in as the student

- **WHEN** a student is writing in class and the same account opens the test on another device
- **THEN** the other device is refused, and the live view shows the refused device for that student

#### Scenario: The student's laptop fails

- **WHEN** the teacher releases a student's attempt in the live view
- **THEN** the student can resume it on another device with the saved answers and the remaining time

#### Scenario: Server restart during a sitting

- **WHEN** the server restarts during a sitting and the student logs in again on the same browser
- **THEN** the student resumes their attempt

### Requirement: The live view shows the browser an attempt is bound to

The server SHALL record the browser string (the `User-Agent` request header) of the browser an attempt is bound to, at the start of the attempt and whenever an unbound attempt binds to the next browser that opens it. It SHALL record the browser string of every browser that is refused. A browser string longer than 512 characters SHALL be cut to 512.

For each participant with an open attempt, the teacher's live view SHALL show a column "Bound to browser" with the bound browser shortened to browser name, major version and operating system. The full browser string SHALL be available both on mouse-over and through a control in the cell that can be operated by touch and keyboard and shows it in place, without a browser dialog. An attempt bound before its browser string was recorded SHALL show "unknown". An unbound attempt SHALL show that it waits for the next browser, and SHALL show the newly bound browser as soon as one opens it, without the page being reloaded. The column "Other browsers" SHALL show, besides the number of refusals, the shortened string of the most recently refused browser, with the full string available in the same way.

The action that lifts the binding SHALL be called "Unbind browser" and SHALL take effect on a single click, without confirmation. The browser strings SHALL NOT be shown to students, SHALL NOT appear on the class screen, and SHALL be kept and deleted together with their attempt.

#### Scenario: A student writes in Firefox on Windows

- **WHEN** a student starts an attempt in Firefox 131 on Windows and the teacher opens the live view
- **THEN** the student's row shows `Firefox 131 · Windows` under "Bound to browser", and the full browser string on mouse-over

#### Scenario: The full string on a tablet

- **WHEN** the teacher follows the sitting on a tablet and taps the info control in a student's "Bound to browser" cell
- **THEN** the full browser string is shown in the cell, and tapping the control again hides it

#### Scenario: Unbinding and re-binding

- **WHEN** the teacher clicks "Unbind browser" for a student, and the student then opens the attempt in Chrome on Android
- **THEN** no confirmation is asked, the cell first says the attempt waits for the next browser, and then shows `Chrome 130 · Android` without the teacher's page being reloaded

#### Scenario: An attempt from before the change

- **WHEN** an attempt was bound before browser strings were recorded
- **THEN** its "Bound to browser" cell shows "unknown"

#### Scenario: A refused browser

- **WHEN** the same account opens a bound attempt from Safari on iOS
- **THEN** the request is refused, and the student's "Other browsers" cell shows `1 refused` and `Safari 18 · iOS`

#### Scenario: Nothing reaches the students

- **WHEN** the class screen of the sitting is shown and a student reads their own attempt
- **THEN** neither contains any browser string

### Requirement: Leaving the page is recorded and shown, never penalized automatically

While an attempt is open, the page SHALL report to the server each time it loses visibility or focus and when it regains it. The server SHALL keep, per attempt, the number of times and the total time away. These SHALL be shown to teachers, during the sitting and after it is over, and SHALL NOT change the grade. A total time away below one minute SHALL be shown in seconds; from one minute on it SHALL be shown in minutes and seconds.

#### Scenario: Switching to another tab

- **WHEN** a student switches to another tab three times for 47 seconds in total
- **THEN** the live view shows "left 3×, 47 s" for that student and their grade is unaffected

#### Scenario: Away for minutes

- **WHEN** a student left the page twice for 252 seconds in total
- **THEN** the live view shows "left 2×, 4 min 12 s" for that student

#### Scenario: After the sitting

- **WHEN** a sitting is over and a teacher opens its live view from the test's page
- **THEN** every participant is shown with their final status, the share of their attempt in focus, and how often and how long they left the page

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

### Requirement: Tests are not visible after they were written

A test SHALL be hidden from a student once they have submitted or their deadline has passed. Its questions SHALL NOT be retrievable by any student afterwards. An image of a question SHALL be served to a student only while they have an open attempt whose test contains that question.

#### Scenario: After the sitting

- **WHEN** a student requests a test's questions after their attempt was submitted
- **THEN** the request is refused

#### Scenario: An image during and after the attempt

- **WHEN** a student requests an image of a question in their open attempt, and again after submitting
- **THEN** the first request is served and the second is refused

### Requirement: The Exams page hides the student's results while they write

On the student's Exams page (`/exam/my`), the results section, both its heading and its list, SHALL NOT be shown while the student's own attempt is running. This SHALL apply whether the attempt was started on the page or resumed when the page was opened or reloaded. Once the attempt has been submitted, by the student or by the server at the deadline, the page SHALL show the results section again, without a reload. The section SHALL then include the result of the attempt just submitted. The page SHALL show the results whenever no attempt of the student is running. A content page that places a test element and a results element SHALL show both as placed. A teacher's preview of a test SHALL NOT hide anything.

#### Scenario: Starting a test

- **WHEN** a student on `/exam/my` starts an open test
- **THEN** the writing view is shown and the page shows neither the results heading nor the results list

#### Scenario: Reloading during the test

- **WHEN** a student reloads `/exam/my` while their attempt is running
- **THEN** the attempt is resumed and the results are not shown

#### Scenario: Submitting

- **WHEN** the student submits the attempt
- **THEN** the page shows their points and grade, and below them the results again, including this test's result

#### Scenario: Time is up

- **WHEN** the deadline passes while the student's page is open and the server submits the attempt
- **THEN** the page shows the result and the results section again

#### Scenario: No test running

- **WHEN** a student opens `/exam/my` without a running attempt
- **THEN** the open tests and the results are both shown, as before

#### Scenario: A content page with both elements

- **WHEN** a student writes a test from a content page that also places a results element
- **THEN** that results element stays visible

### Requirement: The view for the class keeps its counts current

The view for the class SHALL show how many participants are writing, have submitted and have not started, and SHALL bring those counts up to date within a few seconds of a change, without a reload, for as long as the page stays open. It SHALL show no participant's name and offer nothing to click. When the session no longer acts as a teacher, it SHALL stop updating and say so.

#### Scenario: A student starts while the board shows the sitting

- **WHEN** the view for the class shows "0 writing · 0 submitted · 2 not started" and a participant starts their attempt
- **THEN** within a few seconds it shows "1 writing · 0 submitted · 1 not started", without the page being reloaded

#### Scenario: A student submits

- **WHEN** a participant who is writing submits while the view for the class is open
- **THEN** within a few seconds that participant is counted as submitted and no longer as writing

#### Scenario: Open for a whole lesson

- **WHEN** the view for the class has been open for longer than the teacher's access token lives and then a participant submits
- **THEN** the view counts that participant as submitted within a few seconds

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
