import fs from "fs";
import { getUserAttributes } from "./middlewares/keycloak-middleware.js";

/**
 * hasAllRoles(req, ["teacher", "student", "admin", "gluppy"])
 */
export async function hasAllRoles(req, clientRoles, allowOverride = false) {
  return hasRoles(req, clientRoles, true, allowOverride);
}

/**
 * hasSomeRoles(req, ["teacher", "student", "admin", "gluppy"])
 */
export async function hasSomeRoles(req, clientRoles, allowOverride = false) {
  return hasRoles(req, clientRoles, false, allowOverride);
}

/**
 * Gets the Keycloak roles for the client.
 */
async function getClientRoles(req) {
  try {
    if (
      req.user.accessTokenDecoded.resource_access !== undefined &&
      req.user.accessTokenDecoded.resource_access !== null
    ) {
      // Load keycloak.json
      const keycloakConfig = JSON.parse(
        fs.readFileSync("keycloak.json", "utf8")
      );
      const resource = keycloakConfig.resource;
      const a = req.user.accessTokenDecoded.resource_access;
      const r = a[resource];
      if (r) {
        return r.roles;
      }
    }
    return null;
  } catch (error) {
    console.error(`Error checking client roles: ${error}`);
    return null;
  }
}

/**
 * The names that belong to a role and to nothing else. The display name is
 * merged into the same flat set as the roles, so these five have to be kept out
 * of it: only the identity provider or the LDAP claim may hand them out. Both
 * plural spellings are listed, because a name has to be refused before the
 * canonicalization in hasRoles folds `teachers` into `teacher`.
 */
const namesReservedForRoles = new Set([
  "admin",
  "teacher",
  "teachers",
  "student",
  "students",
]);

/**
 * Fetches all Keycloak roles of the client and all LDAP roles of the user, previously calculated in the Keycloak-middleware and checks for permissions.
 */
async function hasRoles(req, clientRoles, all, allowOverride) {
  try {
    //console.log("Checking roles", clientRoles, "all", all, "allowOverride", allowOverride);
    // The roles to check are empty. So we return true.
    const normalizeRole = (role) =>
      typeof role === "string" ? role.trim().toLowerCase() : "";

    let normalizedClientRoles = Array.isArray(clientRoles)
      ? clientRoles
          .map(normalizeRole)
          .filter((role) => role.length > 0)
      : [];

    if (normalizedClientRoles.length === 0) {
      return true;
    }

    let clientAccess = null;
    const attributes = await getUserAttributes(req);
    // console.log("Request user rolesCalculated", req.user.rolesCalculated);
    // console.log("attributes", attributes);
    let a = {ve: 0, vt: 0, va: 0};
    if (attributes?.attributes?.config) {
      a = JSON.parse(attributes.attributes.config);
    }
    let r = JSON.parse(req.user.rolesCalculated);
    // console.log("Roles Calculated", r);
    if (r === undefined || r === null) {
      r = {};
    }
    let name = req.user.name
    name = name.trim()
    name = name.toLowerCase()
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
    } else {
      r[name] = true;
    }
    const cr = await getClientRoles(req);
    if (cr) {
      for (const role of cr) {
        const normalizedRole = normalizeRole(role);
        if (normalizedRole) {
          r[normalizedRole] = true;
        }
      }
    }
    // The session's role set is complete at this point. Any future source of
    // roles must be merged above this line, so that the canonicalization and
    // the alias below cover it too. Nothing below reads the requested roles to
    // decide which roles the session holds - a directive never grants itself.
    if (r.teachers) {
      r.teacher = true;
      delete r["teachers"];
    }
    if (r.students) {
      r.student = true;
      delete r["students"];
    }
    if (r.teacher) {
      r.teachers = true;
    }
    if (r.student) {
      r.students = true;
    }
    let clientViews = normalizedClientRoles.filter((role) => role.startsWith("#"));
    normalizedClientRoles = normalizedClientRoles.filter((role) => !role.startsWith("#"));
    let isAdmin = !!r.admin;
    let isTeacher = !!r.teacher;
    if ((isAdmin || isTeacher) && allowOverride && a.vt == 0) {
      // Downgrade teacher and admin to student.
      isAdmin = false;
      isTeacher = false;
      delete r["teacher"];
      delete r["teachers"];
      delete r["admin"];
    }
    if (isAdmin) {
      clientAccess = true;
    } else {
      if (normalizedClientRoles.length > 0) {
        if (all) {
          clientAccess = normalizedClientRoles.every((role) => r[role]);
        } else {
          clientAccess = normalizedClientRoles.some((role) => r[role]);
        }
      }
    }
    if (clientAccess === null || clientAccess) {
      for (const view of clientViews) {
        const viewRole = view.substring(1);
        switch (viewRole) {
          case "exam":
            // For security reasons hardcoded to only allow teachers and admins to view exam-questions.
            clientAccess = a.ve == 1 && (isAdmin || isTeacher);
            break;
          case "practice":
            clientAccess = a.ve == 0;
            break;
          case "answer":
            clientAccess = a.va == 1;
            break;
        }
      }
    }
    //console.log("Checking roles:", clientRoles, "all:", all, "allowOverride:", allowOverride, "isAdmin:", isAdmin, "isTeacher:", isTeacher, "studOvr:", a.vt == 0, "Client access:", clientAccess);
    if (clientAccess === null) {
      clientAccess = false;
    }
    return clientAccess;
  } catch (error) {
    console.error(`Error checking client roles: ${error}`);
    // Refuse rather than leave the decision open: the success path already
    // normalizes an undecided result to false, and this is the branch that
    // knows the least about what the session may read.
    return false;
  }
}

export function uiConfig(req) {
  let uiConfig = {};
  if (req.user.accessTokenDecoded.config) {
    uiConfig = JSON.parse(req.user.accessTokenDecoded.config);
  }
  return uiConfig;
}
