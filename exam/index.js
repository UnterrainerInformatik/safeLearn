/**
 * The exam module (`exam-foundation`). `app.js` imports this file dynamically,
 * and only when `EXAM_MODULE=on`; nothing else in the repository imports from
 * `exam/`. Removing the module means removing this directory, that import and
 * the compose variable.
 *
 * `init()` resolves to one of
 *
 *   { active: true, router, embedHandlers, clientScript, dbPath }
 *   { active: false, reason }
 *
 * and never rejects for a reason it can name: a database that cannot be opened,
 * a failed migration or a read-only data directory disable the module, and the
 * reader keeps serving.
 */

import express from "express";
import path from "node:path";

import { embedPlaceholder, wrapInPage } from "../obsidian.js";
import { scheduleDailyBackups } from "./backup.js";
import { databasePath, openDatabase } from "./db.js";
import { SessionEndedError } from "../middlewares/keycloak-middleware.js";
import { actsAsTeacher, identityOf, teacherPage } from "./gate.js";
import { ConflictError, InvalidInputError, NotFoundError } from "./classes.js";
import { registerClassRoutes } from "./routes-classes.js";
import { registerGradebookRoutes } from "./routes-gradebook.js";

const clientDir = path.join(import.meta.dirname, "client");
const clientScript = "/exam/assets/exam-client.js";

/**
 * Express 4 does not see a rejected promise, so every async handler goes
 * through this: a throw becomes `next(error)` and ends at the module's own
 * error handler below.
 */
const handle = (fn) => (req, res, next) => {
  Promise.resolve()
    .then(() => fn(req, res, next))
    .catch(next);
};

/**
 * What each kind of block renders to while the module is active. Elements a
 * student may see render for everyone; teacher-only ones render nothing for a
 * session not acting as a teacher - a teacher in student view included - so
 * such a page makes no request for them (`exam-embedding`).
 */
function buildEmbedHandlers() {
  const forEveryone = (kind) => async (params) => embedPlaceholder(kind, params);
  const forTeachers = (kind) => async (params, req) =>
    (await actsAsTeacher(req)) ? embedPlaceholder(kind, params) : "";
  return {
    test: forEveryone("test"),
    results: forEveryone("results"),
    gradebook: forTeachers("gradebook"),
    live: forTeachers("live"),
  };
}

/** The status a refusal of the module's own is answered with, or null for a failure. */
function refusalStatus(error) {
  if (error instanceof InvalidInputError) return 400;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ConflictError) return 409;
  return null;
}

function buildRouter(db, startPage) {
  const router = express.Router();

  // The module's client: its directory and nothing beside it. Mounted here, so
  // it exists only while the module is active.
  router.use("/assets", express.static(clientDir));

  // Who the module takes this session for. The client's first question, and
  // the one place a session can see the student-view downgrade from outside.
  router.get(
    "/api/me",
    handle(async (req, res) => {
      const username = identityOf(req);
      if (!username) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      res.json({ username, teacher: await actsAsTeacher(req) });
    })
  );

  registerClassRoutes(router, { db, handle, startPage });
  registerGradebookRoutes(router, { db, handle, startPage });

  // The module's home page, for teachers: the school years, their classes and
  // the classes' courses.
  router.get(
    "/",
    teacherPage,
    handle(async (req, res) => {
      const body = `
        <h1>Classes and courses</h1>
        ${embedPlaceholder("classes-home", {})}
        <p class="sl-exam-quiet"><a href="/exam/scale">Grading scale</a></p>`;
      res.send(await wrapInPage(body, startPage(), req, { title: "Classes and courses", wide: true }));
    })
  );

  // The end of every module request that fails. That request alone is answered
  // with a server error; the process and every other session carry on.
  router.use((error, req, res, next) => {
    // A session that ended meanwhile is answered by app.js's handler, the way
    // checkAuthenticated answers a request without one.
    if (error instanceof SessionEndedError) {
      next(error);
      return;
    }
    // A refusal the module names is an answer, not a failure. A page about a
    // record there is none of lands where a path with nothing behind it lands.
    const status = refusalStatus(error);
    if (status === 404 && !req.path.startsWith("/api/")) {
      next();
      return;
    }
    if (status !== null) {
      res.status(status).json({ error: error.message });
      return;
    }
    console.error(`[exam] ${req.method} ${req.originalUrl} failed:`, error);
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(500).json({ error: "The exam module could not answer this request." });
  });

  return router;
}

/**
 * `startPage` is `app.js`'s own resolver, for the page frame's "Home" link.
 */
export async function init({ startPage }) {
  const dbPath = databasePath();
  let opened;
  try {
    opened = openDatabase(dbPath);
  } catch (error) {
    return { active: false, reason: `the database ${dbPath} could not be opened: ${error.message}` };
  }
  const { db, migrated } = opened;
  if (migrated.from !== migrated.to) {
    console.log(`[exam] Migrated ${dbPath} from schema version ${migrated.from} to ${migrated.to}.`);
  }
  scheduleDailyBackups(db, dbPath);
  return {
    active: true,
    router: buildRouter(db, startPage),
    embedHandlers: buildEmbedHandlers(),
    clientScript,
    dbPath,
  };
}
