## Context

The board solution (`/exam/tests/<id>/solution`) is rendered server-side by `solutionSlides` in `exam/routes-tests.js` from the tally `correctShares(db, testId)` in `exam/attempts.js`, which returns `{ submitted, correct: Map<questionId, count> }`. The tally already loads every chosen answer of every submitted attempt (`response` joined with `attempt` and `test_answer`) and applies the grade's all-or-nothing rule. The deck's few texts are inline German/English strings chosen by the course's language, not i18n keys. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Correct/wrong/blank counts per question and a chosen-count per answer option, from the same pass over the submitted attempts.

**Non-Goals:**
- No change to grading, the student's view, the review page or the offline handout solution.
- No percentages per option and no charts; plain counts.

## Decisions

- **Extend `correctShares` rather than add a second query.** It returns `{ submitted, correct, wrong, blank, chosen }`, where `wrong` and `blank` are Maps keyed by question id and `chosen` a Map keyed by answer id. The rows it already loads carry everything; `blank` is a question with no chosen answer in an attempt, `wrong = submitted - correct - blank`. Alternative: a separate SQL `GROUP BY test_answer_id` for the option counts - rejected, a second read of the same rows for no gain. The function keeps its name for the existing callers and tests.
- **Rendering.** The share line becomes `Richtig beantwortet: 75 % · 18 richtig · 4 falsch · 2 leer` (English: `Answered correctly: 75 % · 18 correct · 4 wrong · 2 blank`), still in `.sl-board-share`, so the existing check that reads the share keeps a stable prefix. Each answer `<li>` gets a trailing `<span class="sl-board-count">7×</span>`, pushed to the right edge, absent when nothing was submitted. Inline strings as the rest of the deck, not new i18n keys.
- **"Blank" means no chosen answer.** Saving an empty selection removes the question's responses, so "no response row" and "empty selection" are the same state; no extra flag is needed.

## Risks / Trade-offs

- [Option counts let a class guess who chose what in a very small group (e.g. one submitted attempt)] → accepted: the share has had the same property since the deck exists, and the deck is a teacher's alone.
- [Longer share line on narrow projectors] → small font as today, the counts separated by `·` wrap naturally.
