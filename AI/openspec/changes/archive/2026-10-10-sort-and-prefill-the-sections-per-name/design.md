## Context

The change touches two repositories: the safeLearn server (`middlewares/directory-service.js`) and the Obsidian plugin (`AI/plugin/main.ts`, its own repo). They are released independently. The plugin reaches other vaults roughly a day after a release, and a deployment such as secureLectures updates its server on its own schedule. Either side can therefore meet an older version of the other.

Today:

- `displayName(user)` joins `firstName` and `lastName` with a space and falls back to `username`. `searchDirectory()` maps each user to `{ name, roles }`.
- The plugin's `searchDirectory()` reduces each entry to `{ name, roles }`.
- `NameListModal` keeps `chosenNames: string[]` in the order people were clicked or taken over. `confirm` merges it with the typed field, deduplicating on the trimmed name, and hands the resulting `string[]` to `insertSectionsPerName` or `restrictSelection`. Both write in the order they are handed.

## Goals / Non-Goals

**Goals:**

- Surname order in what is written, decided once, at `confirm`.
- One pure ordering function that the existing Obsidian unit harness can reach through `pluginFunction()`. The ordering is then tested without a running Obsidian, in the way `semester-table.test.js` tests `semesterTableLines`.

**Non-Goals:**

- Re-ordering the picker's offered results or its chosen list. They stay in directory order, see the proposal.
- Re-ordering documents that already exist.
- Inferring a surname for a typed name, for instance by looking it up among the entries the picker has seen. A typed line keeps its place.
- Making the server answer in surname order. The plugin needs its own ordering anyway for older servers, and directory order is the order the picker wants.

## Decisions

### The server returns the parts, not a sort key

`searchDirectory()` returns `{ name, firstName, lastName, roles }`. A missing part becomes `""`, so a consumer never has to tell "absent" from "empty". `name` is still produced by `displayName()` and is byte-for-byte what it was.

*Alternative: a precomputed `sortKey` such as `"lastName firstName"`.* Rejected. Collation is a reader-side decision (German here), and a joined key re-creates the ambiguity this change removes: a two-word surname plus a given name cannot be told apart from a one-word surname plus a two-word given name. Two fields cost nothing more and stay unambiguous.

*Alternative: split `name` in the plugin at the last space.* Rejected. It misfiles exactly the people whose surname has two words, and there are five of those in the 5th-year classes alone (see the proposal).

A user who falls back to `username` (both parts empty) gets `""` for both. The plugin then orders them by `name`, which is the username. These are the 7 local accounts, and none of them is a student.

### The modal holds people, not strings

`chosenNames: string[]` becomes `chosen: Chosen[]`, with `Chosen = { name: string; firstName?: string; lastName?: string }`. The chosen list, the count, deduplication and taking a person back out still key on `name`. Only what is stored next to the name changes. The plugin's `searchDirectory()` passes `firstName` and `lastName` through when they are strings, and leaves them `undefined` otherwise. That `undefined` is how an older server shows up.

### Ordering lives in one pure function, applied at confirm

```
orderForWriting(chosen: Chosen[], typed: string[]): string[]
```

- `chosen` is sorted stably by `(lastName ?? name, firstName ?? "")`. The comparison is an `Intl.Collator("de", { sensitivity: "base" })` used for both keys, with `name` as the last tie-break. Deduplication has already happened on `name`, so after that only a true duplicate remains, and the stable sort keeps the choice order for it.
- `typed` follows in its own order. A line that duplicates a chosen name is dropped, as `confirm` does today.
- The result is the `string[]` the two writers already take. `insertSectionsPerName` and `restrictSelection` stay unchanged, and "A restricted section is written for each name that was given" still holds literally.

`Intl.Collator` with `sensitivity: "base"` sorts `Ö` beside `O` and ignores case, which is what a German class list does. Electron ships full ICU, so the `de` locale is available in every Obsidian. The collator is built once at module level.

*Alternative: `localeCompare` on each comparison.* Equivalent in result, but it builds a collator on every call, and a year group is a few hundred comparisons. The shared collator is simpler to test.

*Alternative: sort when someone is added to the chosen list.* Rejected by the user. A class has to stay together while it is being picked.

### Where no picker is shown, nothing is sorted

Without a login, `chosen` is empty and `orderForWriting([], typed)` returns `typed` unchanged. That is today's behaviour for a pasted list.

### The section content is a second field of the same dialog, and only for the per-name command

`NameListModal` gets an option `withSectionContent: boolean`. The per-name command passes `true`, "Restrict selection…" passes `false`. When it is `true`, a second textarea is placed below the names (or below the picker), with a label saying it is optional and is written into every section. The confirmation stays below the last field, in its button container. `onList` then receives `(names, content)`, and the restrict command ignores the second argument.

The content field is built outright. It does not appear on demand the way the typed-names field does, because it is needed whether or not the picker is shown.

*Alternative: a separate dialog after the names.* Rejected. It would be a second confirmation for something optional, and the person would have to remember that it comes.

*Alternative: remember the last content across invocations.* Not now. A grid is pasted from wherever it lives, and a remembered grid would silently land in the next, unrelated generation. That can be added later without changing anything here.

### Normalising the content

`sectionContentLines(raw: string): string[]`, a pure function:

- If `raw.trim() === ""`, return `[""]`, which is the single blank line written today.
- Otherwise split on `\r?\n` and drop exactly one trailing empty element, which is the line break a paste brings along. Leading blank lines, indentation and inner blank lines are kept.

`insertSectionsPerName(editor, names, contentLines)` writes `@@@ name`, then `...contentLines`, then `@@@` per name, as one `writeLines` call. The cursor goes to line 1 of the insertion, which is the first content line of the first section and the same line as today. `writeLines` puts it at the end of that line, as it does for every command; for the blank line that is its start.

### Refusing a marker inside the content

The content is refused when any of its lines matches `directiveOpeningPattern()` (`/^[ \t]*@@@/`). That is the same test the plugin's block resolution and the server use to recognise a marker line. A bare `@@@` would close the section, and `@@@ x` would open a nested one. The server's grammar does not nest, so both would leave part of the grid outside its section. The modal checks this in `confirm` before closing, shows a `Notice`, and returns without closing, so names and content stay as they were.

Other directives, such as side-by-side or fragment markers, are allowed. They are legal inside a restricted section today, and someone can write them there by hand.

## Risks / Trade-offs

- [A person's `sn` in the directory holds something other than the surname] → They are filed by whatever `sn` holds. The check on 2026-10-10 found 1 of 545 5th-year accounts where the e-mail address suggests a swap. This change does not repair directory data. Gerald fixes such accounts in the AD, and the next directory refresh carries the fix.
- [Plugin released before the server] → Entries carry no parts, so people are ordered by display name, which means by first name. That is deterministic and better than directory order, and it corrects itself once the server is updated. No version check is needed.
- [Server updated before the plugin] → An older plugin ignores the two extra fields. Nothing changes for it.
- [A long grid times seventy students makes a long document] → That is what was asked for. It is one insertion, so a single undo takes all of it back.
- [Two people with identical display names] → They are deduplicated to one, exactly as today. The directive cannot tell them apart anyway, so ordering adds no new problem here.

## Migration Plan

1. safeLearn: add the fields and unit tests, push. Then merge `public/master` into secureLectures and push (see the usual sync order). Do not wait for the build.
2. Plugin: implement, build, run `npm test` in safeLearn (the Obsidian run picks up `AI/plugin`), then release as usual.
3. Rollback: either side can be reverted alone. The other degrades as described under Risks.
