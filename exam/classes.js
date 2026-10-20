/**
 * School years, classes, rosters and courses (`class-roster`), as plain SQL
 * over the module's database. Every function takes the open database first and
 * is synchronous, like `DatabaseSync` itself. Nothing here knows about HTTP or
 * the directory: the router decides who may call what, and the roster source
 * (`roster-source.js`) decides whom a class's checklist offers.
 */

import { i18nFor } from "../i18n/server.js";

const { t: englishT, format: englishFormat } = i18nFor("en", "de-AT");

/** A day as a message parameter, formatted in the format of whoever reads the message. */
export function dateParam(iso) {
  return { isoDate: iso };
}

/** `params` with every `dateParam` written as a day in `format`. */
function filledParams(params, format) {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [name, value?.isoDate !== undefined ? format.date(value.isoDate) : value])
  );
}

const english = (key, params = {}) => englishT(key, filledParams(params, englishFormat));

/** Whether `text` names a text of the catalogs' `exam.errors` group. */
function isErrorKey(text) {
  return typeof text === "string" && /^exam\.errors\.[\w.]+$/.test(text);
}

/**
 * A refusal a teacher or student reads (`ui-language`): `key` names its text
 * in the catalogs' `exam.errors` group and `params` fill it. The message is
 * the English text, for the log and the unit checks; the module's error
 * handler answers in the reader's language (`readableMessage`). A plain
 * sentence in place of a key is kept as it is.
 */
class Refusal extends Error {
  constructor(key, params = {}) {
    super(isErrorKey(key) ? english(key, params) : key);
    if (isErrorKey(key)) {
      this.key = key;
      this.params = params;
    }
  }
}

/** A request the module refuses as malformed. Answered with 400. */
export class InvalidInputError extends Refusal {}

/** A request that would create something that exists already. Answered with 409. */
export class ConflictError extends Refusal {}

/** A request the session may not make, though the gate let it through. Answered with 403. */
export class ForbiddenError extends Refusal {}

/** A request about a record there is none of. Answered with 404. */
export class NotFoundError extends Refusal {}

/**
 * A problem at a field, as a list of them reports it: `{ field, answer,
 * message }`, the message English like a refusal's. `key` and `params` ride
 * along unlisted, for `readableMessage`, so the problem reads and compares
 * as it did before it could be translated.
 */
export function problemAt(field, key, params = {}, answer = null) {
  return withKey({ field, answer, message: english(key, params) }, key, params);
}

/** `item` with `key` and `params` attached unlisted, for `readableMessage`. */
export function withKey(item, key, params = {}) {
  Object.defineProperty(item, "key", { value: key });
  Object.defineProperty(item, "params", { value: params });
  return item;
}

/** The English text of `key`, for a message built where no refusal is raised. */
export function englishText(key, params = {}) {
  return english(key, params);
}

/**
 * The text of a refusal or of a problem for the reader `i18n` (`i18nOf`): its
 * catalog text in their language, days in their format, where it has a key,
 * else its message as it was written.
 */
export function readableMessage(item, { t, format }) {
  return item.key ? t(item.key, filledParams(item.params ?? {}, format)) : item.message;
}

/**
 * The gradebook's categories, in the order a config sheet lists them, and the
 * weights a new course starts with until a teacher sets its own.
 */
export const weightCategories = Object.freeze(["onlineTests", "manualTests", "participation", "homework"]);
export const defaultWeights = Object.freeze({ onlineTests: 25, manualTests: 25, participation: 25, homework: 25 });

export const languages = Object.freeze(["de", "en"]);

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function now() {
  return new Date().toISOString();
}

/** `value` when it is an ISO date; refused with the refusal `key` names otherwise. */
export function validDate(value, key) {
  if (typeof value !== "string" || !isoDate.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new InvalidInputError(key);
  }
  return value;
}

/**
 * Runs `fn` inside one transaction: everything it writes lands, or nothing
 * does.
 */
export function inTransaction(db, fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** True for SQLite's answer to a broken UNIQUE constraint. */
function isUniqueViolation(error) {
  return /UNIQUE constraint failed/.test(error?.message ?? "");
}

// ---------------------------------------------------------------- school years

function yearFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    startsOn: row.starts_on,
    summerStartsOn: row.summer_starts_on,
    endsOn: row.ends_on,
    current: row.is_current === 1,
  };
}

export function listYears(db) {
  return db.prepare("SELECT * FROM school_year ORDER BY starts_on").all().map(yearFromRow);
}

