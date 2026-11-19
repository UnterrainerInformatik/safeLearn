## Context

- `renderHandout` (`app.js`) reads the file, drops frontmatter and the whole-file directive, then calls `stripComments` (`obsidian.js`) before `preParse`, `marked` and `sanitizeHtml`. Three routes in `exam/routes-handout.js` call it: the participant's page (which knows the sitting), and the preview and the solution deck (which know only the test and the group).
- `stripComments` finds comment ranges on a code-masked copy. A `%%` that begins a line opens a block comment. Any other `%%` opens an inline comment that has to close on the same line. Code is never a comment.
- `startSitting` (`exam/tests.js`) already refuses a start while `handoutsOf(test)` holds an unresolved handout. `getTest` returns `handouts` through `offlineFields`, and the client shows them with `handoutPaths` (`exam/client/tests.js`).
- `getCourse(...).className` is the class name, for example `4BHIF`. A sitting has `opens_at` (the planned time before the start) and `started_at`.

## Goals / Non-Goals

**Goals:**
- One scanner shared by finding the variables and replacing them, so the test's page offers exactly the names the handout replaces.
- No change for any read of a corpus file other than the handout rendering.

**Non-Goals:**
- Values per sitting or per group. Stated in the proposal: one list on the test.
- Showing variables on ordinary pages or in the Obsidian plugin.
- Variables in online tests or in any other module page.

## Decisions

**D1: Variables are comment ranges, found by the comment scanner.** `obsidian.js` gets `commentRanges(markdown)` (the existing loop, extracted). `stripComments` keeps its behaviour on top of it. A new `handoutVariables(markdown)` returns, in order and each name once, the names of ranges whose inner text matches `^\s*var\s+([A-Z][A-Z0-9_]*)\s*$`. A new `fillVariables(markdown, values)` replaces those ranges with `values[name]`, or with `‹NAME›` when there is no value, and cuts every other range as `stripComments` does. The rejected alternative was a separate regex over the raw text. It would also match inside code and inside a larger block comment, and it would disagree with what `stripComments` removes. Because only an inline-comment range can have `var NAME` as its whole content, a block comment of notes that happens to contain `%%var X%%` is a block that ends at the first inner `%%`. That is Obsidian's own reading, and the scanner follows it.

**D2: Substitution happens in `renderHandout`, in place of `stripComments`.** `renderHandout(corpusPath, req, { exam, answer, vars })` calls `fillVariables(d, vars ?? {})` where it now calls `stripComments(d)`. The value then goes through `preParse`, `marked` and `sanitizeHtml` with the rest, so inline Markdown and autolinks work and nothing unsanitized gets out. To keep a value from changing the file's structure, values are refused when they hold a line break, `%%` or `@@@` (spec). `hasSolution` and the attachment check keep `stripComments`, because a value never decides a block or an attachment.

**D3: Storage.** Migration `021-handout-variables.sql` adds `test_variable (test_id INTEGER NOT NULL REFERENCES test (id) ON DELETE CASCADE, name TEXT NOT NULL CHECK (name GLOB '[A-Z]*'), value TEXT NOT NULL, PRIMARY KEY (test_id, name))`. An empty value deletes the row. `CLASS` and `DATE` are never stored, and a request that sets them is refused. Rows whose name no longer appears in a handout stay (spec). They cost nothing, and they come back when the variable returns.

**D4: Values in the payload, one route to save.** `offlineFields` adds `variables: [{ name, value, auto, missing }]`. This is the union of `handoutVariables` over the resolving handouts, A before B, with the stored values filled in. `CLASS` is computed. `DATE` is the value the preview would use (D5), and it is never `missing`. `PUT /exam/api/tests/:id/variables` with `{ values: { NAME: "…" } }` saves the given names, open to the test's teachers, and allowed in every state of the test, so during the window too. It answers with the test, as the other test writes do. The scan reads both files on every `getTest`. These are two small local reads, the same cost as `hasSolution` today.

**D5: Which `DATE`.** `variablesFor(db, test, sitting)` builds the map `renderHandout` receives. On the participant's page it is the participant's sitting: `started_at`, otherwise `opens_at`. For the preview and the deck it is the earliest sitting with `started_at`, otherwise the earliest by `opens_at`, otherwise no value. It is formatted `DD.MM.YYYY` in the server's time zone, independent of the UI language, because the handout text is written in the teacher's language anyway.

**D6: The start refusal.** `startSitting` checks after the resolve check: `missing = variables.filter(v => v.missing)`. If any are missing, it throws `ConflictError("exam.errors.tests.handoutVariablesMissing", { names })`. The client shows missing names in red in a "Variables" section of the test page, and the same list on the sitting's page next to the handout paths. The fields save on change through the route in D4, the way the test's other fields do.

## Risks / Trade-offs

- [A teacher clears a value during the window] → The participant sees `‹NAME›` on reload. That is visible and harmless, and it is no reason to lock values during the window, because correcting a PIN during the window is the main use.
- [A file is edited during the window so that it gains a variable] → The open sitting keeps running and shows `‹NAME›` until the teacher fills it in. Only the next start is refused.
- [Values reach students] → The value is the teacher's own text, rendered through the same sanitizer as the file, and shown only where the handout is shown. A hidden block of the handout stays hidden, and a variable in it is replaced but never shown.

## Migration Plan

Migration 021 adds a table and changes no existing row. A test without variables behaves as before. Rolling back the code leaves an unused table.
