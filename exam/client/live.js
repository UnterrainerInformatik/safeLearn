/**
 * The teacher's live view of a sitting (`online-test`):
 *
 * - `live`: at the top whether the sitting is live, its window with the time
 *   until it opens or closes, and the server's time in the viewer's time
 *   zone; per participant not started, writing with the time left, or
 *   submitted; the share of their attempt they kept the page in focus as a
 *   bar, with how often and how long they left it; requests refused from
 *   another browser; and the button that releases an attempt to a new browser
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

const stateLabels = { scheduled: "Not open yet", open: "Live", over: "Over" };

const statusLabels = { "not started": "not started", writing: "writing", submitted: "submitted" };

/** "12:05" for a number of milliseconds. */
function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "left 3×, 47 s", or nothing for somebody who stayed. */
function focusText(participant, awayMs) {
  if (participant.focusCount === 0) return "never left";
  return `left ${participant.focusCount}×, ${Math.round(awayMs / 1000)} s${participant.away ? " (away now)" : ""}`;
}

/** The colour of a focus share: above 98 % good, from 70 % a warning, below that bad. */
function focusLevel(share) {
  if (share > 0.98) return "good";
  if (share >= 0.7) return "warn";
  return "bad";
}

/** "1:02:05" or "12:05" for a stretch of time. */
function span(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

const localClock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

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
    this.sitting = snapshot.sitting;
    this.badge = h("span", { class: "sl-exam-live-badge" });
    this.state = h("span", { class: "sl-exam-quiet sl-exam-live-state", role: "status" });
    this.windowLine = h("span", { class: "sl-exam-live-window" });
    this.serverClock = h("span", { class: "sl-exam-live-clock" });
    this.message = h("p", { class: "sl-exam-message", role: "status" });
    this.body = h("tbody", {});
    this.summary = h("p", { class: "sl-exam-live-summary" });
    this.draw(snapshot);
    if (!this.streaming) this.connect();
    if (!this.ticker) this.ticker = setInterval(() => this.tick(), 1000);
    const { sitting, test, course } = snapshot;
    const head = h(
      "div",
      { class: "sl-exam-live-head" },
      h("p", {}, this.badge, " ", this.state),
      h("p", {}, this.windowLine),
      h("p", { class: "sl-exam-quiet" }, "Server time ", this.serverClock),
      h(
        "p",
        { class: "sl-exam-quiet" },
        h("a", { href: `/exam/tests/${test.id}` }, test.name),
        ` · ${displayClass(course.className)} ${course.subject} · ${sitting.makeup ? "make-up sitting · " : ""}${Math.round(sitting.durationS / 60)} min per attempt`
      )
    );
    const view = h(
      "div",
      { class: "sl-exam sl-exam-live" },
      head,
      this.summary,
      h(
        "table",
        { class: "sl-exam-table sl-exam-live-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Student"), h("th", {}, "Status"), h("th", {}, "Time left"), h("th", {}, "In focus"), h("th", {}, "Other browsers"), h("th", {}, ""))),
        this.body
      ),
      this.message
    );
    this.tick();
    return view;
  }

  /** The server's time now, from the offset of the last answer that carried it. */
  serverNow() {
    return Date.now() + (this.offset ?? 0);
  }

  /** Takes the server's clock from an answer: its time minus the browser's. */
  syncClock(serverTime) {
    if (serverTime) this.offset = Date.parse(serverTime) - Date.now();
  }

  /** Whether the sitting is live, and how long until it opens or closes, by the server's clock. */
  drawWindow() {
    if (!this.sitting || !this.badge) return;
    const now = this.serverNow();
    const opens = Date.parse(this.sitting.opensAt);
    const closes = Date.parse(this.sitting.closesAt);
    const state = now < opens ? "scheduled" : now < closes ? "open" : "over";
    this.dataset.sitting = state;
    this.badge.textContent = stateLabels[state];
    this.badge.dataset.state = state;
    const remaining = state === "scheduled" ? `opens in ${span(opens - now)}` : state === "open" ? `closes in ${span(closes - now)}` : `closed ${span(now - closes)} ago`;
    this.windowLine.textContent = `Window ${displayWindow(this.sitting)} · ${remaining}`;
    this.serverClock.textContent = localClock.format(new Date(now));
  }

  /** Draws a whole snapshot. */
  draw(snapshot) {
    this.syncClock(snapshot.serverTime);
    this.sitting = snapshot.sitting;
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
      this.focusCell(participant),
      h("td", { class: "sl-exam-live-refused" }, participant.refused === 0 ? "–" : `${participant.refused} refused${participant.bound === false ? ", released" : ""}`),
      h("td", {}, release)
    );
    this.rows.set(username, tr);
    return tr;
  }

  /**
   * The share of the attempt so far - or of the whole attempt once submitted -
   * the page kept the focus, as a bar and a percentage, with how often and how
   * long it was left. Nothing for somebody who has not started.
   */
  focusCell(participant) {
    const cell = h("td", { class: "sl-exam-live-focus" });
    this.fillFocus(cell, participant);
    return cell;
  }

  fillFocus(cell, participant) {
    if (participant.startedAt === null) {
      cell.replaceChildren("–");
      return;
    }
    const sinceReceived = performance.now() - participant.at;
    const awayMs = participant.focusMs + (participant.away ? sinceReceived : 0);
    const end = participant.submittedAt ? Date.parse(participant.submittedAt) : this.serverNow();
    const elapsed = end - Date.parse(participant.startedAt);
    const share = elapsed <= 0 ? 1 : Math.min(1, Math.max(0, 1 - awayMs / elapsed));
    const level = focusLevel(share);
    const percent = `${Math.floor(share * 1000) / 10} %`;
    cell.dataset.level = level;
    cell.replaceChildren(
      h(
        "span",
        { class: "sl-exam-live-bar", role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(share * 100)), "aria-label": `In focus ${percent}` },
        h("span", { class: "sl-exam-live-bar-fill", style: `width: ${share * 100}%` })
      ),
      " ",
      h("span", { class: "sl-exam-live-share" }, percent),
      h("span", { class: "sl-exam-quiet sl-exam-live-left-page" }, ` · ${focusText(participant, awayMs)}`)
    );
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
    this.drawWindow();
    for (const participant of this.participants?.values() ?? []) {
      const row = this.rows.get(participant.username);
      if (!row || participant.status !== "writing") continue;
      const cell = row.querySelector(".sl-exam-live-left");
      if (cell && participant.remainingMs !== null) cell.textContent = clock(participant.remainingMs - (performance.now() - participant.at));
      this.fillFocus(row.querySelector(".sl-exam-live-focus"), participant);
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
      this.state.textContent = "changes arrive as they happen";
    });
    source.addEventListener("snapshot", (event) => this.draw(JSON.parse(event.data)));
    source.addEventListener("change", (event) => {
      const change = JSON.parse(event.data);
      this.syncClock(change.serverTime);
      if (change.sitting) this.sitting = change.sitting;
      this.update(change.participant);
    });
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
    this.state.textContent = "updating every 5 seconds";
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
