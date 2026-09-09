Source proposal: `AI/proposals/plugin-login-flow.md`

## Why

A teacher clicked "Log in". The browser opened and came straight back — the safeLearn session in that browser was still valid, so Keycloak had nothing to ask — and Obsidian still read "Log in". A second click did the same. Hours later, on the other side of a suspend, the settings tab said "Logged in" and the classes were there. The login had succeeded on the first click. Nothing said so, and that is the defect: not that the exchange failed, but that a person could not tell it had worked.

The acute cause is repaired. `handleAuthCallback` now redraws the settings tab (`main.ts:385`), so a tab left open no longer goes on offering "Log in" after a login that in fact succeeded. That fixed one path, and only for as long as that one tab is open.

What is left is the shape of the thing. `hasLogin()` (`main.ts:305`) is `this.accessToken !== null` — one boolean — and it is the only question anything asks: the command palette gates on it (`main.ts:250`), the settings tab renders from it (`main.ts:571-593`). Situations a person has to tell apart collapse into it:

- **Startup restores in the background.** `onload` fires `refreshAccessToken()` without awaiting it (`main.ts:260`), deliberately, so Obsidian's start is not held on a network round trip. Until it lands the plugin reads exactly as "not logged in", and nothing redraws when it does.
- **A logged-in account without the role the directory requires is a distinct situation.** `hasDirectoryRole()` (`main.ts:316`) already computes it, but only the settings tab's description text ever shows it.
- **A login in flight is not a state at all.** `login()` (`main.ts:325`) opens the browser and returns; the button it was clicked on still says "Log in".
- **A callback that never arrives leaves its entry in `pendingLogins` (`main.ts:169`) forever.** Nothing expires it, and nothing can cancel it.
- **`handleAuthCallback` drops three cases without a word:** an unknown `state` (`main.ts:366`), a missing `code` (`main.ts:369`), and a failed token exchange, which does raise a Notice (`main.ts:376`) but names no cause — the status Keycloak answered with goes to `console.error`, where nobody looks.

The unknown-`state` case is the one that reads as nothing having happened. `obsidian://` callbacks are dispatched to whichever Obsidian window is frontmost, not to the vault that started the login. The vault that receives a callback it did not start is the one vault that knows what became of that login, and it is today the one that stays silent.

## What Changes

- **The login has five named states**, and everything that shows the login shows one of them: not logged in; logging in, since when and against which instance; logged in, as whom; logged in but without the role the directory requires; failed, with the reason. `hasLogin()` stays what it is — one question about whether a call can be made — and stops being what the interface is rendered from.
- **The state is readable outside the settings tab.** A status-bar item carries the current state for as long as it lasts, because the callback lands minutes after the click and by then the person is looking elsewhere. A Notice announces the transition and nothing else. The settings tab stays the long form: the reason, and what to do about it. The status-bar item obeys `plugin-directory-auth`'s existing silence rule and is absent — not empty, not neutral — while no instance is configured.
- **A failure names what failed**, out of what the plugin knows on its own: no identity held; the configured instance could not be reached; the Keycloak URL or realm does not resolve; Keycloak refused the token exchange, with its status; the redirect is not registered on the client; the callback carried no `code`. What is `console.error` today becomes what the person reads.
- **The boundary of what may be said is written down rather than weighed again each time.** The plugin may name what it observed itself. It may not differentiate the server's refusal: `directory-search` deliberately makes "not logged in" and "holds neither role" indistinguishable in a refused search, and nothing added here may hand a caller a way around that. `hasDirectoryRole()` is not an exception to that rule — it reads the plugin's own token locally and never the server's answer.
- **A callback that belongs to another vault is reported by the vault that receives it.** The silent `return` at `main.ts:366` becomes a visible statement that a login begun in another vault arrived here. The vault still waiting gets a timeout, since from where it stands a callback that went elsewhere and a callback that never existed look identical. The two vaults are not made to know about each other: each says only what it has in front of it.
- **Retrying and cancelling are reachable from every state**, "logging in" and "failed" included. Today the settings tab offers "Log in" or "Log out" and has nothing in between.
- **A login in flight expires.** An entry in `pendingLogins` gets an age and is dropped when it passes that age, which is also what turns "logging in" into "failed: the callback never arrived" without anybody having to click.
- **A restored login is visible while it is being restored.** The un-awaited refresh at `main.ts:260` falls under *logging in* rather than under *not logged in*, so the window between Obsidian starting and the token landing reads as what it is, and its outcome redraws whatever is showing. It is not a sixth state: a restore is a login in progress that nobody clicked for.

## Capabilities

### New Capabilities

- `plugin-login-state`: what a person can tell about the plugin's login at any moment. It owns the five states and their names, where each one is shown and for how long, what a failed login is allowed to say and the line it may not cross, the treatment of a callback that reaches the wrong vault, the expiry of a login in flight, and the rule that retrying and cancelling are reachable wherever a person happens to be standing.

### Modified Capabilities

- `plugin-directory-auth`: two of its requirements change. *A held identity survives a restart and renews itself* is silent about the interval between the restart and the renewal, which in the code is a real interval because the restore is deliberately not awaited; it gains the statement that this interval is shown as itself and not as being logged out. *Logging in never hands a password to the plugin* has a scenario "A login is abandoned" that ends at "the plugin holds no identity"; it gains that the abandonment is reported, not merely true. The capability's silence rule — nothing that depends on a configured instance draws attention to its own absence while none is configured — is unchanged, and governs everything this change adds.

## Impact

- **`main.ts` in the plugin repository** (through the gitignored `AI/plugin` symlink): a login state replaces the booleans read at `main.ts:250`, `main.ts:305` and `main.ts:571-593`; `pendingLogins` (`main.ts:169`) gains a timestamp and an expiry; `handleAuthCallback` (`main.ts:363-386`) stops returning silently at each of its exits and reports instead; `refreshAccessToken` (`main.ts:408`) and the un-awaited call at `main.ts:260` report their outcome; a status-bar item is added in `onload`, where the plugin registers none today.
- **`styles.css`** in the same repository: the status-bar item, and whatever the settings tab's state block needs beyond a `Setting`.
- **`test/obsidian/plugin.test.js` and `test/obsidian/harness.js`**: `plugin-verification` requires that a run can reach each state the plugin behaves differently in. Five states, a callback landing in the wrong vault and a login expiring are not reachable by typing into a document, so how the harness reaches them is a design question and not a detail.
- **`test/coverage-map.json` is untouched.** It records which check guards which file in this repository; the plugin suite is not among its entries, and this change does not add it.
- **`AI/architecture.md`** for anything this accepts as a divergence.
