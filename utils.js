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
 * Checks all Keycloak roles of the client for permissions.
 */
async function hasClientRoles(req, clientRoles, all) {
  try {
    if (
      clientRoles === undefined ||
      clientRoles === null ||
      clientRoles.length == 0
    ) {
      return true;
    }
    let clientAccess = false;
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
        if (all) {
          clientAccess = clientRoles.every((role) => r.roles.includes(role));
        } else {
          clientAccess = clientRoles.some((role) => r.roles.includes(role));
        }
      }
    }
    return clientAccess;
  } catch (error) {
    console.error(`Error checking client roles: ${error}`);
    return null;
  }
}

/**
 * Fetches all Keycloak roles of the client and all LDAP roles of the user, previously calculated in the Keycloak-middleware and checks for permissions.
 */
async function hasRoles(req, clientRoles, all, allowOverride) {
  try {
    //console.log("Checking roles", clientRoles, "all", all, "allowOverride", allowOverride);
    // The roles to check are empty. So we return true.
    if (
      clientRoles === undefined ||
      clientRoles === null ||
      clientRoles.length == 0
    ) {
      return true;
    }

    let clientAccess = null;
    const attributes = await getUserAttributes(req);
    const ccr = await getClientRoles(req, clientRoles);
    // console.log("Client roles", ccr);
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
    r[name] = true;
    const cr = await getClientRoles(req, clientRoles);
    if (cr) {
      for (const role of cr) {
        r[role] = true;
      }
    }
    const clientViews = clientRoles.filter((role) => role.startsWith("#"));
    clientRoles = clientRoles.filter((role) => !role.startsWith("#"));
    let isAdmin = r.admin || clientRoles.includes("admin");
    let isTeacher = r.teacher || clientRoles.includes("teacher");
    if (isTeacher) {
      r.teachers = true;
    }
    if ((isAdmin || isTeacher) && allowOverride && a.vt == 0) {
      // Downgrade teacher and admin to student.
      isAdmin = false;
      isTeacher = false;
      delete r["teacher"];
    }
    if (isAdmin) {
      clientAccess = true;
    } else {
      if (clientRoles.length > 0) {
        if (all) {
          clientAccess = clientRoles.every((role) => r[role]);
        } else {
          clientAccess = clientRoles.some((role) => r[role]);
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
    console.log("Checking roles:", clientRoles, "all:", all, "allowOverride:", allowOverride, "isAdmin:", isAdmin, "isTeacher:", isTeacher, "studOvr:", a.vt == 0, "Client access:", clientAccess);
    if (clientAccess === null) {
      clientAccess = false;
    }
    return clientAccess;
  } catch (error) {
    console.error(`Error checking client roles: ${error}`);
    return null;
  }
}

export function uiConfig(req) {
  let uiConfig = {};
  if (req.user.accessTokenDecoded.config) {
    uiConfig = JSON.parse(req.user.accessTokenDecoded.config);
  }
  return uiConfig;
}
