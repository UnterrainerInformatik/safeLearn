/**
 * Backs `GET /api/admin/directory/search`: verifying the caller and querying
 * the directory are two distinct Keycloak identities, kept apart here.
 *
 * The caller's own bearer token is checked against Keycloak's introspection
 * endpoint, authenticated with the existing `safeLearn` confidential client's
 * own credentials (`client` from `keycloak-middleware.js`) — no new secret for
 * that half. The directory itself is queried under a second, dedicated
 * confidential client (`DIRECTORY_SERVICE_CLIENT_ID`/`_SECRET`, service
 * accounts enabled, holding only `view-users`) that never sees the caller's
 * identity.
 */

import fs from "fs";

import { client, keycloakIssuer, deriveRoles } from "./keycloak-middleware.js";

function readKeycloakConfig() {
  return JSON.parse(fs.readFileSync("keycloak.json", "utf8"));
}

function adminApiBaseUrl() {
  const kc = readKeycloakConfig();
  const authServerUrl = kc["auth-server-url"].endsWith("/")
    ? kc["auth-server-url"]
    : `${kc["auth-server-url"]}/`;
  return `${authServerUrl}admin/realms/${kc.realm}/`;
}

// ################### Caller identity (3.1-3.3) ###################

const bearerPattern = /^Bearer\s+(\S+)$/i;

/**
 * The teacher/admin decision, split out as pure data in, pure flags out: no
 * introspection, no networking, so it can be unit-tested without a live
 * Keycloak (`client.introspect` cannot be substituted in a test process —
 * see `test/directory-service.test.js`).
 *
 * Merges the same two sources `hasRoles` (utils.js) merges for the session
 * path: the LDAP-derived group map and the client roles Keycloak assigned
 * directly. Either can carry "admin" or "teacher", independent of whether the
 * `ldap` claim is mapped onto the access token this endpoint sees. Both
 * sources canonicalize the plural client-role spelling (`teachers` ->
 * `teacher`, `students` -> `student`) the same way `deriveRoles`
 * (keycloak-middleware.js) already does for LDAP, so a caller recognized as a
 * teacher/admin anywhere else in the system is never refused here on account
 * of the role's plural spelling alone.
 */
export function resolveCallerRoles(ldap, resourceAccessRoles) {
  const roles = deriveRoles(ldap);
  if (Array.isArray(resourceAccessRoles)) {
    for (const role of resourceAccessRoles) {
      let normalized = typeof role === "string" ? role.trim().toLowerCase() : "";
      if (!normalized) continue;
      if (normalized === "teachers") normalized = "teacher";
      if (normalized === "students") normalized = "student";
      roles[normalized] = true;
    }
  }

  return { isAdmin: !!roles.admin, isTeacher: !!roles.teacher };
}

/**
 * Whether `req` carries proof of a currently valid teacher or admin identity.
 *
 * A missing header, a malformed bearer value, an inactive token, an
 * introspection call that itself fails, and a token that is active but holds
 * neither role, all collapse to the same `false` here — the route answers all
 * of them identically, so none becomes a way to tell the others apart.
 */
export async function verifyCallerIdentity(req) {
  const header = req.headers.authorization;
  const match = typeof header === "string" ? header.match(bearerPattern) : null;
  if (!match) {
    return { authorized: false };
  }

  let introspection;
  try {
    introspection = await client.introspect(match[1]);
  } catch (error) {
    console.error("Directory search: token introspection failed:", error);
    return { authorized: false };
  }
  if (!introspection?.active) {
    return { authorized: false };
  }

  const { isAdmin, isTeacher } = resolveCallerRoles(
    introspection.ldap,
    introspection.resource_access?.[client.client_id]?.roles
  );
  return { authorized: isAdmin || isTeacher };
}

// ################### Directory service client (4.1) ###################

let directoryServiceClient = null;
let directoryServiceTokenSet = null;

function getDirectoryServiceClient() {
  if (directoryServiceClient) return directoryServiceClient;

  const clientId = process.env.DIRECTORY_SERVICE_CLIENT_ID;
  const clientSecret = process.env.DIRECTORY_SERVICE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "DIRECTORY_SERVICE_CLIENT_ID / DIRECTORY_SERVICE_CLIENT_SECRET are not set; the directory " +
        "search endpoint cannot reach Keycloak's admin API without them. See docs-keycloak.md."
    );
  }
  directoryServiceClient = new keycloakIssuer.Client({
    client_id: clientId,
    client_secret: clientSecret,
  });
  return directoryServiceClient;
}

