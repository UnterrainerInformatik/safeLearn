Source: AI/open-proposals.md

## Why

The board solution of an online test shows for each question only the share of submitted attempts that got it right ("Richtig beantwortet: 75 %"). In the lesson after the test the teacher cannot tell whether the other quarter answered wrong or left the question open, nor which distractor drew the class. Absolute counts, and how often each answer option was chosen, make the discussion at the board concrete without naming anybody.

## What Changes

- Each question slide keeps the share and adds, beside it, three absolute counts over the submitted attempts: answered correctly, answered wrong, left blank (`75 % · 18 richtig · 4 falsch · 2 leer`). The three add up to the number of submitted attempts.
- "Correct" keeps the grading rule (exactly the correct answers chosen, all or nothing). "Blank" is an attempt that chose no answer for the question; every other attempt is "wrong", a partly correct multiple-answer selection included.
- Every answer option on the slide shows how many submitted attempts chose it, for single-choice, multiple-answer and true/false questions alike.
- Without a submitted attempt the slide shows neither the share, the counts nor the per-option counts, as today.
- Still no names and no individual answers; only counts.

## Capabilities

### New Capabilities

### Modified Capabilities
- `board-solution`: the requirement "A teacher presents a test's solution as a deck" gains the correct/wrong/blank counts per question and the per-option counts.

## Impact

- `exam/attempts.js`: the board's per-question tally (`correctShares`) also returns wrong and blank counts and the count per chosen answer.
- `exam/routes-tests.js`: the solution slides render the counts.
- `css/reveal.css`: styles for the counts on the slide.
- `test/exam-tests.test.js`, `test/exam.test.js`: the tally and the deck's text.
- `docs-exam-module.md`: "Solution on the board".
- No schema change, no new route, no change to grading or permissions.
