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

  // The same two sources `hasRoles` (utils.js) merges for the session path:
  // the LDAP-derived group map and the client roles Keycloak assigned
  // directly. Either can carry "admin" or "teacher", independent of whether
  // the `ldap` claim is mapped onto the access token this endpoint sees.
  const roles = deriveRoles(introspection.ldap);
  const resourceRoles = introspection.resource_access?.[client.client_id]?.roles;
  if (Array.isArray(resourceRoles)) {
    for (const role of resourceRoles) {
      const normalized = typeof role === "string" ? role.trim().toLowerCase() : "";
      if (normalized) roles[normalized] = true;
    }
  }

  const isAdmin = !!roles.admin;
  const isTeacher = !!roles.teacher;
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

/** Fetched once and reused until shortly before it expires, not per search. */
async function getDirectoryServiceToken() {
  if (directoryServiceTokenSet && directoryServiceTokenSet.expires_in > 30) {
    return directoryServiceTokenSet.access_token;
  }
  directoryServiceTokenSet = await getDirectoryServiceClient().grant({
    grant_type: "client_credentials",
  });
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
 * The `safeLearn` client roles `user` holds, by user id — the realm's own
 * equivalent of an LDAP-derived group, and the one `hasRoles` (utils.js)
 * already treats as interchangeable with it for the session path. A realm
 * with no LDAP federation configured (nothing populates `LDAP_ENTRY_DN`, and
 * the demo realm this project tests against is exactly that) still grants
 * `teacher`, a class, or `examParticipant` this way, so the role/group half of
 * a search would otherwise find nothing on such a realm at all.
 */
async function fetchClientRoleNames(userId, token, resource) {
  const url = `${adminApiBaseUrl()}users/${userId}/role-mappings`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Keycloak admin role-mappings lookup answered with status ${response.status}`);
  }
  const mappings = await response.json();
  const clientMappings = mappings.clientMappings?.[resource]?.mappings;
  return Array.isArray(clientMappings) ? clientMappings.map((mapping) => mapping.name) : [];
}

async function fetchAllDirectoryUsers() {
  const now = Date.now();
  if (directoryUsersCache && now - directoryUsersCachedAt < directoryCacheTtlMs) {
    return directoryUsersCache;
  }

  const token = await getDirectoryServiceToken();
  const resource = readKeycloakConfig().resource;
  const url = `${adminApiBaseUrl()}users?briefRepresentation=false`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Keycloak admin user search answered with status ${response.status}`);
  }
  const users = await response.json();

  directoryUsersCache = await Promise.all(
    users.map(async (user) => ({
      ...user,
      clientRoleNames: await fetchClientRoleNames(user.id, token, resource),
    }))
  );
  directoryUsersCachedAt = now;
  return directoryUsersCache;
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
