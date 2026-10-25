/**
 * The routes of classes and courses (`class-roster`): school years, classes
 * with their rosters, the directory checklist, and courses with their config
 * sheets. Every one of them is a teacher's: the API refuses any other session
 * with 403, and the pages are not there for it at all (`gate.js`). A teacher in
 * student view is refused like a student.
 */

import {
  addToRoster,
  closeYear,
  createClass,
  createCourse,
  createNextClass,
  createYear,
  currentYear,
  deleteClass,
  deleteCourse,
  deleteYear,
  getClass,
  getCourse,
  InvalidInputError,
  listClasses,
  listYears,
  nextYearProposal,
  NotFoundError,
  normalizeClassName,
  refreshNames,
  removeFromRoster,
  renameClass,
  renameYear,
  setCurrentYear,
  updateCourse,
  viennaToday,
  weightCategories,
} from "./classes.js";
import { columnCounts } from "./gradebook.js";
import { purgeLeavers, retentionReport } from "./retention.js";
import {
  asRosterPerson,
  classCandidates,
  directoryClassNames,
  findPerson,
  isKnownTeacher,
  searchPeople,
} from "./roster-source.js";
import { requireTeacher, teacherPage } from "./gate.js";
import { teacherShell } from "./bar.js";
import { directoryServiceConfigured, heldDirectoryPeople } from "../middlewares/directory-service.js";
import { rosterWithParticipations } from "./participants.js";

/** A record id from the path; anything but a positive integer names nothing. */
function idParam(value) {
  const id = /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("exam.errors.noSuchRecord");
  return id;
}

/**
 * What the directory can contribute right now: its people, or null with the
 * reason - not configured on this instance at all, or still being fetched.
 */
function directory() {
  if (!directoryServiceConfigured()) return { people: null, state: "unavailable" };
  const people = heldDirectoryPeople();
  return { people, state: people ? "ready" : "loading" };
}

/**
 * The people a teacher ticked or typed, resolved against the directory: a known
 * person with the names it holds, an unknown username as it is - the roster
 * editor's fallback for a directory that is not available. A known teacher is
 * refused: no teacher is ever on a roster.
 */
function resolveStudents(usernames, people) {
  if (!Array.isArray(usernames)) throw new InvalidInputError("exam.errors.classes.rosterUsernames");
  return usernames.map((username) => {
    if (typeof username !== "string") throw new InvalidInputError("exam.errors.classes.rosterUsernames");
    if (isKnownTeacher(people, username)) {
      throw new InvalidInputError("exam.errors.classes.teacherOnRoster", { username: username.trim().toLowerCase() });
    }
    const person = findPerson(people, username);
    return person ? asRosterPerson(person) : { username };
  });
}

/**
 * Registers the routes on the module's router. `handle` wraps an async handler
 * so a throw reaches the module's error handler; `db` is the open database.
 */
