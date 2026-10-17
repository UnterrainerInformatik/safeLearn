## Context

See proposal.md for the motivation. The code as it stands:

- `app.js` registers **every** route inside `initKeycloak(app).then(...)`. `initKeycloak` (`middlewares/keycloak-middleware.js`) reads `keycloak.json`, discovers the issuer over the network, checks `SESSION_SECRET` and mounts `express-session` and passport, and then registers `/test`, `/auth/callback`, `/logout` and `/logout/callback`. Without a reachable Keycloak nothing is served.
- `checkAuthenticated` stands in front of every content route and every static mount.
- `permission-context.js` builds the one context per request: `buildRoleViews(req)` assembles roles from `req.user.rolesCalculated` (LDAP OUs), `req.user.name` and the access token's client roles, and states explicitly that any future source of roles must be merged above the canonicalization. `buildPermissionContext` reads the preference block from `fetchAccount(req)`, which it only calls when `req.user.accessToken` exists. A missing or unparseable block already falls back to `defaultPreferences`.
- Preferences reach the browser through `GET /userattributes`, which answers `req.user`. `obsidian-page.js` reads `user.accessTokenDecoded.config` from it and writes through `POST /userattributes`, which stores the block as the Keycloak attribute `config`. `rememberLastVisited` stores `lastVisitedUrl` the same way, fire-and-forget, after the page has been sent. The `/` redirect reads it from the context's account.
- `getTopdownMenu` (`obsidian.js`) always renders the logout button. The teacher toggle is gated by `hasSomeRoles(req, ["teacher"], true)`. Because of the override flag it stays visible while the teacher view is off, so it is decided by the roles alone.
- `test/deployment-config.test.js` fails when a variable the application reads reaches no deployed instance, unless it is listed in `optionalWithDefault`.
- `test/harness.js` spawns `app.js` from the working tree with the inherited environment and logs in through `/test`.

## Goals / Non-Goals

**Goals:**

- One image, two authentication modes, chosen at start-up, with the safe outcome on every misconfiguration.
- The client script stays mode-agnostic. The page talks to `/userattributes` in both modes.
- The role and view rules are not duplicated. The reader roles enter the existing pipeline as one more source.

**Non-Goals:**

- No per-reader identity of any kind in `AUTH=none` (no name, no "who is reading").
- No protection of attachments. That is `attachment-access-control`, which should land first.
- No switch at run time. Changing the mode means restarting the instance.
- No change to the Obsidian plugin. It has no login without an identity provider, and its directory features are absent there.

## Decisions

### D1: One module decides the mode before anything is mounted

A new `auth-mode.js` reads `AUTH`, `READER_ROLES` and the identity-requiring switches once at start-up and returns `{ mode: "keycloak" | "none", readerRoles: Set }` or terminates the process with a message, following the pattern `SESSION_SECRET` uses today. The order is:

1. Normalize `AUTH` (trim, lowercase). Unset counts as `keycloak`. Anything other than `keycloak` or `none` → exit.
2. If `none`: each entry of `identityRequiringSwitches` (initially only `["EXAM_MODULE", "on"]`) that is on → exit, naming both variables.
3. If `keycloak`: `initKeycloak` runs as today, so a missing `keycloak.json` still ends the start. The message is extended to name `AUTH=none` as the deliberate alternative.

The switch list sits in this module, not in the exam module, so the check works before the exam module exists and does not require loading it. *Alternative:* the exam module refuses on its own when it sees `AUTH=none`. Rejected because the module is loaded lazily and only when its switch is on, so the check would depend on code that, per the plan, is not loaded in this situation.

*Alternative:* derive the mode from whether `keycloak.json` exists. Rejected, because that turns a missing file into a public site, which rule 1 of the plan forbids.

### D2: Routes are registered by one function, with the identity layer passed in

The body of `initKeycloak(app).then(...)` moves into `registerRoutes(app, identity)`. `identity` carries `checkAuthenticated`, the preference store (D4) and a flag for whether login surfaces exist. In `keycloak` mode it is built from the middleware as today, after `initKeycloak` resolves. In `none` mode, `checkAuthenticated` is `(req, res, next) => next()` and `initKeycloak` is never called. That means no issuer discovery, no `express-session`, no passport, no login routes and no `SESSION_SECRET` check.

The directory search and status routes are registered only in `keycloak` mode. Unregistered, they fall through to the catch-all, which answers them as unserved paths. The same applies to `/test`, `/auth/callback`, `/logout` and `/logout/callback`. `/convert` does not appear here: the separate change `remove-convert-route` removes it in every mode, so this change has nothing left to gate.

