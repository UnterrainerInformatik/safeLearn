## Why

When a teacher takes a whole class over in the directory picker and has "Restricted section per name…" write a section for each student, the sections come out in an order nobody chose. Generated for 5CHIF on 2026-10-10, the list opened at Gugerbauer and closed at Horvath. The picker returns the people it holds in the order they were chosen. Taking a class over chooses them in the order the server answered, and the server answers in the order Keycloak enumerates its accounts, which is roughly by username (`if190123`, …). That order is unrelated to anyone's name. A teacher scrolling a page of per-student sections looks for a surname, as in every class list the school produces, and has to search the whole page for it instead.

The same applies, less visibly, to the entries "Restrict selection…" writes into a single directive.

There is a second cost on the same page. Each generated section holds a single blank line. When a teacher wants the same grid in every section, for example an assessment raster, a feedback table or a checklist, they paste it into each section by hand, once per student, seventy times for a year group.

Sorting by surname needs the surname. The display name the server hands back is `firstName + " " + lastName`, joined before it leaves the server, and it cannot be split back reliably: in the realm's 5th-year classes, five surnames contain a space and one given name does. Splitting at the last space would misfile exactly those students. The directory already holds both parts separately: the LDAP federation maps `givenName` to `firstName` and `sn` to `lastName` in both providers, checked 2026-10-10. In 508 of the 545 5th-year accounts the e-mail address confirms that the first name sits in `firstName`; one disagrees, and the rest have no address or one that cannot be compared.

## What Changes

- The directory search endpoint SHALL return, next to each person's display name and roles/groups, the two parts that display name is made of: given name and surname. This is additive. The display name stays exactly what it is, because it is what a directive carries and what the server compares against the `name` claim.
- The people chosen in the directory picker SHALL be handed to the command ordered by surname, then given name, using German collation and ignoring case.
- The picker itself SHALL keep its current order, both in the offered results and in the chosen list. In directory order a class's students stand together, and with some 70 students per year group that is what makes choosing them workable. The sorting happens when the names are inserted, not while they are chosen.
- Names typed or pasted into the command SHALL keep the order they were given in. A pasted class list is usually ordered already, possibly by a rule this command does not know, and it carries no surname to sort by. Where both sources contribute, the chosen people come first, sorted, then the typed lines in their order.
- "Restricted section per name…" SHALL offer an optional field for content that every section starts with. Whatever is pasted there is written, unchanged, into each section in place of the blank line. Left empty, the command writes exactly what it writes today. Content containing a line that opens or closes a restriction is refused with a message, because that line would end the section early. "Restrict selection…" gets no such field, since it encloses text that already exists.
- A person returned by a server that predates this change carries no name parts. They are ordered by their display name, so an older server still produces a deterministic, if first-name-based, order.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `directory-search`: "Results carry only a display name and roles/groups" now also admits the given-name and surname parts of the display name. These parts disclose nothing the display name does not already contain.
- `plugin-directory-search`: "A picker never surfaces more than a display name and roles/groups" admits the name parts the endpoint now returns. The picker carries them along so the command can order what it writes, and never shows them separately. How the picker orders what it offers and what has been chosen does not change.
- `plugin-authoring-commands`: "The names are given to the command" now hands chosen people over sorted by surname, not in the order they were chosen. "A restricted section is written for each name that was given" still writes in the order the command was handed. The ordering is decided once, where the names are collected. The same requirement now writes the given content into each section, where it used to write a blank line. A new requirement covers that content, and the dialog requirements name the per-name dialog's second field.

## Impact

- **safeLearn (server):** `middlewares/directory-service.js`, where `searchDirectory()` maps each user to `{ name, roles }`, plus its unit tests in `test/directory-service.test.js`. The response shape gains two optional fields. Nothing that reads only `name` and `roles` changes behaviour.
- **Plugin (separate repo, `AI/plugin`):** `main.ts`
  - `searchDirectory()` parses the new fields.
  - `NameListModal` holds the chosen people with their name parts, not as bare strings. The chosen list keeps its current order, and the people are sorted only on confirm.
  - For the per-name command, the dialog gets a content field, and `insertSectionsPerName` takes the content to write into each section.
  - The plugin README describes the command.
- **Rollout order:** either order works, because the server change is additive and the plugin falls back when the fields are absent. Following the usual sync order, safeLearn goes first, then secureLectures, then a plugin release.
- **Data:** none. Nothing stored changes, and existing documents are not re-ordered.
