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
import { flagParticipant, participantHolders } from "./participants.js";
import { NotFoundError } from "./classes.js";
import { requireTeacher, sessionNow, teacherPage } from "./gate.js";
import { teacherShell } from "./bar.js";
import { openEventStream } from "../event-stream.js";
import { embedPlaceholder } from "../obsidian.js";
import { i18nOf } from "../i18n/server.js";

function escapeHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** A record id from the path; anything but a positive integer names nothing. */
function idParam(value) {
  const id = typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
  if (id === null) throw new NotFoundError("exam.errors.noSuchRecord");
  return id;
}

const heartbeatMs = 25000;

/** A snapshot with the course's Matura candidates marked (exam-participant-role D5). */
function markedSnapshot(db, sittingId, at) {
  const snapshot = liveSnapshot(db, sittingId, at);
  const holders = participantHolders(snapshot.course);
  return { ...snapshot, participants: snapshot.participants.map((participant) => flagParticipant(participant, holders)) };
}

export function registerLiveRoutes(router, { db, handle, startPage }) {
  router.get(
    "/api/sittings/:id/live",
    requireTeacher,
    handle(async (req, res) => {
      res.json(markedSnapshot(db, idParam(req.params.id)));
    })
  );

  router.get(
    "/api/sittings/:id/events",
    requireTeacher,
    handle(async (req, res) => {
      const sittingId = idParam(req.params.id);
      const snapshot = markedSnapshot(db, sittingId);
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
          const now = await sessionNow(req, { teacher: true });
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
        checked(() => {
          const at = new Date().toISOString();
          const snapshot = liveSnapshot(db, sittingId, at);
          stream.send("change", {
            type: event.type,
            serverTime: at,
            sitting: snapshot.sitting,
            // A change of the window itself (ended, extended) concerns no one participant.
            participant:
              event.username === null
                ? null
                : flagParticipant(liveParticipant(db, sittingId, event.username, at), participantHolders(snapshot.course)),
          });
        })
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
          title: (t) => t("exam.pages.live", { name: sitting.testName }),
          context: { courseId: sitting.courseId },
          kind: "live",
          params: { sitting: String(sitting.id) },
          current: "tests",
        })
      );
    })
  );

  // The view for the class, to put on a projector from the teacher's own
  // session: a page of its own with no top bar, no navigation and no bar,
  // showing the sitting's state, window, time left and clock large, and how
  // many are writing - never a name.
  router.get(
    "/sittings/:id/screen",
    teacherPage,
    handle(async (req, res) => {
      const sitting = getSitting(db, idParam(req.params.id));
      const title = escapeHtml(sitting.testName);
      const { t, lang, loc } = await i18nOf(req);
      res.send(`<!DOCTYPE html>
<html lang="${lang}" data-sl-locale="${loc}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/css/main.css">
  <link rel="shortcut icon" href="/assets/favicon.ico" type="image/x-icon" />
  <title>${title}</title>
</head>
<body class="sl-exam-screen-page">
  <div id="markdown-content" class="sl-exam-screen-content">
    ${embedPlaceholder("live", { sitting: String(sitting.id), screen: "1" }, t("app.embed.loading"))}
  </div>
  <script type="module" src="/exam/assets/exam-client.js"></script>
</body>
</html>`);
    })
  );
}
