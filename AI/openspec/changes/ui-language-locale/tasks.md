## 1. Mechanism

- [x] 1.1 `i18n/t.js`: `createT(catalog, fallback, locale)` with `{name}` parameters, `_one`/`_other` plurals via `Intl.PluralRules`, fallback to English, bracketed key plus warning outside production (D3)
- [x] 1.2 `i18n/en.json`, `i18n/de.json` (nested keys by surface) and `i18n/safeLearn.babel`; confirm BabelEdit opens the project and shows both languages (D2)
- [x] 1.3 `i18n/format.js`: `date`, `dateTime`, `time`, `clock`, `weekdayDay`, `number`, `percent`, explicit locale and `Europe/Vienna`, date-only values without day shift (D4)
- [x] 1.4 Unit tests `test/i18n.test.js`: `t()` lookup, fallback, parameters, plurals; `format.js` in `de-AT` and `en-GB`, date-only values on 2026-10-25 and 2027-03-28, numbers and percent
- [x] 1.5 Catalog check in the test suite: equal key sets, every literal `t(` key exists, no unused keys, allowlist for computed keys; check against new `toLocale…String(`/`Intl.*Format(` outside `i18n/` (D4, D8)
- [x] 1.6 Serve `/i18n/*.json` and the two modules statically with revalidation; register new files in `test/coverage-map.json`

## 2. Preference and app surfaces

- [x] 2.1 `lang` (`en`/`de`, default `en`) and `loc` (`en-GB`/`de-AT`, default `de-AT`) in `parsePreferences` with validation; `obsidian-page.js` reads and writes them like `dm` (D1)
- [x] 2.2 Per-request `t` and format bound from the preferences in `app.js`; `<html lang>` set from `lang` (D3, D7)
- [x] 2.3 Settings menu in `obsidian.js`: "Language" `English | Deutsch`, "Format" `20.10.2026 | 20/10/2026`, `aria-pressed`, write and reload (D6)
- [x] 2.4 Move the app's own texts in `obsidian.js`, `obsidian-page.js` and `app.js` (top bar, menu, sidebar, search hint, server-rendered pages and messages) to the catalogs, German written alongside
- [x] 2.5 `GET /exam/api/me` returns `lang` and `loc`; exam frame loads the catalog(s) in parallel and exposes `t` and the formatters to the client modules

## 3. Date and time picker

- [x] 3.1 `<sl-date-input>` (form-associated): text field in the locale's pattern from `formatToParts`, month grid, `min`/`max`, ISO `value`, validity and message at the field (D5)
- [x] 3.2 Keyboard (arrows, PageUp/PageDown, Enter, Escape), `role="grid"` with labelled days, touch-sized targets
- [x] 3.3 `time` variant with an `HH:MM` field, value as local Vienna date-time
- [x] 3.4 Unit tests for the pattern parser: both locales, invalid days and months, two-digit years refused, `min`/`max`
- [x] 3.5 Replace native inputs: gradebook column date and new-column date (`gradebook.js`), school year dates (`classes.js`), sitting date and exact times (`tests.js`)

## 4. Exam module texts and formats

- [x] 4.1 Server side: `exam/bar.js` and the page bodies of `exam/routes-*.js` through `t`
- [x] 4.2 `exam/client/classes.js`, `bar.js`, `frame.js`
- [x] 4.3 `exam/client/gradebook.js` incl. the decimal separator and points via `format.number`
- [x] 4.4 `exam/client/pool.js`, `pool-categories.js`, `pool-import.js`, `question-editor.js`, `rich-text.js`
- [x] 4.5 `exam/client/tests.js` and `periods.js` (window label `lesson(s)` / `EH` and weekday/date via `format.js`, per the modified `school-periods` requirement)
- [x] 4.6 `exam/client/live.js` (live view and class screen, `clock` with seconds)
- [x] 4.7 `exam/client/attempt.js` and `/exam/my`: controls in the student's language, question content wrapped in `lang` of the course (D7), results and "Time is up" included
- [x] 4.8 User-facing error messages from the exam API translated where they are shown; developer error codes unchanged

## 5. Verification and docs

- [x] 5.1 Harness checks in `test/exam.test.js`/`test/content.test.js`: teacher in German (menu, sidebar, bar, gradebook); English + `de-AT` (English labels, `20.10.2026`); student with English in a German course; date entry by typing and by keyboard; `lang`/`loc` of the shared demo accounts reset before and after (D8)
- [x] 5.2 German layout at the legibility viewport: module bar and gradebook header do not overflow
- [x] 5.3 `docs-exam-module.md`/`docs-development.md`: how to add a text and a language, BabelEdit project; `AI/architecture.md`: i18n modules, preferences, picker
- [x] 5.4 `npm test` in both module configurations; record the result — 2026-10-18: full run 657/666, the 9 failures all in test/exam.test.js (an expectation still German after the controls moved to the reader's language, which left an attempt open and failed four checks after it; the period form's default depending on the time of day; text replacement and the calendar's focus in the new date checks). Fixed in the harness and in `<sl-date-input>` (focusout now checked a turn later); test/exam.test.js then 94/94
- [x] 5.5 Gerald reviews the German catalog in BabelEdit; open wording questions from design.md settled
- [x] 5.6 secureLectures: merge `public/master`, push, confirm a deploy run for HEAD; smoke check with Gerald's account in German and in English + `de-AT`
