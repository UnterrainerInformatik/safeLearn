## Why

A teacher who invites a class to something, such as a meeting, a shared document, a course in another system or a mailing list, needs the class as a list in whatever format the receiving tool reads. Today that list is typed out or copied together from the school's address book, one student at a time. The plugin already finds exactly these people: its directory picker takes a whole class over in one action, and "Restricted section per name…" writes a section for each of them. What it cannot do is write the people themselves as a list, and it cannot write their e-mail addresses at all, because the directory search does not return them.

The format differs with every receiving tool. One wants addresses one per line, another separated by commas, a spreadsheet import wants `,,,Given,Surname,address,,` with its own empty columns around the data. So the command has to let the author say which fields are written, in which order, and what stands between, before and after them, rather than offering a fixed format.

## What Changes

- The directory search endpoint SHALL return each person's e-mail address beside their display name, name parts and roles/groups. This is a deliberate widening of what the endpoint discloses. Until now it returned nothing the display name did not already show (`plugin-admin-api-backend`, 2026-08-18, minimised the response to what a restriction needs). The address is the institutional one, the endpoint stays limited to teacher and admin identities, and the address is what an invitation list is for. A person the directory holds without an address carries it as empty.
- A new authoring command, "Invitation list…", opens the same directory picker the per-name command uses. From the people chosen there it writes one entry per person, in surname order.
- The author chooses which of the fields given name, surname, class and e-mail are written, and in which order.
- The author sets the text written between two fields of an entry, before each entry (prefix), after each entry (postfix) and between two entries. Between entries offers a line break and a comma as presets, plus free text. In every one of these texts, `\n` stands for a line break and `\t` for a tab, so a postfix such as `,,\n` can be given in a single-line field.
- The dialog shows a preview of the first entries as they will be written.
- The dialog offers two confirmations: insert the list at the cursor, or copy it to the clipboard without changing the document.
- The format last confirmed is remembered and pre-filled the next time the dialog opens.
- A chosen person who lacks a selected field, for example a student with no address in the directory, is written with that field empty. The author is told how many entries that affects.
- The picker carries the e-mail address with each chosen person only for the command that opened it, and does not show it.

## Capabilities

### New Capabilities

- `plugin-invitation-list`: the "Invitation list…" command: which people it writes, the field selection and order, the separator, prefix and postfix texts and their escapes, the preview, insert versus copy, the remembered format, and how a missing field is written.

### Modified Capabilities

- `directory-search`: "Results carry only a display name, its two parts, and roles/groups" admits the e-mail address and records why the endpoint now discloses more than the display name shows.
- `plugin-directory-search`: "A picker never surfaces more than a display name, its two parts, and roles/groups" admits the e-mail address, which is carried for the command that opened the picker and never shown.

## Impact

- **safeLearn (server):** `middlewares/directory-service.js`, where `searchResultEntry` maps a cached user to its result entry. The cache already holds the full Keycloak user, address included, so nothing is fetched additionally. Affected tests: `test/directory-service.test.js` and the live check `test/checks/directory-search.js`, both of which pin the exact set of result fields. `docs-keycloak.md` / `docs-technical-details.md` describe the response shape.
- **Plugin (separate repo, `AI/plugin`):** `main.ts` parses `email`, carries it on the chosen person, and gains the new command, its dialog and the persisted format in the plugin data. `README.md` describes the command. A plugin release follows.
- **Rollout order:** safeLearn first, then secureLectures, then the plugin release. Against an instance that predates this change, the plugin writes the e-mail field empty and says so.
- **Data:** the plugin data gains the remembered list format. No server-side data changes.
