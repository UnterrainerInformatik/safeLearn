## 1. The deadline the plugin decides

Work in the plugin repo, `AI/plugin` → `/mnt/data/source/JAVASCRIPT/safeLearn-Obsidian-plugin`, in `main.ts`.

- [x] 1.1 Add `LOGIN_DEADLINE_MS = 10 * 60 * 1000` beside `EXPIRY_TICK_MS` (`main.ts:405`), with a comment
      saying what it bounds — a person at a login page, a password, a second factor, the phone that
      second factor is on — and why that is not the same quantity as a token's life
      (design.md — The deadline is a constant in the plugin)
- [x] 1.2 Stamp `expiresAt` from it in `login()` (`main.ts:1129-1133`) and `restoreLogin()`
      (`main.ts:1082-1086`), and delete `pendingLoginLifetimeMs()` (`main.ts:1024-1028`)
- [x] 1.3 Stop writing the figure: drop the `refresh_expires_in` read and its comment from
      `applyTokenResponse` (`main.ts:1334-1336`). `expires_in` (`main.ts:1330`) stays exactly as it is —
      renewal is not part of this change
- [x] 1.4 Drop `refreshTokenLifetimeSeconds` from `SafeLearnPluginData` (`main.ts:85`) and from
      `DEFAULT_DATA` (`main.ts:106`), and rewrite the file-level comment at `main.ts:72-73` that explains
      what the field was for — what replaces it is a sentence on why the deadline is the plugin's own
- [x] 1.5 Leave the key in existing `data.json` files alone: no migration, no strip-on-load
      (design.md — The field goes away rather than being left unread)

## 2. The login path in the debug log

- [x] 2.1 Add a helper that renders a `state` for the log as its first eight characters, used by every
      call below — a full one is a live anti-forgery token and a debug log is made to be sent to
      somebody (design.md — Logging)
- [x] 2.2 `login()`: log that a login was started, the deadline in seconds, and the wall-clock moment it
      falls at
- [x] 2.3 `expirePendingLogins()`: log each login that ended at its deadline, and how long it had been in
      progress
- [x] 2.4 `handleAuthCallback()`: log the callback's arrival and which of its three exits it took — an
      identity obtained, a login belonging to another window, or a login no longer in progress — naming
      the cause where there is one
- [x] 2.5 Confirm nothing else of the login reaches the log at any level: not the verifier, not the
      authorization code, not a token
- [x] 2.6 `npm run build` in the plugin repo and confirm the bundle builds clean

## 3. Verification

The checks live in this repo, in `test/obsidian/plugin.test.js`, driving a real Obsidian
(`npm run test:obsidian`). Sections 3.1-3.2 are the harness, 3.3-3.6 the checks.

- [x] 3.1 Give `loginTokenFigures()` (`test/obsidian/harness.js:1890`) a reader for the deadline a
      pending login was actually given — `expiresAt - startedAt` off the running plugin — and keep the
      access-token figure it already reports. The `refreshTokenLifetimeSeconds` reader goes
- [x] 3.2 Keep `seedLoginFacts`'s `refreshTokenLifetimeSeconds` parameter
      (`test/obsidian/harness.js:1597-1632`): it is now the only way to plant the poisoned value, since
      the plugin no longer writes it
- [x] 3.3 Rewrite `a fresh installation carries the seed until a realm has answered`
      (`plugin.test.js:4565-4589`) into a check that a fresh installation's first login gets the ten
      minutes, with nothing in `data.json` having decided it
- [x] 3.4 Rewrite `a real login against the configured realm completes, and what the realm answered is
      kept` (`plugin.test.js:4590-4635`): the real login against the configured realm still has to
      complete and the refresh token still has to be the one thing written to disk — what comes out is
      the assertion that the realm's figure governs the login, and `refreshTokenLifetimeSeconds` is
      asserted absent from what the plugin writes
- [x] 3.5 Add the check this bug is about: seed `refreshTokenLifetimeSeconds: 1`, start a login through
      `startLoginWithoutBrowser()`, and assert the deadline stamped on it is the plugin's ten minutes and
      not the second it was told. Fails on today's code
- [x] 3.6 Add the check in the words it was reported in: with the same seed, wait past two ticks of
      `EXPIRY_TICK_MS` and assert the state is still *logging in* — not *login failed: nothing came
      back* — and that delivering the callback afterwards logs the person in rather than reporting a
      login already given up on. Fails on today's code
- [x] 3.7 Rename the `describe` block: it no longer covers "the realm's own figure for how long a login
      may take", which is the claim this change retires
- [x] 3.8 `npm run test:obsidian` green, and `npm test` unaffected — the content suite does not touch
      the login, and a change in its results would mean something else moved

## 4. What the documentation claims

- [x] 4.1 Correct `docs-keycloak.md:68-70`: the plugin no longer gives a login in progress
      `refresh_expires_in` to conclude, and no longer keeps that figure. The row for `refresh_expires_in`
      in the table above stays — it is still what the realm answers — and what changes is the paragraph
      saying the plugin derives a deadline from it
- [x] 4.2 Say, in the same place, why: the figure measures a session, the deadline measures a person, and
      a realm answering a small number must not be able to lock the plugin out of logging in
- [x] 4.3 Check `AI/architecture.md` for the same claim and correct it where it appears

## 5. The vault this was found on

- [x] 5.1 Before the release lands: with the plugin disabled, set `refreshTokenLifetimeSeconds` to `1800`
      in `/mnt/data/source/HTL/secureLectures/.obsidian/plugins/safelearn-formatter/data.json`, then
      enable it and confirm a login completes. A running plugin holds its data in memory and writes it
      back over any edit made underneath it, which is why the plugin has to be off
- [ ] 5.2 After the release: confirm the same vault logs in with the key left at `1`, which is the claim
      that poisoned installations recover by being updated and nothing else

## 6. Release

- [x] 6.1 Bump the version in the three places, push, tag, and cut the GitHub release with `main.js`,
      `manifest.json` and `styles.css`
- [ ] 6.2 Confirm the login once from a vault that takes the plugin through the store rather than through
      the symlink, since that is the path every other machine gets it by
