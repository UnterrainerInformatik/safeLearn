Source: Gerald's request of 2026-10-17 (no backlog entry in `AI/open-proposals.md`). It builds on the archived `exam-question-editor` and on the pool of `exam-module` (P2).

## Why

The pool grows only through the question editor, one question at a time. Gerald wants to have a Claude draft batches of new questions, in both languages, and bring them into the pool in one step. That needs a file format a Claude can write reliably from a single description, an import that refuses a broken file before anything is stored, and a way to find the imported questions again afterwards, because Gerald wants to check them before they go into a test.

## What Changes

- **A Markdown import format**, `safelearn-questions/1`: categories and questions as headings, each question with a German and an English section, its answers as a task list (`- [x]` correct, `- [ ]` wrong). Formatting is Markdown: bold, italic, inline code, code blocks, lists. There are no images in v1; they are added later in the editor.
- **A format description for a Claude**, one Markdown file with everything needed to write such a file: the syntax, the rules the import checks, the house style of the pool, a complete example, and the pool's current category tree. Teachers download it from the import page and hand it to a Claude together with the topic. The description says: prefer several correct answers (`multichoiceset`), and end every such question text with the number of correct answers, "(2 richtige Antworten)" / "(2 correct answers)", as all of these questions in the pool do today.
- **The import checks the hint.** For a `multichoiceset` question the German and the English text must end with that hint, and its number must equal the number of answers marked correct. A missing or wrong hint is a problem like any other.
- **An "Import questions" button in the pool browser**, leading to an import page with a file upload. The upload is checked first and shows a preview: how many questions per category and type, which categories will be created, and questions that look like ones the pool already has. If anything is wrong, nothing can be imported, and every problem is listed with its line number, ready to hand back to the Claude. A clean file is imported with one more click, all or nothing.
- **Imported questions are marked "not reviewed"** until a teacher marks them as reviewed on the preview or saves them in the editor. The browser highlights them in their rows and in the preview, says where they came from, and offers a filter that shows only them. After an import, the browser opens with that filter on. A test may contain unreviewed questions, but the test assembly says how many of the chosen ones are.
- **An import can be taken back** while none of its questions has been used in a test: its questions, and the categories it created and that are empty again, are deleted.
- **The one-time Moodle import stays as it is**, including its refusal to run a second time. This import adds questions and never overwrites or merges into existing ones. It is still not an export.

## Capabilities

### New Capabilities

- `question-import`: the Markdown import format and its format description, the checks before anything is stored, the import page with preview, all-or-nothing import, the "not reviewed" mark with its highlighting and filter in the browser, and taking an import back.

### Modified Capabilities

None. The mark is cleared by a save in the editor, and the browser shows it. Both are specified in `question-import`, as `question-editor` did for its own entry points, because the browser (`question-pool`) is still a spec of the unarchived `exam-module`. The rule there, "no re-import over existing questions", stays true: this import only adds questions.

## Impact

- **Code:** `exam/` and `css/exam.css` only. New `exam/question-import.js` (parse, check, plan, import, take back) and routes in a new `exam/routes-pool-import.js`. The format description lives as `exam/question-import-format.md` and is served with the current category tree appended. New client element for the import page. The pool browser gets the button, the highlighting, the filter and "Mark as reviewed". The editor's save clears the mark. Validation and storing reuse `questionProblems` and `cleanStoredHtml` from the editor. `marked`, already a dependency, turns Markdown into HTML.
- **Data:** migration `008-question-import.sql` adds `question_import` (who, when, file name, hash, report) and two columns on `question`: the import it came from and whether it still awaits review. No existing row is rewritten. Existing questions are reviewed.
- **APIs:** under `/exam/api/pool/`: check a file, import a file, list imports, take an import back, mark a question as reviewed. The format description is at `/exam/pool/import/format`. Everything is behind `requireTeacher`. The file is read as raw text with its own limit of 1 MB, so the global JSON limit is untouched.
- **Docs:** `docs-exam-module.md` gets a section on the import. `AI/exam-module-plan.md` and the sentence "There is no re-import and no export" are corrected to: no re-import from Moodle, no export, Markdown imports add questions.
- **Tests:** unit tests for parser and checks (hint, pairing, line numbers), harness checks for upload, refusal, highlighting, review and taking back.
- **Rollout:** secureLectures runs `EXAM_MODULE=on`. Nothing changes until a teacher imports a file. Imported questions reach students only when a teacher puts them into a test.
