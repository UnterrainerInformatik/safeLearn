Source: AI/open-proposals.md, entry **Mehrsprachigkeit der Oberfläche: Sprache und Locale pro Benutzer**. Decided by Gerald on 2026-10-18: the setting exists for every user and covers the whole app interface, not only the exam module; content for students always comes in the course's language; the catalogs follow BabelEdit's layout.

## Why

The app's interface is English throughout, and dates and numbers are formatted inconsistently: about 15 places in the exam module mix the browser's locale with a hard `de-AT`, and the native `<input type="date">`/`datetime-local` fields take their format from the operating system, not from the page. A teacher cannot pick a language, and cannot pick a format independently of it. Gerald himself wants English texts with Austrian dates (`20.10.2026`, `10:00`, `1,5`), which today no setting can give. The design review of 2026-10-18 is about to rename and rework many labels; moving the texts into catalogs first means they are touched only once.

## What Changes

- **Two new preferences per user**, chosen in the settings menu (gear, top right): **language** (`en`, `de`) and **format** (locale: `en-GB`, `de-AT`). They are stored like the other preferences (`dm`, `vt`, …) in the user's `config` block, under the keys `lang` and `loc`, and take effect on the next page load. A reader without a stored value gets English and `de-AT`, so nothing changes for anyone who does not touch the setting except that the formats become consistent.
- **Texts come from catalogs.** One JSON file per language with identical keys (`en.json`, `de.json`) in BabelEdit's layout, read by a small own `t(key, params)` on the server and in the client. No i18n library. A key missing in `de.json` falls back to the English text; a key missing in both is a test failure, never a blank.
- **The whole app interface is translated:** top bar, settings menu, sidebar ("Site", "Content", search hint), start and error pages rendered by the server, the exam module's bar, routes and all of `exam/client/*.js`. The Markdown content of pages stays as written.
- **Formats come from the chosen locale.** Every date, time and number the app formats goes through one module that wraps `Intl` with the reader's locale and the school's time zone. No call to `toLocale…String()` without an explicit locale remains.
- **An own date and time picker** replaces the native `date` and `datetime-local` inputs (gradebook columns, school year dates, sittings' exact times), so the field shows and accepts the locale's format. It is a small custom element with keyboard use and ARIA, built on `Intl`; no third-party picker.
- **Students' content stays in the course's language.** Questions and answers in the writing view and the results keep following `course.language` as today; the controls around them (buttons, timer, messages) follow the student's own language.
- **Periods follow the language.** The window label of `school-periods` (`Di 20.10. · lessons 3–4`) is built from the catalog and the locale, e.g. `Tue 20/10 · lessons 3–4` in English with `en-GB`, `Di. 20.10. · 3.–4. EH` in German.

## Capabilities

### New Capabilities

- `ui-language`: the two preferences, how they are chosen, stored and defaulted, the catalogs and their fallback, which surfaces are translated and which content is not, and the course language for students' content.
- `locale-formats`: formatting of dates, times and numbers by the reader's locale in the school's time zone, and the own date/time picker that replaces the native inputs.

### Modified Capabilities

- `school-periods`: the window label and its weekday/date format are no longer fixed to `Di 20.10. · lessons 3–4`; they follow the reader's language and locale. Matching, tooltip and clock times are unchanged.

## Impact

- **Server:** `obsidian.js` (top bar, settings menu, sidebar), `app.js` (rendered pages, `<html lang>`), `permission-context.js` (`lang`/`loc` read with the other preferences), `exam/bar.js`, the `exam/routes-*.js` that render page bodies, `GET /exam/api/me` (returns `lang` and `loc`).
- **Client:** `obsidian-page.js` (setting the two preferences), every file in `exam/client/` (texts through `t()`, formats through the new module, inputs through the picker).
- **New files:** `i18n/en.json`, `i18n/de.json`, a shared `t()` module and a shared format module usable from server and client, the picker element, a BabelEdit project file.
- **Tests:** a catalog check (same keys in both files, every key used in code exists, no unused keys), unit tests for formats and the picker's parsing, harness checks that switch a teacher and a student to German and to English/`de-AT`. Existing harness checks that look for English texts keep running with the default.
- **Other changes:** `publishing-without-keycloak` keeps preferences in cookies; `lang` and `loc` are ordinary config parameters there and need nothing extra. The design-review entries on buttons and labels in `AI/open-proposals.md` should follow this change.
- **Not affected:** the Markdown corpus, the Obsidian plugin, the stored data of the exam module (dates stay ISO, instants stay UTC).
