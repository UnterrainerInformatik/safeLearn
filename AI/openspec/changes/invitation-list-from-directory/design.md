## Context

See proposal.md for why. The relevant state today:

- **Server.** The directory cache holds every Keycloak user as fetched with `briefRepresentation=false`, spread into the cache entry (`{ ...user, clientRoleNames }` in `runDirectoryFetch`). `email` is therefore already in memory and in the disk cache. `searchResultEntry` maps a cached user to `{ name, firstName, lastName, roles }`. That mapping is the only place the response shape is decided.
- **Plugin.** `NameListModal` (`AI/plugin/main.ts`) holds the directory picker inline: `buildDirectorySearch` (~300 lines) builds the search field, class filter, results, chosen list, "take all" and the fetch-progress wait. It writes into the modal's own `chosen: ChosenPerson[]` and `fetchWait`. `ChosenPerson` is `Pick<DirectoryEntry, "name" | "firstName" | "lastName">`, and `orderForWriting` sorts chosen people by surname and returns bare names. `classLikeValues` derives class names from the role map for the filter.
- **Persistence.** The plugin keeps its settings in `SafeLearnPluginData`, loaded once in `onload` and written by `saveData`.
- **Tests.** Plugin behaviour is verified in a real Obsidian instance via `test/obsidian/plugin.test.js` in safeLearn, including the directory picker against a stubbed directory. The server's result shape is pinned by `test/directory-service.test.js` and the live check `test/checks/directory-search.js`.

## Goals / Non-Goals

**Goals:**
- One picker implementation shared by both commands, so the invitation list gets search, class filter, take-all and the fetch wait without copying them.
- Formatting as a pure function of (people, format), so the preview, the insert and the copy all produce the same text and it can be tested without a dialog.

**Non-Goals:**
- CSV quoting. Values are written verbatim (spec). A real CSV export with quoting is a different command if it is ever needed.
- Typed or pasted names as input (spec: they carry none of the fields).
- Sending invitations or talking to any mail system.
- More directory attributes than the e-mail address.

## Decisions

### The picker is extracted into its own component

`buildDirectorySearch` and the state it writes (`chosen`, `fetchWait`) move into a `DirectoryPicker` class. It is constructed with the plugin and a container element, exposes `chosen` (read-only), an `onChange` callback and `dispose()` (ends the fetch wait), and reports `unreachable`/`failed` through a callback so `NameListModal` can still reveal its typed field. `NameListModal` hosts one, and so does the new `InvitationListModal`.

*Alternative:* a mode flag on `NameListModal`. Rejected: the two dialogs share the picker and nothing else. The per-name dialog has a typed field, section content and one confirmation, while the invitation dialog has fields, four texts, a preview and two confirmations. A flag would put two dialogs' worth of branches into one `onOpen`. *Alternative:* subclassing `NameListModal`. Rejected for the same reason, since the subclass would have to switch off half of what it inherits.

`onChange` is new. The invitation preview has to follow the chosen list, and the per-name dialog ignores it.

### The chosen person carries the whole entry it was chosen from

`ChosenPerson` becomes `Pick<DirectoryEntry, "name" | "firstName" | "lastName" | "email" | "roles">`, and `DirectoryEntry` gains `email?: string`. `searchDirectory` parses `email` the same way it parses the name parts: a string is kept, anything else becomes `undefined`. `undefined` therefore means "the instance did not send it" and `""` means "the directory holds none", which is the distinction the missing-field notice needs. `roles` comes along so the class field can be derived without a second lookup. The per-name command still writes only `name`.

The surname sort is split out of `orderForWriting` into `sortBySurname(chosen): ChosenPerson[]`. `orderForWriting` uses it and keeps its current output, and the invitation list uses it directly. One ordering rule for both commands is what the spec asks for.

### Formatting is one pure function

```ts
type InvitationField = "firstName" | "lastName" | "class" | "email";
type InvitationFormat = {
  fields: InvitationField[];          // switched-on fields, in order
  fieldSeparator: string;             // all four as typed, escapes not yet resolved
  prefix: string;
  postfix: string;
  entrySeparator: string;
};
function formatInvitationList(people: ChosenPerson[], format: InvitationFormat):
  { text: string; emptyFields: Map<InvitationField, number>; addressesSent: boolean }
```

The texts are stored as the author typed them (`,,\n`, not a real line break), so the single-line inputs can show them again exactly as typed. `unescapeFormatText` resolves `\n`, `\t` and `\\` in one left-to-right pass, which is what makes `\\n` mean a backslash followed by `n` and not a backslash followed by a line break. The class field is `classLikeValues` applied to the one person, sorted and joined with `/`. The preview, the insert and the copy all call this function. The preview takes the first five people, or one placeholder person (`Anna`, `Beispiel`, `1A`, `anna.beispiel@example.org`) when nobody is chosen.

### The entry separator is a select plus a free-text field

A dropdown offers "Line break", "Comma" and "Custom". "Custom" reveals a text input that accepts the same escapes. The stored value is always the escaped text (`\n`, `,` or whatever was typed), so a remembered format is restored by mapping `\n` and `,` back to their presets. The dropdown is the fast path the request asked for ("Enter, Komma oder ein String"). Prefix, postfix and the field separator are free text only, because their useful values vary too much for presets.

### Field selection is a fixed list of four rows

Each row holds a checkbox, the field's label, and up/down buttons. The order of the rows is the order of the fields, and unchecked rows keep their place so that switching a field back on restores it where it was. Drag-and-drop was considered and rejected: for four rows it costs more code and is not keyboard-reachable, while buttons are both.

### Two confirmations in the button container

"Insert" (`mod-cta`) and "Copy" stand in the same `modal-button-container` the other dialogs use, so the layout requirements of `plugin-authoring-commands` apply unchanged. Ctrl/Cmd+Enter inserts. Copy uses `navigator.clipboard.writeText`, which Obsidian's Electron renderer permits. A rejection is reported in a notice and the dialog stays open, so nothing is lost.

### The format is persisted on confirm, in the plugin data

`SafeLearnPluginData` gains `invitationFormat: InvitationFormat`, defaulting to the spec's first-run format. It is written on either confirmation, not while typing: a format the author abandoned by closing the dialog should not replace the last one that was used.

### Server: one field more in `searchResultEntry`

`email: typeof user.email === "string" ? user.email.trim() : ""`, mirroring `namePart`. Nothing else in the server changes. The refusal for non-teacher callers happens before `searchDirectory` runs and is untouched.

## Risks / Trade-offs

- [Wider disclosure through the search endpoint] → Bounded by the existing teacher/admin gate, institutional addresses only, recorded in the `directory-search` spec. The picker never displays the address, so it does not appear on screen until the author writes it.
- [A value contains the field separator, e.g. a surname with a comma] → Written verbatim (spec). The preview makes it visible before writing. The 2026-10-10 name check found no commas in names.
- [Extracting the picker regresses the per-name command] → The existing Obsidian tests for the picker and the surname order run unchanged against the extracted component, and they pass before the new dialog is built on it.
- [Stale disk cache without `email`] → Not possible: the disk cache stores the full user objects, so an address is present wherever Keycloak has one. No cache invalidation is needed.
- [Clipboard write fails] → Notice, dialog stays open, the author can insert instead.

## Migration Plan

1. safeLearn: server field, tests, docs. Push, then merge into secureLectures and push (usual sync order).
2. Plugin: extraction, new command, release with the version bumped in the usual three places.
3. Rollback: the server field is additive, and an older plugin ignores it. A new plugin against an old server writes empty e-mail fields and says so.
