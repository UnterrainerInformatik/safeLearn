/**
 * A course's Matura candidates (`exam-participant-role`): the students who
 * hold the course's exam-participant role, a client role on the application's
 * own Keycloak client named after the course's subject and language. The teacher grants and
 * withdraws it from the gradebook; every view that shows a course's students
 * marks its holders.
 *
 * Who holds it is read from the held directory (`heldDirectoryPeople()`), never
 * asked of Keycloak per request; a change is written through the
 * directory-service client, which patches the held directory at once.
 */

import {
  directoryServiceConfigured,
  DirectoryWriteRightsError,
  heldDirectoryPeople,
  setClientRoleHeld,
} from "../middlewares/directory-service.js";
import { ConflictError, getCourse, InvalidInputError, listCourses, rosterOf } from "./classes.js";

/**
 * The role marking the candidates of `course`: one role per subject and
 * language (`examparticipant-wmc-en`), shared by the courses of that subject
 * and language in every class. The only place the name is made; a request
 * never names a role.
 */
export function participantRole({ subject, language }) {
  return `examparticipant-${subject.trim().toLowerCase()}-${language}`;
}

/**
 * True for a class that sits the Matura: a fifth-year class, its name starting
 * with `5` (`5ahif`). Only there is anyone a candidate.
 */
export function maturaClass(className) {
  return /^5/.test(className.trim());
}

/**
 * What the directory can tell about the role right now: `unavailable` on an
 * instance without directory credentials, `loading` while it holds nothing
 * yet, `ready` otherwise - with the directory's people then.
 */
function directoryNow() {
  if (!directoryServiceConfigured()) return { state: "unavailable", people: null };
  const people = heldDirectoryPeople();
  return { state: people ? "ready" : "loading", people };
}

/**
 * The usernames holding the role of `course`, or null while that is not known
 * and in a course of a class below the fifth year.
 */
export function participantHolders(course) {
  if (!maturaClass(course.className)) return null;
  const { people } = directoryNow();
  if (!people) return null;
  const role = participantRole(course);
  return new Set(people.filter((person) => person.roles[role]).map((person) => person.username));
}

/** `person` flagged `examParticipant` when `holders` has them; as it is otherwise, and while nobody is known. */
export function flagParticipant(person, holders) {
  return person && holders?.has(person.username) ? { ...person, examParticipant: true } : person;
}

/**
 * What a gradebook needs beside its rows: whether the toggle can work -
 * `notMaturaClass` below the fifth year - and the role it writes.
 */
export function participantSetup(course) {
  return { state: maturaClass(course.className) ? directoryNow().state : "notMaturaClass", role: participantRole(course) };
}

/**
 * A class's roster with each entry's `examParticipantIn`: the subjects, in lower
 * case, of the class's courses whose role the entry holds. Left as it is while
 * the directory holds nothing, and below the fifth year.
 */
export function rosterWithParticipations(db, klass) {
  const { id: classId, roster } = klass;
  if (!maturaClass(klass.name)) return roster;
  const { people } = directoryNow();
  if (!people) return roster;
  const roles = new Map(people.map((person) => [person.username, person.roles]));
  const courses = listCourses(db, classId);
  return roster.map((entry) => {
    const held = roles.get(entry.username) ?? {};
    const examParticipantIn = courses.filter((course) => held[participantRole(course)]).map((course) => course.subject.toLowerCase());
    return examParticipantIn.length ? { ...entry, examParticipantIn } : entry;
  });
}

/**
 * Grants (`held` true) or withdraws the course's role for `username`, who has
 * to be on the course's class's roster now. Refused below the fifth year, in a closed year, on an
 * instance without directory credentials, and - with a text that names the
 * missing Keycloak setup - when the directory-service client may not write.
 * Answers `{ username, held }`.
 */
export async function setParticipant(db, courseId, username, held) {
  const course = getCourse(db, courseId);
  if (course.year.closed) throw new ConflictError("exam.errors.years.closed");
  if (!maturaClass(course.className)) throw new ConflictError("exam.errors.participants.notMaturaClass");
  if (typeof held !== "boolean") throw new InvalidInputError("exam.errors.participants.held");
  const key = typeof username === "string" ? username.trim().toLowerCase() : "";
  const onRoster = rosterOf(db, course.classId).some((entry) => entry.username === key && entry.leftAt === null);
  if (!onRoster) throw new InvalidInputError("exam.errors.gradebook.notOnCourseRoster", { username: key });
  if (!directoryServiceConfigured()) throw new ConflictError("exam.errors.participants.unavailable");
  try {
    const answer = await setClientRoleHeld(key, participantRole(course), held);
    return { username: key, held: answer.held };
  } catch (error) {
    if (error instanceof DirectoryWriteRightsError) {
      throw new ConflictError(error.step === "create" ? "exam.errors.participants.missingCreateRights" : "exam.errors.participants.missingRights");
    }
    throw error;
  }
}
