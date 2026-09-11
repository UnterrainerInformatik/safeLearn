/**
 * Backs `GET /api/admin/directory/search`: verifying the caller and querying
 * the directory are two distinct Keycloak identities, kept apart here.
 *
 * The caller's own bearer token is checked against Keycloak's introspection
 * endpoint, authenticated with the existing `safeLearn` confidential client's
 * own credentials (`client` from `keycloak-middleware.js`) — no new secret for
 * that half. The directory itself is queried under a second, dedicated
 * confidential client (`DIRECTORY_SERVICE_CLIENT_ID`/`_SECRET`, service
 * accounts enabled, holding `view-users` and `view-events`) that never sees
 * the caller's identity.
 */

import fs from "fs";
import path from "path";

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
 *
 * The in-flight grant, while one is running — observed live once bisection
 * (see `bisectFailingRange`) could fan out into a couple dozen concurrent
 * callers: with a stale token and no lock here, every one of them saw the
 * same "expired" check and started its own `grant()`, logging 823 "requesting
 * a fresh token" against only 69 "got a fresh token" in one run — a request
 * storm against Keycloak's token endpoint on top of the page-fetch fan-out
 * itself. Concurrent callers now await the one grant already underway,
 * mirroring the `directoryUsersFetchPromise` dedup above.
 */
let directoryServiceTokenGrantPromise = null;

async function getDirectoryServiceToken() {
  if (directoryServiceTokenSet && directoryServiceTokenSet.expires_in > 30) {
    return directoryServiceTokenSet.access_token;
  }
  if (directoryServiceTokenGrantPromise) {
    return directoryServiceTokenGrantPromise;
  }

  directoryServiceTokenGrantPromise = (async () => {
    console.log("Directory search: requesting a fresh directory-service access token...");
    directoryServiceTokenSet = await withDeadline(
      getDirectoryServiceClient().grant({ grant_type: "client_credentials" }),
      directoryApiTimeoutMs,
      "directory-service token grant"
    );
    console.log("Directory search: got a fresh directory-service access token.");
    return directoryServiceTokenSet.access_token;
  })();

  try {
    return await directoryServiceTokenGrantPromise;
  } finally {
    directoryServiceTokenGrantPromise = null;
  }
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

function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

/**
 * Retries a transient failure in one call rather than letting it take the
 * whole fetch down — observed live against a ~14,000-user realm: a single
 * page far into the run hit `directoryApiTimeoutMs` once, and because
 * nothing retried, that one timeout discarded every page already fetched in
 * the same run (the disk cache below is only written at the very end) and
 * left the in-memory cache empty too. `attemptFn` is a thunk, not a promise,
 * so each attempt (including re-fetching a token — see the callers) starts
 * fresh rather than re-awaiting whatever failed the first time. `delayMs`
 * (default 1000, scaled by attempt number) exists as a parameter rather than
 * a hardcoded constant so tests can make retries near-instant instead of
 * actually waiting seconds per attempt.
 */
export async function withRetry(attemptFn, attempts, label, delayMs = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await attemptFn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.error(`Directory search: ${label} failed (attempt ${attempt}/${attempts}), retrying:`, error.message);
        await delay(delayMs * attempt);
      }
    }
  }
  throw lastError;
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

async function fetchDirectoryUserPageUnbounded(first, token, max, brief, timeoutMs) {
  const url = `${adminApiBaseUrl()}users?briefRepresentation=${brief}&first=${first}&max=${max}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
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

/**
 * `max`/`brief`/`timeoutMs` default to a normal full page fetch; `bisectFailingRange`
 * below is the only caller that overrides them, asking for a narrower range with a
 * shorter deadline (or, at its base case, a `brief` representation) once a full page
 * has already proven it hangs.
 */
export function fetchDirectoryUserPage(
  first,
  token,
  { max = directoryPageSize, brief = false, timeoutMs = directoryApiTimeoutMs } = {}
) {
  return withDeadline(
    fetchDirectoryUserPageUnbounded(first, token, max, brief, timeoutMs),
    timeoutMs,
    `admin user page fetch (first=${first}, max=${max})`
  );
}

async function fetchDirectoryUserCountUnbounded(token) {
  const response = await fetch(`${adminApiBaseUrl()}users/count`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(directoryApiTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Keycloak admin user count answered with status ${response.status}`);
  }
  return await response.json();
}

/**
 * A single number, not a fetch of every user — cheap enough to ask on every
 * cache refresh as a first check: if it still matches what the disk cache
 * below was built from, and that cache isn't too old, the whole multi-minute
 * pagination-and-role-mappings fetch can be skipped entirely.
 */
