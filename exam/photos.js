/**
 * A photo per student (`student-photos`): checking an image by its header,
 * storing it per directory username, the version a list's payload carries,
 * matching an import against the held directory, and the admin's summary and
 * deletions (design D1, D2, D4, D7).
 *
 * Nothing here decides who may see a photo; `gate.js` does
 * (`holdsStudentImages`), and the routes in `routes-photos.js` ask it.
 */

import { ConflictError, InvalidInputError, inTransaction, now } from "./classes.js";
import { isTeacher } from "./roster-source.js";

/** The largest photo stored, in bytes, and the longest side, in pixels. */
export const photoLimitBytes = 256 * 1024;
export const photoLimitPixels = 600;

/** A role value that names a class: a year digit and letters, like `5ahif` (as in `roster-source.js`). */
const classValue = /^[1-9][a-z]{1,8}$/;

// ------------------------------------------------------------------ the image

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * The PNG's size from its IHDR chunk, which the format requires right after
 * the signature, or null.
 */
function pngSize(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(pngSignature)) return null;
  if (bytes.toString("latin1", 12, 16) !== "IHDR") return null;
  return { mime: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The start-of-frame markers that carry a JPEG's size: C0-CF without DHT (C4), JPG (C8) and DAC (CC). */
function isStartOfFrame(marker) {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * The JPEG's size from its first start-of-frame segment, walking the
 * segments from the start-of-image marker, or null when the bytes are no
 * JPEG or end before a frame.
 */
function jpegSize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    // Fill bytes before a marker.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // Markers without a length: TEM and the restart markers.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    // The end of the image, or the scan, before any frame: no size to read.
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = bytes.readUInt16BE(at + 2);
    if (length < 2) return null;
    if (isStartOfFrame(marker)) {
      if (at + 9 > bytes.length) return null;
      return { mime: "image/jpeg", height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
    }
    at += 2 + length;
  }
  return null;
}

/**
 * What `bytes` are as a photo: `{ mime, width, height }`, judged by the
 * image's own header and never by a file name. Refused unless it is a JPEG or
 * PNG of at most `photoLimitBytes` and `photoLimitPixels` on its longer side.
 */
export function checkPhoto(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new InvalidInputError("exam.errors.photos.notAnImage");
  if (bytes.length > photoLimitBytes) throw new InvalidInputError("exam.errors.photos.tooLarge", { kb: photoLimitBytes / 1024 });
  const size = pngSize(bytes) ?? jpegSize(bytes);
  if (!size || size.width < 1 || size.height < 1) throw new InvalidInputError("exam.errors.photos.notAnImage");
  if (Math.max(size.width, size.height) > photoLimitPixels) {
    throw new InvalidInputError("exam.errors.photos.tooWide", { px: photoLimitPixels });
  }
  return size;
}

// ---------------------------------------------------------------- the store

/** A username as the module records it, or null for one it cannot be. */
export function photoUsername(value) {
  const username = typeof value === "string" ? value.trim().toLowerCase() : "";
  return username.length > 0 && username.length <= 256 && !/[\s/\\]/.test(username) ? username : null;
}

/**
 * The version a payload carries for a photo: its import time as a short
 * token, so a replaced photo has a new URL (design D2).
 */
export function photoVersion(importedAt) {
  const ms = Date.parse(importedAt);
  return Number.isFinite(ms) ? ms.toString(36) : String(importedAt);
}

/**
 * Stores `bytes` as the photo of `username`, replacing the one it had.
 * Answers what is stored now, without the image.
 */
export function storePhoto(db, username, bytes, importedBy, at = now()) {
  const key = photoUsername(username);
  if (key === null) throw new InvalidInputError("exam.errors.photos.username");
  const { mime, width, height } = checkPhoto(bytes);
  db.prepare(
    `INSERT INTO student_photo (username, image, mime, width, height, imported_at, imported_by) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (username) DO UPDATE SET image = excluded.image, mime = excluded.mime, width = excluded.width,
       height = excluded.height, imported_at = excluded.imported_at, imported_by = excluded.imported_by`
  ).run(key, bytes, mime, width, height, at, importedBy);
  return { username: key, mime, width, height, importedAt: at, importedBy, version: photoVersion(at) };
}

/** The photo of `username` with its image, or null. */
export function readPhoto(db, username) {
  const key = photoUsername(username);
  if (key === null) return null;
  const row = db.prepare("SELECT * FROM student_photo WHERE username = ?").get(key);
  if (!row) return null;
  return {
    username: row.username,
    image: Buffer.from(row.image),
    mime: row.mime,
    width: row.width,
    height: row.height,
    importedAt: row.imported_at,
    importedBy: row.imported_by,
    version: photoVersion(row.imported_at),
  };
}

/** The versions of the photos the given usernames have, as a Map; one query, no image read. */
export function photoVersions(db, usernames) {
  const keys = [...new Set(usernames.filter((name) => typeof name === "string"))];
  const versions = new Map();
  if (keys.length === 0) return versions;
  const rows = db
    .prepare("SELECT username, imported_at FROM student_photo WHERE username IN (SELECT value FROM json_each(?))")
    .all(JSON.stringify(keys));
  for (const row of rows) versions.set(row.username, photoVersion(row.imported_at));
  return versions;
}

/**
 * `rows` with the field `photo` on each, the version or null, for a session
 * that may see photos (design D2). The rows are copied, never changed; a row
 * that is null stays null.
 */
export function withPhotoVersions(db, rows) {
  const versions = photoVersions(db, rows.filter(Boolean).map((row) => row.username));
  return rows.map((row) => (row ? { ...row, photo: versions.get(row.username) ?? null } : row));
}

// -------------------------------------------------------- summary, deletion

function classesOf(person) {
  return Object.keys(person.roles).filter((role) => person.roles[role] && classValue.test(role));
}

function storedUsernames(db) {
  return db.prepare("SELECT username FROM student_photo ORDER BY username").all().map((row) => row.username);
}

/**
 * What the module holds, for the import page (design D7): the number of
 * photos, those per directory class, and the usernames whose person the
 * directory no longer holds. Without a directory (`people` null) the photos
 * without a person cannot be told, and are null.
 */
export function photoSummary(db, people) {
  const usernames = storedUsernames(db);
  if (!people) return { ready: false, total: usernames.length, classes: [], withoutPerson: null };
  const byUsername = new Map(people.map((person) => [person.username, person]));
  const perClass = new Map();
  const withoutPerson = [];
  for (const username of usernames) {
    const person = byUsername.get(username);
    if (!person) {
      withoutPerson.push(username);
      continue;
    }
    for (const name of classesOf(person)) perClass.set(name, (perClass.get(name) ?? 0) + 1);
  }
  const classes = [...perClass.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, photos]) => ({ name, photos }));
  return { ready: true, total: usernames.length, classes, withoutPerson };
}

