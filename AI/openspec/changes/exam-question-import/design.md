## Context

See `proposal.md` for the motivation and `specs/question-import/spec.md` for the behaviour. The draft of the format description is `format-draft.md` in this change. It is the file a Claude gets and the most direct review of the format.

What exists today and shapes this change:

- **Schema 7.** `question` (with `version`, `retired`, `position` within its category), `answer`, `image`, `question_category` (unique German name per parent), `pool_import` (the one-time Moodle import, whose row refuses a second one), `image_upload`.
- **The editor's checks and storing** (`exam/pool-edit.js`): `questionProblems(db, input)` collects every problem with field and answer number. `createQuestion` validates, inserts at the end of the category and runs `writeContent`, which cleans every text through `cleanStoredHtml` and resolves images. Its input shape is `{ type, categoryId, nameDe, nameEn, textDe, textEn, answers: [{ textDe, textEn, correct }] }`.
- **The Moodle importer** (`exam/pool-import.js`) builds the category tree from German paths and checks DE/EN pairing by position. It is a command line tool, refuses to run twice, and stays untouched.
- **`marked` 12** is a dependency already. The renderer uses it for the corpus.
- **The pool's convention**: all 77 imported `multichoiceset` questions end their text with "(N richtige Antworten)" / "(N correct answers)", N from 1 to 8 (`AI/exam-module-plan.md`, section 4). Because grading is all-or-nothing, the hint is part of the question.
- **The browser** (`exam/client/pool.js`) colours chosen rows green and gives the row clicked last a blue edge.

## Goals / Non-Goals

**Goals:**

- A Claude that gets only the format description and a topic writes a file that passes the check in most cases. Where it fails, the problem list can be pasted back to it unchanged.
- Nothing reaches the pool from a file that breaks any rule. Nothing already in the pool changes.
- Gerald finds every question he has not checked yet, without remembering which ones they were.

**Non-Goals:**

- Images in the file. A zip with Markdown and pictures is a format of its own. Images are added in the editor afterwards (D1).
- Updating existing questions from a file, or any export. A file only adds.
- Calling Claude from safeLearn. The teacher hands the description to a Claude of their own choice and uploads the result.
- Moodle XML through the button. The one-time importer stays a command line tool.
- Blocking unreviewed questions from tests. The mark is for the teacher's overview, not a gate (D7).

## Decisions

### D1 — Markdown with headings and task lists, both languages in one question block

The format is described in `format-draft.md` and specified in the spec. The main choices:

- **Markdown rather than JSON or YAML.** Question texts contain code, quotes and line breaks. In JSON a Claude must escape all of them, and an error breaks the whole file. Markdown is what a Claude writes most reliably, it reads like the questions themselves, and Gerald can check it by eye before the upload.
- **German and English inside one question block** (`### de`, `### en`), not two files paired by position as in the Moodle import. Pairing by position across files is the weak point of the Moodle export. Inside one block a missing translation is local and has a line number.
- **Answers as GFM task lists**, `- [x]` / `- [ ]`. They show which answers are correct without a separate key, and `marked` parses them as list items with `task`/`checked`.
- **Header lines `en:`, `type:`, `solution:`** directly under the heading. They are positional and fixed, which is easier to check and to explain than a YAML block per question.
- **Category path with ` / `** (spaces around the slash), so that names like `CI/CD` survive.
- **No images in v1.** `![...]()` and `<img>` are a problem with a line number. The editor's upload already exists for adding them.

### D2 — The format description is a file in the repository, served with the current tree

`exam/question-import-format.md` is the description, starting from `format-draft.md` in this change. `GET /exam/pool/import/format` (teacher only, `Content-Type: text/markdown; charset=utf-8`, `Content-Disposition: attachment; filename="safelearn-question-format.md"`) serves it with the section "Existing categories" filled in from `categoryTree`, one line per category: German path, an em dash, English path. A Claude can then file new questions under existing categories. The path has no `.md` ending because `app.js` reads every path ending in `.md` as a corpus file before the module's router sees it. The download is still named `.md` through `Content-Disposition`. The description is the place for house style: it asks for the hint on `multichoice` questions too, which the check does not require (D4). A teacher who wants different conventions edits the downloaded file before handing it to their Claude. The check only enforces what every pool question needs. The format version (`safelearn-questions/1`) is a constant in `exam/question-import.js`, and a check asserts that the description names it.

*Alternative:* a static page in `docs-…`. It cannot carry the current categories, and a teacher would have to copy them by hand.

### D3 — Parse line by line for structure, `marked` for the content

`parseQuestionFile(text)` in `exam/question-import.js`:

