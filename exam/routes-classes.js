/**
 * The routes of classes and courses (`class-roster`): school years, classes
 * with their rosters, the directory checklist, and courses with their config
 * sheets. Every one of them is a teacher's: the API refuses any other session
 * with 403, and the pages are not there for it at all (`gate.js`). A teacher in
 * student view is refused like a student.
 */

import {
  addToRoster,
  createClass,
  createCourse,
  createYear,
  currentYear,
  getClass,
  getCourse,
  InvalidInputError,
  listClasses,
  listYears,
  NotFoundError,
  normalizeClassName,
  refreshNames,
  removeFromRoster,
  setCurrentYear,
  updateCourse,
  weightCategories,
} from "./classes.js";
import {
  asRosterPerson,
  classCandidates,
  directoryClassNames,
  findPerson,
  isKnownTeacher,
  searchPeople,
} from "./roster-source.js";
import { requireTeacher, teacherPage } from "./gate.js";
import { embedPlaceholder, wrapInPage } from "../obsidian.js";
import { directoryServiceConfigured, heldDirectoryPeople } from "../middlewares/directory-service.js";

/** A record id from the path; anything but a positive integer names nothing. */
function idParam(value) {
  const id = /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("There is no such record.");
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
  if (!Array.isArray(usernames)) throw new InvalidInputError("The roster is a list of usernames.");
  return usernames.map((username) => {
    if (typeof username !== "string") throw new InvalidInputError("The roster is a list of usernames.");
    if (isKnownTeacher(people, username)) {
      throw new InvalidInputError(`${username.trim().toLowerCase()} is a teacher, and a teacher is never on a roster.`);
    }
    const person = findPerson(people, username);
    return person ? asRosterPerson(person) : { username };
  });
}

/**
 * Registers the routes on the module's router. `handle` wraps an async handler
 * so a throw reaches the module's error handler; `db` is the open database.
 */
export function registerClassRoutes(router, { db, handle, startPage }) {
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

  // ----------------------------------------------------------------- classes

  api("get", "/years/:id/classes", (req) => listClasses(db, idParam(req.params.id)));
  api("post", "/years/:id/classes", (req) => {
    const yearId = idParam(req.params.id);
    const { people } = directory();
    const students = resolveStudents(req.body?.students ?? [], people);
    return createClass(db, yearId, { name: req.body?.name, students });
  });
  api("get", "/classes/:id", (req) => getClass(db, idParam(req.params.id)));

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
  api("get", "/courses/:id", (req) => ({ ...getCourse(db, idParam(req.params.id)), categories: weightCategories }));
  api("put", "/courses/:id", (req) => updateCourse(db, idParam(req.params.id), req.body ?? {}));

  // ------------------------------------------------------------------- pages

  // Server-rendered shells in the instance's frame; the element in each loads
  // its own data from the API above.
  const page = (path, title, element) =>
    router.get(
      path,
      teacherPage,
      handle(async (req, res) => {
        const { kind, params } = element(req);
        const body = `
          <p class="sl-exam-crumbs"><a href="/exam/">Classes and courses</a></p>
          <h1>${title}</h1>
          ${embedPlaceholder(kind, params)}`;
        res.send(await wrapInPage(body, startPage(), req, { title, wide: true }));
      })
    );

  page("/classes/new", "New class", (req) => ({
    kind: "class-new",
    params: { year: String(idParam(String(req.query.year ?? ""))) },
  }));
  page("/classes/:id", "Class", (req) => ({ kind: "class", params: { class: String(idParam(req.params.id)) } }));
  page("/courses/:id", "Course", (req) => ({ kind: "course", params: { course: String(idParam(req.params.id)) } }));
}
