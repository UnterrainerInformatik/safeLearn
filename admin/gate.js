/**
 * Who may open the administration pages (`teacher-admin-pages`, design D1-D3):
 * a session that has an identity and acts as a teacher after the student-view
 * downgrade - the rule the exam module's pages apply, here without depending
 * on that module. The menu, the pages and their data routes all ask this one
 * function, so the button and the page never disagree.
 *
 * Kept apart from `index.js` because `obsidian.js` asks it while drawing the
 * menu, and `index.js` imports `obsidian.js`.
 */

import { hasSomeRoles, identityOf } from "../utils.js";

/**
 * Whether the request acts as a teacher (an admin passes too) and carries a
 * username. Without an identity provider nobody has a session, so this is
 * false there whatever `READER_ROLES` grants.
 */
export async function actsAsTeacherWithIdentity(req) {
  return identityOf(req) !== null && (await hasSomeRoles(req, ["teacher"], true));
}

/**
 * The gate for a page: a session not acting as a teacher leaves the router and
 * lands where a path with nothing behind it lands, so the page does not reveal
 * that it exists.
 */
export function adminPage(req, res, next) {
  actsAsTeacherWithIdentity(req)
    .then((teacher) => (teacher ? next() : next("router")))
    .catch(next);
}

/** The gate for the data a page reads: refused with 403, carrying nothing. */
export function adminData(req, res, next) {
  actsAsTeacherWithIdentity(req)
    .then((teacher) => (teacher ? next() : res.status(403).json({ error: "Forbidden" })))
    .catch(next);
}