/**
 * Reused across calls until shortly before it expires — but callers that loop
 * (paginating the whole realm, looking up role-mappings user by user) must
 * call this again for every request rather than once up front and hold onto
 * the result: a realm large enough, and LDAP-federated enough, to take
 * several minutes to page through outlives a single 5-minute access token
 * mid-loop, and every request after that point failed with a 401 that looked
 * like a permissions problem (see the diagnostic logging in
 * `fetchDirectoryUserPage` below, which is how this was found).
 */
async function getDirectoryServiceToken() {
  if (directoryServiceTokenSet && directoryServiceTokenSet.expires_in > 30) {
    return directoryServiceTokenSet.access_token;
  }
  // TEMPORARY - isolating a live multi-minute hang with no error and no
  // AbortSignal.timeout ever firing on the page fetch below it: this line
  // tells whether the hang is here, in openid-client's own grant() request
  // (a different HTTP stack than fetch, undocumented default timeout), or
  // past it. Remove once that's answered.
  console.log("Directory search: requesting a fresh directory-service access token...");
  directoryServiceTokenSet = await getDirectoryServiceClient().grant({
    grant_type: "client_credentials",
  });
  console.log("Directory search: got a fresh directory-service access token.");
  return directoryServiceTokenSet.access_token;
}

// ################### Directory query (4.2-4.4) ###################

// Keycloak's own `search` parameter only matches username/name/email, so it
// cannot answer the role/group half of a query (a class name, `teacher`,
// `ExamParticipant`, ...) at all. Both halves are therefore matched in this
// backend against the realm's full user list, fetched unfiltered.
//
// Fetched at most once per this interval rather than once per search: the
// realm's directory changes rarely (a role or class reassignment, at most a
// few times a month), so a search that lands within the window reuses it.
const directoryCacheTtlMs = 10 * 60 * 1000;
let directoryUsersCache = null;
let directoryUsersCachedAt = 0;

/**
 * Node's `fetch` has no default timeout, so a Keycloak admin-API call that
 * hangs instead of erroring — observed live against a large, LDAP-federated
 * realm, seemingly on `briefRepresentation=false`'s per-user LDAP resolution,
 * while the same realm's own admin console lists users in under a second —
 * would otherwise block the whole fetch forever without ever reaching the
 * error handling below it. Generous enough for a slow-but-working page.
 */
const directoryApiTimeoutMs = 30 * 1000;

/**
 * A backstop for `AbortSignal.timeout` above: observed live, a Keycloak
 * admin-API response whose headers arrive quickly but whose body streams
 * far slower than `directoryApiTimeoutMs` did not reject via the signal —
 * `fetch`'s abort handling isn't guaranteed to cover body consumption across
 * every Node/undici version the same way. Racing against a plain timer does
 * not depend on that: whichever settles first wins, so the caller is always
 * released by `ms`, even though the loser (the fetch itself) keeps running
 * in the background rather than actually being cancelled. That's an accepted
 * cost — a dangling request is far cheaper than a search that never returns.
 */
export function withDeadline(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} did not complete within ${ms}ms`)), ms);
      timer.unref?.();
    }),
  ]);
}

/**
 * The in-flight fetch, while one is running — so a search that lands during
 * the startup warm-up (or during any other refresh) awaits that same fetch
 * instead of starting a second one alongside it against the same realm.
 */
let directoryUsersFetchPromise = null;

/**
 * The `safeLearn` client roles `user` holds, by user id — the realm's own
 * equivalent of an LDAP-derived group, and the one `hasRoles` (utils.js)
 * already treats as interchangeable with it for the session path. A realm
 * with no LDAP federation configured (nothing populates `LDAP_ENTRY_DN`, and
 * the demo realm this project tests against is exactly that) still grants
 * `teacher`, a class, or `examParticipant` this way, so the role/group half of
 * a search would otherwise find nothing on such a realm at all.
 */
async function fetchClientRoleNamesUnbounded(userId, token, resource) {
  const url = `${adminApiBaseUrl()}users/${userId}/role-mappings`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(directoryApiTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Keycloak admin role-mappings lookup answered with status ${response.status}`);
  }
  const mappings = await response.json();
  const clientMappings = mappings.clientMappings?.[resource]?.mappings;
  return Array.isArray(clientMappings) ? clientMappings.map((mapping) => mapping.name) : [];
}

function fetchClientRoleNames(userId, token, resource) {
  return withDeadline(
    fetchClientRoleNamesUnbounded(userId, token, resource),
    directoryApiTimeoutMs,
    `admin role-mappings fetch (user ${userId})`
  );
}