export function registerClassRoutes(router, { db, handle, startPage, retentionYears }) {
  const api = (method, path, fn) =>
    router[method](
      `/api${path}`,
      requireTeacher,
      handle(async (req, res) => {
        res.json(await fn(req));
      })
    );

  // ------------------------------------------------------------ school years

  api("get", "/years", () => ({ years: listYears(db), current: currentYear(db) }));
  api("post", "/years", (req) => createYear(db, req.body ?? {}));
  api("post", "/years/:id/current", (req) => setCurrentYear(db, idParam(req.params.id)));
  api("put", "/years/:id", (req) => renameYear(db, idParam(req.params.id), req.body ?? {}));
  api("delete", "/years/:id", (req) => deleteYear(db, idParam(req.params.id)));
  // For good: nothing in the year can be changed afterwards (exam-year-change D1).
  api("post", "/years/:id/close", (req) => closeYear(db, idParam(req.params.id)));

  // The next year from the one before it (exam-year-change D6): what each of
  // last year's classes moves up to, and creating one of them with the
  // roster the teacher ticked and the courses chosen for copying.
  api("get", "/years/:id/next-classes", (req) => {
    const { people, state } = directory();
    return { state, ...nextYearProposal(db, idParam(req.params.id), people) };
  });
  api("post", "/years/:id/next-classes", (req) => {
    const yearId = idParam(req.params.id);
    const { people } = directory();
    const students = resolveStudents(req.body?.students ?? [], people);
    return createNextClass(db, yearId, { from: req.body?.from, students, courseIds: req.body?.courses ?? [] });
  });

  // Leavers' records past the retention period (exam-year-change D3-D5):
  // the report counts, never names; the purge deletes only what the teacher
  // confirmed, and the log records counts only.
  api("get", "/retention", () => retentionReport(db, viennaToday(), retentionYears));
  api("post", "/retention/purge", (req) => {
    const removed = purgeLeavers(db, viennaToday(), req.body?.expected ?? null, retentionYears);
    const { records } = removed;
    console.log(
      `[exam] Removed the records of ${removed.students} student(s) who left: ${records.results} result(s), ` +
        `${records.overrides} override(s), ${records.attempts} attempt(s), ${records.sittings} sitting participation(s), ` +
        `${records.rosterEntries} roster entry(ies).`
    );
    return removed;
  });

  // ----------------------------------------------------------------- classes

  api("get", "/years/:id/classes", (req) => listClasses(db, idParam(req.params.id)));
  api("post", "/years/:id/classes", (req) => {
    const yearId = idParam(req.params.id);
    const { people } = directory();
    const students = resolveStudents(req.body?.students ?? [], people);
    return createClass(db, yearId, { name: req.body?.name, students });
  });
  // The roster says who is a Matura candidate in which of the class's courses (exam-participant-role D5).
  api("get", "/classes/:id", (req) => {
    const klass = getClass(db, idParam(req.params.id));
    return { ...klass, roster: rosterWithParticipations(db, klass) };
  });
  api("put", "/classes/:id", (req) => renameClass(db, idParam(req.params.id), req.body ?? {}));
  api("delete", "/classes/:id", (req) => deleteClass(db, idParam(req.params.id)));

  // The checklist for a class's name, before or after the class exists. Each
  // candidate says whether the class's roster already has them.
  api("get", "/directory/classes", () => {
    const { people, state } = directory();
    return { state, ...directoryClassNames(people) };
  });
  api("get", "/directory/classes/:name", (req) => {
    const name = normalizeClassName(req.params.name);
    const { people, state } = directory();
    return { state, ...classCandidates(people, name) };
  });
  api("get", "/directory/people", (req) => {
    const { people, state } = directory();
    return { state, ...searchPeople(people, req.query.q) };
  });

  api("post", "/classes/:id/roster", (req) => {
    const classId = idParam(req.params.id);
    const { people } = directory();
    const [student] = resolveStudents([req.body?.username], people);
    return addToRoster(db, classId, student);
  });
  api("delete", "/classes/:id/roster/:username", (req) =>
    removeFromRoster(db, idParam(req.params.id), req.params.username)
  );
  // Names only, never membership.
  api("post", "/classes/:id/names", (req) => {
    const classId = idParam(req.params.id);
    const { people, state } = directory();
    if (!people) return { state, refreshed: 0, roster: getClass(db, classId).roster };
    const refreshed = refreshNames(db, classId, people);
    return { state, refreshed, roster: getClass(db, classId).roster };
  });

  // ----------------------------------------------------------------- courses

  api("post", "/classes/:id/courses", (req) => createCourse(db, idParam(req.params.id), req.body ?? {}));
  // Every category for the config sheet, and how many columns each holds, for the note on a hidden one.
  api("get", "/courses/:id", (req) => ({
    ...getCourse(db, idParam(req.params.id)),
    categories: weightCategories,
    columnCounts: columnCounts(db, idParam(req.params.id)),
  }));
  api("put", "/courses/:id", (req) => updateCourse(db, idParam(req.params.id), req.body ?? {}));
  api("delete", "/courses/:id", (req) => deleteCourse(db, idParam(req.params.id)));

  // ------------------------------------------------------------------- pages

  // Server-rendered shells in the instance's frame, each with the module's bar;
  // the element in each loads its own data from the API above. A new class is
  // created from the bar's dialog, not from a page of its own.
  const page = (path, title, element) =>
    router.get(
      path,
      teacherPage,
      handle(async (req, res) => {
        const { kind, params, context } = element(req);
        res.send(await teacherShell({ db, startPage, req, title, context, kind, params }));
      })
    );

  page("/classes/:id", (t) => t("exam.pages.class"), (req) => {
    const classId = idParam(req.params.id);
    return { kind: "class", params: { class: String(classId) }, context: { classId } };
  });
  page("/courses/:id", (t) => t("exam.pages.course"), (req) => {
    const courseId = idParam(req.params.id);
    return { kind: "course", params: { course: String(courseId) }, context: { courseId } };
  });
}
