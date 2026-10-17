/**
 * Who a request is, as far as the module is concerned, and whether it acts as a
 * teacher (design.md, D5).
 *
 * The teacher question is the one the content asks for `@@@ teacher`:
 * `hasSomeRoles(req, ["teacher"], true)`, with `allowOverride`, so a teacher in
 * student view is a student here too. The role set is rebuilt per request, so
 * switching the view back restores everything without a new login.
 */

import { hasSomeRoles } from "../utils.js";

/**
 * The directory username the module records a person under, lowercased: the
 * token's `preferred_username`, which for a federated account is the LDAP
 * `sAMAccountName`. Never the Keycloak user id, which changes when an account
 * is deleted and re-imported. Null when the session carries none.
 */
export function identityOf(req) {
  const raw =
    req?.user?.accessTokenDecoded?.preferred_username ?? req?.user?.preferred_username ?? null;
  if (typeof raw !== "string") return null;
  const username = raw.trim().toLowerCase();
  return username.length > 0 ? username : null;
}

/** Whether the request acts as a teacher, after the student-view downgrade. */
export function actsAsTeacher(req) {
  return hasSomeRoles(req, ["teacher"], true);
}

function refuse(req, res) {
  res.status(403).json({ error: "Forbidden" });
}

/**
 * Lets a request through only when it acts as a teacher. Everything else is
 * refused with 403 and reaches no handler - hiding an element is not the
 * protection, this is.
 */
export function requireTeacher(req, res, next) {
  actsAsTeacher(req)
    .then((teacher) => {
      if (teacher && identityOf(req)) next();
      else refuse(req, res);
    })
    .catch(next);
}

/**
 * The gate for a module page rather than an API: a session not acting as a
 * teacher leaves the module's router and lands where a path with nothing
 * behind it lands, so the page is not shown, as for a student, and does not
 * reveal that it exists.
 */
export function teacherPage(req, res, next) {
  actsAsTeacher(req)
    .then((teacher) => {
      if (teacher && identityOf(req)) next();
      else next("router");
    })
    .catch(next);
}

/**
 * Lets a request through only when it does not act as a teacher, so a teacher
 * in student view passes and one in teacher view does not. This is the outer
 * gate only: every student action also checks the course's roster, which no
 * teacher is on, so a downgraded teacher still cannot write a test.
 */
export function requireStudent(req, res, next) {
  actsAsTeacher(req)
    .then((teacher) => {
      if (!teacher && identityOf(req)) next();
      else refuse(req, res);
    })
    .catch(next);
}
