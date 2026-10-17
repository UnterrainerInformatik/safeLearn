/**
 * The teacher's live view of a sitting (`online-test`):
 *
 * - `live`: per participant not started, writing with the time left, or
 *   submitted; how often and how long they left the page; requests refused
 *   from another browser; and the button that releases an attempt to a new
 *   browser
 *
 * Changes arrive over the sitting's own event stream as they happen. When the
 * stream fails three times in a row the view fetches snapshots every 5 s and
 * tries the stream again every minute, so it keeps updating without a reload.
 * A session that stops acting as a teacher - the student view switched on -
 * is told so, and the view stops.
 */

import { defineExamElement, ExamApiError, ExamElement, examApi, h } from "./frame.js";
import { displayClass, displayPerson } from "./classes.js";
import { displayWindow } from "./tests.js";

const statusLabels = { "not started": "not started", writing: "writing", submitted: "submitted" };

/** "12:05" for a number of milliseconds. */
function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "left 3×, 47 s", or nothing for somebody who stayed. */
function focusText(participant) {
  if (participant.focusCount === 0) return "–";
  return `left ${participant.focusCount}×, ${Math.round(participant.focusMs / 1000)} s${participant.away ? " (away now)" : ""}`;
}

const pollMs = 5000;
const streamRetryMs = 60000;

class LiveView extends ExamElement {
  disconnectedCallback() {
    this.stopAll();
  }

  async load() {
    return examApi(`/sittings/${this.params.sitting}/live`);
  }

  render(snapshot) {
    this.rows = new Map();
    this.state = h("p", { class: "sl-exam-quiet sl-exam-live-state", role: "status" });
    this.message = h("p", { class: "sl-exam-message", role: "status" });
    this.body = h("tbody", {});
    this.summary = h("p", { class: "sl-exam-live-summary" });
    this.draw(snapshot);
    if (!this.streaming) this.connect();
    if (!this.ticker) this.ticker = setInterval(() => this.tick(), 1000);
    const { sitting, test, course } = snapshot;
    return h(
      "div",
      { class: "sl-exam sl-exam-live" },
      h(
        "p",
        { class: "sl-exam-quiet" },
        h("a", { href: `/exam/tests/${test.id}` }, test.name),
        ` · ${displayClass(course.className)} ${course.subject} · ${sitting.makeup ? "make-up, " : ""}${displayWindow(sitting)} · ${Math.round(sitting.durationS / 60)} min`
      ),
      this.summary,
      h(
        "table",
        { class: "sl-exam-table sl-exam-live-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Student"), h("th", {}, "Status"), h("th", {}, "Time left"), h("th", {}, "Left the page"), h("th", {}, "Other browsers"), h("th", {}, ""))),
        this.body
      ),
      this.state,
      this.message
    );
  }

  /** Draws a whole snapshot. */
  draw(snapshot) {
    this.received = performance.now();
    this.participants = new Map(snapshot.participants.map((participant) => [participant.username, { ...participant, at: performance.now() }]));
    this.body.replaceChildren(...snapshot.participants.map((participant) => this.row(participant.username)));
    this.summarize();
  }

  /** One participant's row, drawn from what is known of them now. */
  row(username) {
    const participant = this.participants.get(username);
    const release =
      participant.status === "writing" && participant.attemptId !== null
        ? h("button", { type: "button", class: "sl-exam-live-release", onClick: () => this.release(participant) }, "Release to another browser")
        : null;
    const tr = h(
      "tr",
      { "data-username": username, "data-status": participant.status },
      h("td", {}, displayPerson(participant)),
      h("td", { class: "sl-exam-live-status" }, statusLabels[participant.status]),
      h("td", { class: "sl-exam-live-left" }, participant.remainingMs === null ? "" : clock(participant.remainingMs)),
      h("td", { class: "sl-exam-live-focus" }, focusText(participant)),
      h("td", { class: "sl-exam-live-refused" }, participant.refused === 0 ? "–" : `${participant.refused} refused${participant.bound === false ? ", released" : ""}`),
      h("td", {}, release)
    );
    this.rows.set(username, tr);
    return tr;
  }

  /** Puts a changed participant in place of their row. */
  update(participant) {
    if (!participant) return;
    this.participants.set(participant.username, { ...participant, at: performance.now() });
    const old = this.rows.get(participant.username);
    const fresh = this.row(participant.username);
    if (old) old.replaceWith(fresh);
    else this.body.append(fresh);
    this.summarize();
  }

  summarize() {
    const counts = { "not started": 0, writing: 0, submitted: 0 };
    for (const participant of this.participants.values()) counts[participant.status] += 1;
    this.summary.textContent = `${counts.writing} writing · ${counts.submitted} submitted · ${counts["not started"]} not started`;
  }

  /** Counts the time left down between changes. */
  tick() {
    for (const participant of this.participants?.values() ?? []) {
      if (participant.remainingMs === null) continue;
      const cell = this.rows.get(participant.username)?.querySelector(".sl-exam-live-left");
      if (cell) cell.textContent = clock(participant.remainingMs - (performance.now() - participant.at));
    }
  }

  async release(participant) {
    try {
      await examApi(`/attempts/${participant.attemptId}/release`, { method: "POST" });
      this.message.textContent = `${displayPerson(participant)} can go on in another browser now.`;
    } catch (error) {
      this.message.textContent = error instanceof ExamApiError && error.status < 500 ? error.message : "The attempt could not be released.";
    }
  }

  // ------------------------------------------------------------ the stream

  connect() {
    this.closeStream();
    const source = new EventSource(`/exam/api/sittings/${this.params.sitting}/events`);
    this.source = source;
    this.streaming = true;
    source.addEventListener("open", () => {
      this.failures = 0;
      this.stopPolling();
      this.dataset.mode = "stream";
      this.state.textContent = "Live.";
    });
    source.addEventListener("snapshot", (event) => this.draw(JSON.parse(event.data)));
    source.addEventListener("change", (event) => this.update(JSON.parse(event.data).participant));
    source.addEventListener("renew", () => this.connect());
    source.addEventListener("refused", () => this.studentView());
    source.addEventListener("error", () => {
      if (this.source !== source) return;
      this.failures = (this.failures ?? 0) + 1;
      if (this.failures >= 3 || source.readyState === EventSource.CLOSED) this.fallBack();
    });
  }

  /** Snapshots every 5 s, and the stream tried again every minute. */
  fallBack() {
    this.closeStream();
    this.dataset.mode = "polling";
    this.state.textContent = "Updating every 5 seconds.";
    if (!this.poller) {
      this.poller = setInterval(() => this.poll(), pollMs);
      this.poll();
    }
    clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      this.failures = 0;
      this.connect();
    }, streamRetryMs);
  }

  async poll() {
    try {
      this.draw(await examApi(`/sittings/${this.params.sitting}/live`));
    } catch (error) {
      if (error instanceof ExamApiError && error.status === 403) this.studentView();
    }
  }

  /** The session no longer acts as a teacher: the view stops and says why. */
  studentView() {
    this.stopAll();
    this.dataset.mode = "refused";
    this.state.textContent = "The student view is active: the live view is not shown. Switch back to the teacher view and reload the page.";
    this.body.replaceChildren();
  }

  closeStream() {
    if (this.source) this.source.close();
    this.source = null;
    this.streaming = false;
  }

  stopPolling() {
    clearInterval(this.poller);
    this.poller = null;
    clearTimeout(this.retry);
  }

  stopAll() {
    this.closeStream();
    this.stopPolling();
    clearInterval(this.ticker);
    this.ticker = null;
  }
}

defineExamElement("live", LiveView);
