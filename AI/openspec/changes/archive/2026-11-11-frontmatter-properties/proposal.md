Source: AI/open-proposals.md, entry **Frontmatter (Obsidian-Properties) nicht anzeigen**. Decided by Gerald on 2026-11-10: frontmatter always stands at the very start of a file, the file's `@@@` directive follows on the line right after it; the block is stripped before anything else happens to the file; its values are searchable; the page view can show them through a button as a message (not in reveal); `header` and `footer` are shown as header and footer, in reveal too.

## Why

Obsidian stores a note's properties as a YAML frontmatter block at the top of the file. Files like secureLectures' `homework/WMC/GRULE/Hausübung 1 - 4AHIF - Ausgabe 2026-11-10 - Abgabe 2026-12-08.md` already carry one (`klasse`, `ausgabe`, `abgabe`, `footer`, `themen`, …). safeLearn knows nothing about it: the block is rendered as body text (a rule followed by a setext heading made of the YAML lines), and in reveal its `---` lines are slide separators. Worse, the whole-file permission is read from the first line only, so a file with frontmatter has `---` there and its `@@@` directive is silently not applied.

## What Changes

- A frontmatter block that opens on the file's first line (after the leading invisible marks the pipeline already drops) is split off before anything else reads the file. The `@@@` directive on the line right after it is then the first line again, and every existing step - visibility, inline blocks, rendering, search, handouts, attachment checks - works on the body as it does today.
- The block's values are kept as the file's properties. They are never rendered as body text in any view.
- Search matches the property values of a file the session may see, like body text.
- The page view gets a button that shows the file's properties as a message. The presentation view and the document view show no such button.
- The properties `header` and `footer`, when present, are shown as the page's header and footer in the page view and the document view, and on every slide in the presentation view.
- A frontmatter block that cannot be parsed is still stripped; the file then simply has no properties.

## Capabilities

### New Capabilities
- `frontmatter-properties`: recognizing and stripping a file's frontmatter, the `@@@` directive after it, the properties as search content, the properties message in the page view, and `header`/`footer` in all three views.

### Modified Capabilities
<!-- None: the whole-file directive, the search rules and the views keep their requirements; they now apply to the body after the frontmatter is stripped. -->

## Impact

- `obsidian.js`: a shared `splitFrontmatter(text)`; used by `readCorpusFile`, `answerFromFile`, `referencesVisibly`; `wrapInPage`, `wrapAsDocument`, `wrapInReveal` take the properties for header/footer and (page view only) the properties button.
- `app.js`: `sanitizeAndParseMarkdown` and `renderHandout` strip before reading the first line and pass the properties on.
- New dependency `yaml` (no transitive dependencies) for parsing the block.
- CSS for the header/footer and the properties message (`css/`, `css/reveal.css`); i18n keys for the button and the message title in `i18n/en.json` and `i18n/de.json`.
- Tests: unit tests for the splitter; content and browser checks with a fixture file carrying frontmatter and a `@@@` directive.
- Out of scope: the Obsidian plugin (own repo) and any other use of individual properties.
