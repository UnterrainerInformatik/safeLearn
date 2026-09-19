## Why

Logging in from the plugin fails on the production realm, and it fails before the person has typed anything. The observed sequence, reported from the vault at `secureLectures`:

> I sign out everywhere so no stale login can slip through. Then I say log in. The browser opens with the sign-in page. The status bar says *Logging in since &lt;time&gt;*. Immediately the plugin flips to nothing came back — failed.

And when the sign-in does complete, the callback that arrives is reported as *a login already given up on*.

The cause is a number in `data.json`:

```
/mnt/data/source/HTL/secureLectures/.obsidian/plugins/safelearn-formatter/data.json
  "instanceUrl": "https://htl.dev",
  "keycloakUrl": "https://auth.htl-leonding.ac.at",
  "realm": "unterrainer",
  "refreshToken": null,
  "refreshTokenLifetimeSeconds": 1
```

One second. That is the lifetime a login in progress is given — `pendingLoginLifetimeMs()` (`main.ts:1024`) reads exactly this field — and the sweep that ends expired logins runs every second (`EXPIRY_TICK_MS`, `main.ts:405`). So the login is over on the first tick after the browser opens: `expirePendingLogins()` drops it, the state becomes *login failed* with the cause *nothing came back*, and the `state` it was keyed by moves into `concludedLogins`. When the real callback arrives a minute later, `handleAuthCallback` (`main.ts:1215`) finds that `state` among the concluded and reports *a login already given up on*. Both messages are accurate about what the plugin observed, and both point at the browser, which did nothing wrong.

How the 1 got there follows from the one place that writes the field: `applyTokenResponse` (`main.ts:1335-1336`) takes `refresh_expires_in` off every token response and keeps it. Keycloak does not answer that field with a configured lifetime — it answers with how much of the current session is left. A refresh performed at the end of a session is answered with the seconds remaining, and `refreshToken: null` beside the 1 is the rest of that story: the refresh after it failed, which cleared the token (`refreshAccessToken`, `main.ts:1284`) and left the figure standing.

It does not heal. Only a successful exchange overwrites the field, and no login can succeed while it is 1. Short of editing `data.json` by hand, the plugin is locked out of logging in permanently — which is why this reads as *the login stopped working* rather than as *the login is flaky*.

The risk was seen and guarded at the wrong end. `plugin-login-flow`'s design.md recorded it under Risks: "on a realm with long sessions a refresh token good for a day gives a pending login a day to wait… If *logging in* is seen hanging where somebody had already walked away, the change is a cap on top of that figure". A cap bounds the value from above. What arrived was a value from below, and nothing bounded that. The same document's claim that "a wrong seed costs exactly one attempt" holds for the seed and not for what replaces it: a wrong stored value costs every attempt after it.

The verification suite states the defect as a requirement, which is why it is green. `test/obsidian/plugin.test.js:4609-4617` asserts that the figure "comes from the realm rather than from a constant in the plugin", and it passes because the demo realm answers 1800. The production realm answers 1, and no check could have caught that: the two checks in `describe("the realm's own figure for how long a login may take")` assert where the number comes from, never that the login it governs can still be completed by a person.

Finally, and independently: none of this could be read off the log. The debug toggle covers `ensureAccessToken`, `searchDirectory` and `directoryStatus` (`main.ts:1343-1439`) and nothing of the login itself. With debug logging switched on, the log says nothing about which `state` was sent, which came back, how long the login was given, or which of the three branches in `handleAuthCallback` was taken. The diagnosis above came from reading `data.json` and the source, which is not a thing the person hitting this can be asked to do.

## What Changes

- **A login in progress is given a deadline the plugin decides**, sized for a person at a browser sign-in page — ten minutes — rather than inherited from whatever a token response last said. The quantity was wrong in kind, not merely wrong in value: how long a refresh token lives, or how much of a session is left, has nothing to do with how long a person takes to type a password and clear an MFA prompt.