export function fetchDirectoryUserCount(token) {
  return withDeadline(fetchDirectoryUserCountUnbounded(token), directoryApiTimeoutMs, "admin user count fetch");
}

/**
 * Persisted at `directoryCacheFilePath`, mounted at deploy/docker-compose.yml's
 * `${DATA_DIR}:/app/data` so it survives a redeploy, not just a process
 * restart — without that mount, every push would force the next search back
 * through the fetch this cache exists to spare it from.
 */
const directoryCacheFilePath = path.join("data", "directory-cache.json");

/**
 * How long a disk cache (or an in-progress fetch's checkpoint) is trusted
 * once its stored count still matches Keycloak's current count, on a realm
 * where `isDirectoryCacheFresh`'s admin-events check can't be consulted. A
 * matching count only rules out someone being added or removed — a role or
 * class reassignment on an existing user changes nothing about it — so this
 * bounds that blind spot as a fallback, where admin-events would otherwise
 * close it precisely.
 */
const diskCacheMaxAgeMs = 24 * 60 * 60 * 1000;

export function readDirectoryDiskCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(directoryCacheFilePath, "utf8"));
    if (typeof parsed.count !== "number" || typeof parsed.cachedAt !== "number" || !Array.isArray(parsed.users)) {
      return null;
    }
    return { ...parsed, skipped: Array.isArray(parsed.skipped) ? parsed.skipped : [] };
  } catch {
    return null;
  }
}

/** `skipped` (default none) carries forward any records `bisectFailingRange` gave up identifying below. */
export function writeDirectoryDiskCache(users, count, skipped = []) {
  try {
    fs.mkdirSync(path.dirname(directoryCacheFilePath), { recursive: true });
    fs.writeFileSync(directoryCacheFilePath, JSON.stringify({ count, cachedAt: Date.now(), users, skipped }));
  } catch (error) {
    console.error("Directory search: failed to write the disk cache (next restart will refetch from scratch):", error);
  }
}

// ################### Resumable fetch-in-progress checkpoint ###################

/**
 * Where an in-progress fetch's checkpoint is written after every page, so a
 * restart mid-fetch resumes near where it left off instead of paginating a
 * realm the size of `AI/open-proposals.md`'s first=14200 case (~14,000 users,
 * ~2.5s/page) from `first=0` again. Split into a small meta file, rewritten
 * whole each time, and an append-only log of the pages themselves: rewriting
 * every user fetched so far as one JSON document on every single page would
 * be O(pages²) of disk I/O by the end of a long fetch, where appending one
 * line per page is O(page size) each time.
 */
const directoryFetchProgressMetaPath = path.join("data", "directory-fetch-progress.meta.json");
const directoryFetchProgressPagesPath = path.join("data", "directory-fetch-progress.jsonl");

/**
 * The in-progress checkpoint, if one exists and is well-formed. `nextFirst` is
 * the actual Keycloak pagination offset to resume at — distinct from the
 * returned `users.length` once any records have been skipped (see
 * `bisectFailingRange`), since a skip doesn't shift Keycloak's own offsets.
 */
export function readDirectoryFetchProgress() {
  try {
    const meta = JSON.parse(fs.readFileSync(directoryFetchProgressMetaPath, "utf8"));
    if (
      typeof meta.targetCount !== "number" ||
      typeof meta.updatedAt !== "number" ||
      typeof meta.nextFirst !== "number" ||
      !Array.isArray(meta.skipped)
    ) {
      return null;
    }
    const users = [];
    for (const line of fs.readFileSync(directoryFetchProgressPagesPath, "utf8").split("\n")) {
      if (!line) continue;
      const page = JSON.parse(line);
      if (Array.isArray(page)) users.push(...page);
    }
    return { ...meta, users };
  } catch {
    return null;
  }
}

/** Appends one page's worth of successfully-fetched users — never rewrites what's already on disk. */
export function appendDirectoryFetchProgressPage(users) {
  try {
    fs.mkdirSync(path.dirname(directoryFetchProgressPagesPath), { recursive: true });
    fs.appendFileSync(directoryFetchProgressPagesPath, `${JSON.stringify(users)}\n`);
  } catch (error) {
    console.error("Directory search: failed to append a fetch-progress page (a restart won't be able to resume past this point):", error);
  }
}

