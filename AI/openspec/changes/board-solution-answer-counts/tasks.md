## 1. Tally

- [x] 1.1 Extend `correctShares` in `exam/attempts.js` to also return `wrong` and `blank` per question and `chosen` per answer, over submitted attempts only; verify by extending the board-share test in `test/exam-tests.test.js` (Anna all correct, Ben partly correct on the multiple-answer question and blank elsewhere: correct/wrong/blank and the option counts as expected, an open attempt counted nowhere, counts summing to `submitted`)

## 2. Deck

- [x] 2.1 Render the counts in `solutionSlides` (`exam/routes-tests.js`): the share line with `· N richtig · N falsch · N leer` (English `correct/wrong/blank`) and a `.sl-board-count` per answer, all left out without a submitted attempt; verify with the browser check in `test/exam.test.js` ("a teacher shows a test's solution on the board"), updated to expect the counts and the option counts for the one submitted attempt and none on the unwritten test
- [x] 2.2 Style `.sl-board-count` in `css/reveal.css` (right-aligned, muted like the share); verify visually in the deck in both themes

## 3. Docs and verification

- [x] 3.1 Update "Solution on the board" in `docs-exam-module.md` (and the board-solution line in `AI/architecture.md` if it mentions the share); verify the text matches the delta spec
- [ ] 3.2 Run the targeted tests, then the full `npm test` once; verify green
