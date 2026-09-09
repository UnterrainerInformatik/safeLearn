## Context

See `proposal.md` — Why. What matters here is the shape the code has now.

The login is spread over facts that live in four places and are read directly by whoever needs them: `accessToken` and `accessTokenExpiresAt` in memory (`main.ts:163-165`), `data.refreshToken` on disk, `pendingLogins` keyed by `state` (`main.ts:169`), and nothing at all for a failure — a failed exchange writes to `console.error` and is gone (`main.ts:375`). `hasLogin()` (`main.ts:305`) collapses the first of those into a boolean, and that boolean is what the command palette (`main.ts:250`) and the settings tab (`main.ts:571-593`) render from. There is exactly one redraw in the whole plugin, `this.settingTab?.display()` at `main.ts:385`, and it exists because the one path that was noticed to be broken was patched where it broke.

Three constraints shape everything below:

- **`directory-search` makes two refusals identical on purpose.** A caller with no identity and a caller with neither role get the same answer. `searchDirectory` (`main.ts:468`) honours that by returning `[]` for any refusal. Whatever this change shows must not become the side channel that tells them apart.
- **`plugin-directory-auth` requires silence without a configured instance.** Not an error, not an empty control — absent.
- **A callback is not delivered to the window that asked for it.** `obsidian://` goes to whichever window is frontmost. This is not a defect to fix; it is the environment.

## Goals / Non-Goals

**Goals:**

- One place computes the login state, and every surface renders from that one place.
- Every transition reaches every surface, without a surface having to know it should look again.
- A cause survives long enough to be read, in a form three surfaces can render at three lengths and a check can assert on without reading prose.
- The states, the stray callback and the expiry are reachable in a verification run.

**Non-Goals:**

- No change to how the identity is obtained: PKCE, the browser, the client id, the token storage and the refresh are as they are. This change is about what is known and shown, not about the exchange.
- No coordination between windows. Neither a file outside the vault nor a broadcast channel nor a lock. Each window says what it has in front of it.
- No change to `searchDirectory`'s behaviour on refusal, and no login state derived from a server answer.
- No retry policy for a failed refresh. `refreshAccessToken` (`main.ts:408`) clears and gives up, deliberately (`tasks.md #5.4` of the change that built it); it gains a reported cause, not a retry.

## Decisions

### The state is derived, not stored alongside the facts

One function computes the state from what is already held: an unexpired `accessToken` plus its own claims give *logged in* or *logged in without the directory role*; a live entry in `pendingLogins` gives *logging in*; a recorded last failure that nothing has superseded gives *login failed*; anything else is *not logged in*. Only two things are newly stored, both because nothing holds them today: an age on each `pendingLogins` entry, and the last failure.

*Alternative considered:* a `state` field written at each transition. Rejected — a stored state can disagree with the tokens, and a surface that renders a state disagreeing with what a call will actually do is the bug in this proposal, one level up.

### One notifier, and every surface subscribes

A single `notifyLoginStateChanged()` is called wherever a fact changes — after the exchange, after a refresh, on logout, on expiry, on a rejected callback — and it redraws the status-bar item, redraws the settings tab if it is open, and raises a Notice if the state name or the failure cause differs from the last one announced. `main.ts:385`'s lone `this.settingTab?.display()` becomes one of its effects rather than a call site.

*Alternative considered:* each site redraws itself where it changes something. Rejected — that is the current arrangement, and it is why exactly one of five paths redraws anything.

### Three surfaces, three lengths, one cause

The status-bar item carries the state name and lasts as long as the state does. The Notice carries the transition and one sentence, once. The settings tab carries the state, its particulars and what to do about it. All three read the same value; none of them computes anything.

The status-bar item opens the plugin's settings when clicked, since every remedy the settings tab names is in the settings tab. It is registered only while an instance is configured and removed when that setting is cleared, which is what `plugin-directory-auth`'s silence rule requires of it.

### A failure is a tagged cause, not a message

`{ kind: "provider-refused", status: 400 }`, `{ kind: "instance-unreachable" }`, `{ kind: "no-callback" }`, and so on — the enumeration the spec names. Each surface renders the tag at its own length.

*Alternative considered:* an English string built where the failure happens. Rejected on two counts: a check would have to assert on prose, so every rewording breaks a test; and the three surfaces would each want a different length of the same sentence, which a string cannot give them.

The tag is produced only where the plugin has first-hand knowledge — `requestUrl`'s transport failure, the status the token endpoint answered with, the parameters a callback carried, the URL that could not be built. Never from a `searchDirectory` result. That is the whole of the boundary, and it is an invariant of where causes may be constructed rather than a judgement made per case.

### The role keeps being read from the plugin's own token

`hasDirectoryRole()` (`main.ts:316`) already decodes the held access token locally and never asks the server. It is unchanged, and it is what separates *logged in* from *logged in without the directory role*. This is why that fifth state does not violate `directory-search`: it is a statement about a token the plugin holds, made without any request having been refused.

### The start-up restore becomes a pending login

`main.ts:260` stays un-awaited — holding Obsidian's start on a network round trip is the thing that comment is there to prevent. It registers a pending entry before it fires, so the state derives as *logging in* for the interval, and calls the notifier when it settles either way.

