## ADDED Requirements

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
