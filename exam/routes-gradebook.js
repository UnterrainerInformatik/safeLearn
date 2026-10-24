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
import { contextFromQuery, teacherShell } from "./bar.js";
import { flagParticipant, participantHolders, participantSetup, setParticipant } from "./participants.js";

/** A record id from the path or query; anything but a positive integer names nothing. */
function idParam(value) {
  const id = typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("exam.errors.noSuchRecord");
  return id;
}

/** The semester a request asks for, or the one running now in the course's year. */
function semesterParam(value, course) {
  if (value === undefined || value === "") return semesterToday(course.year);
  if (!semesters.includes(value)) throw new InvalidInputError("exam.errors.gradebook.semester", { semesters: semesters.join(" or ") });
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
    if (!course) throw new NotFoundError("exam.errors.noSuchCourse");
    return course;
  });

  // Both answers mark the course's Matura candidates (exam-participant-role D5).
  api("get", "/courses/:id/gradebook", (req) => {
    const id = idParam(req.params.id);
    const overview = courseOverview(db, id, semesterParam(req.query.semester, getCourse(db, id)));
    const holders = participantHolders(overview.course);
    return {
      ...overview,
      participants: participantSetup(overview.course),
      students: overview.students.map((row) => flagParticipant(row, holders)),
      left: overview.left.map((row) => flagParticipant(row, holders)),
    };
  });
  api("get", "/courses/:id/students/:username", (req) => {
    const record = studentRecord(db, idParam(req.params.id), req.params.username);
    const holders = participantHolders(record.course);
    return {
      ...record,
      student: flagParticipant(record.student, holders),
      previous: flagParticipant(record.previous, holders),
      next: flagParticipant(record.next, holders),
    };
  });
  // Grants or withdraws the course's exam-participant role; the role's name
  // comes from the course, never from the request (exam-participant-role D3).
  api("put", "/courses/:id/participants/:username", (req) =>
    setParticipant(db, idParam(req.params.id), req.params.username, req.body?.held)
  );
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
        const { kind, params, context, current = null } = element(req);
        res.send(await teacherShell({ db, startPage, req, title, context, kind, params, current }));
      })
    );

  page("/courses/:id/gradebook", (t) => t("exam.pages.gradebook"), (req) => {
    const courseId = idParam(req.params.id);
    // A page asking for no semester, or for one there is not, shows the one running now.
    const semester = semesters.includes(req.query.semester) ? req.query.semester : semesterToday(getCourse(db, courseId).year);
    return { kind: "gradebook", params: { course: String(courseId), semester, page: "1" }, context: { courseId, semester } };
  });
  page("/courses/:id/students/:username", (t) => t("exam.pages.student"), (req) => {
    const courseId = idParam(req.params.id);
    // The semester the teacher came from, kept on the way to the neighbours and back.
    const semester = semesters.includes(req.query.semester) ? req.query.semester : null;
    return {
      kind: "gradebook-student",
      params: { course: String(courseId), student: String(req.params.username).toLowerCase(), ...(semester ? { semester } : {}) },
      context: semester ? { courseId, semester } : { courseId },
    };
  });
  // One of the bar's buttons: the scale belongs to no course, but keeps what the bar has chosen.
  page("/scale", (t) => t("exam.pages.scale"), (req) => ({ kind: "scale", params: {}, context: contextFromQuery(req.query), current: "scale" }));

  // Everyone's own results, a teacher's included - a teacher is on no roster
  // and finds none - now on the student's Exams page (`/exam/my`).
  router.get("/results", (req, res, next) => (identityOf(req) ? res.redirect("/exam/my") : next("router")));
}
