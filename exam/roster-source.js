/**
 * Whom a class's checklist offers (design.md, D6): every directory person whose
 * merged role set holds the class's name, the same membership the directory
 * search uses. On an LDAP realm that is the class's OU; on a realm that grants
 * classes as client roles, like the shared demo realm, it is that role.
 *
 * Teachers are never offered and never added: a teacher is never on a roster,
 * which is what keeps a teacher in student view from writing a test.
 *
 * Every function takes the directory's people (`heldDirectoryPeople()`), so it
 * can be driven without a realm. The router passes null when the directory
 * holds nothing yet, and each answer says so instead of offering nobody.
 */

/** A role value that names a class: a year digit and letters, like `5ahif`. */
const classValue = /^[1-9][a-z]{1,8}$/;

function isTeacher(person) {
  return Boolean(person.roles.teacher || person.roles.admin);
}

function byName(a, b) {
  return (
    a.lastName.localeCompare(b.lastName, "de", { sensitivity: "base" }) ||
    a.firstName.localeCompare(b.firstName, "de", { sensitivity: "base" }) ||
    a.username.localeCompare(b.username)
  );
}

/** What the module shows of a directory person: names and username, no roles. */
function entry(person) {
  return { username: person.username, givenName: person.firstName, familyName: person.lastName };
}

/** The class names the directory holds, for the teacher to pick from. */
export function directoryClassNames(people) {
  if (!people) return { ready: false };
  const names = new Set();
  for (const person of people) {
    for (const role of Object.keys(person.roles)) {
      if (classValue.test(role)) names.add(role);
    }
  }
  return { ready: true, classes: [...names].sort() };
}

/**
 * The checklist for `className`: every member of the class's directory unit
 * who is not a teacher, by name. Nobody is marked; the caller ticks.
 */
export function classCandidates(people, className) {
  if (!people) return { ready: false };
  return {
    ready: true,
    candidates: people
      .filter((person) => person.roles[className] && !isTeacher(person))
      .sort(byName)
      .map(entry),
  };
}

/**
 * People from the whole directory whose name or username contains `query`, for
 * adding a student who is in no class's unit yet. Teachers are left out. At
 * most `limit`, and nothing for a query shorter than two characters.
 */
export function searchPeople(people, query, limit = 20) {
  if (!people) return { ready: false };
  const needle = typeof query === "string" ? query.trim().toLowerCase() : "";
  if (needle.length < 2) return { ready: true, people: [] };
  const matches = people.filter((person) => {
    if (isTeacher(person)) return false;
    const name = `${person.firstName} ${person.lastName}`.toLowerCase();
    return person.username.includes(needle) || name.includes(needle);
  });
  return { ready: true, people: matches.sort(byName).slice(0, limit).map(entry) };
}

/** The directory's record of one username, or null. */
export function findPerson(people, username) {
  if (!people) return null;
  const key = typeof username === "string" ? username.trim().toLowerCase() : "";
  return people.find((person) => person.username === key) ?? null;
}

/** Whether the directory knows `username` as a teacher. Unknown people are not. */
export function isKnownTeacher(people, username) {
  const person = findPerson(people, username);
  return person ? isTeacher(person) : false;
}

/** A directory person in the shape the roster records. */
export function asRosterPerson(person) {
  return entry(person);
}