- **`refreshTokenLifetimeSeconds` stops governing anything.** It is no longer read when a login starts, no longer written by `applyTokenResponse`, and no longer carried in `DEFAULT_DATA`. Every installation already holding a poisoned value — including the one this was found on — is well again on the first run of the new version, with nothing to reset and nothing to configure. A floor under the value would have been the smaller change and the wrong one: it would leave a realm's session arithmetic deciding a question that is not the realm's.

- **The login path is logged when debug logging is on**: a login starting, with the deadline it was given and when it will pass; a login expiring; and a callback arriving, with which of the three branches it took (completed, belonging to another window, no longer pending). Enough that the next failure of this shape is read off the log rather than reconstructed from the source. The `state` values themselves are logged truncated — they are the anti-forgery token of a login that may still be in flight, and a full one in a shared log is a real one.

- **The two checks that assert today's behaviour are rewritten**, not deleted. `a fresh installation carries the seed until a realm has answered` and `a real login against the configured realm completes, and what the realm answered is kept` (`test/obsidian/plugin.test.js:4564-4635`) both state that the realm's figure governs the login. What replaces them: a login started under a realm answer of `refresh_expires_in: 1` is still in progress a minute later, and a real login against the configured realm still completes. The first is the check that would have caught this; it does not exist today in any form.

- **`docs-keycloak.md:68-70` is corrected.** It currently tells a reader that the plugin gives a login in progress exactly `refresh_expires_in` to conclude, and that a deployment on a realm with different session settings needs nothing configured. The first half stops being true with this change; the second half stays true, for a better reason.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plugin-login-state`: the requirement "A login in progress expires on its own" says the lifetime is "bounded" and says nothing about where the bound comes from — which is the freedom the implementation used to take it from the realm. It is modified to fix the deadline as the plugin's own, long enough for a person to sign in, unaffected by what any token response says, and unshortenable by anything stored from an earlier version. A requirement is added for the course of a login being readable in the log when debug logging is on: the causes the existing "A failed login names what the plugin itself observed" produces ("nothing came back", "a login already given up on") are true of the browser and silent about a plugin-side deadline that made them inevitable, and no surface has room for the particulars that would have said so.

## Impact

- `main.ts` in the plugin repo (`/mnt/data/source/JAVASCRIPT/safeLearn-Obsidian-plugin`, reachable as `AI/plugin`) — `pendingLoginLifetimeMs()`, `applyTokenResponse`, `DEFAULT_DATA` and the `SafeLearnPluginData` comment at `main.ts:72-73`, plus new `debugLog` calls in `login()`, `expirePendingLogins()` and `handleAuthCallback()`.
- `test/obsidian/plugin.test.js` — the `describe("the realm's own figure for how long a login may take")` block, rewritten.
- `test/obsidian/harness.js` — `loginTokenFigures()` (`harness.js:1890`), which reads a field that is going away; `seedLoginFacts`'s `refreshTokenLifetimeSeconds` parameter (`harness.js:1597-1632`) is what a check needs to plant the poisoned value, so it stays and changes meaning.
- `docs-keycloak.md:68-70`.
- `AI/openspec/specs/plugin-login-state/spec.md` — through the delta above.
- Existing `data.json` files keep a now-unread `refreshTokenLifetimeSeconds` key. Nothing reads it, `Object.assign` over `DEFAULT_DATA` carries it along harmlessly, and it disappears from any file the plugin rewrites.

Not in scope: **why the realm answered 1.** It is worth knowing — an SSO Session Max that a long-running Obsidian sits at the end of is the likely answer — but the defect here is that the plugin adopted the number at all, and it stays a defect on a realm that answers sensibly. Measuring the realm belongs with the directory work in `AI/open-proposals.md`, not here.

Not in scope: **the callback that arrives twice.** While reading `handleAuthCallback` for this, a second path was noticed by which a late callback can overwrite the cause of the exchange that preceded it. Nothing observed in this report requires it, no instance of it has been seen, and a fix written against a mechanism nobody has watched fail is a guess. It is named here so that it is not re-derived from scratch next time.

Not in scope: **a setting for the deadline.** Ten minutes covers a password, an MFA prompt and a moment of hunting for the phone. A person for whom it does not can start again from every state, which `plugin-login-state` already requires.