*Alternative:* keep `initKeycloak` and stub it with a fake issuer. Rejected: every caller would still have to tell "no identity provider" from "a session that failed", and the code would pretend to have sessions it does not have.

### D3: Reader roles are one more source in `buildRoleViews`

`READER_ROLES` is parsed once (split on `,`, `normalizeRole`, empties dropped) by `auth-mode.js`. In `none` mode, `buildRoleViews` adds those roles to the set **above** the canonicalization block, exactly where its comment asks future sources to go. It reads no `req.user` at all. The plural aliasing, the admin short-circuit, the student-view downgrade and the exam gate then apply unchanged. Reader roles bypass the reserved-name check deliberately: that check guards *display names* against standing in for a role, and `READER_ROLES` is a role source that the operator controls, like a client role.

`req.user` stays undefined in `none` mode. Every guard that already tests `req.user`/`accessToken` (`fetchAccount`, `getUserAttributes`, `setUserAttribute`, `getLdapGroups`) therefore keeps doing nothing, and `getClientRoles` returns `null` because `keycloakConfig` was never read.

### D4: Preferences and the last visited page in cookies, through the same endpoint

The server needs `vt`, `ve` and `va` while it renders, so `localStorage` (which never reaches the server) cannot hold them. Two cookies:

- `safelearn_config`: the same JSON block that Keycloak stores as the attribute `config`, URL-encoded.
- `safelearn_last`: the last visited URL.

Both are `HttpOnly`, `SameSite=Lax`, `Path=/`, with `Max-Age` of one year, and `Secure` when the request arrived over HTTPS (`trust proxy` is already set).

The **endpoint stays.** In `none` mode, `POST /userattributes` validates the body as JSON, refuses blocks over 3 KB (`{ success: false }`, keeping the cookie well under the 4 KB browser limit), and answers with `Set-Cookie`. `GET /userattributes` answers `{ accessTokenDecoded: { config } }`, which is exactly the field `obsidian-page.js` reads, built from the cookie. `buildPermissionContext` takes `account = { attributes: { config, lastVisitedUrl } }` from the cookies, so the `/` redirect and `parsePreferences` work unchanged. This saves a cookie parser dependency: the two names are read from `req.headers.cookie` by a small function in the same module.

`rememberLastVisited` gets the response in `none` mode and sets `safelearn_last` **before** `res.send`. Today it runs after the page is sent, which is fine for a Keycloak write but too late for a header.

*Alternative:* the client writes `document.cookie` itself and keeps `localStorage` for everything the server does not need. Rejected: that would give the client two storage paths and a mode it has to know about. With the endpoint unchanged, `obsidian-page.js` needs no change apart from the logout button. It also lets the cookies be `HttpOnly`.

**Which store is authoritative depends on the mode, and only one is ever read.** *Settled with Gerald; the remaining open details are listed below.* Under `AUTH=none` the request is the store, with the cookie as its carrier. Under `AUTH=keycloak`, and later with the database, the server **never** takes preferences from request input. It reads them only from the identity's own store (Keycloak user attributes today, the DB later) and ignores anything the request carries. Honouring a request-supplied block there would open a side channel past that store: a page, link or script that can set a cookie for the origin could change what a logged-in teacher's render shows, and through `setUserAttribute`'s read-merge-write it could even end up stored. In code this is one branch in `buildPermissionContext` and in the `/userattributes` handlers, chosen by the mode from D1. The `keycloak` branch does not read the two cookie names at all. Checked by the `anonymous-publishing` requirement "Preferences are taken from the request only where there is no identity" and a harness check with a forged cookie against a real teacher session (D7).

Settled by Gerald on 2026-10-17:
- A stray `safelearn_config`/`safelearn_last` cookie under `keycloak` mode is **only ignored, never actively cleared**. The server sends no `Set-Cookie` for these names in `keycloak` mode. Switching a browser between a tier-1 and a tier-2 instance of the same origin therefore leaves the tier-1 preferences intact for the next tier-1 visit.

Open details, which do not change the approach:
- Cosmetic keys are config parameters by Gerald's definition (D4a), so they follow the same rule. This is no longer open.
- How the rule reads once the DB holds preferences (exam-module follow-up). The store changes, the principle does not.

The cookies are under the reader's own control, just as their own Keycloak attributes are today. They can change which *view* is chosen, never which *roles* are held (D3). The exam gate still requires `teacher` or `admin` from the reader roles.

### D4a: Config parameters and render parameters

*Defined by Gerald.* Every parameter a request can carry belongs to exactly one of two classes:

1. **Config parameters**: per-user preferences that are persisted. They come from the authoritative store (Keycloak user attributes, later the DB). Only under `AUTH=none` may the request supply them, carried in the cookies of D4. Under `AUTH=keycloak` request input for them is ignored and the value from the store takes its place.
2. **Render parameters**: the presentation of one request. They are always taken from the request in every tier, never persisted, and never overridden by the store. They **live in the URL** (query string) and are never moved into a cookie, `localStorage` or any other store. *Decided by Gerald:* a presentation, document or print view must stay bookmarkable, and a cookie would make the same URL render differently depending on what the browser happens to hold. Today all of them already are query parameters (inventory below), so this holds by construction and must stay that way.

**Invariant:** a render parameter only selects presentation. It never changes which content a reader may see: roles, view pseudo-roles (`#exam`, `#practice`, `#answer`), or the student-view downgrade. Anything that affects visibility is a config parameter (`role-resolution`: "A render parameter never changes what a reader may see").

Inventory of the code as of this change:

| Parameter | Where | Class | Affects visibility | Note |
| --- | --- | --- | --- | --- |
| `vt` teacher view | `config` → `permission-context.js` (downgrade) | config | **yes** | |
| `ve` exam view | `config` → exam/practice gate | config | **yes** | |
| `va` answer view | `config` → `#answer` gate (`utils.js`) | config | **yes** | |
| `sl` start with last page | `config` → `/` redirect (`app.js`) | config | no | |
| `lastVisitedUrl` | Keycloak attribute, `rememberLastVisited` | config | no | Written by the server, not the client |
| `dm` light/dark | `config`, client | config | no | cosmetic |
| `fs` font size, `s` line spacing | `config`, client | config | no | cosmetic |
| `tf`/`t`, `ntf`/`nt` fonts | `config`, client | config | no | cosmetic. `t`/`nt` are the legacy numeric form |
| `?reveal` | `app.js` → `wrapInReveal` | render | no | content is filtered before the split |
| `?document` | `app.js` → `wrapAsDocument` | render | no | |
| `?print-pdf` | `obsidian-page.js` → Reveal print | render | no | read by Reveal on the client |
| `?heading`, `&occurrence` | search result links → client scroll | render | no | |
| `?q` | `/search`, `/api/admin/directory/search` | render | no | results are filtered by the request's context |
| ~~`?url`~~ | ~~`/convert`~~ | gone | — | removed with `/convert` by `remove-convert-route` |
| `?context` | `/hot-reload` | render | no | the endpoint answers no content |

Settled with Gerald on 2026-10-17:

- **`?q`** (corpus and directory search) and **`?context`** (`/hot-reload`) are **render parameters**. Both are taken from the request and never persisted, and neither can widen what a reader sees: search results are filtered by the request's context, and `/hot-reload` answers no content. No third class is needed.
- **`lastVisitedUrl`** stays a config parameter that the server writes as a side effect of rendering. Under `AUTH=none` the server therefore sets the `safelearn_last` cookie without the reader asking for it. This is accepted: it is the only way "remember last visited page" can work without an identity provider.

### D4b: Attachments in tier 1 use the full decision, without a session

`attachment-access-control` (a dependency, `openspec/changes/attachment-access-control/design.md`) decides an attachment request in two steps. A **grant** is recorded in the express session when a corpus page is rendered, valid for 10 minutes and invalidated by a global `grantEpoch`. A request without a live grant falls back to the **full decision** through the corpus index and block filtering, which needs no session. That change explicitly left the anonymous-session question to this one.

**Decision: tier 1 keeps no session and relies on the full decision, memoized process-wide.**

- In tier 1 every reader holds the same role set (`READER_ROLES`). The only thing that differs between readers is the three visibility config parameters `vt`, `ve` and `va` from the cookie, which give 8 combinations at most. A decision therefore depends on `(attachment path, vt, ve, va)` alone. The memo is keyed by that tuple plus the attachment change's `grantEpoch`, which is already bumped on every scan and on every time-window change in visibility. The first request for an attachment in a given view costs one full decision (file reads, no identity-provider call, since there is none). Every later request from any reader costs a map lookup. The memo is bounded by attachments × 8 and is dropped as a whole on an epoch bump.
- *Alternative: an anonymous express session.* That would reuse the grant path unchanged. Rejected: it needs `express-session` and a `SESSION_SECRET` again, which tier 1 has just dropped (`deployment-surface`). On a public site it grows server memory per visitor, bots included, with no login to bound it, which is a cheap memory-exhaustion vector. And it would buy nothing, since the memo is shared across readers and therefore better than per-session grants.
- *Alternative: the full decision without a memo.* Correct but wasteful. One file read per image request is acceptable at classroom scale, but the memo is a few lines and makes a public instance cheap. If the memo turns out to complicate the attachment change's code, falling back to the bare full decision is an acceptable simplification that does not change the specs.

