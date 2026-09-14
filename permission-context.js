import { fetchAccount, keycloakConfig } from "./middlewares/keycloak-middleware.js";

/**
 * The context one request decides every one of its directives against.
 *
 * `hasRoles` used to rebuild all of this on every call: the role set from the
 * session, the client roles from the access token, `keycloak.json` from disk,
 * and one uncached fetch against the identity provider for the three view
 * preferences. A page carrying one whole-file directive per corpus file and one
 * `@@@` block per gated paragraph asked that question a hundred and forty times
 * over, and answered it from a hundred and forty separately read clocks and
 * preference blocks.
 *
 * Here it is resolved once. The promise is put on `req` before the lookup it
 * awaits starts, so the concurrent fan-out in `removeForbiddenContent` - every
 * block of a document starts its check before any of them finishes - joins the
 * one build instead of starting one each. Everything a check reads is finished
 * before that promise resolves, and nothing writes to the context afterwards
 * except `setUserAttribute`, recording the preference it has just stored.
 */

/**
 * The names that belong to a role and to nothing else. The display name is
 * merged into the same flat set as the roles, so these five have to be kept out
 * of it: only the identity provider or the LDAP claim may hand them out. Both
 * plural spellings are listed, because a name has to be refused before the
 * canonicalization below folds `teachers` into `teacher`.
 */
const namesReservedForRoles = new Set([
  "admin",
  "teacher",
  "teachers",
  "student",
  "students",
]);

/**
 * What a session is shown when the lookup that supplies the view preferences
 * does not answer, and the floor under every preference block that does: a key
 * the stored block omits reads as 0 rather than as undefined.
 *
 * All three defaults narrow. The teacher view off applies the student-view
 * downgrade, the exam view off yields the practice variant of a question, and
 * answers stay hidden - so a failed lookup can only take content away from a
 * session, never hand it any.
 */
const defaultPreferences = Object.freeze({ ve: 0, vt: 0, va: 0 });

/**
 * How a role name is compared, wherever it comes from: the directive that names
 * it, the access token that grants it, or the account's display name.
 */
export function normalizeRole(role) {
  return typeof role === "string" ? role.trim().toLowerCase() : "";
}

/**
 * The roles the access token carries for this application's Keycloak client.
 *
 * `resource` comes from the parsed `keycloak.json` the middleware read at
 * startup, not from a `readFileSync` per check: this ran on the event loop once
 * per directive before, which is a synchronous disk read in the middle of
 * rendering a page.
 */
function getClientRoles(req) {
  try {
    const resourceAccess = req?.user?.accessTokenDecoded?.resource_access;
    if (resourceAccess === undefined || resourceAccess === null) {
      return null;
    }
    const resource = keycloakConfig?.resource;
    if (!resource) {
      return null;
    }
    const granted = resourceAccess[resource];
    return granted ? granted.roles : null;
  } catch (error) {
    console.error(`Error checking client roles: ${error}`);
    return null;
  }
}

/**
 * The stored preference block, with every key this application reads given a
 * value. A block that does not parse is treated the same way a lookup that did
 * not answer is: the defaults, recorded once, rather than a request that refuses
 * every directive because one attribute is malformed.
 */
function parsePreferences(rawConfig) {
  if (typeof rawConfig !== "string" || rawConfig.length === 0) {
    return { ...defaultPreferences };
  }
  try {
    const parsed = JSON.parse(rawConfig);
    if (parsed === null || typeof parsed !== "object") {
      return { ...defaultPreferences };
    }
    return { ...defaultPreferences, ...parsed };
  } catch (error) {
    console.error(`Error reading the stored view preferences: ${error}`);
    return { ...defaultPreferences };
  }
}

/**
 * The session's roles, as the two sets a check selects between.
 *
 * Sets rather than the plain object this used to be: `r["constructor"]` and
 * `r["__proto__"]` are truthy on any object literal, so a directive reading
 * `@@@ constructor` was granted to every session that reached it. A `Set` has no
 * inherited keys, and an intersection is what the check actually is.
 *
 * Both sets are built here, up front. The downgrade used to `delete` from the
 * map it had just built, which was harmless only because every call built its
 * own; against one set shared by a whole request it is exactly the evaluation
 * order dependence `role-resolution` forbids.
 */
