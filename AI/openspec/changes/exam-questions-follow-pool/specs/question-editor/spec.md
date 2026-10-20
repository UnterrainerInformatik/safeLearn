## ADDED Requirements

### Requirement: An edit reaches every test not yet begun and no begun test

Saving a question SHALL change the pool. The change SHALL apply at once to every test that holds the question and has not begun, without a teacher asking for it. A test begins when its first sitting opens or its first attempt starts. Every begun test SHALL keep its snapshot: its texts, answers, correct flags and images as they were when it began. An image that a begun test shows SHALL NOT be changed or deleted by an edit, even if the edited text no longer references it. An image that is no longer referenced by the question and is shown by no begun test SHALL be removed. Before saving, the editor SHALL name the tests not yet begun that the save will change, and SHALL say that begun tests keep their version.

#### Scenario: Fixing a question used last semester

- **WHEN** a teacher changes the text of a question that appeared in a written test and saves
- **THEN** the written test, its board solution and its students' results show the old text, and new tests get the new text

#### Scenario: A typo fixed after assembling

- **WHEN** a teacher fixes a typo in a question that is part of a test with a sitting next week, and saves
- **THEN** the test shows the corrected text and still has the same questions in the same order, with no further step

#### Scenario: Replacing an image

- **WHEN** a teacher replaces the only image of a question that a written test shows, and saves
- **THEN** the written test still shows the old image, and the pool question and every test not yet begun show the new one

#### Scenario: The editor names the tests it reaches

- **WHEN** a teacher opens a question that is part of one test with a sitting next week and one written test
- **THEN** the editor names the test with the sitting next week as one the save will change, and says that written tests keep their version

### Requirement: Any question can be deleted, and retiring keeps one out of new tests

Any teacher SHALL be able to delete any question, whether or not it has been part of a test. Before deleting, the editor SHALL ask for confirmation and SHALL name every test not yet begun that holds the question. The deletion SHALL be refused, and nothing changed, if that set of tests changed between the confirmation and the deletion. Deleting SHALL remove the question, its answers and its usage records from the pool, and SHALL take it out of every test not yet begun. Every begun test SHALL keep its copy of the question, with its images, attempts and grades unchanged.

A teacher SHALL be able to retire a question instead. A retired question SHALL NOT be offered for new tests, SHALL be shown in the browser only when retired questions are asked for, and SHALL keep its usage history. It SHALL stay in the tests not yet begun that hold it, and SHALL keep following edits there. A teacher SHALL be able to revive a retired question, which makes it available for new tests again. Any teacher SHALL be able to retire, revive and delete any question.

#### Scenario: Retiring a used question

- **WHEN** a teacher retires a question that appeared in two tests
- **THEN** the question is no longer offered for new tests, and both tests and its usage entries are unchanged

#### Scenario: Deleting a question used in a written test

- **WHEN** a teacher deletes a question that appeared in a test written last semester, and confirms
- **THEN** the question is gone from the pool, and the written test, its board solution, its attempts and their grades still show it as it was written

#### Scenario: Deleting a question planned for a test

- **WHEN** a teacher deletes a question that is part of two tests whose sittings have not opened yet
- **THEN** the confirmation names both tests, and after confirming, neither test holds the question any more

#### Scenario: A test begins between confirmation and deletion

- **WHEN** a teacher confirms the deletion of a question and, before the request arrives, a test that the confirmation named begins
- **THEN** the deletion is refused with the notice that the affected tests changed, and the question is still in the pool

#### Scenario: Deleting a fresh question

- **WHEN** a teacher deletes a question created today that no test contains
- **THEN** the question, its answers and its images are gone

## REMOVED Requirements

### Requirement: Editing never changes a test that already exists

**Reason**: A test now follows the pool until it begins. Only a begun test keeps the version it was written with.
**Migration**: Replaced by "An edit reaches every test not yet begun and no begun test". Written tests behave as before.

### Requirement: Tests not yet written can take up an edit on request

**Reason**: Tests not yet begun take up every edit at once, so there is nothing left to offer.
**Migration**: The editor's list of unwritten tests and its update button are removed. The tests affected by a save are named before saving instead.

### Requirement: Used questions are retired, unused ones may be deleted

**Reason**: Deleting is now allowed for every question (Gerald, 2026-10-20). Retiring stays as a way to keep a question out of new tests.
**Migration**: Replaced by "Any question can be deleted, and retiring keeps one out of new tests". The refusal "used questions cannot be deleted" goes away.
