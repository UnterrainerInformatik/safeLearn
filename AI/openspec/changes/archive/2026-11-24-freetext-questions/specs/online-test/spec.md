## ADDED Requirements

### Requirement: An online test holds no free-text question

An online test SHALL hold only choice questions (`multichoiceset`, `multichoice`, `truefalse`). While a test is assembled or its questions are changed, the browser SHALL show free-text questions without a box to choose them, with the reason that online tests cannot hold free-text questions. A request that creates an online test with a free-text question, or adds one to it, SHALL be refused, naming the question, and SHALL change nothing. A test begun before a question became a free-text question SHALL keep its snapshot of that question unchanged.

#### Scenario: Assembling with free-text questions in the category

- **WHEN** a teacher with a course chosen in the bar opens a category holding three choice questions and two free-text questions
- **THEN** the three choice questions can be ticked for the test, and the two free-text questions show no box and say that online tests cannot hold them

#### Scenario: A request with a free-text question

- **WHEN** a request creates an online test from two choice questions and one free-text question
- **THEN** it is refused, the free-text question is named, and no test is created
