/**
 * The routes of the gradebook (`gradebook`). Everything about a course - its
 * overview, a student's record in it, entries, overrides, the scale - is a
 * teacher's: the API refuses any other session with 403, and the pages are not
 * there for it (`gate.js`). A student has exactly one route of their own,
 * `GET /api/my/results`, which answers about the session's own identity and
 * takes no username, so no request can name somebody else.
 */

import {
  addEntries,
  courseOverview,
  deleteEntry,
  findCourse,
  readScale,
  resultsOf,
  semesterToday,
  setSemesterGrade,
  studentRecord,
  updateEntry,
  updateScale,
} from "./gradebook.js";
import { getCourse, InvalidInputError, NotFoundError } from "./classes.js";
import { semesters } from "./grading.js";
import { identityOf, requireTeacher, teacherPage } from "./gate.js";
import { embedPlaceholder, wrapInPage } from "../obsidian.js";

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
  api("post", "/courses/:id/entries", (req) => addEntries(db, idParam(req.params.id), req.body?.entries));
  api("put", "/courses/:id/grades/:username/:semester", (req) =>
    setSemesterGrade(db, idParam(req.params.id), req.params.username, req.params.semester, req.body ?? {})
  );
  api("put", "/entries/:id", (req) => updateEntry(db, idParam(req.params.id), req.body ?? {}));
  api("delete", "/entries/:id", (req) => deleteEntry(db, idParam(req.params.id)));

  // ---------------------------------------------------- a student's own view

  api(
    "get",
    "/my/results",
    (req) => resultsOf(db, identityOf(req), { yearId: req.query.year ? idParam(String(req.query.year)) : null }),
    requireIdentity
  );

  // ------------------------------------------------------------------ pages

  const page = (path, gate, crumbs, title, element) =>
    router.get(
      path,
      gate,
      handle(async (req, res) => {
        const { kind, params } = element(req);
        const body = `
          ${crumbs ? `<p class="sl-exam-crumbs"><a href="/exam/">Classes and courses</a></p>` : ""}
          <h1>${title}</h1>
          ${embedPlaceholder(kind, params)}`;
        res.send(await wrapInPage(body, startPage(), req, { title }));
      })
    );

  page("/courses/:id/gradebook", teacherPage, true, "Gradebook", (req) => {
    const params = { course: String(idParam(req.params.id)) };
    if (semesters.includes(req.query.semester)) params.semester = req.query.semester;
    return { kind: "gradebook", params: { ...params, page: "1" } };
  });
  page("/courses/:id/students/:username", teacherPage, true, "Student", (req) => ({
    kind: "gradebook-student",
    params: { course: String(idParam(req.params.id)), student: String(req.params.username).toLowerCase() },
  }));
  page("/scale", teacherPage, true, "Grading scale", () => ({ kind: "scale", params: {} }));
  // Everyone's own results, a teacher's included - a teacher is on no roster
  // and finds none.
  page(
    "/results",
    (req, res, next) => (identityOf(req) ? next() : next("router")),
    false,
    "My results",
    () => ({ kind: "results", params: { page: "1" } })
  );
}
