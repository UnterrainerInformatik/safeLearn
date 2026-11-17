Source: AI/open-proposals.md, entry **Navigation: „Online-Tests" in „Tests" umbenennen**.

## Why

Since `2026-10-25-exam-offline-sittings` a course's test list holds online and offline tests together, and a student's Exams page shows open offline sittings beside open online tests. The bar's button, the page title and several texts still say "Online-Tests" / "Online tests". That tells a teacher looking for a paper test that it is somewhere else.

## What Changes

- The bar's button and the page title of the test list: "Online-Tests" → **"Tests"** (en: "Online tests" → "Tests").
- Texts that mean the whole list or every open sitting say "Test(s)" from now on:
  - the link from the teacher hint on `/exam/my` to the list (`exam.attempt.onlineTests`)
  - the empty list (`exam.tests.noTestYet`): "Noch kein Test." / "No test yet."
  - the course-delete refusal, which counts online and offline tests (`exam.errors.classes.courseInUse`)
  - the student page's "Offene Online-Tests" (`exam.my.openTests`) and "kein Online-Test offen" (`exam.attempt.noneOpen`)
  - the Exams button's tooltip (`app.topbar.examsTitle`): "Meine Tests und Ergebnisse"
- Texts that really mean online tests stay as they are: the gradebook category `exam.categories.onlineTests`, the teacher hint "Hier schreiben Schüler ihre offenen Online-Tests" (`exam.attempt.teacherHint`, offline tests are not written there), and the retention counts of online-test attempts (`exam.retention.attempts_*`).
- Translation keys keep their names (BabelEdit, see `i18n-babeledit-json`). Only values change.

## Capabilities

### New Capabilities

### Modified Capabilities
- `exam-navigation`: the bar's second button is named **Tests**, and the student's page lists every open test, online and offline.

## Impact

- `i18n/de.json`, `i18n/en.json`: values of the keys above.
- `test/exam.test.js` and browser checks that compare against literal "Online-Tests" text, if any (most read the key through `text()`).
- `docs-exam-module.md` (the bar's buttons, the test list), `AI/architecture.md` if it names the button.
- No code, no route, no key name changes.
