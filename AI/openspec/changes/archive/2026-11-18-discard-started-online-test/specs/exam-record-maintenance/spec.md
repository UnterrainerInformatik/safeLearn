## ADDED Requirements

### Requirement: An open test can be discarded

While the first sitting of an online test is open, a teacher SHALL be able to discard the test, in the sitting's live view and on the test's page. The teacher need not be an admin. Discarding SHALL be confirmed by the module's two-click confirmation. The second click's label SHALL name the number of attempts to be deleted, and the server SHALL refuse the request if the test's number of attempts differs from the confirmed number.

Discarding SHALL do the following in one transaction:
- end the sitting;
- delete every attempt of the test, running or submitted, with its answers;
- delete every sitting of the test, make-ups included;
- delete the notes in the test's gradebook column and the teachers' notes on its participants.

The test SHALL keep its name and its questions and SHALL follow the pool again (`online-test`). Because the test has no sitting left, its gradebook column and its results SHALL disappear from the gradebook, and the date its questions count as used SHALL be today until a new sitting is scheduled.

Discarding SHALL be announced to the students' pages and to the sitting's live view. A student who is writing the test SHALL leave the attempt and full screen and SHALL be told that the teacher discarded the test. The student SHALL NOT be able to save or submit anything for it afterwards. The live view SHALL say that the test was discarded and SHALL offer the way back to the test.

Discarding SHALL be refused for an offline test, for a test whose first sitting is scheduled or over, and while only a make-up sitting is open. A refused request SHALL change nothing.

#### Scenario: Discarding while students write

- **WHEN** a teacher who is not an admin clicks "Discard test" in the live view of an open sitting in which three students have started
- **THEN** nothing changes yet, and the button reads "Click again: delete 3 attempts and discard the test"
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

- **WHEN** a request discards a test whose only sitting has closed
- **THEN** it is refused, and the attempts can only go through an admin's reschedule

#### Scenario: Only a make-up is open

- **WHEN** a request discards a test whose first sitting is over and whose make-up sitting is open
- **THEN** it is refused and nothing changes

#### Scenario: An offline test

- **WHEN** a request discards an offline test
- **THEN** it is refused
