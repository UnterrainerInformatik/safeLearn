Source: AI/open-proposals.md, entry **Freitext-Fragen im Pool, Quickies daraus zusammensetzen** (decided with Gerald on 2026-11-23: a type `freetext`, not a flag; split into this change for the pool and `pool-quickie` for composing short tests from it; online tests stay without free-text questions for now, a later optional change may allow them with teacher correction). The entry is shared with `pool-quickie`: archiving this change SHALL NOT remove it; `pool-quickie`'s archive does.

## Why

The pool keeps only questions the module can grade by itself. Questions with a free answer, which short tests on paper consist of, cannot be kept, shared or reused, and the 9 `essay` questions of the Moodle export were dropped for that reason. This change lets the pool hold them. `pool-quickie` then composes short tests from them.

## What Changes

- **A fourth question type `freetext`.** It has a question text and a model solution in German and English, no answers and no correct flags. The module cannot grade it; a teacher does (`pool-quickie`).
- **The editor edits a free-text question** with the model solution side by side in both languages, in place of the answers. A save needs the model solution in both languages. Changing a question to `freetext` drops its answers. The change is refused while an online test that has not begun holds the question.
- **The import format `safelearn-questions/1` knows `type: freetext`**, with a `#### solution` section under each language. The check, the preview counts and the downloadable format description cover it. The hint about the number of correct answers does not apply to it.
- **The question browser gets a type selector.** It narrows the tree to one type. The preview of a free-text question shows its model solution.
- **An online test holds no free-text question.** When a test is assembled, free-text questions are shown but cannot be ticked, with the reason.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `question-pool`: a question is one of four types; a free-text question has a model solution instead of answers and is graded by a teacher. The browser filters by type, and the preview shows the model solution.
- `question-editor`: editing and saving a free-text question. A change of type to `freetext` is refused while an online test that has not begun holds the question.
- `question-import`: the format and the check know `freetext`, and the format description explains it.
- `online-test`: free-text questions cannot be part of an online test.

## Impact

- `exam/migrations/023-freetext-questions.sql`: rebuild `question` and `test_question` with `freetext` in the type `CHECK`, and add `solution_de`/`solution_en` to both.
- `exam/pool-import.js` (`questionTypes`), `exam/pool-edit.js` (validation, writing the content, the type change guard), `exam/question-import.js` (parser, check, counts, format description).
- `exam/tests.js`: assembling and changing an online test refuses free-text questions.
- `exam/client/pool.js`, `exam/client/pool-tree.js`, `exam/client/question-editor.js`, `exam/client/pool-import.js`.
- `i18n/de.json`, `i18n/en.json` (BabelEdit format); tests in `test/exam*.test.js`, a browser check, and `test/coverage-map.json`.
