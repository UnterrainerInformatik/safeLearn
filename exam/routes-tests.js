/**
 * The routes of the online tests (`online-test`) as teachers use them: the
 * list of a course's or a school year's tests, a test with its snapshot, its
 * sittings, and releasing an attempt to another browser.
 * Every one of them is a teacher's: the API refuses any other session with
 * 403, and the pages are not there for it (`gate.js`).
 */

import { createSitting, createTest, deleteSitting, deleteTest, getTest, listTests, updateSitting, updateTest } from "./tests.js";
import { releaseAttempt } from "./attempts.js";
import { NotFoundError } from "./classes.js";
import { requireTeacher, teacherPage } from "./gate.js";
import { contextFromQuery, teacherShell } from "./bar.js";

/** A record id from the path; anything but a positive integer names nothing. */
function idParam(value) {
  const id = typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("There is no such record.");
  return id;
}

export function registerTestRoutes(router, { db, handle, startPage }) {
  const api = (method, path, fn) =>
    router[method](
      `/api${path}`,
      requireTeacher,
      handle(async (req, res) => {
        res.json(await fn(req));
      })
    );

  api("get", "/tests", (req) => listTests(db, contextFromQuery(req.query)));
  api("post", "/courses/:id/tests", (req) => createTest(db, idParam(req.params.id), req.body ?? {}));
  api("get", "/tests/:id", (req) => getTest(db, idParam(req.params.id)));
  api("put", "/tests/:id", (req) => updateTest(db, idParam(req.params.id), req.body ?? {}));
  api("delete", "/tests/:id", (req) => deleteTest(db, idParam(req.params.id)));
  api("post", "/tests/:id/sittings", (req) => createSitting(db, idParam(req.params.id), req.body ?? {}));
  api("put", "/sittings/:id", (req) => updateSitting(db, idParam(req.params.id), req.body ?? {}));
  api("delete", "/sittings/:id", (req) => deleteSitting(db, idParam(req.params.id)));
  api("post", "/attempts/:id/release", (req) => releaseAttempt(db, idParam(req.params.id)));

  // The list the bar's "Online tests" button opens: the chosen course's tests,
  // or the school year's when no course is chosen.
  router.get(
    "/tests",
    teacherPage,
    handle(async (req, res) => {
      const context = contextFromQuery(req.query);
      const params = {};
      if (context.courseId !== null) params.course = String(context.courseId);
      else if (context.classId !== null) params.class = String(context.classId);
      else if (context.yearId !== null) params.year = String(context.yearId);
      res.send(await teacherShell({ db, startPage, req, title: "Online tests", context, kind: "tests", params, current: "tests" }));
    })
  );

  router.get(
    "/tests/:id",
    teacherPage,
    handle(async (req, res) => {
      const test = getTest(db, idParam(req.params.id));
      res.send(
        await teacherShell({
          db,
          startPage,
          req,
          title: test.name,
          context: { courseId: test.course.id },
          kind: "test-detail",
          params: { test: String(test.id) },
          current: "tests",
        })
      );
    })
  );
}
