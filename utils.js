import { getPermissionContext, normalizeRole } from "./permission-context.js";

/**
 * hasSomeRoles(req, ["teacher", "student", "admin", "gluppy"])
 */
export async function hasSomeRoles(req, clientRoles, allowOverride = false) {
  return hasRoles(req, clientRoles, false, allowOverride);
}

/**
 * Decides whether the session may see content addressed to `clientRoles`.
 *
 * It performs no I/O. Everything it reads - the session's roles, the view
 * preferences, the reference time - was resolved once by
 * `getPermissionContext`, so the hundred and forty questions one page view asks
 * are a hundred and forty set lookups against one answer rather than a hundred
 * and forty round-trips to the identity provider, each with a clock and a
 * preference block of its own.
 */
async function hasRoles(req, clientRoles, all, allowOverride) {
  try {
    //console.log("Checking roles", clientRoles, "all", all, "allowOverride", allowOverride);
    // The roles to check are empty. So we return true.
    let normalizedClientRoles = Array.isArray(clientRoles)
      ? clientRoles
          .map(normalizeRole)
          .filter((role) => role.length > 0)
      : [];

    if (normalizedClientRoles.length === 0) {
      return true;
    }

    let clientAccess = null;
    const context = await getPermissionContext(req);
    const a = context.preferences;
    // The student-view downgrade, as a choice between two sets built before
    // either was read. It used to delete `teacher`, `teachers` and `admin` from
    // the map the call had just assembled, which is the one write that would
    // make the answer to a directive depend on which directive came before it.
    const view = allowOverride && a.vt == 0 ? context.studentView : context.full;

    let clientViews = normalizedClientRoles.filter((role) => role.startsWith("#"));
    normalizedClientRoles = normalizedClientRoles.filter((role) => !role.startsWith("#"));
    if (view.isAdmin) {
      clientAccess = true;
    } else {
      if (normalizedClientRoles.length > 0) {
        if (all) {
          clientAccess = normalizedClientRoles.every((role) => view.roles.has(role));
        } else {
          clientAccess = normalizedClientRoles.some((role) => view.roles.has(role));
        }
      }
    }
    if (clientAccess === null || clientAccess) {
      for (const v of clientViews) {
        const viewRole = v.substring(1);
        switch (viewRole) {
          // The exam and the practice case are one rule and its complement, not
          // two rules over the same preference: every session sees exactly one
          // of the two variants. An edit to either condition has to be made at
          // both, or a session ends up seeing neither version of the question.
          case "exam":
            // For security reasons hardcoded to only allow teachers and admins to view exam-questions.
            clientAccess = a.ve == 1 && (view.isAdmin || view.isTeacher);
            break;
          case "practice":
            clientAccess = !(a.ve == 1 && (view.isAdmin || view.isTeacher));
            break;
          case "answer":
            clientAccess = a.va == 1;
            break;
        }
      }
    }
    if (clientAccess === null) {
      clientAccess = false;
    }
    return clientAccess;
  } catch (error) {
    console.error(`Error checking client roles: ${error}`);
    // Refuse rather than leave the decision open: the success path already
    // normalizes an undecided result to false, and this is the branch that
    // knows the least about what the session may read. A context that fails to
    // build at all is not the same thing as a lookup that returned nothing -
    // that one is settled inside the context, with the defaults.
    return false;
  }
}
