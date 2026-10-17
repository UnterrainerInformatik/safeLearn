/**
 * The routes of the gradebook (`gradebook`, `gradebook-sheet`). Everything
 * about a course - its sheet, a student's record in it, columns and their
 * results, overrides, the scale - is a
 * teacher's: the API refuses any other session with 403, and the pages are not
 * there for it (`gate.js`). A student has exactly one route of their own,
 * `GET /api/my/results`, which answers about the session's own identity and
 * takes no username, so no request can name somebody else.
 */

import {
  courseOverview,
  createColumn,
  deleteColumn,
  deleteResult,
  findCourse,
  readScale,
  resultsOf,
  semesterToday,
  setResult,
  setSemesterGrade,
  studentRecord,
  updateColumn,
  updateScale,
} from "./gradebook.js";
import { getCourse, InvalidInputError, NotFoundError } from "./classes.js";
import { semesters } from "./grading.js";
import { identityOf, requireTeacher, teacherPage } from "./gate.js";
import { embedPlaceholder, wrapInPage } from "../obsidian.js";
import { teacherShell } from "./bar.js";

/** A record id from the path or query; anything but a positive integer names nothing. */
function idParam(value) {
  const id = typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("There is no such record.");
  return id;
}

/** The semester a request asks for, or the one running now in the course's year. */
function semesterParam(value, course) {
  if (value === undefined || value === "") return semesterToday(course.year);
  if (!semesters.includes(value)) throw new InvalidInputError(`A semester is ${semesters.join(" or ")}.`);
  return value;
}

/** Answers 403 to a request that carries no identity; lets every other one through. */
function requireIdentity(req, res, next) {
  if (identityOf(req)) next();
  else res.status(403).json({ error: "Forbidden" });
}

export function registerGradebookRoutes(router, { db, handle, startPage }) {
  const api = (method, path, fn, gate = requireTeacher) =>
    router[method](
      `/api${path}`,
      gate,
      handle(async (req, res) => {
        res.json(await fn(req));
      })
    );

  // ------------------------------------------------------------------ scale

  api("get", "/scale", () => readScale(db));
  api("put", "/scale", (req) => updateScale(db, req.body?.thresholds));

  // ---------------------------------------------------------------- courses

  // A course by the names a page's block gives it: class, subject and,
  // optionally, the school year's name. The current year otherwise.
  api("get", "/course-lookup", (req) => {
    const yearName = typeof req.query.year === "string" && req.query.year ? req.query.year : null;
    const course = findCourse(db, { className: req.query.class, subject: req.query.subject, yearName });
    if (!course) throw new NotFoundError("There is no such course.");
    return course;
  });

  api("get", "/courses/:id/gradebook", (req) => {
    const id = idParam(req.params.id);
    return courseOverview(db, id, semesterParam(req.query.semester, getCourse(db, id)));
  });
  api("get", "/courses/:id/students/:username", (req) => studentRecord(db, idParam(req.params.id), req.params.username));
  api("put", "/courses/:id/grades/:username/:semester", (req) =>
    setSemesterGrade(db, idParam(req.params.id), req.params.username, req.params.semester, req.body ?? {})
  );

  // ------------------------------------------------- columns and their cells

  // One request per field: a cell is written on its own and answers the
  // student's recomputed row, so writes of a teacher tabbing quickly through a
  // row cannot undo each other (design.md, D3).
  api("post", "/courses/:id/assessments", (req) => createColumn(db, idParam(req.params.id), req.body ?? {}));
  api("put", "/assessments/:id", (req) => updateColumn(db, idParam(req.params.id), req.body ?? {}));
  api("delete", "/assessments/:id", (req) => deleteColumn(db, idParam(req.params.id)));
  api("put", "/assessments/:id/results/:username", (req) =>
    setResult(db, idParam(req.params.id), req.params.username, req.body ?? {})
  );
  api("delete", "/assessments/:id/results/:username", (req) =>
    deleteResult(db, idParam(req.params.id), req.params.username)
  );

  // ---------------------------------------------------- a student's own view

  api(
    "get",
    "/my/results",
    (req) => resultsOf(db, identityOf(req), { yearId: req.query.year ? idParam(String(req.query.year)) : null }),
    requireIdentity
  );

  // ------------------------------------------------------------------ pages

  // A teacher's pages carry the module's bar (`teacherShell`); a student's own
  // results, which every session can open, do not.
  const page = (path, title, element) =>
    router.get(
      path,
      teacherPage,
      handle(async (req, res) => {
        const { kind, params, context } = element(req);
        res.send(await teacherShell({ db, startPage, req, title, context, kind, params }));
      })
    );

  page("/courses/:id/gradebook", "Gradebook", (req) => {
    const courseId = idParam(req.params.id);
    // A page asking for no semester, or for one there is not, shows the one running now.
    const semester = semesters.includes(req.query.semester) ? req.query.semester : semesterToday(getCourse(db, courseId).year);
    return { kind: "gradebook", params: { course: String(courseId), semester, page: "1" }, context: { courseId, semester } };
  });
  page("/courses/:id/students/:username", "Student", (req) => {
    const courseId = idParam(req.params.id);
    return {
      kind: "gradebook-student",
      params: { course: String(courseId), student: String(req.params.username).toLowerCase() },
      context: { courseId },
    };
  });
  page("/scale", "Grading scale", () => ({ kind: "scale", params: {}, context: {} }));

  // Everyone's own results, a teacher's included - a teacher is on no roster
  // and finds none.
  router.get(
    "/results",
    (req, res, next) => (identityOf(req) ? next() : next("router")),
    handle(async (req, res) => {
      const title = "My results";
      const body = `
        <h1>${title}</h1>
        ${embedPlaceholder("results", { page: "1" })}`;
      res.send(await wrapInPage(body, startPage(), req, { title, wide: true }));
    })
  );
}
