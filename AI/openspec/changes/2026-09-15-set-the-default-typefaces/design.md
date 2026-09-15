## Context

See proposal.md — Why. Two constraints shape the approach, and both come from outside the source.

The first is that the server knows what fonts exist and the page does not. `scanFonts()` walks the two font directories at startup and fills `mainFontsArray`/`navFontsArray`; `obsidian.js` already ships both, plus a table of per-typeface facts, into the page through a single `initFonts(mainFonts, navFonts, table)` call. The page has no other way to learn anything about a font. A default nominated anywhere but on the server would be a second, hand-maintained copy of knowledge that already has one home.

The second is that the reset touches live accounts through an interface the application never uses. `setUserAttribute()` writes through the Account API at `/realms/{realm}/account`, carrying the reader's own access token — it can only ever write the account that is signed in. Clearing 77 other people's attributes is necessarily the Admin API, with a role the bot account does not hold, and it is irreversible in the sense that matters: nobody can reconstruct a preference a reader set months ago from anywhere else.

Both LDAP providers on the `unterrainer` realm run `editMode: UNSYNCED`, verified live. Attribute writes land in Keycloak's own database and are never written back to the directory, so the reset cannot damage the source of record.

## Goals / Non-Goals

**Goals:**

- One place in the source names the two default typefaces, and everything that needs a default reads it from there — the server, the page, the two icon buttons and the checks.
- The reset is rehearsed before it is run, reports only aggregates, and leaves behind enough to put the old values back.

**Non-Goals:**

- Making the nomination configurable per deployment. A fork that wants different defaults edits the same line it would edit to add a font.
- Reaching the reset from inside the application. Nothing in safeLearn gains an admin-API path; the reset is a script run once, by hand, against a temporarily raised role.
- Retiring `LEGACY_FONT_ORDER`. It survives this change.

## Decisions

### The nomination lives beside the typeface table in `obsidian.js`

The `typefaces` table already records what each shipped face is — the generic family it falls back to, whether it has a real italic — and already travels to the page as `typefaceTable`. The nomination is one more fact of the same kind and travels the same way: `initFonts()` gains a fourth argument carrying the two names.

*Alternative considered:* a constant in `obsidian-page.js`, where `chosenTypeface()` reads it. Rejected because the page would then hold a font fact that the font scanner cannot see. The scanner is what knows whether a nominated face is actually shipped, and a check that the nomination is real has to run where the directories are — so the fact belongs on that side of the wire.

*Alternative considered:* environment variables, so a deployment could nominate without editing source. Rejected in the proposal; a fork changing its fonts is already editing `assets/` and the typeface table.

### `chosenTypeface()` gains the default as an argument, and `offered[0]` stays behind it

The signature becomes `chosenTypeface(name, index, offered, legacyOrder, nominated)` and the last two lines read: the nominated face when the deployment offers it, `offered[0]` when it does not. Keeping `offered[0]` is not defensiveness for its own sake — a fork that deletes `Open Sans.ttf` without touching the nomination is a real thing to survive, and a page in the wrong shipped font beats a page in the browser's default.

*Alternative considered:* letting a missing nomination throw at startup, so the deployment cannot boot mis-nominated. Rejected: a font directory is content, and content problems should not take a deployment down. The check catches it instead, which is where a mis-nomination should surface.

### The numeric defaults are removed rather than re-pointed

`t: a.t ?? 2` could be made to point at Open Sans by changing `2` to `7`. That would work today and would be wrong: it re-establishes the indirection this change exists to remove, and `7` is again a position in a captured directory listing. `t: a.t` and `nt: a.nt` leave the legacy path reachable only for a reader who genuinely stored a number.

### The reset removes the attribute rather than writing the new values into it

Two readings of "reset every reader to the default" exist. Writing `{"tf":"Open Sans","ntf":"Inter"}` into all 77 makes each reader's choice *explicitly* the nominated pair; removing `config` altogether makes them readers who have chosen nothing.

Removal is chosen. It is what "reset" means — the reader is returned to the state they were in before they ever opened the menu — and it is the only one of the two that keeps its meaning if the nomination changes again: a reader who was reset stays with the deployment, whereas a reader written to explicitly would be pinned to today's pair forever, indistinguishable from someone who deliberately picked Open Sans. It also disposes of the string-typed legacy values and the whole `config` blob in one operation, which is what was asked for.

### The reset only touches accounts that carry `config`

Of 1,978 accounts, 77 have the attribute. Writing to the other 1,901 would materialise an `attributes` block on accounts that never had one, and each write is a federated user update. The script reads the census, selects the accounts carrying `config`, and issues one `PUT` each.

`lastVisitedUrl` is a separate attribute on 175 accounts and is preserved through the `PUT` by sending back the full user representation with only `config` removed.

### The reset takes a restorable snapshot first, and reports only aggregates

Before any write, every `config` value is written to a file on babylon5 beside the census snapshots, `chmod 600`, keyed by user id. That is the rollback: the same script run in reverse puts each value back. Nothing about an individual account is printed to the session — counts and distributions only, as with the census.

## Risks / Trade-offs

- **77 readers lose preferences they set deliberately, with no notice.** → Accepted and intended; recorded in the proposal as breaking. The snapshot makes it reversible for as long as the file is kept, which is the only mitigation available.

- **Reading the user list imports federated accounts on demand.** `GET /users` paginates into the LDAP federation and imports what it walks; `users/count` does not. → The reset works from account ids the census already holds rather than re-walking the realm, and fetches each of the 77 individually. Post-split this is a settled realm rather than the hazardous state of 2026-09-13, but there is no reason to walk 1,978 accounts to reach 77.

- **A raised role left in place.** `manage-users` on a bot that is otherwise read-only is exactly the kind of grant that stays granted. → Same handling as the split: the revocation is a task in this change, not an intention, and `revoke_admin_roles.py` already exists on babylon5 from that work.

- **A demo account carries a stored preference a browser check silently relies on.** The `safeLearn` realm is not reset, so nothing there changes — but the source change moves what an *unconfigured* session is served, and a check that never set a preference is one of those sessions. → `npm test` runs after the source change lands, before the reset, so the harness answers this on its own.

- **A reader signed in during the reset writes their old `config` back.** `setUserAttribute()` merges over what it read at the start of the request, so a page view that overlaps the write can restore the blob. → The window is seconds and the realm is a school; if it happens, the account simply keeps its preferences, and a second pass over the census catches it.

## Migration Plan

1. Land the source change and let it deploy. Until the reset runs, an existing reader keeps their stored preference and only a genuinely new reader meets the nominated pair — the two halves are independent in that order, and only in that order.
2. Gerald grants `manage-users` on `unterrainer`.
3. Snapshot, rehearse against one account, then run; verify by re-censusing.
4. Revoke.

Rollback of the source change is a revert. Rollback of the reset is the snapshot, replayed. The two do not depend on each other: reverting the source after the reset leaves every reader on the old default with no stored preference, which is a coherent state rather than a broken one.

## Open Questions

None. The one that stood here — whether the `safeLearn` demo realm needed resetting too — was settled by taking that realm out of scope.