/**
 * Keycloak's admin user list is paginated, and asking for no page is not
 * asking for all of them: `GET users` without `max` answers at most
 * `Constants.DEFAULT_MAX_RESULTS` (100) users, and says nothing about there
 * being more. A realm larger than one page would silently become a directory
 * of whichever 100 users came first — every class beyond them missing from the
 * dropdown, and everyone beyond them unfindable by a search that reports no
 * match rather than a truncation. So pages are asked for explicitly until one
 * comes back short.
 */
const directoryPageSize = 100;

/** At most this many role-mappings lookups are in flight at once. */
const roleLookupConcurrency = 8;

/**
 * `Promise.all(items.map(...))`, but never more than `limit` of them in
 * flight. Results keep `items`' order. `onProgress(completed, total)`, if
 * given, fires after each item finishes — not in item order, since that's
 * exactly what the concurrency makes unpredictable.
 */
async function mapWithConcurrency(items, limit, mapper, onProgress) {
  const results = new Array(items.length);
  let next = 0;
  let completed = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
      completed++;
      onProgress?.(completed, items.length);
    }
  });
  await Promise.all(workers);
  return results;
}

// TEMPORARY - diagnosing a live 401 from the admin API that config inspection
// (role assignment, Full Scope Allowed, client scope) could not explain. Logs
// only the token's own unverified claims (never the token itself) plus
// whatever body Keycloak sent with the refusal - remove once resolved.
function unverifiedJwtClaims(token) {
  try {
    const payload = token.split(".")[1];
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch (error) {
    return { decodeError: String(error) };
  }
}

async function fetchDirectoryUserPageUnbounded(first, token) {
  const url = `${adminApiBaseUrl()}users?briefRepresentation=false&first=${first}&max=${directoryPageSize}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(directoryApiTimeoutMs),
  });
  if (!response.ok) {
    const bodyText = await response.text().catch(() => "<unreadable>");
    const { azp, aud, exp, iat, sub, iss } = unverifiedJwtClaims(token);
    console.error("Directory service admin API refusal - diagnostic:", {
      url,
      status: response.status,
      bodyText,
      tokenClaims: { azp, aud, exp, iat, sub, iss },
      nowUnixSeconds: Math.floor(Date.now() / 1000),
    });
    throw new Error(`Keycloak admin user search answered with status ${response.status}`);
  }
  const page = await response.json();
  return Array.isArray(page) ? page : [];
}

export function fetchDirectoryUserPage(first, token) {
  return withDeadline(
    fetchDirectoryUserPageUnbounded(first, token),
    directoryApiTimeoutMs,
    `admin user page fetch (first=${first})`
  );
}

/**
 * Every user across every page, asked for explicitly until one page comes
 * back short of `directoryPageSize` — split out from `fetchAllDirectoryUsers`
 * so this loop (the pagination fix itself) can be tested without also
 * exercising the service-account token grant, which does not go through
 * `fetch` and so cannot be stubbed the same way.
 *
 * Takes a token *provider*, not a token, and calls it before every page —
 * against a realm large enough to take several minutes to page through, the
 * token handed to the first page can no longer be trusted by the last one.
 *
 * The realm's total user count isn't known up front (Keycloak's paged `users`
 * endpoint doesn't report it), so progress here is one line per page rather
 * than a percentage. Each line ends in a newline on purpose, via `console.log`
 * rather than an accumulating `process.stdout.write(".")`: observed live,
 * Docker's log capture holds an incomplete (newline-less) line entirely,
 * so a run of bare dots with no newline between them stayed invisible in
 * `docker logs -f` for the run's whole duration — sometimes several minutes
 * — and only appeared as one burst once something (the loop's own end, or
 * the container dying) finally produced the newline. A fetch that was
 * actually progressing the whole time then looked indistinguishable from
 * one that had hung. One flushed line per page fixes that.
 */
export async function fetchAllUserPages(getToken) {
  const users = [];
  for (;;) {
    const token = await getToken();
    const page = await fetchDirectoryUserPage(users.length, token);
    users.push(...page);
    console.log(`Directory search: fetched page at first=${users.length - page.length} (${users.length} users so far)`);
    if (page.length < directoryPageSize) break;
  }
  return users;
}

async function fetchAllDirectoryUsers() {
  if (directoryUsersCache && Date.now() - directoryUsersCachedAt < directoryCacheTtlMs) {
    return directoryUsersCache;
  }
  if (directoryUsersFetchPromise) {
    return directoryUsersFetchPromise;
  }

  directoryUsersFetchPromise = (async () => {
    console.log("Directory search: cache stale or empty, fetching all users and role-mappings from Keycloak...");
    const startedAt = Date.now();
    const resource = readKeycloakConfig().resource;
    const users = await fetchAllUserPages(getDirectoryServiceToken);
    console.log(`Directory search: fetched ${users.length} users, now resolving their role-mappings...`);

    // One role-mappings call per user, since Keycloak offers no bulk form of it.
    // All of them at once was survivable while the list above was capped at a
    // single page; against a realm of several hundred it would open that many
    // sockets to Keycloak in one breath, and the failure that produces is a
    // directory that intermittently comes back empty. A small pool keeps the
    // fetch concurrent without that. Re-fetching the token per user (cheap once
    // valid — see getDirectoryServiceToken) rather than reusing the one from the
    // page loop above, for the same reason that loop no longer does either.
    //
    // Unlike the page loop above, the total here is known up front (`users.length`),
    // so progress is logged as the percentage actually done rather than a raw
    // count — one line per 5% crossed, not one per user.
    let lastPercentLogged = 0;
    const cache = await mapWithConcurrency(
      users,
      roleLookupConcurrency,
      async (user) => ({
        ...user,
        clientRoleNames: await fetchClientRoleNames(user.id, await getDirectoryServiceToken(), resource),
      }),
      (completed, total) => {
        const percent = Math.floor((completed / total) * 20) * 5;
        if (percent > lastPercentLogged) {
          lastPercentLogged = percent;
          console.log(`Directory search: role-mappings ${percent}% (${completed}/${total})`);
        }
      }
    );

    // Stamped now, at completion, rather than when the fetch above started:
    // against a realm slow enough for that fetch to take longer than
    // directoryCacheTtlMs, stamping the start would make the result stale
    // the instant it lands, and every following search would pay for a full
    // refetch again — including the one the startup warm-up exists to spare.
    directoryUsersCache = cache;
    directoryUsersCachedAt = Date.now();
    console.log(`Directory search: done, ${cache.length} users and their classes cached (${Date.now() - startedAt}ms).`);
    return cache;
  })();

  try {
    return await directoryUsersFetchPromise;
  } finally {
    directoryUsersFetchPromise = null;
  }
}

/** Mirrors how Keycloak's built-in "full name" mapper derives the ID token's `name` claim. */
function displayName(user) {
  const parts = [user.firstName, user.lastName].filter(
    (part) => typeof part === "string" && part.trim().length > 0
  );
  return parts.length > 0 ? parts.join(" ") : user.username ?? "";
}

/**
 * A directory user's role/group map, merging the same two sources
 * `verifyCallerIdentity` merges for the caller: whatever `deriveRoles` finds
 * in their `ldap` attribute, and their `safeLearn` client roles, canonicalized
 * the same way (`teachers` -> `teacher`, `students` -> `student`).
 */
function directoryUserRoles(user) {
  const roles = deriveRoles(user.attributes?.LDAP_ENTRY_DN?.[0]);
  for (const rawName of user.clientRoleNames ?? []) {
    let normalized = typeof rawName === "string" ? rawName.trim().toLowerCase() : "";
    if (!normalized) continue;
    if (normalized === "teachers") normalized = "teacher";
    if (normalized === "students") normalized = "student";
    roles[normalized] = true;
  }
  return roles;
}

/**
 * Matches `query` against every directory user's display name or role/group
 * map, case-insensitively, and maps each match down to `{ name, roles }` —
 * nothing else the directory holds for them.
 *
 * An empty (or missing) query returns the whole directory mapped the same
 * way, rather than an empty list: a caller that wants to enumerate every
 * role/group value the directory currently holds — `plugin-admin-directory-ui`'s
 * "list classes" — has no substring that is guaranteed to match everyone, and
 * this endpoint is the only source of that data. The caller is already gated
 * to a teacher or admin identity above, the same identity that could
 * reconstruct the same list today by sweeping single-character queries; this
 * just answers it directly instead.
 */
export async function searchDirectory(query) {
  const normalizedQuery = query.trim().toLowerCase();

  const users = await fetchAllDirectoryUsers();
  if (!normalizedQuery) {
    return users.map((user) => ({ name: displayName(user), roles: directoryUserRoles(user) }));
  }

  const matches = [];

  for (const user of users) {
    const name = displayName(user);
    const roles = directoryUserRoles(user);
    const nameMatches = name.toLowerCase().includes(normalizedQuery);
    const roleMatches = Object.keys(roles).some((role) => role.includes(normalizedQuery));
    if (nameMatches || roleMatches) {
      matches.push({ name, roles });
    }
  }

  return matches;
}
