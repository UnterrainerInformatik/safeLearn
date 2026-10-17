# safeLearn question import - format description

You are writing a file of multiple-choice questions that a teacher imports into the safeLearn question pool. The pool is used for short online tests at an HTL (a technical secondary school in Austria; students are 14 to 19). Every question is written in **German and in English**. Write the file exactly in the format below. The import checks every rule listed here and refuses the whole file if one question breaks one. The teacher then hands the problems back to you.

Reply with the file only, nothing before or after it, unless you are asked for something else. If you show it inside a code block, fence that block with `~~~~`, because the file itself contains ```` ``` ```` code blocks. Better still, offer it as a downloadable `.md` file.

## The file

~~~~markdown
---
format: safelearn-questions/1
---

# HTTP und REST / Statuscodes
en: HTTP and REST / Status codes

## Statuscode nach POST
en: Status code after POST
type: multichoiceset

### de

Ein Client legt mit `POST /users` einen neuen Benutzer an. Welche Antworten des Servers sind korrekt? (2 richtige Antworten)

- [x] `201 Created` mit einem `Location`-Header
- [ ] `200 OK` ohne Body
- [x] `202 Accepted`, wenn das Anlegen später erfolgt
- [ ] `204 No Content` mit dem neuen Benutzer im Body
- [ ] `301 Moved Permanently`

### en

A client creates a new user with `POST /users`. Which responses of the server are correct? (2 correct answers)

- [x] `201 Created` with a `Location` header
- [ ] `200 OK` without a body
- [x] `202 Accepted`, if the user is created later
- [ ] `204 No Content` with the new user in the body
- [ ] `301 Moved Permanently`

## Idempotenz
en: Idempotency
type: multichoice

### de

Was bedeutet es, dass eine HTTP-Methode idempotent ist?

- [ ] Sie verändert nie den Zustand am Server.
- [x] Mehrfaches Ausführen hat dieselbe Wirkung wie einmaliges.
- [ ] Ihre Antwort darf zwischengespeichert werden.
- [ ] Sie braucht keinen Request-Body.

### en

What does it mean that an HTTP method is idempotent?

- [ ] It never changes the state on the server.
- [x] Executing it several times has the same effect as executing it once.
- [ ] Its response may be cached.
- [ ] It needs no request body.

# Java / CDI
en: Java / CDI

## Feld-Injection
en: Field injection
type: truefalse
solution: false

### de

Das folgende Feld wird von CDI auch ohne Annotation befüllt:

```java
private UserRepository repository;
```

### en

CDI fills the following field even without an annotation:

```java
private UserRepository repository;
```
~~~~

## Structure

- **Front matter.** The file starts with exactly these three lines: `---`, `format: safelearn-questions/1`, `---`.
- **Category**: a line `# <German path>`, directly followed by a line `en: <English path>`. A path has one or more segments separated by ` / ` (a slash with a space on each side). Both paths have the same number of segments. A slash without spaces is part of a name (`CI/CD`). Every question belongs to the category above it. Use the existing categories listed at the end whenever one fits. Spell them exactly as listed, in both languages. Create a new category only when none fits. A new category can sit below an existing one: `# HTTP und REST / Statuscodes`.
- **Question**: a line `## <German short title>`, directly followed by the lines `en: <English short title>` and `type: <type>`. A `truefalse` question has a third line, `solution: true` or `solution: false`. A short title has 3 to 8 words and at most 200 characters. It tells the teacher what the question is about and is never shown to students.
- **Languages**: then a line `### de` with the German question text and answers, and a line `### en` with the English ones, in this order.
- **Answers**: after the question text, the answers as a task list, one answer per item. `- [x] ` marks a correct answer and `- [ ] ` a wrong one. A `truefalse` question has no answers. Its answers are always Richtig/Falsch and True/False.

## Types

| `type` | Meaning | Answers |
| --- | --- | --- |
| `multichoiceset` | **Several correct answers. Prefer this type.** | 4 to 6, of which at least 1 is correct (typically 2 or 3). |
| `multichoice` | Exactly one correct answer | 3 to 5, exactly 1 correct |
| `truefalse` | A statement that is true or false | none, `solution:` instead |

Every question is worth one point and graded all-or-nothing. Students get the point only if they mark exactly the correct answers. Several correct answers therefore test more than one correct answer does. Use `multichoiceset` unless the question has one answer by its nature.

## The number of correct answers

**Every `multichoiceset` question text ends with the number of correct answers in parentheses**, as every such question in the pool does today:

- German: `(2 richtige Antworten)`, for one: `(1 richtige Antwort)`
- English: `(2 correct answers)`, for one: `(1 correct answer)`

The number is the number of answers you marked `[x]`. Count them again after every change to the answers. The hint is the last thing in the question text, at the end of its last paragraph. If the text ends with a code block, put the hint in its own paragraph after the code block. **End every `multichoice` question the same way**, with `(1 richtige Antwort)` / `(1 correct answer)`. A `truefalse` question has no hint.

## Both languages

- The English section is a faithful translation of the German one. Both have the same answers **in the same order with the same `[x]` marks**. The import pairs them by position and refuses a question whose marks differ.
- Code, identifiers, commands and output stay the same in both languages. Translate only comments and prose.
- German follows Austrian usage. Address the reader impersonally, neither with „du" nor with „Sie" ("Welche Aussagen sind korrekt?").

## Writing good questions

- **Answers are shuffled** for every student. No answer may refer to another one or to its position: no "all of the above", "none of the above", "A and C", "both".
- Every wrong answer is plausible: a typical misconception, a near miss, a confused term. Avoid joke answers and answers that are obviously wrong in length or tone.
- Answers have similar length and form. The correct one is not the longest or the most precise.
- Avoid negations in the question ("Which is NOT …"). If one is unavoidable, write it in bold: `**nicht**` / `**not**`.
- A question asks about one thing. It can be answered in under a minute: a test has about 4 questions in 10 minutes.
- Stick to the facts of the given topic. When unsure whether a statement is true, leave it out.

## Formatting

Texts and answers are Markdown: paragraphs, `**bold**`, `*italic*`, `` `inline code` ``, code blocks with a language (```` ```java ````), bulleted and numbered lists. Nothing else:

- no images (the teacher adds them later in the editor), no links, no tables, no headings inside a text, no HTML;
- an answer is a single list item. Keep answers short. Code in an answer is inline code.

## What the import refuses

The import refuses the whole file, with the line of every problem, if:

- the front matter is missing or names another format;
- a question has no category above it, or an `en:`, `type:` or `solution:` line is missing or misplaced;
- a title, a question text or an answer is missing in one language;
- a question has fewer than two answers, a `multichoice` question has not exactly one correct answer, or a `multichoiceset` question has none;
- the German and the English answers differ in number or in their `[x]` marks;
- a `multichoiceset` question text does not end with the hint in both languages, or its number differs from the number of `[x]` answers, or a `multichoice` question's hint says anything but 1;
- a text contains an image;
- the file has more than 200 questions or more than 1 MB;
- exactly this file was imported before (and that import was not taken back).

A question whose German text equals one already in the pool is not refused. The teacher is told about it.

## Existing categories

The pool's categories at the time of download, one per line: the German path, an em dash, the English path.

<!-- categories -->
(Filled in by the server at download.)
<!-- /categories -->
