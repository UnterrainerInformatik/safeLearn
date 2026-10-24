/**
 * The teacher's live view of a sitting (`online-test`):
 *
 * - `live`: at the top whether the sitting is live, its window with the time
 *   until it opens or closes, and the server's time in Vienna; per participant not started, writing with the time left, or
 *   submitted; the share of their attempt they kept the page in focus as a
 *   bar, with how often and how long they left it; requests refused from
 *   another browser, with the browser refused last; the browser the attempt
 *   is bound to; and the button that unbinds it, so the next browser that
 *   opens the attempt is bound instead
 *
 * With `screen: 1` it is the view for the class, on its own page
 * (`/exam/sittings/<id>/screen`) for a projector: whether the sitting is
 * live, its window, the time until it opens or closes and the server's time,
 * large enough to read from the back of the room, and how many are writing
 * and have submitted - no name, no list, nothing to click.
 *
 * Changes arrive over the sitting's own event stream as they happen. When the
 * stream fails three times in a row the view fetches snapshots every 5 s and
 * tries the stream again every minute, so it keeps updating without a reload.
 * The view for the class holds no stream at all and only fetches snapshots
 * every 5 s: it is idle by design, and a fetch that waits for a connection is
 * only delayed, never stuck. A failed snapshot is said in its connection line,
 * and the next one is fetched as usual; an ended session reloads the page into
 * the login, as on every module page. A session that stops acting as a
 * teacher - the student view switched on - is told so, and the view stops.
 */

import { button, confirmButton, defineExamElement, ExamApiError, ExamElement, examApi, examMe, format, h, linkButton, t } from "./frame.js";
import { displayClass, displayPerson } from "./classes.js";
import { displayWindow } from "./tests.js";

const stateLabels = {
  scheduled: () => t("exam.live.stateScheduled"),
  open: () => t("exam.live.stateOpen"),
  over: () => t("exam.live.stateOver"),
};

const statusLabels = {
  "not started": () => t("exam.live.statusNotStarted"),
  writing: () => t("exam.live.statusWriting"),
  submitted: () => t("exam.live.statusSubmitted"),
};

/**
 * A browser as the participant snapshot names it (`boundBrowser`,
 * `refusedBrowser`): the short label, with the full string on mouse-over and
 * behind a small toggle that shows it in place, for touch and keyboard. No
 * browser dialog. "Other browser" when the server recognized none.
 */
function browserCell(browser) {
  const label = browser.short ?? (browser.os ? `${t("exam.live.otherBrowser")} · ${browser.os}` : t("exam.live.otherBrowser"));
  const full = h("small", { class: "sl-exam-live-ua-full", hidden: true }, browser.full);
  const toggle = h("button", {
    type: "button",
    class: "sl-exam-live-ua-toggle",
    "aria-expanded": "false",
    "aria-label": t("exam.live.showFullBrowser"),
    title: t("exam.live.showFullBrowser"),
  }, "i");
  toggle.addEventListener("click", () => {
    const open = full.hidden;
    full.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    const text = open ? t("exam.live.hideFullBrowser") : t("exam.live.showFullBrowser");
    toggle.setAttribute("aria-label", text);
    toggle.title = text;
  });
  return h("span", { class: "sl-exam-live-ua" }, h("span", { class: "sl-exam-live-ua-short", title: browser.full }, label), " ", toggle, full);
}

