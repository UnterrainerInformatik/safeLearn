/**
 * The teacher's live view of a sitting (`online-test`, exam-online-tests
 * design D7): a snapshot to fetch, and an event stream of its own that pushes
 * every change as it is written. Both are a teacher's alone; the stream is
 * separate from `/hot-reload`, which answers without authentication and never
 * carries exam data.
 *
 * The stream re-checks the session before each event and with each heartbeat:
 * still there, still acting as a teacher after the student-view downgrade. A
 * check that fails sends `refused` and ends the stream; a session whose token
 * is about to expire gets `renew`, and the client reconnects through an
 * ordinary request, which renews it.
 */

import { getSitting } from "./tests.js";
import { listen, liveParticipant, liveSnapshot } from "./live.js";
import { NotFoundError } from "./classes.js";
import { actsAsTeacher, identityOf, requireTeacher, teacherPage } from "./gate.js";
import { teacherShell } from "./bar.js";
import { openEventStream } from "../event-stream.js";

/** A record id from the path; anything but a positive integer names nothing. */
function idParam(value) {
  const id = typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("There is no such record.");
  return id;
}

const heartbeatMs = 25000;

/**
 * What the session behind a long-lived request is now: `teacher` while it is
 * still there and still acts as a teacher after the student-view downgrade,
 * `refused` otherwise, and `renew` when its access token is about to expire.
 *
 * The session is read from its store as a copy, never through `req.session`,
 * which this request would write back over newer changes when it ends; the
 * permission context is built anew from that copy, so a switch to the
 * student view made by another request counts. Renewing the tokens is left to
 * an ordinary request: the stream asks the client to reconnect instead.
 */
function sessionNow(req) {
  return new Promise((resolve) => {
    if (!req.sessionStore || !req.sessionID) {
      resolve("refused");
      return;
    }
    req.sessionStore.get(req.sessionID, (error, stored) => {
      const user = stored?.passport?.user;
      if (error || !user) {
        resolve("refused");
        return;
      }
      const probe = { user, session: stored };
      if (!identityOf(probe) || identityOf(probe) !== identityOf(req)) {
        resolve("refused");
        return;
      }
      const exp = user.accessTokenDecoded?.exp;
      if (typeof exp !== "number" || exp - Date.now() / 1000 <= 60) {
        resolve("renew");
        return;
      }
      actsAsTeacher(probe).then(
        (teacher) => resolve(teacher ? "teacher" : "refused"),
        () => resolve("refused")
      );
    });
  });
}

export function registerLiveRoutes(router, { db, handle, startPage }) {
  router.get(
    "/api/sittings/:id/live",
    requireTeacher,
    handle(async (req, res) => {
      res.json(liveSnapshot(db, idParam(req.params.id)));
    })
  );

  router.get(
    "/api/sittings/:id/events",
    requireTeacher,
    handle(async (req, res) => {
      const sittingId = idParam(req.params.id);
      const snapshot = liveSnapshot(db, sittingId);
      let stop = () => {};
      let heartbeat = null;
      const stream = openEventStream(req, res, {
        // A proxy that buffers would hold the events back (task 6.4).
        headers: { "X-Accel-Buffering": "no" },
        onClose: () => {
          stop();
          clearInterval(heartbeat);
        },
      });
      stream.send("snapshot", snapshot);

      // One check at a time, in the order the changes happened.
      let queue = Promise.resolve();
      const checked = (deliver) => {
        queue = queue.then(async () => {
          if (stream.closed) return;
          const now = await sessionNow(req);
          if (now === "refused") {
            stream.send("refused", { reason: "The session no longer acts as a teacher." });
            stream.close();
            return;
          }
          if (now === "renew") {
            stream.send("renew", {});
            stream.close();
            return;
          }
          deliver();
        });
      };
      stop = listen(sittingId, (event) =>
        checked(() => stream.send("change", { type: event.type, participant: liveParticipant(db, sittingId, event.username) }))
      );
      heartbeat = setInterval(() => checked(() => stream.comment("heartbeat")), heartbeatMs);
    })
  );

  router.get(
    "/sittings/:id/live",
    teacherPage,
    handle(async (req, res) => {
      const sitting = getSitting(db, idParam(req.params.id));
      res.send(
        await teacherShell({
          db,
          startPage,
          req,
          title: `Live: ${sitting.testName}`,
          context: { courseId: sitting.courseId },
          kind: "live",
          params: { sitting: String(sitting.id) },
          current: "tests",
        })
      );
    })
  );
}
