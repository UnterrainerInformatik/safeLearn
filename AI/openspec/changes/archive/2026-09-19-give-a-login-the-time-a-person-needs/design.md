## Context

See proposal.md — Why. What matters here is the shape of the thing being removed.

One field carries the defect. `refreshTokenLifetimeSeconds` is written in exactly one place (`applyTokenResponse`, `main.ts:1335-1336`, from `refresh_expires_in`), read in exactly one place (`pendingLoginLifetimeMs()`, `main.ts:1024`), and its only consumer is the `expiresAt` stamped on a pending login in `login()` (`main.ts:1129-1133`) and `restoreLogin()` (`main.ts:1082-1086`). Nothing else in the plugin depends on it, and nothing outside the plugin reads `data.json`. So this is a one-field removal, not an architectural change — which is the reason the design is short and the verification is not.

The surrounding machinery stays as it is and is worth naming, so that the change is understood as not touching it: `expirePendingLogins()` on its one-second tick, `concludedLogins` and its bound of twenty, the three exits of `handleAuthCallback`, and the five states. All of that behaves correctly. It was being fed a deadline of one second.

Two constraints from the repo that shape the work:

- The plugin lives in its own repository (`AI/plugin` → `/mnt/data/source/JAVASCRIPT/safeLearn-Obsidian-plugin`), and `main.ts` is its single source file. The verification for it lives in *this* repository, under `test/obsidian/`, and reaches into the running plugin over Obsidian's debugging protocol.
- `test/obsidian/harness.js` can start a login without opening a browser (`startLoginWithoutBrowser`, `harness.js:1673`) and can complete a real one against the demo realm (`completeRealLogin`, `harness.js:1934`). Both are needed below, and neither has to be built.

## Goals / Non-Goals

**Goals:**

- A login in progress outlives a person signing in, on every realm, whatever the realm answers.
- An installation already holding a poisoned figure recovers by being updated, with nothing for its user to do.
- The next failure in the login path is diagnosable from the debug log.
- A check exists that fails on today's code for the reason this bug happened.

**Non-Goals:**

- Changing when or how a login concludes, what `handleAuthCallback` decides, or any of the five states and their causes.
- Making the deadline configurable, or adapting it to the realm in any other way. The point of the change is that the realm does not get a say in it.
- Renewal of a held identity. `refresh_expires_in` stops being *stored*; the access token's own `expires_in` still drives renewal exactly as before (`main.ts:1330`), and a refresh token that the realm has expired still fails the refresh and clears itself. Nothing about holding an identity changes.

## Decisions

### The deadline is a constant in the plugin: ten minutes

`LOGIN_DEADLINE_MS = 10 * 60 * 1000`, beside `EXPIRY_TICK_MS`, with the reasoning in a comment the way that file writes constants.

Ten minutes is sized for the thing it actually bounds: a person at a login page, typing a password, clearing a second factor, and finding the phone the second factor is on. It is not sized for how long an identity is good for, which is the quantity the old value measured and the reason it was wrong even when it read 1800.

Alternatives considered:

- **A floor under the realm's figure** (`max(refresh_expires_in, ten minutes)`). Smaller change, and it repairs the reported symptom. Rejected because the value it keeps can then only ever exceed the floor, which means it is doing nothing except on realms with very long sessions — where it produces the *other* defect `plugin-login-flow` recorded under Risks: a login left in progress for a day after the person walked away. Keeping a number that is either inert or harmful is worse than not keeping it.
- **A floor and a cap** (clamp between ten minutes and, say, an hour). Rejected as the same conclusion written expensively: once both ends are the plugin's, the realm's figure only decides where in a range nobody cares about it lands.
- **A setting.** Rejected per proposal.md — starting again is already reachable from every state, which is the cheaper answer for the person for whom ten minutes was not enough.

### The field goes away rather than being left unread

`refreshTokenLifetimeSeconds` comes out of `DEFAULT_DATA`, out of `SafeLearnPluginData`, out of `applyTokenResponse`, and `pendingLoginLifetimeMs()` goes with it.

A field that is still written but no longer read is the state this bug would come back through: a future reader finds a plausible number in `data.json` next to the refresh token, and the comment at `main.ts:72-73` explaining what it is for, and wires something to it. Removing the write is what makes the mistake unavailable.

Existing `data.json` files keep the key. `loadData()` is merged over `DEFAULT_DATA` with `Object.assign` (`main.ts:686`), which carries unknown keys through untouched and hands them back on the next `saveSettings()`. That is acceptable: nothing reads it, and it is gone from any file the plugin rewrites — which is every file, at the first settings change. Writing migration code to strip one dead key would be more code than the key costs.