function buildRoleViews(req) {
  const roles = new Set();

  let calculated = null;
  try {
    calculated = JSON.parse(req?.user?.rolesCalculated);
  } catch (error) {
    console.error(`Error reading the calculated roles of the session: ${error}`);
  }
  if (calculated !== null && typeof calculated === "object") {
    for (const [group, held] of Object.entries(calculated)) {
      const normalized = normalizeRole(group);
      if (held && normalized) {
        roles.add(normalized);
      }
    }
  }

  const name = normalizeRole(req?.user?.name);
  // Being addressed by name is a documented feature, so the display name
  // shares this namespace with the roles - and must never be able to stand in
  // for one. A name equal to a built-in role is dropped here, at the
  // assignment, so it reaches neither the canonicalization below nor the
  // admin short-circuit, the student-view downgrade or the exam gate.
  if (namesReservedForRoles.has(name)) {
    console.warn(
      `Display name "${name}" is a reserved role name and was not added to the role set of ` +
        `${req.user.preferred_username ?? "this session"}. The account keeps every role the ` +
        `identity provider issued; rename it in Keycloak to make it addressable by name again.`
    );
  } else if (name) {
    roles.add(name);
  }

  const clientRoles = getClientRoles(req);
  if (clientRoles) {
    for (const role of clientRoles) {
      const normalized = normalizeRole(role);
      if (normalized) {
        roles.add(normalized);
      }
    }
  }

  // The session's role set is complete at this point. Any future source of
  // roles must be merged above this line, so that the canonicalization and
  // the alias below cover it too. Nothing below reads the requested roles to
  // decide which roles the session holds - a directive never grants itself.
  if (roles.has("teachers")) {
    roles.add("teacher");
  }
  if (roles.has("students")) {
    roles.add("student");
  }
  if (roles.has("teacher")) {
    roles.add("teachers");
  }
  if (roles.has("student")) {
    roles.add("students");
  }

  const studentRoles = new Set(roles);
  studentRoles.delete("teacher");
  studentRoles.delete("teachers");
  studentRoles.delete("admin");

  return {
    full: { roles, isAdmin: roles.has("admin"), isTeacher: roles.has("teacher") },
    // Whatever the session holds, this is the set it is judged by while it looks
    // at its own content as a student does, and the exam gate reads the flags
    // after that downgrade - so both are false here rather than copied.
    studentView: { roles: studentRoles, isAdmin: false, isTeacher: false },
  };
}

async function buildPermissionContext(req) {
  // One clock reading for the request. Both callers of
  // `getActivePermissionRoles` used to take their own, so a window closing
  // between the navigation tree and the body of the page it links to left the
  // two disagreeing about the same file.
  const referenceDate = new Date();
  const { full, studentView } = buildRoleViews(req);

  let account = null;
  let lookupFailed = false;
  // The roles above never come from this lookup - they come from the session and
  // from the access token - so a failure here settles the preferences and leaves
  // the identity of the session untouched.
  if (req?.user?.accessToken && req?.user?.keycloakConfig) {
    try {
      account = await fetchAccount(req);
    } catch (error) {
      lookupFailed = true;
      console.error(`Error fetching current attributes: ${error}`);
    }
  }

  return {
    full,
    studentView,
    preferences: parsePreferences(account?.attributes?.config),
    account,
    referenceDate,
    lookupFailed,

    /**
     * Records an attribute this request has just written, so that whatever it
     * evaluates afterwards reads the value it stored rather than the one it
     * replaced. `setUserAttribute` calls this rather than reaching into the
     * shape itself: the middleware is the identity provider's wiring and does
     * not know how a preference block is read.
     */
    applyWrittenAttribute(name, value) {
      if (typeof name !== "string" || name.length === 0) {
        return;
      }
      if (this.account === null) {
        this.account = {};
      }
      this.account.attributes = { ...this.account.attributes, [name]: value };
      if (name === "config") {
        this.preferences = parsePreferences(value);
      }
    },
  };
}

/**
 * The one context of this request, built on first need.
 *
 * The promise is stored, not the value it resolves to: a caller arriving while
 * the lookup is still in flight has to be able to join it, and a field that
 * stays empty until the build finishes would leave every block of a document
 * starting a build of its own.
 *
 * Lazy, so a request that asks no permission question - a stylesheet, an image,
 * the hot-reload stream - pays for no lookup at all.
 */
export function getPermissionContext(req) {
  if (!req.permissionContext) {
    req.permissionContext = buildPermissionContext(req);
  }
  return req.permissionContext;
}
