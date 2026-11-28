/**
 * The routes of classes and courses (`class-roster`): school years, classes
 * with their rosters, the directory checklist, and courses with their config
 * sheets. Every one of them is a teacher's: the API refuses any other session
 * with 403, and the pages are not there for it at all (`gate.js`). A teacher in
 * student view is refused like a student.
 *
 * A teacher sees only the classes they are entered in (`class-teachers`): every
 * route naming a class or a course asks the request's scope first, and one it
 * does not see is answered as one that does not exist. Creating, renaming and
 * deleting a class, the year change's class step and the class's teacher list
 * are an admin's.
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
  directoryTeachers,
  enterTeacher,
  getClass,
  getCourse,
  InvalidInputError,
  listClasses,
  listClassTeachers,
  listYears,
  nextYearProposal,
  NotFoundError,
  normalizeClassName,
  refreshNames,
  removeFromRoster,
  removeTeacher,
  renameClass,
  renameYear,
  setCurrentYear,
  updateCourse,
  viennaToday,
  visibleRecord,
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
import { actsAsAdmin, classScope, holdsStudentImages, requireAdmin, requireTeacher, teacherPage } from "./gate.js";
import { withPhotoVersions } from "./photos.js";
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
function heldDirectory() {
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
 * `directory` answers what the directory holds now; the checks pass one of
 * their own.
 */
export function registerClassRoutes(router, { db, handle, startPage, retentionYears, directory = heldDirectory }) {
  const api = (method, path, fn, gate = requireTeacher) =>
    router[method](
      `/api${path}`,
      gate,
      handle(async (req, res) => {
        res.json(await fn(req));
      })
    );
  const adminApi = (method, path, fn) => api(method, path, fn, requireAdmin);
  // The id of a record of `kind` from the path, refused as missing outside the request's scope.
  const seen = async (req, kind, value) => visibleRecord(db, await classScope(db, req), kind, idParam(value));

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
  // It creates classes, so it is an admin's (class-bound-teachers, task 3.3).
  adminApi("get", "/years/:id/next-classes", (req) => {
    const { people, state } = directory();
    return { state, ...nextYearProposal(db, idParam(req.params.id), people) };
  });
  adminApi("post", "/years/:id/next-classes", (req) => {
    const yearId = idParam(req.params.id);
    const { people } = directory();
    const students = resolveStudents(req.body?.students ?? [], people);
    return createNextClass(db, yearId, {
      from: req.body?.from,
      students,
      teachers: req.body?.teachers ?? [],
      directory: people,
      courseIds: req.body?.courses ?? [],
    });
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

  // The classes the session sees; for an admin with the teachers entered in
  // each, those without any first (class-bound-teachers D8).
  api("get", "/years/:id/classes", async (req) =>
    listClasses(db, idParam(req.params.id), await classScope(db, req), { teachers: await actsAsAdmin(req) })
  );
  adminApi("post", "/years/:id/classes", (req) => {
    const yearId = idParam(req.params.id);
    const { people } = directory();
    const students = resolveStudents(req.body?.students ?? [], people);
    return createClass(db, yearId, { name: req.body?.name, students, teachers: req.body?.teachers ?? [], directory: people });
  });
  // The roster says who is a Matura candidate in which of the class's courses
  // (exam-participant-role D5), and for a session holding `student-images`
  // each entry's photo version (student-photos D2). The class is one the
  // session sees, so every row of it may carry one (class-bound-teachers D4).
  api("get", "/classes/:id", async (req) => {
    const klass = getClass(db, await seen(req, "class", req.params.id));
    const roster = rosterWithParticipations(db, klass);
    return {
      ...klass,
      teachers: listClassTeachers(db, klass.id, directory().people),
      roster: (await holdsStudentImages(req)) ? withPhotoVersions(db, roster) : roster,
    };
  });
  adminApi("put", "/classes/:id", (req) => renameClass(db, idParam(req.params.id), req.body ?? {}));
  adminApi("delete", "/classes/:id", (req) => deleteClass(db, idParam(req.params.id)));

  // The teachers entered in a class (`class-teachers`): shown to everyone who
  // sees the class, maintained by an admin from the directory's teachers.
  api("get", "/classes/:id/teachers", async (req) => listClassTeachers(db, await seen(req, "class", req.params.id), directory().people));
  adminApi("post", "/classes/:id/teachers", (req) => enterTeacher(db, idParam(req.params.id), req.body?.username, directory().people));
  adminApi("delete", "/classes/:id/teachers/:username", (req) =>
    removeTeacher(db, idParam(req.params.id), req.params.username, directory().people)
  );
  // The admin's picker: the directory's teachers, by name.
  adminApi("get", "/directory/teachers", () => {
    const { people, state } = directory();
    return { state, ready: people !== null, teachers: directoryTeachers(people) };
  });

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

  api("post", "/classes/:id/roster", async (req) => {
    const classId = await seen(req, "class", req.params.id);
    const { people } = directory();
    const [student] = resolveStudents([req.body?.username], people);
    return addToRoster(db, classId, student);
  });
  api("delete", "/classes/:id/roster/:username", async (req) =>
    removeFromRoster(db, await seen(req, "class", req.params.id), req.params.username)
  );
  // Names only, never membership.
  api("post", "/classes/:id/names", async (req) => {
    const classId = await seen(req, "class", req.params.id);
    const { people, state } = directory();
    if (!people) return { state, refreshed: 0, roster: getClass(db, classId).roster };
    const refreshed = refreshNames(db, classId, people);
    return { state, refreshed, roster: getClass(db, classId).roster };
  });

  // ----------------------------------------------------------------- courses

  api("post", "/classes/:id/courses", async (req) => createCourse(db, await seen(req, "class", req.params.id), req.body ?? {}));
  // Every category for the config sheet, and how many columns each holds, for the note on a hidden one.
  api("get", "/courses/:id", async (req) => {
    const id = await seen(req, "course", req.params.id);
    return { ...getCourse(db, id), categories: weightCategories, columnCounts: columnCounts(db, id) };
  });
  api("put", "/courses/:id", async (req) => updateCourse(db, await seen(req, "course", req.params.id), req.body ?? {}));
  api("delete", "/courses/:id", async (req) => deleteCourse(db, await seen(req, "course", req.params.id)));

  // ------------------------------------------------------------------- pages

  // Server-rendered shells in the instance's frame, each with the module's bar;
  // the element in each loads its own data from the API above. A new class is
  // created from the bar's dialog, not from a page of its own.
  const page = (path, title, element) =>
    router.get(
      path,
      teacherPage,
      handle(async (req, res) => {
        const { kind, params, context } = await element(req);
        res.send(await teacherShell({ db, startPage, req, title, context, kind, params }));
      })
    );

  page("/classes/:id", (t) => t("exam.pages.class"), async (req) => {
    const classId = await seen(req, "class", req.params.id);
    return { kind: "class", params: { class: String(classId) }, context: { classId } };
  });
  page("/courses/:id", (t) => t("exam.pages.course"), async (req) => {
    const courseId = await seen(req, "course", req.params.id);
    return { kind: "course", params: { course: String(courseId) }, context: { courseId } };
  });
}