1. Normalizes line endings, strips a BOM, and requires the front matter.
2. Scans lines and tracks fenced code blocks (```` ``` ```` and `~~~`, by the length of the opening fence), so that a `# comment` inside code is not taken for a heading. Outside fences, `# `, `## ` and `### de|en` start category, question and language section. The header lines are read right after their heading. Every element keeps the line where it starts.
3. Hands each language section's Markdown to `marked.lexer` (GFM). The section's last top-level token must be a `list` whose items are all tasks, except for `truefalse`. Those are the answers. Everything before it is the question text. Each answer item's text is rendered with `marked.parser` without its checkbox. Question text is rendered from the remaining tokens. Raw `html` tokens and `image` tokens anywhere are problems.
4. Returns `{ categories: [{ line, de: [...], en: [...] }], questions: [{ line, categoryIndex, type, nameDe, nameEn, solution, de: { line, html, answers: [{ line, html, correct }] }, en: {...} }], problems }`.

The HTML from `marked` then goes through the same path as an editor save (D4), so `cleanStoredHtml` is the last word on what is stored. `marked` gets no extensions (no `marked-shiki`). Code blocks become `<pre><code class="language-java">`, and the class is removed by `cleanStoredHtml` like every class. That is the same markup the editor's code block produces.

### D4 — One check: the parser's problems, the editor's rules, then the import's own

`checkQuestionFile(db, text, fileName)` returns `{ problems, plan }`:

- **Structure** from D3.
- **Editor rules**: every question becomes the editor's input shape (`truefalse`: answers true/false with the `solution` flag) and goes through `questionProblems` with a placeholder category, so the rules are exactly the editor's. Each problem it reports is mapped to the line of the field it names (title → heading line, text → section line, answer *n* → that item's line).
- **Pairing**: the number of answers and the `x`/`-` pattern per language, as in the Moodle import.
- **Hint**: on the plain text (`plainText` from `exam/pool.js`) of the question, trimmed, a final `\((\d+) richtige Antworten?\)$` in German and `\((\d+) correct answers?\)$` in English. For `multichoiceset` both are required and must equal the number of correct answers. For `multichoice` a hint, if present, must say 1. Singular and plural are not checked against the number, because that would refuse a correct file over a typo the students cannot misread.
- **Category paths**: the same number of segments in both languages. Two categories in the file with the same German path but different English ones are a problem.
- **Limits**: 1 MB, 200 questions, no empty file.
- **Same file again**: SHA-256 of the raw bytes against `question_import.sha256`.

Each problem is `{ line, question, message }`. `question` is the German title or null. The client shows them sorted by line, as plain text that can be copied: `Line 42 (Statuscode nach POST): the hint says 2 but 3 answers are marked correct.`

The plan, for a clean file: per category (German path, existing or new) the number of questions per type, the new categories, and the near duplicates. A near duplicate is an existing, unretired or retired, question whose `plainText(text_de)`, lowercased with whitespace collapsed, equals the imported one's.

### D5 — Two requests, no server state between them

`POST /exam/api/pool/imports/check` and `POST /exam/api/pool/imports` both take the file as the raw body (`express.text({ type: () => true, limit: "1mb" })` on these routes only, as the upload route does with `express.raw`) and the file name in the query `?name=`. Check answers `{ problems, plan }`. Import runs the whole check again inside one transaction and refuses with 422 and the problems if anything is wrong. In between, the client holds the file text. No staging table and no token, because the file is small and the second check is cheap. Nothing can go stale between the two requests: a category created meanwhile is simply matched.

The import transaction:

1. Inserts the `question_import` row.
2. Creates missing categories along each German path, with their English names, at the end of their siblings (the logic of `createCategory`, without its separate transaction).
3. Inserts every question through the editor's create path (`createQuestion` without its own transaction, the inner function factored out), with `import_id` set and `unreviewed = 1`.
4. Stores the report (counts per type, new categories, near duplicates) on the import row.

`createQuestion` today wraps itself in `inTransaction`. The body moves into `insertQuestion(db, value)`, which both call, so the import is one transaction and the editor behaves as before.

### D6 — Migration 008: an import table and two columns

```sql
CREATE TABLE question_import (
  id INTEGER PRIMARY KEY,
  imported_at TEXT NOT NULL,
  imported_by TEXT NOT NULL,           -- the teacher's username
  file_name TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,         -- of the raw file; refuses the same file twice
  report TEXT NOT NULL                 -- JSON: counts, new categories, near duplicates
);
ALTER TABLE question ADD COLUMN import_id INTEGER REFERENCES question_import (id);
ALTER TABLE question ADD COLUMN unreviewed INTEGER NOT NULL DEFAULT 0 CHECK (unreviewed IN (0, 1));
CREATE INDEX question_unreviewed ON question (unreviewed) WHERE unreviewed = 1;
```

`ALTER TABLE … ADD COLUMN` with a default needs no table rebuild. Existing questions get `unreviewed = 0` and no `import_id`, so they count as reviewed. `pool_import` (Moodle) stays separate. The two imports have different rules, and merging them would weaken the one-time refusal. Taking an import back deletes its row (D10), so the identical file can be imported again afterwards (decided by Gerald on 2026-10-17). The row is deleted only after the import's questions, so no `question.import_id` is ever left pointing at a missing row.

### D7 — "Not reviewed" is a mark, not a state machine

- `POST /exam/api/pool/questions/:id/reviewed` sets `unreviewed = 0` and does **not** bump `version`, because the content is unchanged and an editor open meanwhile must still be able to save.
- `saveQuestion` sets `unreviewed = 0` in its `UPDATE`. A save is a review.
- Retire and revive leave the mark alone.
- `getQuestion` and `listQuestions` return `unreviewed` and, for imported questions, `importedAt`, `importedBy`, `importFileName`. `listQuestions` takes `onlyUnreviewed`. `categoryTree` counts stay as they are, and the filter shows its own total.

No gate on tests: a teacher in a hurry can use a question they have just read on the preview. The assembly panel shows "1 of 4 chosen questions is not reviewed yet" as a reminder.

### D8 — The browser: an amber stripe and a badge, a filter, a banner

- **Row**: an amber left stripe and a small badge "not reviewed". Chosen rows stay green, and the row clicked last keeps its blue edge. The stripe sits on the left edge, the blue edge on the outline, so all three can show at once. Colours come from new tokens in `css/exam.css` for both themes, with the same contrast rules as the existing green/blue.
- **Filter**: a toggle "Not reviewed (n)" beside "show retired", visible while n > 0. It keeps the category and search filters. `?unreviewed=1` in the browser URL turns it on, which is how the import page hands over.
- **Preview**: a banner above the question: "Imported on 17.10.2026 by g.unterrainer from `http-statuscodes.md`, not reviewed yet", with **Mark as reviewed**. After marking, the browser moves to the next unreviewed question in the list, so a batch can be read through without hunting.
- **Buttons**: **Import questions** beside **Edit categories** below the tree, always shown, leading to `/exam/pool/import`.

### D9 — The import page

`/exam/pool/import` through `teacherShell` (kind `pool-import`), like the category page:

1. **Download the format description** (D2), with one sentence on what to do with it.
2. **Choose a file** (`<input type="file" accept=".md,text/markdown">`, plus drop onto the field). The client reads it with `File.text()` and sends it to `check`.
3. **Problems**: a list sorted by line, and **Copy problems** for handing them back. No import button.
4. **Preview** for a clean file: a table per category (new ones marked), counts per type, near duplicates with a link to the existing question, and **Import n questions**. After the import the client navigates to `/exam/pool?unreviewed=1`.
5. **Past imports**: date, teacher, file, questions, still unreviewed, and **Take back** with a confirmation in the page itself (the module uses no `confirm()`), shown while none of its questions is used.

### D10 — Taking back deletes through the editor's rules

`DELETE /exam/api/pool/imports/:id` refuses with 409 and the titles while any question of the import has a `question_usage` or `test_question` row. Otherwise, in one transaction, it deletes the import's questions (answers and images by cascade, as `deleteQuestion` does) and then, deepest first, every category that was created by this import (recorded in the report) and is now empty, without subcategories. A category the import created and a teacher has filled since stays. Last, it deletes the `question_import` row, so the same file is accepted again.

## Risks / Trade-offs

- **A Claude miscounts the hint.** → This is the reason the check exists. The problem message states both numbers, so a second pass fixes it.
- **Markdown edge cases** (an answer spanning two lines, a nested list in an answer, a missing blank line before the task list) produce a question with odd answers instead of a clean refusal. → The pairing and count checks catch most of them. The preview shows counts per category, and the "not reviewed" mark covers the rest. Unit tests cover the cases the format description forbids.
- **Near duplicates by exact text only.** Rephrased duplicates slip through. → Acceptable for v1. The mark makes Gerald read every imported question anyway.
- **The format description and the parser drift apart.** → One check parses the example in `exam/question-import-format.md` and requires it to pass with zero problems, and asserts that every refusal rule in the description has a unit test.
- **A 200-question file in one transaction** runs `cleanStoredHtml` (JSDOM) 1,000+ times. → Measured in the unit tests. Expected well under two seconds, and it is a teacher's rare action.

## Migration Plan

Migration 008 runs at start with the usual pre-migration backup. It only adds. Rolling back the code leaves two unused columns and an unused table. Nothing reads them, and the schema version stays at 8. Deployment: safeLearn first, then secureLectures (see the sync order).

## Open Questions

None. Settled by Gerald on 2026-10-17:

1. The identical file can be imported again after its import was taken back (D6, D10).
2. The hint is optional for `multichoice` in the check, which only requires it to say 1 when present. The format description asks the Claude to write it anyway (D2). A colleague who wants it otherwise changes the description they hand to their Claude. The check does not have to change.
