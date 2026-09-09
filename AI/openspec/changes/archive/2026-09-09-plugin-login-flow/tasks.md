All work in groups 1–4 is in the companion repository reached through the gitignored `AI/plugin` symlink, in `main.ts` and `styles.css`. Groups 5 and 6 are in this repository. Take them in this order: nothing can be shown until there is one state to show, and nothing can be verified until the harness can reach it.

## 1. One state, computed in one place

- [x] 1.1 Establish how Obsidian holds a registered `obsidian://` protocol handler, so a check can deliver a callback through the renderer instead of the OS URL scheme — the one unknown `design.md` leaves for the first task. Verify by evaluating in a running harness page that the handler registered at `main.ts:239` can be reached and invoked, and record what was found in `design.md` before building on it.
- [x] 1.2 Give each `pendingLogins` entry (`main.ts:169`) a start time and the instance URL it was started against, and record the last failure as a tagged cause rather than a `console.error`. Verify the plugin compiles and an existing login still completes end to end in a harness run.
- [x] 1.3 Add the single derivation that returns one of the five states of `plugin-login-state` from the tokens, the pending entries and the last failure, with no side effects. Verify with checks that construct each of the five situations and assert the state that comes back, including *logged in without the directory role* against a token carrying neither role.
- [x] 1.4 Add `notifyLoginStateChanged()` and call it wherever a fact changes — after the exchange, after a refresh, on logout, on expiry, on a rejected callback — replacing the lone `this.settingTab?.display()` at `main.ts:385` with one of its effects. Verify that a login completed with the settings tab open still redraws that tab, which is the behavior the current patch delivers and this must not lose.
- [x] 1.5 Register the start-up restore at `main.ts:260` as a pending entry before firing it, and notify when it settles. Verify a harness run seeded with a stored refresh token reads as *logging in* immediately after start and as *logged in* once the renewal lands, with the start of the application not held up.
- [x] 1.6 Keep `refresh_expires_in` from every successful token response in `data.json` beside the refresh token it describes — `applyTokenResponse` (`main.ts:441-444`) currently reads `expires_in` and drops it — and seed it with Keycloak's default of thirty minutes where nothing has answered yet. Verify a check that reads the stored value back after a real exchange against the configured realm, and one that finds the seed in place on a fresh `data.json`.

## 2. Where the state is read

- [x] 2.1 Add a status-bar item carrying the current state, registered only while an instance URL is configured and removed when that setting is cleared, opening the plugin settings when clicked. Verify a check reads the state from the status bar with the settings closed, and that no status-bar item exists at all while no instance is configured.
- [x] 2.2 Rebuild the settings tab's login block (`main.ts:571-593`) to render the state and its particulars — since when and against which instance for *logging in*, who for either logged-in state, the cause for *login failed* — instead of the `hasLogin()` ternary. Verify each of the five states renders its own text and its own controls in a harness run.
- [x] 2.3 Raise a Notice from the notifier on a change of state name or of failure cause, and only then. Verify that a successful background renewal that leaves the state *logged in* raises nothing, and that a repeated identical failure raises one Notice rather than one per attempt.
- [x] 2.4 Style the status-bar item and the settings tab's state block in `styles.css`. Verify by eye in a real Obsidian on the vault the harness assembles, in both the light and the dark theme.

## 3. What a failure is allowed to say

- [x] 3.1 Introduce the tagged causes the spec enumerates — instance unreachable, Keycloak URL or realm unresolvable, provider refused with its status, callback carried no code, redirect not registered, cancelled, expired without a callback — and construct them only at the sites that observe them first-hand: the `requestUrl` call in `applyTokenResponse`, `refreshAccessToken` (`main.ts:408`), and `handleAuthCallback` (`main.ts:363-386`). Verify a check for each cause, provoking it against a Keycloak URL pointed at an unreachable host and at one that answers with a status.
- [x] 3.2 Render each cause at the three lengths the surfaces need, from the tag and never from a prose string passed along. Verify the checks assert on the tag, so that rewording any of the three texts breaks no check.
- [x] 3.3 Confirm the boundary holds: `searchDirectory` (`main.ts:468`) still returns `[]` for every refusal, feeds nothing into the login state, and `hasDirectoryRole()` (`main.ts:316`) still reads only the held token. Verify with a check that a refused directory request leaves the shown state untouched, whichever of the two grounds the server refused on.

## 4. The stray callback and the expiry

- [x] 4.1 Replace the silent `return` at `main.ts:366` with a reported state saying a login begun in another window arrived here, naming no vault, and obtaining no identity. Verify with a check that delivers a callback carrying a `state` the plugin is not waiting on and reads back both the report and the absence of an identity.
- [x] 4.2 Report the missing-code exit at `main.ts:369` as its own cause rather than returning silently. Verify with a check delivering a callback whose `state` matches and which carries no code.
- [x] 4.3 Expire a pending login on a timer registered through `registerInterval`, moving the state to *login failed* with the cause naming that no callback arrived, and drop the entry. Verify a check that starts a login, advances past the lifetime without a callback, and reads the state change with nothing having been clicked. The lifetime is the stored refresh-token lifetime from 1.6, read at the moment the login is started, never a constant in the source.
- [x] 4.4 Report a callback that arrives for an already-expired login as belonging to a login no longer in progress, obtaining no identity from it. Verify with a check that expires a login and then delivers its callback.
- [x] 4.5 Make starting a login reachable from every state and ending one in progress reachable from *logging in*, with starting again superseding any login already in progress rather than adding to it. Verify with a check that starts a second login while one is pending and finds exactly one entry left.

## 5. Verification

- [x] 5.1 Extend `test/obsidian/harness.js` with what the checks above need and nothing more: seeding the plugin's `data.json` before start (the file `assembleVault` already removes at `harness.js:355-362`), delivering a callback through the handle established in 1.1, and reading the status-bar item. Verify the harness still starts a clean run and every existing check in `test/obsidian/plugin.test.js` still passes.
- [x] 5.2 Land the checks from groups 1–4 in `test/obsidian/plugin.test.js`, one per scenario in `plugin-login-state` and per changed scenario in `plugin-directory-auth`. Verify the full plugin suite passes against a freshly built plugin, and that a run that cannot reach a state fails naming what it looked for rather than reporting an empty pass, as `plugin-verification` requires.
- [x] 5.3 Run `npm test` in this repository unchanged and confirm nothing in the content or deployment suites moved. Verify the run is green and `test/coverage-map.json` needed no edit, which is what `proposal.md` — Impact asserts.

## 6. Writing it down

- [x] 6.1 Record in `AI/architecture.md` §9 anything this change accepts as a divergence — at minimum that no status bar exists on mobile, so the state is read there from the settings tab and the Notice alone. Verify the section reads as a decision with its reason, not as a defect left open.
- [x] 6.2 Record what `auth.unterrainer.info` actually answers for `expires_in` and `refresh_expires_in` on the `safeLearn` realm, so the figure a pending login gets is a known one rather than an inferred one. Verify by reading both out of one real exchange in a harness run and noting them where `docs-keycloak.md` already documents the realm.