/** "12:05" for a number of milliseconds. */
function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "left 3×, 47 s", "left 2×, 4 min 12 s" from a minute on, or nothing for somebody who stayed. */
function focusText(participant, awayMs) {
  if (participant.focusCount === 0) return t("exam.live.neverLeft");
  const total = Math.round(awayMs / 1000);
  const [count, minutes, seconds] = [participant.focusCount, Math.floor(total / 60), total % 60];
  const left =
    minutes === 0
      ? t("exam.live.leftPage", { count, seconds })
      : seconds === 0
        ? t("exam.live.leftPageWholeMinutes", { count, minutes })
        : t("exam.live.leftPageMinutes", { count, minutes, seconds });
  return participant.away ? `${left} ${t("exam.live.awayNow")}` : left;
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

const pollMs = 5000;
const streamRetryMs = 60000;
const resortMs = 10000;

/**
 * How the participants are ordered: by name as the server sends them; by
 * status, not started first and submitted last; or by the share or the net
 * time in focus, lowest first, with those not started at the end. Ties keep
 * the order by name.
 */
const statusRank = { "not started": 0, writing: 1, submitted: 2 };
const sortKeys = {
  name: () => 0,
  status: (participant) => statusRank[participant.status],
  share: (participant, figures) => (figures ? figures.share : Infinity),
  net: (participant, figures) => (figures ? figures.netMs : Infinity),
};
const sortLabels = {
  name: () => t("exam.live.sortName"),
  status: () => t("exam.live.sortStatus"),
  share: () => t("exam.live.sortShare"),
  net: () => t("exam.live.sortNet"),
};
const sortStorageKey = "sl-exam-live-sort";

function storedSort() {
  try {
    const value = localStorage.getItem(sortStorageKey);
    return value in sortKeys ? value : "name";
  } catch {
    return "name";
  }
}

class LiveView extends ExamElement {
  disconnectedCallback() {
    this.stopAll();
  }

  async load() {
    const [snapshot, me] = await Promise.all([examApi(`/sittings/${this.params.sitting}/live`), examMe()]);
    this.periods = me.periods ?? [];
    this.admin = me.admin === true;
    return snapshot;
  }

  render(snapshot) {
    this.rows = new Map();
    this.sitting = snapshot.sitting;
    this.badge = h("span", { class: "sl-exam-live-badge" });
    this.state = h("span", { class: "sl-exam-quiet sl-exam-live-state", role: "status" });
    // The window is drawn only when it changes, the time beside it every
    // second, so a period's tooltip stays put under the cursor.
    this.windowShown = h("span", {});
    this.windowKey = null;
    this.remainingText = h("span", {});
    this.windowLine = h("span", { class: "sl-exam-live-window" }, `${t("exam.live.window")} `, this.windowShown, this.remainingText);
    this.serverClock = h("span", { class: "sl-exam-live-clock" });
    this.message = h("p", { class: "sl-exam-message", role: "status" });
    this.windowActions = this.windowControls(snapshot.sitting);
    this.screenLink = linkButton({ label: t("exam.live.classScreenLink"), href: `/exam/sittings/${snapshot.sitting.id}/screen`, newWindow: true, class: "sl-exam-live-screen-link" });
    this.body = h("tbody", {});
    this.summary = h("p", { class: "sl-exam-live-summary" });
    this.sortBy = storedSort();
    this.draw(snapshot);
    if (this.params.screen === "1") this.pollOnly();
    else if (!this.streaming) this.connect();
    if (!this.ticker) this.ticker = setInterval(() => this.tick(), 1000);
    // Shares and net times drift between changes; the order follows them
    // now and then, not every second, so a row stays put under the cursor.
    if (!this.resorter) this.resorter = setInterval(() => this.sort(), resortMs);
    const { sitting, test, course } = snapshot;
    const head = h(
      "div",
      { class: "sl-exam-live-head" },
      h("p", {}, this.badge, " ", this.state),
      h("p", {}, this.windowLine),
      h(
        "p",
        { class: "sl-exam-quiet" },
        `${t("exam.live.serverTime")} `,
        this.serverClock
      ),
      h("p", { class: "sl-exam-actions" }, this.screenLink, this.windowActions),
      this.windowMessage,
      h(
        "p",
        { class: "sl-exam-quiet" },
        h("a", { href: `/exam/tests/${test.id}` }, test.name),
        ` · ${displayClass(course.className)} ${course.subject} · ${sitting.makeup ? `${t("exam.live.makeupSitting")} · ` : ""}${t("exam.tests.minutesPerAttempt", { minutes: Math.round(sitting.durationS / 60) })}`
      )
    );
    if (this.params.screen === "1") return this.screenView(snapshot);
    const view = h(
      "div",
      { class: "sl-exam sl-exam-live" },
      head,
      this.summary,
      this.sortControl(),
      h(
        "table",
        { class: "sl-exam-table sl-exam-live-table" },
        h("thead", {}, h("tr", {}, h("th", {}, t("exam.live.columnStudent")), h("th", {}, t("exam.live.columnStatus")), h("th", {}, t("exam.live.columnTimeLeft")), h("th", {}, t("exam.live.columnInFocus")), h("th", {}, t("exam.live.columnBoundBrowser")), h("th", {}, t("exam.live.columnOtherBrowsers")), h("th", {}, ""))),
        this.body
      ),
      this.message
    );
    this.tick();
    return view;
  }

  /** The choice of order, kept in this browser. */
  sortControl() {
    const select = h(
      "select",
      {
        class: "sl-exam-live-sort",
        "aria-label": t("exam.live.sortBy"),
        onchange: (event) => {
          this.sortBy = event.target.value;
          try {
            localStorage.setItem(sortStorageKey, this.sortBy);
          } catch {
            // Without storage the choice lasts as long as the page.
          }
          this.sort();
        },
      },
      Object.entries(sortLabels).map(([value, label]) => h("option", { value, selected: value === this.sortBy }, label()))
    );
    return h("p", { class: "sl-exam-actions sl-exam-live-sort-line" }, h("label", {}, `${t("exam.live.sortBy")} `, select));
  }

  /** Puts the rows in the chosen order, moving them rather than drawing them anew. */
  sort() {
    if (!this.participants || !this.body || this.params.screen === "1") return;
    const key = sortKeys[this.sortBy] ?? sortKeys.name;
    const ordered = [...this.participants.values()]
      .map((participant) => ({ participant, value: key(participant, this.focusFigures(participant)) }))
      .sort((a, b) => a.value - b.value || this.order.get(a.participant.username) - this.order.get(b.participant.username))
      .map(({ participant }) => this.rows.get(participant.username))
      .filter(Boolean);
    if (ordered.some((row, index) => this.body.children[index] !== row)) this.body.append(...ordered);
  }

  /** The projector's view: the same state, clock and counts, large, and no names. */
  screenView(snapshot) {
    const { test, course } = snapshot;
    this.bigRemaining = h("div", { class: "sl-exam-screen-remaining" });
    this.bigLabel = h("div", { class: "sl-exam-screen-label" });
    const view = h(
      "div",
      { class: "sl-exam sl-exam-screen" },
      h("p", { class: "sl-exam-screen-test" }, test.name, h("span", { class: "sl-exam-quiet" }, ` · ${displayClass(course.className)} ${course.subject}`)),
      h("p", { class: "sl-exam-screen-state" }, this.badge),
      this.bigLabel,
      this.bigRemaining,
      h("p", { class: "sl-exam-screen-window" }, this.windowLine),
      h("div", { class: "sl-exam-screen-clock-label" }, t("exam.live.time")),
      h("div", { class: "sl-exam-screen-clock" }, this.serverClock),
      h("div", { class: "sl-exam-screen-summary" }, this.summary),
      h("p", { class: "sl-exam-quiet sl-exam-screen-connection" }, this.state)
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
    this.badge.textContent = stateLabels[state]();
    this.badge.dataset.state = state;
    const remaining =
      state === "scheduled"
        ? t("exam.live.opensIn", { time: span(opens - now) })
        : state === "open"
          ? t("exam.live.closesIn", { time: span(closes - now) })
          : t("exam.live.closedAgo", { time: span(now - closes) });
    this.serverClock.textContent = format.clock(new Date(now));
    if (this.windowActions) this.windowActions.hidden = state !== "open";
    // The board has nothing to show once the sitting is over.
    if (this.screenLink) this.screenLink.hidden = state === "over";
    const key = `${this.sitting.opensAt} ${this.sitting.closesAt}`;
    if (key !== this.windowKey) {
      this.windowKey = key;
      this.windowShown.replaceChildren(displayWindow(this.sitting, this.periods));
    }
    if (this.bigRemaining) {
      this.bigLabel.textContent = state === "scheduled" ? t("exam.live.bigOpensIn") : state === "open" ? t("exam.live.bigClosesIn") : t("exam.live.bigClosed");
      this.bigRemaining.textContent = state === "over" ? "–" : span(state === "scheduled" ? opens - now : closes - now);
      return;
    }
    this.remainingText.textContent = ` · ${remaining}`;
  }

  /**
   * End now and Extend, while the sitting is open (`exam-record-maintenance`):
   * ending asks by a second click and submits every running attempt; extending
   * moves the window's end by the minutes given. Either is told beside them.
   */
  windowControls(sitting) {
    this.windowMessage = h("p", { class: "sl-exam-message sl-exam-live-window-message", role: "status" });
    const send = async (path, body) => {
      this.windowMessage.textContent = "";
      try {
        await examApi(`/sittings/${sitting.id}/${path}`, { method: "POST", body });
        await this.poll();
      } catch (error) {
        this.windowMessage.textContent = error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.frame.saveFailed");
      }
    };
    const minutes = h("input", { type: "number", min: "5", max: "120", step: "1", value: "5", class: "sl-exam-number sl-exam-live-extend-minutes", "aria-label": t("exam.live.extendMinutes") });
    return h(
      "span",
      { class: "sl-exam-actions sl-exam-live-window-actions", hidden: true },
      h(
        "span",
        { class: "sl-exam-actions" },
        minutes,
        button({ label: t("exam.live.extend"), class: "sl-exam-live-extend", action: () => send("extend", { minutes: Number(minutes.value) }) })
      ),
      confirmButton({ class: "sl-exam-live-end", label: t("exam.live.endNow"), armed: t("exam.live.endNowArmed"), action: () => send("end") })
    );
  }

  /** Draws a whole snapshot. */
  draw(snapshot) {
    this.syncClock(snapshot.serverTime);
    this.sitting = snapshot.sitting;
    this.received = performance.now();
    this.participants = new Map(snapshot.participants.map((participant) => [participant.username, { ...participant, at: performance.now() }]));
    this.order = new Map(snapshot.participants.map((participant, index) => [participant.username, index]));
    this.body.replaceChildren(...snapshot.participants.map((participant) => this.row(participant.username)));
    this.sort();
    this.summarize();
  }

  /** One participant's row, drawn from what is known of them now. */
  row(username) {
    const participant = this.participants.get(username);
    const release =
      participant.status === "writing" && participant.attemptId !== null
        ? h("button", { type: "button", class: "sl-exam-action sl-exam-live-release", onClick: () => this.release(participant) }, t("exam.live.release"))
        : null;
    const remove =
      this.admin && participant.attemptId !== null
        ? confirmButton({
            class: "sl-exam-live-delete sl-exam-admin",
            label: t("exam.live.deleteAttempt"),
            armed: t("exam.live.deleteAttemptArmed"),
            action: () => this.deleteAttempt(participant),
          })
        : null;
    const tr = h(
      "tr",
      { "data-username": username, "data-status": participant.status },
      h("td", {}, displayPerson(participant)),
      h("td", { class: "sl-exam-live-status" }, statusLabels[participant.status]()),
      h("td", { class: "sl-exam-live-left" }, participant.remainingMs === null ? "" : clock(participant.remainingMs)),
      this.focusCell(participant),
      this.boundCell(participant),
      h(
        "td",
        { class: "sl-exam-live-refused" },
        participant.refused === 0
          ? "–"
          : participant.bound === false
            ? t("exam.live.refusedReleased", { count: participant.refused })
            : t("exam.live.refused", { count: participant.refused }),
        participant.refused > 0 && participant.refusedBrowser ? [h("br", {}), browserCell(participant.refusedBrowser)] : null
      ),
      h("td", {}, release, release && remove ? " " : null, remove)
    );
    this.rows.set(username, tr);
    return tr;
  }

  /**
   * The browser an open attempt is bound to: its label, "unknown" for a
   * binding from before browser strings were kept, and after an unbind that
   * the attempt waits for the next browser - replaced by that browser's
   * label as soon as the change arrives. Nothing once there is no open attempt.
   */
  boundCell(participant) {
    const cell = h("td", { class: "sl-exam-live-bound" });
    if (participant.status !== "writing") cell.append("–");
    else if (participant.bound === false) {
      cell.dataset.bound = "waiting";
      cell.append(h("span", { class: "sl-exam-quiet" }, t("exam.live.boundWaiting")));
    } else if (!participant.boundBrowser?.full) {
      cell.dataset.bound = "unknown";
      cell.append(h("span", { class: "sl-exam-quiet" }, t("exam.live.boundUnknown")));
    } else {
      cell.dataset.bound = "known";
      cell.append(browserCell(participant.boundBrowser));
    }
    return cell;
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

  /**
   * What is known of a participant's focus now: the time away, the share of
   * the attempt in focus and the net time in focus. Nothing before they start.
   */
  focusFigures(participant) {
    if (participant.startedAt === null) return null;
    const sinceReceived = performance.now() - participant.at;
    const awayMs = participant.focusMs + (participant.away ? sinceReceived : 0);
    const end = participant.submittedAt ? Date.parse(participant.submittedAt) : this.serverNow();
    const elapsed = end - Date.parse(participant.startedAt);
    const share = elapsed <= 0 ? 1 : Math.min(1, Math.max(0, 1 - awayMs / elapsed));
    return { awayMs, share, netMs: Math.max(0, elapsed - awayMs) };
  }

  fillFocus(cell, participant) {
    if (participant.startedAt === null) {
      cell.replaceChildren("–");
      return;
    }
    const { awayMs, netMs, share } = this.focusFigures(participant);
    const level = focusLevel(share);
    const percent = format.percent(Math.floor(share * 1000) / 1000, 1);
    cell.dataset.level = level;
    cell.title = t("exam.live.netInFocus", { time: span(netMs) });
    cell.replaceChildren(
      h(
        "span",
        { class: "sl-exam-live-bar", role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(share * 100)), "aria-label": t("exam.live.inFocusShare", { percent }) },
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
    if (!this.order.has(participant.username)) this.order.set(participant.username, this.order.size);
    if (old) old.replaceWith(fresh);
    else this.body.append(fresh);
    this.sort();
    this.summarize();
  }

  summarize() {
    const counts = { "not started": 0, writing: 0, submitted: 0 };
    for (const participant of this.participants.values()) counts[participant.status] += 1;
    this.summary.textContent = t("exam.live.summary", { writing: counts.writing, submitted: counts.submitted, notStarted: counts["not started"] });
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
      this.message.textContent = t("exam.live.released", { name: displayPerson(participant) });
    } catch (error) {
      this.message.textContent = error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.live.releaseFailed");
    }
  }

  /** An admin's correction: the attempt goes, and the participant counts as not started. */
  async deleteAttempt(participant) {
    try {
      await examApi(`/attempts/${participant.attemptId}`, { method: "DELETE" });
      this.message.textContent = t("exam.live.attemptDeleted", { name: displayPerson(participant) });
    } catch (error) {
      this.message.textContent = error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.live.deleteFailed");
    }
  }

  // ------------------------------------------------------------ the stream

  /**
   * A page left for another is kept by the browser's back/forward cache with
   * its connections open; enough of them use up the six a browser allows per
   * host over HTTP/1.1, and the next page does not load. So the stream closes
   * when the page is hidden that way and opens again when it is shown.
   */
  watchPage() {
    if (this.watchingPage) return;
    this.watchingPage = true;
    window.addEventListener("pagehide", () => {
      this.resume = this.streaming || Boolean(this.poller);
      this.closeStream();
      this.stopPolling();
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted && this.resume) this.connect();
    });
  }

  connect() {
    this.watchPage();
    this.closeStream();
    const source = new EventSource(`/exam/api/sittings/${this.params.sitting}/events`);
    this.source = source;
    this.streaming = true;
    source.addEventListener("open", () => {
      this.failures = 0;
      this.stopPolling();
    });
    // Streaming once the stream's first snapshot is drawn: it replaces every
    // row the first load drew.
    source.addEventListener("snapshot", (event) => {
      this.draw(JSON.parse(event.data));
      this.dataset.mode = "stream";
      this.state.textContent = t("exam.live.streaming");
    });
    source.addEventListener("change", (event) => {
      const change = JSON.parse(event.data);
      this.syncClock(change.serverTime);
      if (change.sitting) this.sitting = change.sitting;
      // The window itself changed (ended, extended): every deadline may have moved.
      if (change.participant) this.update(change.participant);
      else this.poll();
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
    this.state.textContent = t("exam.live.polling");
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

  /** The view for the class: snapshots every 5 s, and never a stream. */
  pollOnly() {
    this.dataset.mode = "polling";
    this.state.textContent = t("exam.live.polling");
    if (!this.poller) this.poller = setInterval(() => this.poll(), pollMs);
  }

  async poll() {
    try {
      this.draw(await examApi(`/sittings/${this.params.sitting}/live`));
      if (this.dataset.mode === "waiting") this.pollOnly();
    } catch (error) {
      if (error instanceof ExamApiError && error.status === 403) this.studentView();
      // Only the view for the class says so: the live view has its stream to
      // fall back on. A 401 has already sent the page into the login.
      else if (this.params.screen === "1" && error.status !== 401) {
        this.dataset.mode = "waiting";
        this.state.textContent = t("exam.live.waitingForConnection");
      }
    }
  }

  /** The session no longer acts as a teacher: the view stops and says why. */
  studentView() {
    this.stopAll();
    this.dataset.mode = "refused";
    this.state.textContent = t("exam.live.studentView");
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
    clearInterval(this.resorter);
    this.resorter = null;
  }
}

defineExamElement("live", LiveView);
