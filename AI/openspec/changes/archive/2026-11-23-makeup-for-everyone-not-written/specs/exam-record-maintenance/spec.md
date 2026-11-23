## RENAMED Requirements

- FROM: `### Requirement: An open test can be discarded`
- TO: `### Requirement: A test can be discarded`

## MODIFIED Requirements

### Requirement: A test can be discarded

A teacher SHALL be able to discard a test, online or offline, so that it can be written again from the start, for example after the whole class failed it. The teacher need not be an admin. An online test SHALL be discardable while its first sitting is open, in the sitting's live view and on the test's page, and once its first sitting is over, on the test's page. An offline test SHALL be discardable on the test's page once a sitting of it has been started. Discarding SHALL be confirmed by the module's two-click confirmation. The second click's label SHALL name the number of results to be deleted: for an online test its attempts, for an offline test the results entered in its column. The server SHALL refuse the request if that number differs from the confirmed number.

Discarding SHALL do the following in one transaction:
- end an open sitting;
- delete every attempt of the test, running or submitted, with its answers;
- delete every sitting of the test, make-ups included, with their attendance and groups;
- for an offline test, delete the results entered in its column;
- delete the notes in the test's gradebook column and the teachers' notes on its participants.

The test SHALL keep its name, its questions, its handouts, its duration and, for an offline test, its column's maximum and its factor A:B. An online test SHALL follow the pool again (`online-test`). Because an online test has no sitting left, its gradebook column and its results SHALL disappear from the gradebook, and the date its questions count as used SHALL be today until a new sitting is scheduled. An offline test's column SHALL stay in the sheet without results, keeping its date until a new sitting is planned.

Discarding SHALL be announced to the students' pages and to the sitting's live view. A student who is writing the test SHALL leave the attempt and full screen and SHALL be told that the teacher discarded the test. The student SHALL NOT be able to save or submit anything for it afterwards. The live view SHALL say that the test was discarded and SHALL offer the way back to the test.

Discarding SHALL be refused while a make-up sitting is open, while an offline sitting is running, for a test none of whose sittings has opened or been started, and in a closed school year. A refused request SHALL change nothing.

#### Scenario: Discarding while students write

- **WHEN** a teacher who is not an admin clicks "Discard test" in the live view of an open first sitting in which three students have started
- **THEN** nothing changes yet, and the button reads "Click again: delete 3 results and discard the test"
- **WHEN** the teacher clicks again
- **THEN** the three attempts and the sitting are gone, the gradebook has no column for the test, and the test page shows the test with its questions and no sitting

#### Scenario: A student is writing

- **WHEN** the test is discarded while a student has it open in full screen
- **THEN** the student's page leaves full screen and tells them that the teacher discarded the test, and a later save from that page is refused

#### Scenario: The number of attempts changed

- **WHEN** a discard request confirms two attempts and a third student started in the meantime
- **THEN** it is refused and nothing changes

#### Scenario: A make-up scheduled for later

- **WHEN** a test is discarded whose make-up sitting is scheduled for next week
- **THEN** the make-up sitting is gone as well

#### Scenario: The notes go with the test's results

- **WHEN** a teacher discards a test for which a teacher noted one participant in the live view
- **THEN** the note is gone, and the student's page shows no note for the test

#### Scenario: A sitting that is over

- **WHEN** the only sitting of an online test is over, 20 of 24 students submitted with a failing grade, and a teacher who is not an admin discards it on the test's page with two clicks naming 20 results
- **THEN** the 20 attempts and the sitting are gone, the gradebook has no column for the test, and the teacher can schedule a new first sitting for the whole class

#### Scenario: An offline test

- **WHEN** the only sitting of an offline test was started and is over, its column holds 18 results, and a teacher discards it with two clicks naming 18 results
- **THEN** the sitting with its attendance is gone, the column stays in the sheet without results, and the test keeps its handouts and can be planned again

#### Scenario: Only a make-up is open

- **WHEN** a request discards a test whose first sitting is over and whose make-up sitting is open
- **THEN** it is refused and nothing changes

#### Scenario: An offline sitting is running

- **WHEN** a request discards an offline test while one of its sittings is running
- **THEN** it is refused and nothing changes

#### Scenario: Nothing has been written yet

- **WHEN** a request discards a test whose only sitting is scheduled and has not opened
- **THEN** it is refused, and the sitting can be deleted instead

#### Scenario: A closed school year

- **WHEN** a request discards a test of a closed school year
- **THEN** it is refused and nothing changes
