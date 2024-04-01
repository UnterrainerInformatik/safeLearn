import fs from "fs";
import { getUserAttributes } from "./middlewares/keycloak-middleware.js";

/**
 * hasAllRoles(req, ["teacher", "student", "admin", "gluppy"])
 */
export async function hasAllRoles(req, clientRoles, override = false) {
  return hasRoles(req, clientRoles, true, override);
}

/**
 * hasSomeRoles(req, ["teacher", "student", "admin", "gluppy"])
 */
export async function hasSomeRoles(req, clientRoles, override = false) {
  return hasRoles(req, clientRoles, false, override);
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
async function hasRoles(req, clientRoles, all, override) {
  try {
    if (
      clientRoles === undefined ||
      clientRoles === null ||
      clientRoles.length == 0
    ) {
      return true;
    }
    let clientAccess = null;
    const attributes = await getUserAttributes(req);
    if (
      req.user.rolesCalculated !== undefined &&
      req.user.rolesCalculated !== null
    ) {
      if (attributes && attributes.config) {
        const a = JSON.parse(attributes.config);
        const r = JSON.parse(req.user.rolesCalculated);
        const cr = await getClientRoles(req, clientRoles);
        if (cr) {
          for (const role of cr) {
            r[role] = "cr";
          }
        }
        const clientViews = clientRoles.filter((role) => role.startsWith("#"));
        clientRoles = clientRoles.filter((role) => !role.startsWith("#"));
        if ((r.admin || r.teacher) && override && a.vt == 0) {
          // Downgrade teacher and admin to student.
          r.admin = false;
          r.teacher = false;
        }
        if (r.admin) {
          clientAccess = true;
        } else {
          if (!clientRoles.includes("admin") && r.teacher) {
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
        }
        if (clientAccess === null || clientAccess) {
          for (const view of clientViews) {
            const viewRole = view.substring(1);
            switch (viewRole) {
              case "exam":
                // For security reasons hardcoded to only allow teachers and admins to view exam-questions.
                clientAccess = a.ve == 1 && (r.admin || r.teacher);
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
      }
    }
    return clientAccess || false;
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