export function getYear(db, id) {
  const row = db.prepare("SELECT * FROM school_year WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("exam.errors.classes.noYear", { id });
  return yearFromRow(row);
}

export function currentYear(db) {
  const row = db.prepare("SELECT * FROM school_year WHERE is_current = 1").get();
  return row ? yearFromRow(row) : null;
}

/**
 * Creates a school year such as `2026/27`. Its dates have to be in order: the
 * start, then the first day of the summer semester, then the end. The first
 * year there is becomes the current one, so there is always exactly one
 * current year once there is any; a later one is created in advance and made
 * current by `setCurrentYear`.
 */
/** A school year's name as stored, `2026/27`, refused unless the two years follow each other. */
function yearName(name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  const match = /^(\d{4})\/(\d{2})$/.exec(trimmed);
  if (!match || (Number(match[1]) + 1) % 100 !== Number(match[2])) {
    throw new InvalidInputError("exam.errors.classes.yearName");
  }
  return trimmed;
}

export function createYear(db, { name, startsOn, summerStartsOn, endsOn } = {}) {
  const trimmed = yearName(name);
  validDate(startsOn, "exam.errors.classes.yearStartFormat");
  validDate(summerStartsOn, "exam.errors.classes.summerStartFormat");
  validDate(endsOn, "exam.errors.classes.yearEndFormat");
  if (!(startsOn < summerStartsOn && summerStartsOn < endsOn)) {
    throw new InvalidInputError("exam.errors.classes.yearOrder");
  }
  try {
    return inTransaction(db, () => {
      const first = db.prepare("SELECT COUNT(*) AS n FROM school_year").get().n === 0;
      const { lastInsertRowid } = db
        .prepare(
          "INSERT INTO school_year (name, starts_on, summer_starts_on, ends_on, is_current) VALUES (?, ?, ?, ?, ?)"
        )
        .run(trimmed, startsOn, summerStartsOn, endsOn, first ? 1 : 0);
      return getYear(db, Number(lastInsertRowid));
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("exam.errors.classes.yearExists", { name: trimmed });
    throw error;
  }
}

/** Makes `id` the current school year, and every other one not current. */
export function setCurrentYear(db, id) {
  getYear(db, id);
  inTransaction(db, () => {
    db.prepare("UPDATE school_year SET is_current = 0 WHERE is_current = 1").run();
    db.prepare("UPDATE school_year SET is_current = 1 WHERE id = ?").run(id);
  });
  return getYear(db, id);
}

/**
 * Renames a school year, by the same rules as on creation (exam-ui-consistency
 * design D8). Nothing else of the year changes.
 */
export function renameYear(db, id, { name } = {}) {
  getYear(db, id);
  const trimmed = yearName(name);
  try {
    db.prepare("UPDATE school_year SET name = ? WHERE id = ?").run(trimmed, id);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("exam.errors.classes.yearExists", { name: trimmed });
    throw error;
  }
  return getYear(db, id);
}

/** Deletes a school year that is not the current one and has no classes. */
export function deleteYear(db, id) {
  const year = getYear(db, id);
  if (year.current) throw new ConflictError("exam.errors.classes.yearIsCurrent", { name: year.name });
  const classes = db.prepare("SELECT COUNT(*) AS n FROM class WHERE school_year_id = ?").get(id).n;
  if (classes > 0) throw new ConflictError("exam.errors.classes.yearHasClasses", { name: year.name, count: classes });
  db.prepare("DELETE FROM school_year WHERE id = ?").run(id);
  return { deleted: id };
}

// --------------------------------------------------------------------- classes

/**
 * A class name as the module stores it: lowercased, the way the directory's
 * role values are (`5AHIF` → `5ahif`). It is the value the class's checklist
 * looks members up by, so it allows what a directory unit's name allows.
 */
export function normalizeClassName(name) {
  const normalized = typeof name === "string" ? name.trim().toLowerCase() : "";
  if (!/^[0-9a-z][0-9a-z_-]{0,31}$/.test(normalized)) {
    throw new InvalidInputError("exam.errors.classes.className");
  }
  return normalized;
}

/**
 * A person as the roster records them: the lowercased directory username and
 * the names known for them, if any.
 */
function normalizePerson(person) {
  const username = typeof person?.username === "string" ? person.username.trim().toLowerCase() : "";
  if (!/^[^\s/]{1,128}$/.test(username)) {
    throw new InvalidInputError("exam.errors.classes.studentUsername");
  }
  const name = (value) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null);
  return { username, givenName: name(person.givenName), familyName: name(person.familyName) };
}

/**
 * Records the person, or updates the names of one already recorded. A name the
 * caller does not know never erases one the module has.
 */
function upsertStudent(db, person) {
  db.prepare(
    `INSERT INTO student (username, given_name, family_name, names_refreshed_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (username) DO UPDATE SET
       given_name = COALESCE(excluded.given_name, student.given_name),
       family_name = COALESCE(excluded.family_name, student.family_name),
       names_refreshed_at = COALESCE(excluded.names_refreshed_at, student.names_refreshed_at)`
  ).run(
    person.username,
    person.givenName,
    person.familyName,
    person.givenName || person.familyName ? now() : null
  );
}

function classFromRow(row) {
  return {
    id: row.id,
    yearId: row.school_year_id,
    name: row.name,
    students: row.students ?? 0,
    courses: row.courses ?? 0,
  };
}

/** The classes of a school year, with how many attend and how many courses each has. */
export function listClasses(db, yearId) {
  getYear(db, yearId);
  return db
    .prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM roster_entry r WHERE r.class_id = c.id AND r.left_at IS NULL) AS students,
         (SELECT COUNT(*) FROM course k WHERE k.class_id = c.id) AS courses
       FROM class c WHERE c.school_year_id = ? ORDER BY c.name`
    )
    .all(yearId)
    .map(classFromRow);
}

/**
 * The roster of a class: everyone ever on it this year, those who left marked
 * with when. Ordered by family name, then given name, then username, with
 * those still attending first.
 */
export function rosterOf(db, classId) {
  return db
    .prepare(
      `SELECT r.username, s.given_name, s.family_name, r.joined_at, r.left_at
       FROM roster_entry r JOIN student s ON s.username = r.username
       WHERE r.class_id = ?
       ORDER BY r.left_at IS NOT NULL, s.family_name COLLATE NOCASE, s.given_name COLLATE NOCASE, r.username`
    )
    .all(classId)
    .map((row) => ({
      username: row.username,
      givenName: row.given_name,
      familyName: row.family_name,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
    }));
}

export function getClass(db, id) {
  const row = db.prepare("SELECT * FROM class WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("exam.errors.classes.noClass", { id });
  const year = getYear(db, row.school_year_id);
  return { ...classFromRow(row), year, roster: rosterOf(db, id), courses: listCourses(db, id) };
}

/**
 * Creates a class for a school year with the people the teacher ticked as its
 * roster - and only those. Nobody is added because the directory lists them;
 * the caller passes exactly the ticked ones.
 */
export function createClass(db, yearId, { name, students = [] } = {}) {
  getYear(db, yearId);
  const normalized = normalizeClassName(name);
  if (!Array.isArray(students)) throw new InvalidInputError("exam.errors.classes.rosterList");
  const people = students.map(normalizePerson);
  try {
    return inTransaction(db, () => {
      const { lastInsertRowid } = db
        .prepare("INSERT INTO class (school_year_id, name) VALUES (?, ?)")
        .run(yearId, normalized);
      const classId = Number(lastInsertRowid);
      const joinedAt = now();
      const enter = db.prepare(
        "INSERT OR IGNORE INTO roster_entry (class_id, username, joined_at) VALUES (?, ?, ?)"
      );
      for (const person of people) {
        upsertStudent(db, person);
        enter.run(classId, person.username, joinedAt);
      }
      return getClass(db, classId);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("exam.errors.classes.classExists", { name: normalized.toUpperCase() });
    }
    throw error;
  }
}

/**
 * Renames a class - the module's record only, meant for a typo (design D8).
 * The roster proposals look the directory up by the new name from then on.
 */
export function renameClass(db, id, { name } = {}) {
  const klass = getClass(db, id);
  const normalized = normalizeClassName(name);
  try {
    db.prepare("UPDATE class SET name = ? WHERE id = ?").run(normalized, id);
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("exam.errors.classes.classExists", { name: normalized.toUpperCase() });
    throw error;
  }
  return klass.name === normalized ? klass : getClass(db, id);
}

/** Deletes a class that has no courses, with its roster; the students' records stay. */
export function deleteClass(db, id) {
  const klass = getClass(db, id);
  if (klass.courses.length > 0) {
    throw new ConflictError("exam.errors.classes.classHasCourses", { name: klass.name.toUpperCase(), count: klass.courses.length });
  }
  inTransaction(db, () => {
    db.prepare("DELETE FROM roster_entry WHERE class_id = ?").run(id);
    db.prepare("DELETE FROM class WHERE id = ?").run(id);
  });
  return { deleted: id, yearId: klass.year.id };
}

/**
 * Puts a student on a class's roster during the year. Someone who left the
 * roster earlier and comes back is on it again from now, with their records
 * from before still theirs.
 */
export function addToRoster(db, classId, person) {
  getClass(db, classId);
  const student = normalizePerson(person);
  return inTransaction(db, () => {
    upsertStudent(db, student);
    const entry = db
      .prepare("SELECT left_at FROM roster_entry WHERE class_id = ? AND username = ?")
      .get(classId, student.username);
    if (entry && entry.left_at === null) {
      throw new ConflictError("exam.errors.classes.onRosterAlready", { username: student.username });
    }
    if (entry) {
      db.prepare("UPDATE roster_entry SET left_at = NULL WHERE class_id = ? AND username = ?").run(
        classId,
        student.username
      );
    } else {
      db.prepare("INSERT INTO roster_entry (class_id, username, joined_at) VALUES (?, ?, ?)").run(
        classId,
        student.username,
        now()
      );
    }
    return rosterOf(db, classId);
  });
}

/**
 * Takes a student off a class's roster. The entry is kept and marked as left,
 * so everything already recorded for them in the class's courses stays theirs
 * and visible to the class's teachers.
 */
export function removeFromRoster(db, classId, username) {
  getClass(db, classId);
  const key = typeof username === "string" ? username.trim().toLowerCase() : "";
  const { changes } = db
    .prepare("UPDATE roster_entry SET left_at = ? WHERE class_id = ? AND username = ? AND left_at IS NULL")
    .run(now(), classId, key);
  if (changes === 0) throw new NotFoundError("exam.errors.classes.notOnRoster", { username: key });
  return rosterOf(db, classId);
}

/**
 * Updates the names of the people on a class's roster from `people` (what the
 * directory holds now, as `heldDirectoryPeople()` answers it). Membership is never touched: a person the directory no
 * longer lists, or lists in another class, stays where the roster has them.
 * Answers how many people's names were looked up.
 */
export function refreshNames(db, classId, people) {
  const roster = rosterOf(db, classId);
  const byUsername = new Map(people.map((person) => [person.username, person]));
  let refreshed = 0;
  inTransaction(db, () => {
    const update = db.prepare(
      "UPDATE student SET given_name = ?, family_name = ?, names_refreshed_at = ? WHERE username = ?"
    );
    for (const entry of roster) {
      const person = byUsername.get(entry.username);
      if (!person) continue;
      const given = person.firstName?.trim() || entry.givenName;
      const family = person.lastName?.trim() || entry.familyName;
      update.run(given ?? null, family ?? null, now(), entry.username);
      refreshed += 1;
    }
  });
  return refreshed;
}

// --------------------------------------------------------------------- courses

/**
 * A config sheet's weights: one whole percentage per category, 0 to 100, that
 * together make 100. Anything else is refused rather than repaired.
 */
export function normalizeWeights(weights) {
  if (weights === null || typeof weights !== "object" || Array.isArray(weights)) {
    throw new InvalidInputError("exam.errors.classes.weightsShape");
  }
  const unknown = Object.keys(weights).filter((key) => !weightCategories.includes(key));
  if (unknown.length > 0) {
    throw new InvalidInputError("exam.errors.classes.noWeightCategory", { names: unknown.join(", ") });
  }
  const normalized = {};
  for (const category of weightCategories) {
    const value = weights[category];
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new InvalidInputError("exam.errors.classes.weightRange", { category });
    }
    normalized[category] = value;
  }
  const sum = weightCategories.reduce((total, category) => total + normalized[category], 0);
  if (sum !== 100) {
    throw new InvalidInputError("exam.errors.classes.weightsSum", { sum });
  }
  return normalized;
}

/**
 * The winter semester's share in the year grade: a whole percentage from 0 to
 * 100 (`year-grade`). The summer semester has the rest.
 */
export function normalizeWinterShare(share) {
  if (!Number.isInteger(share) || share < 0 || share > 100) {
    throw new InvalidInputError("exam.errors.classes.winterShare");
  }
  return share;
}

function normalizeLanguage(language) {
  if (!languages.includes(language)) {
    throw new InvalidInputError("exam.errors.classes.courseLanguage", { languages: languages.join(", ") });
  }
  return language;
}

function normalizeSubject(subject) {
  const trimmed = typeof subject === "string" ? subject.trim() : "";
  if (trimmed.length === 0 || trimmed.length > 40) {
    throw new InvalidInputError("exam.errors.classes.courseSubject");
  }
  return trimmed;
}

function courseFromRow(row) {
  return {
    id: row.id,
    classId: row.class_id,
    subject: row.subject,
    language: row.language,
    weights: { ...defaultWeights, ...JSON.parse(row.weights) },
    winterShare: row.winter_share,
  };
}

export function listCourses(db, classId) {
  return db
    .prepare("SELECT * FROM course WHERE class_id = ? ORDER BY subject COLLATE NOCASE")
    .all(classId)
    .map(courseFromRow);
}

/** A course with the class and school year it belongs to. */
export function getCourse(db, id) {
  const row = db.prepare("SELECT * FROM course WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("exam.errors.classes.noCourse", { id });
  const klass = db.prepare("SELECT * FROM class WHERE id = ?").get(row.class_id);
  return {
    ...courseFromRow(row),
    className: klass.name,
    year: getYear(db, klass.school_year_id),
  };
}

/**
 * Creates the course `subject` for a class, in its school year. A class has
 * each subject once, however it is capitalized; a second attempt is refused.
 * The course has no owner - every teacher sees and edits it.
 */
export function createCourse(db, classId, { subject, language = "de", weights = defaultWeights, winterShare = 50 } = {}) {
  getClass(db, classId);
  const values = {
    subject: normalizeSubject(subject),
    language: normalizeLanguage(language),
    weights: normalizeWeights(weights),
    winterShare: normalizeWinterShare(winterShare),
  };
  try {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO course (class_id, subject, language, weights, winter_share) VALUES (?, ?, ?, ?, ?)")
      .run(classId, values.subject, values.language, JSON.stringify(values.weights), values.winterShare);
    return getCourse(db, Number(lastInsertRowid));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("exam.errors.classes.courseExists", { subject: values.subject });
    }
    throw error;
  }
}

/**
 * Changes a course's language or its config sheet - the weights and the winter
 * semester's share in the year grade. New values apply to every student and
 * every semester of the course; proposals are computed on read, so they follow
 * at once, and overrides are not touched.
 */
export function updateCourse(db, id, { subject, language, weights, winterShare } = {}) {
  const course = getCourse(db, id);
  const next = {
    subject: subject === undefined ? course.subject : normalizeSubject(subject),
    language: language === undefined ? course.language : normalizeLanguage(language),
    weights: weights === undefined ? course.weights : normalizeWeights(weights),
    winterShare: winterShare === undefined ? course.winterShare : normalizeWinterShare(winterShare),
  };
  try {
    db.prepare("UPDATE course SET subject = ?, language = ?, weights = ?, winter_share = ? WHERE id = ?").run(
      next.subject,
      next.language,
      JSON.stringify(next.weights),
      next.winterShare,
      id
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("exam.errors.classes.courseExists", { subject: next.subject });
    throw error;
  }
  return getCourse(db, id);
}

/**
 * Deletes a course nothing depends on: no gradebook column (an empty one
 * counts), no result, no semester grade and no online test (design D8). The
 * refusal names each by its count.
 */
export function deleteCourse(db, id) {
  const course = getCourse(db, id);
  const count = (sql) => db.prepare(sql).get(id).n;
  const held = {
    columns: count("SELECT COUNT(*) AS n FROM assessment WHERE course_id = ?"),
    entries: count("SELECT COUNT(*) AS n FROM manual_entry e JOIN assessment a ON a.id = e.assessment_id WHERE a.course_id = ?"),
    grades: count("SELECT COUNT(*) AS n FROM semester_grade WHERE course_id = ?"),
    tests: count("SELECT COUNT(*) AS n FROM test WHERE course_id = ?") + count("SELECT COUNT(*) AS n FROM question_usage WHERE course_id = ?"),
  };
  if (Object.values(held).some((n) => n > 0)) throw new ConflictError("exam.errors.classes.courseInUse", { subject: course.subject, ...held });
  db.prepare("DELETE FROM course WHERE id = ?").run(id);
  return { deleted: id, classId: course.classId };
}
