/**
 * The routes of students' photos (`student-photos`, design D2, D4, D7): the
 * photo itself, for a session holding `student-images` and nobody else, and
 * the import page with its API - matching, storing, the summary and the
 * deletions - for a session that holds the role **and** acts as an admin.
 * Every refusal is a 403 before a byte of a photo is read or written; the
 * page is not there for anyone else at all (`gate.js`).
 *
 * The photo route asks the role **and** the request's class scope
 * (class-bound-teachers D4): a session that is no admin receives a photo only
 * of a student on the roster of a class it sees - a roster entry marked as
 * left counts - and a 404 for anybody else, as for a student without a photo.
 */

import express from "express";

import { InvalidInputError, scopeSql } from "./classes.js";
import { classScope, identityOf, photoAdminPage, requirePhotoAdmin, requireStudentImages } from "./gate.js";
import { teacherShell } from "./bar.js";
import { deletePhotos, matchPhotos, photoLimitBytes, photoSummary, photoUsername, readPhoto, storePhoto } from "./photos.js";
import { isKnownTeacher, findPerson } from "./roster-source.js";
import { directoryServiceConfigured, heldDirectoryPeople } from "../middlewares/directory-service.js";
import { i18nOf } from "../i18n/server.js";

/**
 * What the directory holds now: whether this instance has one, and its people,
 * null while it holds none. The checks pass a directory of their own.
 */
function heldDirectory() {
  const configured = directoryServiceConfigured();
  return { configured, people: configured ? heldDirectoryPeople() : null };
}

/**
 * The upload's body as raw bytes, whatever type it is declared as - the
 * header decides - and on this route only. Larger than a photo may be is
 * refused with the limit named.
 */
function rawPhoto(req, res, next) {
  express.raw({ type: () => true, limit: photoLimitBytes })(req, res, (error) => {
    if (error?.type === "entity.too.large") {
      i18nOf(req)
        .then(({ t }) => res.status(413).json({ error: t("exam.errors.photos.tooLarge", { kb: photoLimitBytes / 1024 }) }))
        .catch(next);
      return;
    }
    next(error);
  });
}

export function registerPhotoRoutes(router, { db, handle, startPage, directory = heldDirectory }) {
  const directoryPeople = () => directory().people;
  const api = (method, path, ...middleware) => (fn) =>
    router[method](
      `/api${path}`,
      requirePhotoAdmin,
      ...middleware,
      handle(async (req, res) => {
        res.json(await fn(req));
      })
    );

  // The photo, at a URL carrying its version (`?v=`), so the browser keeps it
  // until it is replaced and no shared cache ever stores it.
  router.get(
    "/photos/:username",
    requireStudentImages,
    handle(async (req, res) => {
      const scope = await classScope(db, req);
      const username = photoUsername(req.params.username);
      const filter = scopeSql(scope, "r.class_id");
      const onVisibleRoster =
        scope.all || (username !== null && db.prepare(`SELECT 1 FROM roster_entry r WHERE r.username = ?${filter.sql} LIMIT 1`).get(username, ...filter.params) !== undefined);
      const photo = onVisibleRoster ? readPhoto(db, req.params.username) : null;
      if (!photo) {
        res.status(404).set("Cache-Control", "private, no-store").end();
        return;
      }
      res.set({
        "Content-Type": photo.mime,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      });
      res.send(photo.image);
    })
  );

  api("get", "/photos/summary")(() => {
    const { configured, people } = directory();
    return { directory: configured ? (people ? "ready" : "loading") : "unavailable", ...photoSummary(db, people) };
  });
  api("post", "/photos/match")((req) => matchPhotos(directoryPeople(), req.body?.entries));
  // One confirmed photo. Only a student the directory holds gets one, so
  // neither a teacher nor a username nobody has can be given a photo.
  api("put", "/photos/:username", rawPhoto)((req) => {
    const username = photoUsername(req.params.username);
    const people = directoryPeople();
    if (username === null || !people || !findPerson(people, username) || isKnownTeacher(people, username)) {
      throw new InvalidInputError("exam.errors.photos.noStudent", { username: username ?? "" });
    }
    return storePhoto(db, username, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), identityOf(req));
  });
  api("post", "/photos/delete")((req) => {
    const { scope, className, expected } = req.body ?? {};
    return deletePhotos(db, directoryPeople(), { scope, className, expected });
  });

  router.get(
    "/photos",
    photoAdminPage,
    handle(async (req, res) => {
      res.send(await teacherShell({ db, startPage, req, title: (t) => t("exam.pages.photos"), context: {}, kind: "photos", params: {}, current: "photos" }));
    })
  );
}
