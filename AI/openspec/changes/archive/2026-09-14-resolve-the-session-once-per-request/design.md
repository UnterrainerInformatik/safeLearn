## Context

See proposal.md — Why. What shapes the approach:

- `hasRoles` (`utils.js:56`) rebuilds the entire evaluation context on every call: it reads `req.user.rolesCalculated`, merges the display name, calls `getClientRoles` — which does a synchronous `fs.readFileSync("keycloak.json")` — and awaits `getUserAttributes(req)`, an uncached `fetch` against `…/realms/<realm>/account`. Nothing in it is memoized.
- That `/account` call supplies **only** the three view preferences (`ve`, `vt`, `va`). The roles themselves never leave the process: they come from `req.user.rolesCalculated` (derived at login and again on every token refresh) and from `req.user.accessTokenDecoded.resource_access`. So the one network call this change removes is not a role lookup, which is why its failure can only narrow what is shown.
- `removeForbiddenContent` (`obsidian.js:806`) evaluates every inline block through `Promise.all(matches.map(async …))`. All of them start before any of them finishes, so a per-request cache that is not in flight from the first caller onward would still issue one lookup per block.
- The downgrade at `utils.js:134` **mutates** the role map — `delete r["teacher"]`, `delete r["teachers"]`, `delete r["admin"]`. That is safe today only because `r` is re-parsed from JSON on every call. The moment the map is shared across a request, this mutation is exactly the order dependence `role-resolution` forbids.
- `getActivePermissionRoles(permissions, referenceDate = new Date())` (`obsidian.js:278`) already takes its reference time as a parameter. Both call sites — `resolveFileVisibility:313` and `removeForbiddenContent:814` — omit it, so each one reads the clock for itself.
- The session store is this process's memory and sessions do not survive a restart (`keycloak-middleware.js:73`), so nothing has to be migrated and no stored shape has to stay compatible.
- `setUserAttribute` writes the whole account object back, so it must read the current attributes before merging — today a second `/account` call on top of every check the same request already made.

## Goals / Non-Goals

**Goals:**

- One evaluation context per request, built at most once, shared by every caller including concurrent ones.
- Every call site keeps its signature. `hasSomeRoles(req, roles, allowOverride)` stays what `obsidian.js` calls; what changes is what happens behind it.
- The rules in `role-resolution` produce the same answers they produce today, for every combination of roles, preferences and directives the corpus exercises.

**Non-Goals:**

- Caching across requests. A snapshot lives and dies with one request; nothing is carried into the next.
- Memoizing a decision per distinct directive — stated as out of scope in the proposal and unnecessary once a check is a set lookup.
- Touching `verifyCallerIdentity` in `middlewares/directory-service.js`, which authenticates the plugin by token introspection and never reaches `hasRoles`.
- Any change to how roles are derived from the LDAP claim or the access token.

## Decisions

### The snapshot is a promise held on `req`, not a value

`req.permissionContext` holds the *promise* of the context, assigned before the first `await` in the builder. Every caller awaits the same promise, so the concurrent fan-out in `removeForbiddenContent` produces one lookup rather than one per block.

*Why not a value assigned when the build finishes:* between the first caller's `fetch` and its resolution, the field would still be empty, and every other block of that `Promise.all` would start its own build. That is the current behaviour with extra steps.

*Why not eager, in middleware:* a request for a stylesheet or an image would then pay for a lookup it never asks a question with, and the spec requires the opposite. Lazy also keeps the existing middleware order untouched.

### The context carries two role sets, precomputed, and nothing is mutated after that

The builder produces both the full role set and the student-view set — the full one minus `teacher`, `teachers` and `admin` — and `hasRoles` selects between them by `allowOverride && vt == 0` instead of deleting from a shared map. `isAdmin`/`isTeacher` are recorded per set, since the exam gate reads them after the downgrade.

*Why both up front:* it is two small sets built once, and it removes the only write that a shared context would otherwise still perform. Copy-on-select would work too, but it puts an allocation on every one of the ~140 checks and leaves the mutation in the code for someone to reintroduce against the shared copy.

### The role set becomes a `Set`

Today the roles are a plain object and a check is `r[role]`. Two lowercase names inherited from `Object.prototype` are truthy there: `r["constructor"]` and `r["__proto__"]`. A directive reading `@@@ constructor` is therefore granted to every session — verified against the code path, which normalizes the directive's role to lower case and tests exactly that expression.

A `Set` has no prototype keys, so the "set intersection" the proposal describes closes this on the way past. This is not scope growth: the data structure is being rewritten either way, and `Set` is the structure the operation actually is.

*Note:* `rolesCalculated` stays the JSON string in the session it is today — `deriveRoles`, `getLdapGroups` and the test harness all read that shape. The `Set` is built from it inside the snapshot.

### The builder is its own module, and the snapshot is reached through `req`

A new `permission-context.js` next to `utils.js` holds the builder. It imports `getUserAttributes` from the middleware, and `utils.js` imports the builder from it — the same import direction `utils.js` already has today.