**This is what makes the poisoned installations well.** Not a reset, not a repair step: the value stops being consulted, so an installation holding `1` behaves identically to a fresh one from the first run of the new version. It is also why the spec delta carries the scenario "A short lifetime was stored by an earlier version" — the recovery is a requirement, not an implementation accident, and it should fail a check if a later change reintroduces a stored figure.

### The one-second tick stays

With a ten-minute deadline, a tick that fires six hundred times per login looks excessive, and it is not the deadline's servant: the comment at `main.ts:399-405` says what it is for — the status bar must not go on saying *logging in* after the login has ended. That obligation is unchanged, and so is the tick.

### Logging: three lines, and the `state` truncated

`debugLog` already exists (`main.ts:810-812`) and is already gated on the setting. Three calls are added, at the three points where a login's course is decided:

- `login()` — the login was started, the deadline in seconds, the wall-clock moment it falls at.
- `expirePendingLogins()` — a login ended at its deadline, and how long it had been in progress.
- `handleAuthCallback()` — a callback arrived, and which of the three exits it took, with the cause it produced.

Each names the `state` it is about, truncated to its first eight characters. Untruncated, the log would carry a live anti-forgery token for a login that may still be in flight, and a debug log's whole purpose is to be copied into a chat window and sent to somebody. Eight characters are enough to match a start against a callback in one log — which is the only thing a reader needs it for — and not enough to forge a callback with. This is why the spec delta says so rather than leaving it to the implementation.

The pending login's `state` is the only value of that kind in the log; the verifier, the code and the tokens are not logged at any level.

### The verification plants the poison instead of waiting for it

The check that would have caught this does not need a realm that answers 1. It needs the plugin to have been *told* 1 and to start a login anyway:

1. `seedLoginFacts({ refreshTokenLifetimeSeconds: 1 })` — the harness already takes that parameter (`harness.js:1597-1632`), which is what lets a check write the field the new code no longer writes.
2. `startLoginWithoutBrowser()` — starts a real `login()` with the browser held back.
3. Read the deadline the plugin stamped, and assert it is the plugin's ten minutes.
4. Wait past the old deadline and past two ticks, and assert the state is still *logging in* rather than *login failed*.

Step 4 is the one that reproduces what was reported, in the words it was reported in, and it costs about three seconds of wall clock. Step 3 is the one that says why. Both fail on today's code.

`loginTokenFigures()` (`harness.js:1890`) currently reads the two figures out of the plugin's data. It keeps the access-token figure, which is still recorded for documentation's sake, and gains a reader for the deadline a pending login was actually given — which is now the thing worth asserting, and which no helper exposes today.

The two existing checks in `describe("the realm's own figure for how long a login may take")` are rewritten in place rather than deleted, as this repo does with checks that asserted a defect: the real login against the configured realm still has to complete, because that check covers the whole exchange and not only the figure. What comes out of it is the assertion that the realm's figure governs the login, and what goes in is that the deadline is the plugin's.

## Risks / Trade-offs

- **A realm with sessions shorter than ten minutes issues a token that is already dead when the exchange completes.** → Not made worse by this change, and not hidden by it: the exchange still succeeds, the refresh still fails when it fails, and the cause the person is shown comes from that failure rather than from a login that was never given a chance to conclude. The realm answering `1` is a fact worth chasing on its own — proposal.md leaves it with the directory work.

- **A login left in progress for ten minutes after a person abandoned it** shows *logging in* for that long. → It was up to thirty minutes before this change on a healthy realm, and longer on a realm with long sessions. Cancelling is reachable from the settings and starting again supersedes it, both already required by `plugin-login-state`.

- **`data.json` files keep a dead key.** → Stated above; nothing reads it, and it disappears on the first rewrite.

- **The eight-character `state` prefix is still correlatable across logs.** → It identifies which login a line is about, which is its job. It is not a credential on its own: a callback is only honoured against a full `state` this plugin generated and is still holding.

- **The new checks add about three seconds of wall clock** to `npm run test:obsidian`. → Accepted. The alternative is asserting the deadline figure alone, and the figure is what was asserted last time — it is the waiting that reproduces the report.

## Migration Plan

No data migration, no coordination, no order of operations. The plugin is released and every installation — poisoned or not — is on the plugin's own deadline at the first run of the new version.

The vault this was found on can have its `data.json` corrected by hand before the release lands: set `refreshTokenLifetimeSeconds` to `1800` while the plugin is disabled, since the running plugin holds the data in memory and will write it back over any edit made underneath it. That is a stopgap for one machine and is deliberately not part of this change.

Rollback is the previous release. An installation that has meanwhile been rolled back onto the old code reads whatever `refreshTokenLifetimeSeconds` its `data.json` still holds, which is the value it held before — the change neither corrects nor worsens it.