The grant-recording code path of the attachment change is simply not taken in tier 1 (no `req.session`). The attachment change's own rule that a write to `POST /userattributes` invalidates that session's grants has no counterpart here, because the memo key already contains the view.

### D5: The menu knows the mode

`getTopdownMenu` renders the logout button only when the identity layer offers a logout. The toggles are not touched: they are decided by `hasSomeRoles`, which already sees the reader roles through D3.

### D6: Deployment and templates

- `deploy/docker-compose.yml`: `AUTH=keycloak` as a **literal** in `environment:`, not interpolated from `deploy/.env`, so a missing line in the generated `.env` cannot drop it. `test/deployment-config.test.js` asserts that literal and lists `READER_ROLES` in `optionalWithDefault` ("no roles"). `EXAM_MODULE` is handled by the exam-module change.
- Both WYSIWYG templates: `.env` gains `AUTH=none` and `READER_ROLES=teacher` with a comment that deleting the line hides all restricted content. `SESSION_SECRET` becomes a commented-out line for the Keycloak variant. `docker-compose.yml` passes `AUTH` and `READER_ROLES`, and the `keycloak.json` volume line is commented out. Bind-mounting a file that does not exist makes Docker create a *directory* in its place, which would break a later switch back. `docs-wysiwyg.md` documents both variants, with `AUTH=none` as the default.

### D7: Harness

`test/harness.js` gains `startAnonymous({ readerRoles, env })`. It spawns a second instance from the working tree on its own port, with `AUTH=none` and the given roles, and returns a page that has opened the start page directly instead of `/test`. A helper `expectRefusedStart(env)` spawns with the given environment and asserts that the process exits non-zero within the startup timeout without ever answering HTTP. A new `test/anonymous.test.js` covers the scenarios of `anonymous-publishing` and `browser-verification` against the existing test corpus (`md/test-fileperms-*`, `md/test-exam-practice-question.md`). It runs inside `npm test`, needs no Keycloak and stays green offline. The one check that crosses modes, a forged preference cookie against a `teacher` session, belongs to the Keycloak-backed checks (`test/checks/permissions.js` or `views.js`). It uses `setPreferences` to set the stored exam view off, sets the cookie with the page's `setCookie`, renders the exam/practice page, and compares the stored block before and after.

## Risks / Trade-offs

- [A teacher publishes a tier-1 instance with `READER_ROLES=teacher`] → This is by decision a matter of trust (plan, rule 3). Mitigation: at start-up, an instance in `none` mode whose reader roles include `teacher` or `admin` logs one warning saying that every reader of this instance sees teacher content. The code default stays "no roles".
- [Attachments referenced only from restricted sections become public] → `attachment-access-control` lands first. If it does not, the README of the templates must say so. Recorded as a dependency in the proposal.
- [The deployed instance loses `AUTH`] → The literal in compose plus the deployment test. And even if it is lost, an unset `AUTH` means `keycloak`, so the failure is closed.
- [Cookies are not shared between `localhost:8081` and another port] → Intended: preferences are per browser and per instance.
- [`registerRoutes` is a large mechanical move in `app.js`] → It moves without behaviour change in its own task, verified by the full existing suite before any `none`-mode code is added.
- [The client still reloads on a 401] → In `none` mode no route answers 401, so this path is dead there and harmless.

## Migration Plan

1. Land `registerRoutes` alone (pure move) and run the whole suite.
2. Add `auth-mode.js`, the `none` branch, the cookies and the menu change. An unset `AUTH` keeps every existing deployment on `keycloak`, so nothing changes for production at this point.
3. Add `AUTH=keycloak` to `deploy/docker-compose.yml` and the deployment test, then sync to secureLectures in the usual order.
4. Switch the WYSIWYG templates and docs.

Rollback: revert. Deployed instances never depend on the new mode, and template users fall back to the Keycloak variant by restoring the `keycloak.json` mount.

## Open Questions

- Cookie names (`safelearn_config`, `safelearn_last`) can be adjusted during implementation without touching the specs.
- The open details of the preference-source rule are listed under D4.
- Ordering against `remove-convert-route`: independent. If that change has not landed when this one is applied, `/convert` stays registered in `none` mode; raise it with Gerald before shipping tier 1.
