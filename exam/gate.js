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

/**
 * Whether the request acts as an admin, after the student-view downgrade. An
 * admin passes every role check of the content, so the role itself is asked
 * here: a teacher who is no admin answers false.
 */
export function actsAsAdmin(req) {
  return hasSomeRoles(req, ["admin"], true);
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
 * Lets a request through only when it acts as a teacher and as an admin: the
 * writes that take back what students have written (`online-test`, admin
 * corrections). Everything else is refused with 403.
 */
export function requireAdmin(req, res, next) {
  Promise.all([actsAsTeacher(req), actsAsAdmin(req)])
    .then(([teacher, admin]) => {
      if (teacher && admin && identityOf(req)) next();
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

/**
 * What the session behind a long-lived request is now: `ok` while it is still
 * there with the same identity - and, with `teacher`, still acts as a teacher
 * after the student-view downgrade - `refused` otherwise, and `renew` when its
 * access token is about to expire. Used by the module's event streams.
 *
 * The session is read from its store as a copy, never through `req.session`,
 * which this request would write back over newer changes when it ends; the
 * permission context is built anew from that copy, so a switch to the
 * student view made by another request counts. Renewing the tokens is left to
 * an ordinary request: the stream asks the client to reconnect instead.
 */
export function sessionNow(req, { teacher = false } = {}) {
  return new Promise((resolve) => {
    if (!req.sessionStore || !req.sessionID) {
      resolve("refused");
      return;
    }
    req.sessionStore.get(req.sessionID, (error, stored) => {
      const user = stored?.passport?.user;
      if (error || !user) {
        resolve("refused");
        return;
      }
      const probe = { user, session: stored };
      if (!identityOf(probe) || identityOf(probe) !== identityOf(req)) {
        resolve("refused");
        return;
      }
      const exp = user.accessTokenDecoded?.exp;
      if (typeof exp !== "number" || exp - Date.now() / 1000 <= 60) {
        resolve("renew");
        return;
      }
      if (!teacher) {
        resolve("ok");
        return;
      }
      actsAsTeacher(probe).then(
        (acting) => resolve(acting ? "ok" : "refused"),
        () => resolve("refused")
      );
    });
  });
}
