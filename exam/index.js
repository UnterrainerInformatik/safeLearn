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

import { embedPlaceholder } from "../obsidian.js";
import { scheduleDailyBackups } from "./backup.js";
import { databasePath, openDatabase } from "./db.js";
import { SessionEndedError } from "../middlewares/keycloak-middleware.js";
import { actsAsTeacher, identityOf, teacherPage } from "./gate.js";
import { teacherShell } from "./bar.js";
import { ConflictError, InvalidInputError, listYears, NotFoundError } from "./classes.js";
import { registerClassRoutes } from "./routes-classes.js";
import { registerGradebookRoutes } from "./routes-gradebook.js";
import { registerPoolRoutes } from "./routes-pool.js";
import { registerPoolEditRoutes } from "./routes-pool-edit.js";
import { registerPoolImportRoutes } from "./routes-pool-import.js";
import { purgeUploads, QuestionProblemsError } from "./pool-edit.js";
import { registerTestRoutes } from "./routes-tests.js";
import { registerAttemptRoutes } from "./routes-attempts.js";
import { registerLiveRoutes } from "./routes-live.js";
import { scheduleSweep } from "./attempts.js";

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
  if (error instanceof QuestionProblemsError) return 422;
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
  registerPoolRoutes(router, { db, handle, startPage });
  registerPoolEditRoutes(router, { db, handle, startPage });
  registerPoolImportRoutes(router, { db, handle, startPage });
  registerTestRoutes(router, { db, handle, startPage });
  registerAttemptRoutes(router, { db, handle, startPage });
  registerLiveRoutes(router, { db, handle, startPage });

  // The module's home page, for teachers: the classes of one school year -
  // the current one unless `?year=` names another - which the bar chooses.
  router.get(
    "/",
    teacherPage,
    handle(async (req, res) => {
      const yearId = typeof req.query.year === "string" && /^[1-9]\d{0,9}$/.test(req.query.year) ? Number(req.query.year) : null;
      const year = yearId === null ? null : (listYears(db).find((candidate) => candidate.id === yearId) ?? null);
      const params = year ? { year: String(year.id) } : {};
      res.send(
        await teacherShell({
          db,
          startPage,
          req,
          title: "Classes and courses",
          context: { yearId: year?.id ?? null },
          kind: "classes-home",
          params,
        })
      );
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
      // A question the editor cannot save names every problem at its field.
      res.status(status).json(error.problems ? { error: error.message, problems: error.problems } : { error: error.message });
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
  // Images uploaded into the editor and never saved are dropped after a day:
  // now, and with every daily backup.
  const purge = () => {
    const purged = purgeUploads(db);
    if (purged > 0) console.log(`[exam] Purged ${purged} unsaved image upload${purged === 1 ? "" : "s"}.`);
  };
  try {
    purge();
  } catch (error) {
    console.error(`[exam] Purging unsaved image uploads failed: ${error.message}`);
  }
  scheduleDailyBackups(db, dbPath, { alsoDaily: purge });
  // Attempts whose deadline passed while nobody asked - the page closed, the
  // server down - are submitted now, and from then on every 30 s.
  scheduleSweep(db);
  return {
    active: true,
    router: buildRouter(db, startPage),
    embedHandlers: buildEmbedHandlers(),
    clientScript,
    dbPath,
  };
}