`setUserAttribute` lives in the middleware and must not import the builder back, or the two modules would import each other. It does not need to: the snapshot is on `req`, so a write reads `req.permissionContext` directly when one is there and falls back to its current fetch when it is not. The middleware keeps knowing nothing about how roles are assembled.

*Why not put the builder in the middleware:* the reserved-name rule, the plural aliasing and the student-view downgrade are `role-resolution` logic, and the middleware is the Keycloak wiring. Moving them there would file the permission rules under the identity provider's connection handling.

### The request's reference time is passed to the parameter that already exists

The builder records one `Date` and both call sites pass it into `getActivePermissionRoles`. No signature changes, and a permission window can no longer open or close halfway down a page.

### The snapshot holds the account response, and `setUserAttribute` merges from it

The builder keeps the raw `/account` answer alongside the parsed preferences. `getUserAttributes` keeps its two shapes — the full one and the one stripped of `userProfileMetadata`, `id`, `username`, `emailVerified` for the write-back — but derives both from the snapshot instead of fetching. A write then updates the snapshot with what it wrote, so `POST /userattributes` is a single lookup rather than two.

**One thing to settle while doing this:** `utils.js:78` reads the preferences as `attributes?.attributes?.config`, while `app.js:355` reads the same function's result as `attributes.config` and `attributes.lastVisitedUrl`. Both call `getUserAttributes(req)` with the same arguments, so at most one of the two readings can be right — and the middleware's own loop over `data.attributes` (`keycloak-middleware.js:277`) says it is the nested one. On that reading `app.js:355` never finds `config`, and "remember last visited page" (`sl == 1`) has never taken effect. The test harness pins `sl: 0` precisely so no check depends on it, so the suite would not have caught it. Giving the snapshot one canonical shape removes the ambiguity by construction; the task list verifies the preference actually works afterwards rather than assuming it.

### `keycloak.json` is read once, at startup

`initKeycloak` already reads it (`keycloak-middleware.js:35`). It is exported from there and `getClientRoles` reads `resource` from that export instead of calling `fs.readFileSync` on the event loop per check.

*Why not `req.user.keycloakConfig`:* the session carries a copy, but it is deployment configuration rather than session state, and reading it from the session would make `utils.js` depend on every session having been created by this build.

### A failed lookup settles the request once

The builder resolves to a context carrying the default preferences — `{ve: 0, vt: 0, va: 0}` — and logs once. That is today's per-check fallback, made per-request; the change ships no behavioural difference for a working identity provider and a consistent page instead of a mixed one when it fails. The roles are untouched, because they never came from the lookup, so the defaults only narrow: the teacher view off applies the student downgrade, the exam view off yields the practice variant, answers stay hidden.

*Rejected — refusing the request:* it trades availability for a guarantee that is not at stake. The preferences are view settings, not role grants, and their defaults are already the most restrictive values they can take.

*Rejected — carrying the last known preferences in the session:* it would keep a teacher's view alive across an outage, but it is a cache with its own staleness question, and it reintroduces cross-request state that this design otherwise removes.

The error path inside `hasRoles` keeps refusing (`utils.js:184`): a context that fails to build at all is a different failure from a lookup that returns nothing, and `role-resolution` already requires the refusal.

### The snapshot is discarded when the token is replaced

`refreshAccessToken` rebuilds `rolesCalculated` and merges fresh `userinfo`, so any context built before it is stale. It clears `req.permissionContext` at the end. In practice the refresh middleware runs before any route, and `sanitizeAndParseMarkdown` calls `refreshAccessToken` first thing (`app.js:107`) — so the common path builds the context after the refresh and never discards one.

## Risks / Trade-offs

- **A shared context is a shared mutable object if anything writes to it** → Everything the checks read is built before the promise resolves, and the downgrade is a selection rather than a deletion. The one legitimate write is `setUserAttribute` updating the preferences it just stored.
- **A test that asserts on lookup counts will fail for reasons unrelated to permissions** → It is worth having anyway: it is the only thing that stops the property this change buys from silently regressing, and the proposal names it. It asserts "at most one per rendered page", not an exact number, so an added route that asks no question does not break it.
- **Switching to a `Set` changes what `@@@ constructor` and `@@@ __proto__` do** → From "visible to everyone" to "visible to nobody". No corpus file uses either, and a directive naming a role nobody holds hiding its content is what `role-resolution` already specifies.
- **`app.js:355` may be relying on a shape that never worked** → Fixing it turns on a preference that has been dormant, which is a visible behaviour change for anyone whose stored `sl` is 1. It is the feature's documented purpose, and the tree/route behaviour is unchanged for `sl: 0`, which is what the harness and every account that never opened the setting have.

## Migration Plan

Nothing to migrate: sessions are in-process and discarded on restart, no stored format changes, and no route contract changes. The deployment is the ordinary one — safeLearn first, then the downstream merge into `secureLectures`.

Rollback is a revert: no data written by this change outlives a request.