### Expiry runs on a timer, not on the next read

A pending entry that passes its age moves the state to *login failed* by itself, because a status-bar item that only corrects itself when somebody opens the settings is the same defect wearing a different hat. The timer is registered through `registerInterval` so Obsidian tears it down with the plugin.

*Alternative considered:* checking the age wherever the state is computed. Rejected — nothing recomputes the state while the person is reading it.

### A callback for another window is reported where it lands

The silent `return` at `main.ts:366` becomes a Notice and a state that says a login begun in another window arrived here. It names no vault: the callback carries a `state` this window has never seen, so there is nothing to name, and inventing a name would be a claim the plugin cannot support. The window still waiting learns nothing from this and falls to its own expiry — which is exactly the honest answer, since from there a callback that went elsewhere and a callback that never existed are the same observation.

*Alternative considered:* a marker outside the vault that both windows read. Rejected as a non-goal above: it introduces shared state, its own staleness and its own failure modes, to shorten a wait that the expiry already ends.

### The lifetime of a login in progress comes from the realm, not from a constant

A login in progress lives as long as the token it is trying to obtain would live. The plugin already refreshes — `ensureAccessToken` (`main.ts:449`) renews before every directory call, through `refreshAccessToken` (`main.ts:408`) — so the operative figure is the refresh token's lifetime and not the access token's.

Keycloak sends both with every successful exchange and the plugin keeps one of them: `applyTokenResponse` (`main.ts:441-444`) reads `expires_in` for the in-memory access-token expiry and drops `refresh_expires_in` on the floor. That second value is kept from now on, in `data.json` beside the refresh token it describes, and it is the lifetime a pending login is given.

The first login on a fresh install has no such value, because nothing has answered yet. It is seeded with Keycloak's own default for `refresh_expires_in` — the realm's SSO Session Idle, thirty minutes out of the box — and the first successful exchange replaces the seed with what the realm actually answered. A wrong seed costs exactly one attempt: it decides only how long the very first login waits before giving up, and starting again is reachable from every state.

*Alternative considered:* a fixed constant in the source, which is what the Open Question this replaces was asking for a number for. Rejected on the ground the answer names — the realm already knows the figure and already sends it, and a constant would be a second copy of it, free to be wrong on every deployment that is not this project's own.

### The harness reaches the states through the plugin instance it already holds

`test/obsidian/harness.js:450` already waits on `window.app.plugins.plugins["safelearn-formatter"]`, so a check can drive the plugin object directly rather than through the interface. `assembleVault` already writes and deletes the plugin's `data.json` (`harness.js:355-362`), so a stored refresh token can be seeded before start to reach the restore state. A callback is delivered by invoking the plugin's registered protocol handler through the page instead of through the OS URL scheme. Where Obsidian keeps that handler was established by probing a running harness page (task 1.1, Obsidian 1.13.7): `registerObsidianProtocolHandler` lands in `app.workspace.protocolHandler.handlers`, a `Map` keyed by the action name — `safelearn-formatter-auth` among Obsidian's own dozen — whose values are the handler functions themselves. Beside that `Map` sits `protocolHandler.dispatch`, which is what Obsidian's own URL dispatch calls, and it is the route a check takes: it reads `action` off the one object it is passed, looks the handler up in that `Map` and calls it with the whole object, so `dispatch({ action: "safelearn-formatter-auth", state, code })` delivers a callback along the same path an `obsidian://` URL would, rather than reaching around it. It takes one argument and not two; called with the action as a separate first argument it silently does nothing, which is a way for a check to pass against anything, so the harness owns that call rather than each check writing it out. A check that cannot find the handler must fail naming what it looked for, as `plugin-verification` requires. Pointing the Keycloak URL at an unreachable host and at one that answers with a status is how the two failure families are provoked without a real realm.

## Risks / Trade-offs

- **Obsidian shows no status bar on mobile** → the status-bar item is an addition, never the only place a state is readable. The Notice and the settings tab carry the state on every platform, which is what the spec requires; the status bar is what makes it readable *without* the settings on desktop.
- **A Notice per transition becomes noise if the background refresh flaps** → the notifier announces only a change in the state name or in the failure cause. A successful renewal that leaves the state *logged in* announces nothing, and a repeated identical failure announces once.
- **Naming the status Keycloak refused with could read as leaking configuration** → it is the person's own screen, about their own attempt, and it is a fact of a request the plugin itself made. Nothing here reads or repeats how the safeLearn server answered.
- **Five states, an expiry and a stray callback are new territory for the plugin suite, and could grow into a second harness** → the reach is the plugin instance and `data.json`, both of which the harness already has; nothing new is started, mocked or served.
- **The refresh token's lifetime is doing two jobs at two scales** — on a realm with long sessions a refresh token good for a day gives a pending login a day to wait, long after a person would have given up on a browser round trip. Accepted as it stands, because the figure comes from the one place that knows it. If *logging in* is seen hanging where somebody had already walked away, the change is a cap on top of that figure, not a different source for it.
- **The derived state has more inputs than the boolean it replaces, so a wrong derivation is a wrong screen everywhere at once** → it is one function with no side effects, called from one notifier, and every scenario in `plugin-login-state` is a case of it.
