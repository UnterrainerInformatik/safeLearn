## Context

Preferences are stored per user as one JSON block in the Keycloak user attribute `config` (`dm`, `vt`, `sl`, `fs`, …). The server reads them on each request through `permission-context.js` (`context.preferences`), and the client writes one key at a time with `setParam(key, value)` in `obsidian-page.js`, partly followed by a reload (`toggleLightDark`). The top bar, settings menu and sidebar are built as HTML strings on the server in `obsidian.js` (around line 2880 ff.). The exam module renders page bodies and its bar on the server (`exam/routes-*.js`, `exam/bar.js`) and builds the rest in the browser with custom elements and the `h()` helper (`exam/client/frame.js`), about 4,000 lines without a build step. The project is ES modules throughout (`"type": "module"`), and `exam/client/periods.js` already shows the pattern of one file imported by both server and browser. Courses already carry `language` (`de`/`en`), and the writing view already picks `text_de`/`text_en` from it (`exam/attempts.js`). Rendered pages are not cached on the server, so the language needs no cache key.

## Goals / Non-Goals

**Goals:**
- One `t()` and one format module, shared by server and client, so a text or a date looks the same whichever side drew it.
- A catalog layout Gerald can open in BabelEdit as is.
- The English default keeps every existing test's expectations valid.

**Non-Goals:**
- No languages beyond `en` and `de` in this change; adding one later is a catalog file plus an entry in the allowed list.
- No translation of the Markdown corpus, the Obsidian plugin, server log lines or API error codes meant for developers. Error *messages* shown to users are translated.
- No detection from `Accept-Language`. The default is fixed (spec), so a shared classroom PC does not change language per browser.
- No change to how instants and dates are stored.

## Decisions

**D1 – `lang` and `loc` are two more keys in `config`.** They behave exactly like `dm`: written with `setParam`, followed by a reload, read by the server from `context.preferences`. Allowed values are validated where the preferences are parsed (`parsePreferences`), so an unknown value becomes the default once, for server and client. Separate Keycloak attributes were considered (the backlog entry said "like `dm` and `vt`", which are themselves keys in `config`); a second attribute would need its own read and write path for no gain. Under `publishing-without-keycloak` they travel as config cookies with the rest, with nothing extra.

**D2 – Catalogs `i18n/en.json` and `i18n/de.json`, nested keys, BabelEdit project checked in.** Keys are grouped by surface: `app.topbar.*`, `app.menu.*`, `app.sidebar.*`, `exam.bar.*`, `exam.tests.*`, `exam.gradebook.*`, `exam.attempt.*`, … BabelEdit's "JSON (nested)" format opens such files directly; an `i18n/safeLearn.babel` project file names both files and English as the primary language. Nested over flat because BabelEdit's tree then mirrors the app's surfaces, which is how Gerald will look for a text. Parameters are written `{name}`; plurals are two keys `…_one`/`…_other` selected through `Intl.PluralRules`, which BabelEdit treats as ordinary keys. Key names are English and descriptive (`exam.tests.emptyList`), never the English text itself, so rewording English does not change keys.

**D3 – `i18n/t.js`: `createT(catalog, fallback, locale)` returns `t(key, params)`.** Lookup order: chosen language, then English, then — only outside production — the key in brackets plus a console warning; the test suite (D8) makes sure that last case never ships. On the server, the request handler creates `t` once per request from `context.preferences.lang` and passes it to `obsidian.js` and the exam routes, which today build strings directly. In the browser, the exam frame loads `/i18n/<lang>.json` (and `en.json` when `lang` is not `en`) in parallel with `GET /exam/api/me`, which now also returns `lang` and `loc`; `obsidian-page.js` gets the few texts it needs from the server-rendered page instead of loading a catalog. The catalogs are served as static files with revalidation, like `/css`. Embedding the catalog into every page was the alternative; it would add tens of kilobytes to every page view, including the many pages that never open the exam module.

**D4 – `i18n/format.js`: one function per kind of value, all with explicit locale and `Europe/Vienna`.** `date(iso)`, `dateTime(instant)`, `time(instant)`, `clock(instant)` (with seconds, for the live view), `weekdayDay(instant)`, `number(n, digits)`, `percent(fraction)`. Each keeps one cached `Intl.DateTimeFormat`/`NumberFormat` per locale. A date-only value (`YYYY-MM-DD`) is formatted as a calendar date in UTC so it never shifts by a day. `periods.js` gets its weekday/date from here instead of its own `de-AT` formatter. All ~15 existing `toLocale…String` and `Intl.*Format` calls in `exam/` move to this module; a check in the test suite (D8) fails on any new `toLocale…String(` or `new Intl.DateTimeFormat(`/`NumberFormat(` outside `i18n/` and `periods.js`'s Vienna arithmetic.