/**
 * Deletes photos, after the admin confirmed `expected` of them (design D7):
 * `scope` is `withoutPerson`, `class` (with `className`) or `all`. A number
 * that no longer fits - someone imported or the directory changed meanwhile -
 * is refused, so nothing is deleted the admin was not told of. Answers the
 * number deleted.
 */
export function deletePhotos(db, people, { scope, className, expected } = {}) {
  if (!Number.isInteger(expected) || expected < 0) throw new InvalidInputError("exam.errors.photos.expected");
  return inTransaction(db, () => {
    let usernames;
    if (scope === "all") usernames = storedUsernames(db);
    else if (scope === "withoutPerson") {
      if (!people) throw new ConflictError("exam.errors.photos.directoryNotReady");
      usernames = photoSummary(db, people).withoutPerson;
    } else if (scope === "class") {
      const name = typeof className === "string" ? className.trim().toLowerCase() : "";
      if (!classValue.test(name)) throw new InvalidInputError("exam.errors.photos.className");
      if (!people) throw new ConflictError("exam.errors.photos.directoryNotReady");
      const members = new Set(people.filter((person) => person.roles[name]).map((person) => person.username));
      usernames = storedUsernames(db).filter((username) => members.has(username));
    } else throw new InvalidInputError("exam.errors.photos.scope");
    if (usernames.length !== expected) throw new ConflictError("exam.errors.photos.countChanged", { count: usernames.length });
    const remove = db.prepare("DELETE FROM student_photo WHERE username = ?");
    for (const username of usernames) remove.run(username);
    return { deleted: usernames.length };
  });
}

// ----------------------------------------------------------------- matching

/** A name as the matching compares it: lowercase, accents stripped, white space single. */
export function normalizedName(value) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()
    : "";
}

/** Several given names as a set, so their order does not matter. */
function givenNameKey(value) {
  return [...new Set(normalizedName(value).split(" ").filter(Boolean))].sort().join(" ");
}

function shown(person, className) {
  return { username: person.username, familyName: person.lastName, givenName: person.firstName, class: className };
}

/** A file's name without its extension, as a username; null for none. */
function fileUsername(file) {
  if (typeof file !== "string") return null;
  const base = file.split(/[\\/]/).pop().replace(/\.[^.]*$/, "");
  return photoUsername(base);
}

/** The largest number of entries one match request takes. */
export const matchLimit = 500;

/**
 * Matches the metadata of an import against the directory (design D4):
 * `entries` are `{ key, file, class, familyName, givenName }`, no images. A
 * file whose name without extension is a directory username matches that
 * person. Otherwise class, family name and given names have to fit one
 * person of that class, ignoring case, accents and the order of several given
 * names. Teachers are never candidates. Answers every key in one of
 * `matched` (one person), `ambiguous` (with the candidates) and `unmatched`.
 */
export function matchPhotos(people, entries) {
  if (!people) throw new ConflictError("exam.errors.photos.directoryNotReady");
  if (!Array.isArray(entries) || entries.length > matchLimit) throw new InvalidInputError("exam.errors.photos.entries", { limit: matchLimit });
  const students = people.filter((person) => !isTeacher(person));
  const byUsername = new Map(students.map((person) => [person.username, person]));
  const byName = new Map();
  for (const person of students) {
    for (const name of classesOf(person)) {
      const key = `${name}\u0000${normalizedName(person.lastName)}\u0000${givenNameKey(person.firstName)}`;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(shown(person, name));
    }
  }
  const matched = [];
  const ambiguous = [];
  const unmatched = [];
  const seen = new Set();
  for (const entry of entries) {
    const key = typeof entry?.key === "string" ? entry.key.slice(0, 200) : null;
    if (key === null || seen.has(key)) throw new InvalidInputError("exam.errors.photos.entries", { limit: matchLimit });
    seen.add(key);
    const named = byUsername.get(fileUsername(entry.file));
    if (named) {
      matched.push({ key, person: shown(named, classesOf(named)[0] ?? null) });
      continue;
    }
    const className = normalizedName(entry.class).replace(/\s/g, "");
    const family = normalizedName(entry.familyName);
    const given = givenNameKey(entry.givenName);
    const candidates = className && family && given ? (byName.get(`${className}\u0000${family}\u0000${given}`) ?? []) : [];
    if (candidates.length === 1) matched.push({ key, person: candidates[0] });
    else if (candidates.length > 1) ambiguous.push({ key, candidates });
    else unmatched.push({ key });
  }
  return { matched, ambiguous, unmatched };
}