export function writeDirectoryFetchProgressMeta(targetCount, skipped, nextFirst) {
  try {
    fs.mkdirSync(path.dirname(directoryFetchProgressMetaPath), { recursive: true });
    fs.writeFileSync(
      directoryFetchProgressMetaPath,
      JSON.stringify({ targetCount, nextFirst, skipped, updatedAt: Date.now() })
    );
  } catch (error) {
    console.error("Directory search: failed to write fetch-progress meta (a restart won't be able to resume past this point):", error);
  }
}

/** Called once a fetch finishes (successfully or by falling back to a fresh restart) — the checkpoint is superseded either way. */
export function clearDirectoryFetchProgress() {
  for (const filePath of [directoryFetchProgressMetaPath, directoryFetchProgressPagesPath]) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Already gone - nothing to clear.
    }
  }
}

// ################### Change detection (admin-events) ###################

async function fetchLastUserAdminEventTimeUnbounded(token) {
  const url = `${adminApiBaseUrl()}admin-events?resourceTypes=USER&max=1&direction=desc`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(directoryApiTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Keycloak admin-events lookup answered with status ${response.status}`);
  }
  const events = await response.json();
  if (!Array.isArray(events) || events.length === 0) return null;
  return typeof events[0]?.time === "number" ? events[0].time : null;
}

/**
 * The timestamp of the most recent change Keycloak's admin-events log recorded
 * against any user, or `null` if that can't be determined — Admin Events isn't
 * enabled on this realm, or the service account lacks `view-events` (see
 * "Directory search client" in docs-keycloak.md), or the call itself failed.
 * `null` means "unknown", not "nothing changed" — `isDirectoryCacheFresh` below
 * falls back to the plain age check it used before this existed.
 */
export function fetchLastUserAdminEventTime(token) {
  return withDeadline(fetchLastUserAdminEventTimeUnbounded(token), directoryApiTimeoutMs, "admin-events lookup").catch(
    (error) => {
      console.error("Directory search: admin-events check unavailable, falling back to count+TTL only:", error.message);
      return null;
    }
  );
}

/**
 * Whether previously-cached directory data (a completed disk cache, or an
 * in-progress fetch's checkpoint) can still be trusted, given Keycloak's
 * current user count. A count mismatch is always decisive — someone was added
 * or removed. When the count still matches, Keycloak's admin-events log is
 * asked whether anything happened to *any* user since `cachedAtMs`: a role or
 * class reassignment leaves the count unchanged but is exactly what that log
 * catches, closing the blind spot a count-only check always had. If the log
 * can't be consulted, this falls back to the plain age bound (`diskCacheMaxAgeMs`)
 * used before Admin Events was wired up — so nothing breaks on a realm where
 * it isn't enabled.
 */
export async function isDirectoryCacheFresh(storedCount, cachedAtMs, serverCount, token) {
  if (storedCount !== serverCount) return false;
  const lastChange = await fetchLastUserAdminEventTime(token);
  if (lastChange !== null) return lastChange <= cachedAtMs;
  return Date.now() - cachedAtMs < diskCacheMaxAgeMs;
}

// ################### Bisecting a page that won't come back ###################

/**
 * Timeout for fetches made while isolating the exact record behind an already
 * 3x-timed-out page (see `bisectFailingRange`) — deliberately shorter than
 * `directoryApiTimeoutMs`. By the time this runs, the full-size page is
 * already known to hang, and every sub-range here covers far fewer users, so
 * a genuinely healthy sub-range's LDAP resolution work is proportionally
 * smaller too; there's nothing to gain from waiting out the full 30s per
 * attempt just to reconfirm what's already suspected.
 */
const directoryBisectionTimeoutMs = 8 * 1000;

/**
 * Retry backoff while bisecting: fixed and short, not scaled per attempt the
 * way the outer page loop's is. This isn't waiting out transient load — it's
 * confirming a reproducible hang — so there is no reason to pace it the same
 * way. Together with the shorter timeout above, this cuts the walk from a
 * failing page down to a single offset from roughly 10 minutes to 2-3.
 */
const directoryBisectionRetryDelayMs = 200;

/**
 * Recursively narrows `[first, first+len)` until the single offset causing a
 * page to hang is found, instead of letting one bad record take the whole
 * multi-minute fetch down. A range that fetches cleanly (even after retrying)
 * is kept whole; a range that still fails 3x is halved and each half recursed
 * into independently — so more than one bad record in the same page is found
 * too, not just the first. At the base case (`len === 1`) the offset itself is
 * the culprit: since even its full representation hangs, one extra lightweight
 * `briefRepresentation=true` lookup is tried purely to identify it (`id`,
 * `username`) for the caller to report — if that also hangs, only the offset
 * is known and reported.
 */
async function bisectFailingRange(first, len, getToken) {
  try {
    const page = await withRetry(
      async () => fetchDirectoryUserPage(first, await getToken(), { max: len, timeoutMs: directoryBisectionTimeoutMs }),
      3,
      `admin user page fetch (first=${first}, max=${len}, bisecting)`,
      directoryBisectionRetryDelayMs
    );
    return { users: page, consumed: page.length, skipped: [] };
  } catch {
    if (len === 1) {
      let identity = null;
      try {
        const [user] = await fetchDirectoryUserPage(first, await getToken(), {
          max: 1,
          brief: true,
          timeoutMs: directoryBisectionTimeoutMs,
        });
        if (user) identity = { id: user.id, username: user.username };
      } catch {
        // Even the lightweight brief lookup hangs - report the offset alone.
      }
      return { users: [], consumed: 1, skipped: [{ offset: first, ...identity }] };
    }

    const leftLen = Math.ceil(len / 2);
    const rightLen = len - leftLen;
    const [left, right] = await Promise.all([
      bisectFailingRange(first, leftLen, getToken),
      bisectFailingRange(first + leftLen, rightLen, getToken),
    ]);
    return {
      users: [...left.users, ...right.users],
      consumed: left.consumed + right.consumed,
      skipped: [...left.skipped, ...right.skipped],
    };
  }
}

/** Entry point for `fetchAllUserPages`: splits straight away rather than re-trying the already-known-bad full page at the shorter timeout first. `len` is that page's actual requested width, capped near `targetCount` by the caller — not assumed to always be `directoryPageSize`. */
function bisectFailingPage(first, len, getToken) {
  const leftLen = Math.ceil(len / 2);
  const rightLen = len - leftLen;
  return Promise.all([
    bisectFailingRange(first, leftLen, getToken),
    bisectFailingRange(first + leftLen, rightLen, getToken),
  ]).then(([left, right]) => ({
    users: [...left.users, ...right.users],
    consumed: left.consumed + right.consumed,
    skipped: [...left.skipped, ...right.skipped],
  }));
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
 * `resumeFrom` seeds a restart from an earlier checkpoint (`readDirectoryFetchProgress`)
 * instead of `first=0` — `nextFirst` is Keycloak's own pagination offset, which
 * a skipped record doesn't shift, so it can't be derived from `users.length`
 * once any exist. `onPage`, if given, fires after every page (a normal one or
 * a bisected one) with that page's newly-fetched users, the skip list so far,
 * and the new `nextFirst` — `fetchAllDirectoryUsers` uses it to checkpoint to
 * disk as it goes, rather than only once the whole fetch finishes.
 *
 * A page whose fetch fails 3x no longer takes the whole run down with it: it's
 * handed to `bisectFailingPage` to isolate the exact offset(s) responsible (see
 * there), which are excluded and logged, and pagination continues past them —
 * see `AI/open-proposals.md`'s first=14200 case, the reason this exists.
 *
 * `targetCount` (Keycloak's own `GET users/count`, already fetched by
 * `fetchAllDirectoryUsers` before this runs) hard-stops the loop once
 * `first` reaches it, *before* issuing another request — belt-and-suspenders
 * alongside the short-page check below, not a replacement for it, but the one
 * that actually matters on an LDAP-federated realm: confirmed live against
 * `auth.htl-leonding.ac.at` (14,289 users) that Keycloak never answers a
 * clean short/empty page once `first` runs past the real end of federated
 * data — every offset from there on hangs individually instead, which
 * `bisectFailingPage` would otherwise "resolve" one at a time, forever,
 * without `targetCount` ever ruling those offsets out. `resumeFrom.skipped`
 * is filtered to `offset < targetCount` for the same reason: a checkpoint
 * from before this bound existed can carry exactly that kind of phantom
 * "skipped" run past the real end, which would otherwise be reported as
 * suspect records rather than dropped as the artifact they are.
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
export async function fetchAllUserPages(getToken, resumeFrom = {}, onPage, targetCount = Infinity) {
  const users = [...(resumeFrom.users ?? [])];
  const skipped = [...(resumeFrom.skipped ?? [])].filter((entry) => entry.offset < targetCount);
  let first = resumeFrom.nextFirst ?? 0;
  while (first < targetCount) {
    // Capped to what targetCount says actually remains, once close to it: asking
    // Keycloak for a full directoryPageSize width past that point is exactly how
    // the phantom past-the-end hang above was found - never ask for it at all.
    const pageWidth = Math.min(directoryPageSize, targetCount - first);
    let page;
    let consumed;
    let newlySkipped = [];
    try {
      page = await withRetry(
        async () => fetchDirectoryUserPage(first, await getToken(), { max: pageWidth }),
        3,
        `admin user page fetch (first=${first})`
      );
      consumed = page.length;
    } catch (error) {
      console.error(
        `Directory search: page fetch at first=${first} failed 3x (${error.message}) — bisecting to isolate the failing record...`
      );
      const resolved = await bisectFailingPage(first, pageWidth, getToken);
      page = resolved.users;
      consumed = resolved.consumed;
      newlySkipped = resolved.skipped;
      for (const bad of newlySkipped) {
        console.error(
          `Directory search: record at offset ${bad.offset} consistently times out — skipped, continuing.` +
            (bad.id ? ` id=${bad.id} username=${bad.username}` : " identity unresolvable.")
        );
      }
    }
    users.push(...page);
    skipped.push(...newlySkipped);
    first += consumed;
    console.log(
      `Directory search: fetched through first=${first} (${users.length} users so far` +
        `${skipped.length ? `, ${skipped.length} skipped` : ""})`
    );
    onPage?.({ page, skipped, nextFirst: first });
    if (consumed < pageWidth) break;
  }
  return { users, skipped };
}

async function fetchAllDirectoryUsers() {
  if (directoryUsersCache && Date.now() - directoryUsersCachedAt < directoryCacheTtlMs) {
    return directoryUsersCache;
  }
  if (directoryUsersFetchPromise) {
    return directoryUsersFetchPromise;
  }

  directoryUsersFetchPromise = (async () => {
    console.log("Directory search: in-memory cache stale or empty — checking Keycloak's user count before deciding whether to refetch...");
    const startedAt = Date.now();
    const resource = readKeycloakConfig().resource;
    const token = await getDirectoryServiceToken();
    const serverCount = await fetchDirectoryUserCount(token);

    const disk = readDirectoryDiskCache();
    if (disk && (await isDirectoryCacheFresh(disk.count, disk.cachedAt, serverCount, token))) {
      console.log(
        `Directory search: disk cache matches Keycloak's count (${serverCount}) and nothing changed since — ` +
          "reusing it, skipping the full fetch."
      );
      directoryUsersCache = disk.users;
      directoryUsersCachedAt = Date.now();
      return disk.users;
    }

    const progress = readDirectoryFetchProgress();
    let resumeFrom = { users: [], skipped: [], nextFirst: 0 };
    if (progress && (await isDirectoryCacheFresh(progress.targetCount, progress.updatedAt, serverCount, token))) {
      console.log(
        `Directory search: resuming an in-progress fetch at first=${progress.nextFirst} ` +
          `(${progress.users.length} users already fetched, ${progress.skipped.length} skipped so far).`
      );
      resumeFrom = progress;
    } else {
      if (progress) {
        console.log(
          "Directory search: an in-progress fetch checkpoint exists but the count changed (or something else did) " +
            "— discarding it and starting over."
        );
      }
      clearDirectoryFetchProgress();
    }

    console.log(
      disk
        ? `Directory search: disk cache is stale (had ${disk.count} users, Keycloak now reports ${serverCount}, ` +
            "or something changed) — doing a full fetch..."
        : `Directory search: no usable disk cache (Keycloak reports ${serverCount} users) — doing a full fetch...`
    );
    const { users, skipped } = await fetchAllUserPages(
      getDirectoryServiceToken,
      resumeFrom,
      ({ page, skipped: skippedSoFar, nextFirst }) => {
        appendDirectoryFetchProgressPage(page);
        writeDirectoryFetchProgressMeta(serverCount, skippedSoFar, nextFirst);
      },
      serverCount
    );
    console.log(
      `Directory search: fetched ${users.length} users` +
        `${skipped.length ? ` (${skipped.length} skipped after repeated timeouts)` : ""}, now resolving their role-mappings...`
    );

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
        clientRoleNames: await withRetry(
          async () => fetchClientRoleNames(user.id, await getDirectoryServiceToken(), resource),
          3,
          `admin role-mappings fetch (user ${user.id})`
        ),
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
    writeDirectoryDiskCache(cache, serverCount, skipped);
    clearDirectoryFetchProgress();
    console.log(
      `Directory search: done, ${cache.length} users and their classes cached` +
        `${skipped.length ? `, ${skipped.length} record(s) skipped: ${JSON.stringify(skipped)}` : ""} ` +
        `(${Date.now() - startedAt}ms).`
    );
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