**D5 – Own picker as the custom element `<sl-date-input>`, form-associated.** It is a text field that accepts the locale's pattern plus a button that opens a month grid. The pattern (order of day/month/year and the separator) is derived from `Intl.DateTimeFormat(locale).formatToParts`, so the same code serves `de-AT` and `en-GB`. Its `value` is ISO (`YYYY-MM-DD`), and through `ElementInternals` it takes part in forms and validity like a native input, so the form code around it changes little. `min`/`max` are honoured in the grid and in validation. With `time`, it adds an `HH:MM` field and its value is the local Vienna date-time the `datetime-local` gave before. Keyboard: arrows move by day/week, PageUp/PageDown by month, Enter takes, Escape closes; the grid is a `role="grid"` with labelled day buttons. A library (flatpickr, vanilla-calendar-pro) was considered: flatpickr has had no release in years, and the others bring their own theming and a dependency to keep current for what is about 200 lines here. In `school-periods`' form the period editor uses `<sl-date-input>` for its date, and only the exact-times fallback uses the time part.

**D6 – Settings menu: two small button groups.** Under the existing switches, "Language" with `English | Deutsch` and "Format" with the example values `20.10.2026 | 20/10/2026`, the chosen one marked as pressed (`aria-pressed`). Showing an example instead of `de-AT`/`en-GB` tells a teacher what they get. Each click writes the key and reloads, as light/dark does. The language names are always written in their own language, never translated.

**D7 – `<html lang>` and the course language.** The server sets `<html lang="de|en">` from the preference. The writing view and the results wrap question content in an element with `lang` set to the course's language, so screen readers and hyphenation follow the content, not the interface. The data path for the content (`text_de`/`text_en` by course) stays as it is.

**D8 – Tests.** A unit check reads both catalogs and the source tree: same key set in both files; every key literal passed to `t(` in `app.js`, `obsidian*.js`, `exam/**/*.js` exists in `en.json`; no catalog key unused; no `t(` with a non-literal key outside a short allowlist (keys built from a closed set, such as `exam.gradebook.kind.${kind}`, are listed explicitly). Unit tests for `format.js` (both locales, date-only values across a DST change, numbers) and the picker's parser (each locale's pattern, invalid days, two-digit years refused). Harness checks: a teacher switched to German sees German in the menu, sidebar, bar and gradebook; English + `de-AT` gives English labels with `20.10.2026`; a student with English writes in a German course and sees German questions with English controls. All existing harness checks keep the default and stay unchanged; the harness resets the demo accounts' `lang`/`loc` before and after, since they are shared.

**D9 – Order of work.** First the mechanism (`t.js`, `format.js`, catalogs, preference, menu) with the app's own surfaces, then the picker, then the exam module file by file, each file's English strings moved to `en.json` and the German written at the same time. The German texts are drafted here and reviewed by Gerald in BabelEdit before the change is archived.

## Risks / Trade-offs

- [Moving ~4,000 lines of strings breaks a label silently] → the key check (D8) catches missing and unused keys, and the English harness checks, which look for the current English texts, catch a changed English wording.
- [Shared demo accounts: one test run leaves a demo user in German, the next run fails] → the harness sets and resets `lang`/`loc` explicitly around the checks that change them (D8), and every other check runs after a reset.
- [The picker is worse than the native input on phones] → the text field accepts typing on any keyboard, and the grid buttons have touch-sized targets; the native mobile wheels are the price of a consistent format, which Gerald chose.
- [German texts wrap differently and break narrow layouts (module bar, gradebook header)] → the German harness check runs at the same viewport as the legibility checks; fixes go into CSS, not into shorter, worse translations.
- [Touching every exam client file collides with the design-review work] → the design-review entries in `AI/open-proposals.md` follow this change (proposal, Impact), so labels are renamed once, in the catalog.
- [Deadline 05.02.2027 for the gradebook] → the change touches presentation only; the gradebook's data and rules do not change, and the work can stop after any exam file with the rest still English through the fallback.

## Migration Plan

Nothing to migrate: users without `lang`/`loc` get the defaults. Deployment needs no new variable. Rollback is a revert; stored `lang`/`loc` keys are ignored by the old code. secureLectures receives the change through the usual merge of `public/master`.

## Open Questions

- The German word for the module's "Online tests", "Sitting" and "Gradebook" (Notenbuch is settled; "Sitting" may become "Termin") — wording only, decided in BabelEdit during review.
