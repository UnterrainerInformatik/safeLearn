/**
 * The online tests' elements for teachers (`online-test`):
 *
 * - `tests`: the tests of the course the bar chose, or of every course of its
 *   school year, grouped by class and course
 * - `test-detail`: one test - its sittings, scheduling, changing and deleting
 *   them before they open, its snapshot in the course's language with the
 *   correct answers marked, renaming, and while nobody has written it,
 *   removing questions and deleting it
 *
 * A snapshot's texts are stored markup, sanitized when the pool was imported,
 * as in the pool's preview.
 *
 * The API refuses every session not acting as a teacher; these elements only
 * draw what it answers.
 */

import { confirmButton, defineExamElement, ExamApiError, ExamElement, examApi, examMe, format, h, markRows, t } from "./frame.js";
import { displayClass, displayPerson } from "./classes.js";
import { defaultPeriods, matchWindow, periodTimes, viennaInstant, viennaLocal, windowFor } from "./periods.js";

const stateLabels = {
  scheduled: () => t("exam.tests.stateScheduled"),
  open: () => t("exam.tests.stateOpen"),
  over: () => t("exam.tests.stateOver"),
};

/** A timestamp as a teacher in Vienna reads it, in the reader's format. */
export function displayTime(iso) {
  return format.dateTime(iso);
}

/**
 * "lessons 3–4", or "lesson 3" ("3.–4. EH", "3. EH"), with the clock times as
 * its tooltip. Every period the module shows is drawn here, so none lacks its
 * times (`school-periods`, design.md, D6).
 */
export function periodLabel(periods, from, to = from) {
  return h(
    "span",
    { class: "sl-exam-periods", title: periodTimes(periods, from, to) },
    from === to ? t("exam.periods.lesson", { n: from }) : t("exam.periods.lessons", { from, to })
  );
}

/**
 * A sitting's window as an element: the day and its periods when it lies on
 * period boundaries, otherwise its clock times, the end without its date when
 * it closes on the day it opens.
 */
export function displayWindow({ opensAt, closesAt }, periods = []) {
  const match = matchWindow(periods, opensAt, closesAt);
  if (match) return h("span", { class: "sl-exam-window" }, `${format.weekdayDay(opensAt)} · `, periodLabel(periods, match.from, match.to));
  const sameDay = viennaLocal(opensAt).date === viennaLocal(closesAt).date;
  return h("span", { class: "sl-exam-window" }, `${displayTime(opensAt)} – ${sameDay ? format.time(closesAt) : displayTime(closesAt)}`);
}

/**
 * The links of a sitting that has not ended: its live view, and the view for
 * the class, which opens in a window of its own for the projector.
 */
function sittingLinks(sitting) {
  return [
    " · ",
    h("a", { href: `/exam/sittings/${sitting.id}/live` }, t("exam.tests.liveViewLink")),
    " · ",
    h("a", { href: `/exam/sittings/${sitting.id}/screen`, target: "_blank", rel: "noopener", class: "sl-exam-screen-link" }, t("exam.tests.classScreenLink")),
  ];
}

/** A list of tests, one group per course. */
class TestList extends ExamElement {
  async load() {
    const { course, class: klass, year } = this.params;
    const query = course ? `?course=${course}` : klass ? `?class=${klass}` : year ? `?year=${year}` : "";
    const [list, me] = await Promise.all([examApi(`/tests${query}`), examMe()]);
    this.periods = me.periods ?? [];
    return list;
  }

  render(list) {
    if (list.groups.length === 0) {
      return h("div", { class: "sl-exam" }, h("p", {}, list.year ? t("exam.tests.yearWithoutCourse", { year: list.year.name }) : t("exam.tests.noYear")));
    }
    return h(
      "div",
      { class: "sl-exam sl-exam-tests" },
      list.groups.map((group) => this.group(group, list.scope === "course"))
    );
  }

  group(group, single) {
    const title = `${displayClass(group.className)} ${group.subject}`;
    const assemble = h("a", { href: `/exam/pool?course=${group.courseId}` }, t("exam.tests.assembleInPool"));
    return h(
      "section",
      { class: "sl-exam-tests-course", "data-course": String(group.courseId) },
      single ? null : h("h2", {}, h("a", { href: `/exam/tests?course=${group.courseId}` }, title)),
      group.tests.length === 0
        ? h("p", { class: "sl-exam-quiet" }, t("exam.tests.noTestYet"), assemble, ".")
        : markRows(
            h(
              "table",
              { class: "sl-exam-table" },
              h("thead", {}, h("tr", {}, h("th", {}, t("exam.tests.columnTest")), h("th", {}, t("exam.tests.columnQuestions")), h("th", {}, t("exam.tests.columnSittings")), h("th", {}, t("exam.tests.columnSubmitted")))),
              h(
                "tbody",
                {},
                group.tests.map((test) =>
                  h(
                    "tr",
                    { "data-test": String(test.id) },
                    h("td", {}, h("a", { href: `/exam/tests/${test.id}` }, test.name)),
                    h("td", {}, String(test.questions)),
                    h(
                      "td",
                      {},
                      test.sittings.length === 0
                        ? h("span", { class: "sl-exam-quiet" }, t("exam.tests.noneYet"))
                        : h(
                            "ul",
                            { class: "sl-exam-tests-sittings" },
                            test.sittings.map((sitting) =>
                              h(
                                "li",
                                { "data-state": sitting.state },
                                sitting.makeup ? `${t("exam.tests.makeupPrefix")} ` : null,
                                displayWindow(sitting, this.periods),
                                ` · ${stateLabels[sitting.state]()}`,
                                sitting.state !== "over" ? sittingLinks(sitting) : null
                              )
                            )
                          )
                    ),
                    h("td", {}, String(test.submitted))
                  )
                )
              )
            )
          )
    );
  }
}

defineExamElement("tests", TestList);

/** Stored, sanitized markup as a node. */
function storedMarkup(html, className) {
  const container = h("div", { class: className });
  container.innerHTML = html;
  return container;
}

/** Why a request was refused, in a sentence for the teacher. */
function refusal(error) {
  return error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.frame.saveFailed");
}

/** The value of a `time` date field for an ISO timestamp: its Vienna date and time. */
function localInput(iso) {
  const { date, time } = viennaLocal(iso);
  return `${date}T${time}`;
}

/** One test for its teacher. */
class TestDetail extends ExamElement {
  async load() {
    const [test, me] = await Promise.all([examApi(`/tests/${this.params.test}`), examMe()]);
    this.periods = me.periods ?? [];
    this.admin = me.admin === true;
    const klass = await examApi(`/classes/${test.course.classId}`);
    this.roster = klass.roster.filter((entry) => !entry.leftAt);
    return test;
  }

  render(test) {
    this.test = test;
    this.message = h("p", { class: "sl-exam-message", role: "status" });
    const course = test.course;
    const en = course.language === "en";
    return h(
      "div",
      { class: "sl-exam sl-exam-test" },
      h(
        "p",
        { class: "sl-exam-quiet" },
        h("a", { href: `/exam/tests?course=${course.id}` }, `${displayClass(course.className)} ${course.subject}`),
        ` (${course.yearName}) · ${en ? "English" : "Deutsch"} · ${t("exam.tests.questionCount", { count: test.questions.length })} · `,
        test.started ? t("exam.tests.writtenBy", { started: test.attempts.started, submitted: test.attempts.submitted }) : t("exam.tests.notWrittenYet")
      ),
      h(
        "p",
        {},
        h("a", { href: `/exam/tests/${test.id}/preview`, target: "_blank", rel: "noopener", class: "sl-exam-test-preview" }, t("exam.tests.tryAsStudent")),
        h("span", { class: "sl-exam-quiet" }, ` ${t("exam.tests.tryAsStudentNote")}`)
      ),
      h(
        "p",
        {},
        h("a", { href: `/exam/tests/${test.id}/solution`, target: "_blank", rel: "noopener", class: "sl-exam-test-solution" }, t("exam.tests.boardSolution")),
        h("span", { class: "sl-exam-quiet" }, ` ${t("exam.tests.boardSolutionNote")}`)
      ),
      this.renameForm(test),
      this.message,
      this.sittingsSection(test),
      h("h2", {}, t("exam.tests.questionsHeading")),
      test.started
        ? h(
            "p",
            { class: "sl-exam-quiet" },
            this.admin
              ? t("exam.tests.writtenAdminNote")
              : t("exam.tests.writtenNote")
          )
        : h("p", { class: "sl-exam-quiet" }, h("a", { href: `/exam/pool?course=${course.id}` }, t("exam.tests.addFromPool")), "."),
      h(
        "ol",
        { class: "sl-exam-test-questions" },
        test.questions.map((question) =>
          h(
            "li",
            { "data-question": String(question.questionId), lang: course.language },
            h("h3", {}, en ? question.nameEn : question.nameDe),
            storedMarkup(en ? question.textEn : question.textDe, "sl-exam-pool-text"),
            h(
              "ol",
              { class: "sl-exam-pool-answers" },
              question.answers.map((answer) =>
                h(
                  "li",
                  { class: answer.correct ? "is-correct" : "" },
                  h("span", { class: "sl-exam-pool-mark", "aria-label": answer.correct ? t("exam.tests.correct") : t("exam.tests.wrong") }, answer.correct ? "✓" : "✗"),
                  storedMarkup(en ? answer.textEn : answer.textDe, "sl-exam-pool-answer")
                )
              )
            ),
            test.questions.length === 1
              ? null
              : !test.started
                ? confirmButton({
                    class: "sl-exam-test-remove",
                    label: t("exam.tests.removeQuestion"),
                    armed: t("exam.tests.removeQuestionUnwrittenArmed"),
                    action: () => this.removeQuestion(question.questionId),
                  })
                : this.admin
                  ? confirmButton({
                      class: "sl-exam-test-remove sl-exam-admin",
                      label: t("exam.tests.removeQuestion"),
                      armed: t("exam.tests.removeQuestionArmed"),
                      action: () => this.removeWrittenQuestion(question.questionId),
                    })
                  : null
          )
        )
      ),
      test.started && !this.admin ? null : this.deleteButton(test)
    );
  }

  /**
   * The test's sittings with their windows, durations, participants and
   * states, and the form that schedules one - the first for the whole class or
   * chosen students, every later one a make-up for chosen students with the
   * first one's duration. A sitting that has not opened can be changed or
   * deleted.
   */
  sittingsSection(test) {
    const names = new Map(this.roster.map((entry) => [entry.username, displayPerson(entry)]));
    const list =
      test.sittings.length === 0
        ? h("p", { class: "sl-exam-quiet" }, t("exam.tests.noSittingYet"))
        : h(
            "ul",
            { class: "sl-exam-test-sittings" },
            test.sittings.map((sitting) =>
              h(
                "li",
                { "data-sitting": String(sitting.id), "data-state": sitting.state },
                h("strong", {}, `${sitting.makeup ? t("exam.tests.makeupLabel") : t("exam.tests.sittingLabel")} `),
                displayWindow(sitting, this.periods),
                `, ${t("exam.tests.minutesPerAttempt", { minutes: Math.round(sitting.durationS / 60) })} · ${stateLabels[sitting.state]()} · `,
                sitting.makeup || sitting.participants.length < this.roster.length
                  ? sitting.participants.map((username) => names.get(username) ?? username).join(", ")
                  : t("exam.tests.wholeClassLower"),
                sitting.state !== "over" ? sittingLinks(sitting) : null,
                sitting.state === "scheduled"
                  ? [
                      " ",
                      h("button", { type: "button", class: "sl-exam-sitting-edit", onClick: () => this.editSitting(test, sitting) }, t("exam.tests.change")),
                      " ",
                      confirmButton({
                        class: "sl-exam-sitting-delete",
                        label: t("exam.tests.delete"),
                        armed: t("exam.tests.deleteSittingArmed"),
                        action: () => this.deleteSitting(sitting),
                      }),
                    ]
                  : null
              )
            )
          );
    this.sittingForm = h("div", { class: "sl-exam-sitting-form" });
    this.drawSittingForm(test, null);
    return h(
      "section",
      { class: "sl-exam-test-sittings-section" },
      h("h2", {}, t("exam.tests.sittingsHeading")),
      list,
      this.sittingForm
    );
  }

  /**
   * The form for a new sitting, or for changing `sitting`. Its window is one
   * state that two editors read and write: date and periods when the school's
   * periods are configured, clock times otherwise or when the teacher switches
   * to them (`school-periods`, design.md, D7).
   */
  drawSittingForm(test, sitting) {
    const first = test.sittings.find((candidate) => !candidate.makeup) ?? null;
    const makeup = sitting ? sitting.makeup : first !== null;
    const periods = this.periods;
    let windowState;
    if (sitting) {
      windowState = { opensAt: sitting.opensAt, closesAt: sitting.closesAt };
    } else if (periods.length > 0) {
      const proposed = defaultPeriods(periods);
      windowState = windowFor(periods, proposed.date, proposed.from, proposed.to);
    } else {
      const start = new Date(Date.now() + 60 * 60 * 1000);
      start.setMinutes(0, 0, 0);
      windowState = { opensAt: start.toISOString(), closesAt: new Date(start.getTime() + 50 * 60 * 1000).toISOString() };
    }
    let byPeriods = matchWindow(periods, windowState.opensAt, windowState.closesAt) !== null;
    const windowEditor = h("div", { class: "sl-exam-sitting-window" });
    const drawWindowEditor = () => {
      const toggle = h(
        "button",
        {
          type: "button",
          class: "sl-exam-sitting-mode",
          onClick: () => {
            if (!byPeriods) {
              // A window on period boundaries is carried over; any other keeps
              // its date and gets the periods a new sitting would.
              const match = matchWindow(periods, windowState.opensAt, windowState.closesAt);
              const proposed = match ?? { ...defaultPeriods(periods), date: viennaLocal(windowState.opensAt).date };
              windowState = windowFor(periods, proposed.date, proposed.from, proposed.to);
            }
            byPeriods = !byPeriods;
            drawWindowEditor();
          },
        },
        byPeriods ? t("exam.tests.exactTimesInstead") : t("exam.tests.lessonsInstead")
      );
      windowEditor.replaceChildren(...(byPeriods ? this.periodsEditor(windowState, (changed) => (windowState = changed)) : this.clockEditor(windowState)), h("p", {}, toggle));
    };
    if (periods.length > 0) drawWindowEditor();
    const duration = h("input", {
      type: "number",
      name: "durationMinutes",
      min: "1",
      max: "600",
      required: true,
      class: "sl-exam-number",
      value: String(Math.round((sitting?.durationS ?? first?.durationS ?? 900) / 60)),
      disabled: makeup || (sitting !== null && test.sittings.some((candidate) => candidate.makeup)),
    });
    const chosen = new Set(sitting ? sitting.participants : []);
    const whole = h("input", { type: "checkbox", name: "whole", checked: !makeup && (sitting === null || sitting.participants.length === this.roster.length) });
    const people = h(
      "ul",
      { class: "sl-exam-sitting-people" },
      this.roster.map((entry) =>
        h(
          "li",
          {},
          h(
            "label",
            {},
            h("input", { type: "checkbox", name: "participant", value: entry.username, checked: chosen.has(entry.username) }),
            " ",
            displayPerson(entry)
          )
        )
      )
    );
    const showPeople = () => {
      people.hidden = whole.checked;
    };
    whole.addEventListener("change", showPeople);
    showPeople();
    const message = h("p", { class: "sl-exam-message", role: "status" });
    const form = h(
      "form",
      {
        onSubmit: async (event) => {
          event.preventDefault();
          const body = {
            opensAt: windowState.opensAt,
            closesAt: windowState.closesAt,
            durationMinutes: Number(duration.value),
            participants: whole.checked ? null : [...people.querySelectorAll("input:checked")].map((input) => input.value),
          };
          try {
            await examApi(sitting ? `/sittings/${sitting.id}` : `/tests/${test.id}/sittings`, { method: sitting ? "PUT" : "POST", body });
            this.reload();
          } catch (error) {
            message.textContent = refusal(error);
          }
        },
      },
      h("h3", {}, sitting ? t("exam.tests.changeSitting") : makeup ? t("exam.tests.scheduleMakeup") : t("exam.tests.scheduleSitting")),
      periods.length > 0 ? windowEditor : this.clockEditor(windowState),
      h("label", {}, `${t("exam.tests.minutesPerAttemptLabel")} `, duration),
      makeup
        ? h(
            "p",
            { class: "sl-exam-quiet" },
            t("exam.tests.makeupExplanation")
          )
        : h("label", {}, whole, ` ${t("exam.tests.wholeClass")}`),
      people,
      h("p", {}, h("button", { type: "submit", class: "sl-exam-primary" }, sitting ? t("exam.tests.save") : t("exam.tests.schedule")), sitting ? [" ", h("button", { type: "button", onClick: () => this.drawSittingForm(test, null) }, t("exam.tests.cancel"))] : null),
      message
    );
    this.sittingForm.replaceChildren(form);
  }

  /**
   * The clock-time editor: the two fields of a sitting without periods, in
   * Vienna time and the reader's format. Each writes its instant into
   * `windowState` once it holds a valid date and time.
   */
  clockEditor(windowState) {
    const field = (name, label) => {
      const input = h("sl-date-input", { time: true, name, required: true, value: localInput(windowState[name]) });
      input.addEventListener("change", () => {
        const [date, time] = input.value.split("T");
        if (date && time) windowState[name] = viennaInstant(date, time).toISOString();
      });
      return h("label", {}, label, input);
    };
    return [field("opensAt", `${t("exam.tests.opens")} `), field("closesAt", `${t("exam.tests.closes")} `)];
  }

  /**
   * The periods editor: a date and a from and to period, each choice with its
   * clock times as its tooltip, the to period never before the from period,
   * and the window they make shown as it changes. Hands every new window to
   * `changed`.
   */
  periodsEditor(windowState, changed) {
    const periods = this.periods;
    const current = matchWindow(periods, windowState.opensAt, windowState.closesAt);
    const select = (name, numbers, selected) => {
      const element = h(
        "select",
        { name, required: true },
        numbers.map((period) => h("option", { value: String(period.n), title: periodTimes(periods, period.n) }, String(period.n)))
      );
      element.value = String(selected);
      return element;
    };
    const date = h("sl-date-input", { name: "date", required: true, value: current.date });
    const from = select("fromPeriod", periods, current.from);
    let to = select("toPeriod", periods.filter((period) => period.n >= current.from), current.to);
    const toLabel = h("label", {}, `${t("exam.tests.toLesson")} `, to);
    const times = h("span", { class: "sl-exam-sitting-times" });
    const update = () => {
      const fromN = Number(from.value);
      const toN = Math.max(fromN, Number(to.value));
      if (Number(to.firstChild?.value) !== fromN) {
        const replaced = select("toPeriod", periods.filter((period) => period.n >= fromN), toN);
        replaced.addEventListener("change", update);
        to.replaceWith(replaced);
        to = replaced;
      }
      times.replaceChildren(periodTimes(periods, fromN, toN));
      if (/^\d{4}-\d{2}-\d{2}$/.test(date.value)) changed(windowFor(periods, date.value, fromN, toN));
    };
    for (const input of [date, from, to]) input.addEventListener("change", update);
    times.replaceChildren(periodTimes(periods, current.from, current.to));
    return [
      h("label", {}, `${t("exam.tests.date")} `, date),
      " ",
      h("label", {}, `${t("exam.tests.fromLesson")} `, from),
      " ",
      toLabel,
      " ",
      h("span", { class: "sl-exam-quiet" }, "= ", times),
    ];
  }

  editSitting(test, sitting) {
    this.drawSittingForm(test, sitting);
    this.sittingForm.scrollIntoView({ block: "nearest" });
  }

  async deleteSitting(sitting) {
    try {
      await examApi(`/sittings/${sitting.id}`, { method: "DELETE" });
      this.reload();
    } catch (error) {
      this.message.textContent = refusal(error);
    }
  }

  renameForm(test) {
    const name = h("input", { type: "text", name: "name", value: test.name, maxlength: "80", "aria-label": t("exam.tests.nameLabel"), required: true });
    return h(
      "form",
      {
        class: "sl-exam-test-rename",
        onSubmit: (event) => {
          event.preventDefault();
          this.change({ name: name.value }, true);
        },
      },
      name,
      h("button", { type: "submit" }, t("exam.tests.rename"))
    );
  }

  removeQuestion(questionId) {
    const questionIds = this.test.questions.map((question) => question.questionId).filter((id) => id !== questionId);
    this.change({ questionIds });
  }

  /** An admin's removal from a written test; the server scores the attempts again. */
  async removeWrittenQuestion(questionId) {
    try {
      const test = await examApi(`/tests/${this.test.id}/questions/${questionId}`, { method: "DELETE" });
      this.show(this.render(test));
    } catch (error) {
      this.message.textContent = refusal(error);
    }
  }

  /** Sends a change of the test and draws what the server answers. A new name is a new page title. */
  async change(body, renamed = false) {
    try {
      const test = await examApi(`/tests/${this.test.id}`, { method: "PUT", body });
      if (renamed) {
        const heading = document.querySelector("#markdown-content h1");
        if (heading) heading.textContent = test.name;
      }
      this.show(this.render(test));
    } catch (error) {
      this.message.textContent = refusal(error);
    }
  }

  /**
   * Deleting takes a second click on the same button, so one click alone never
   * deletes. A written test only an admin deletes, with its attempts.
   */
  deleteButton(test) {
    const written = test.attempts.started;
    const button = confirmButton({
      class: test.started ? "sl-exam-test-delete sl-exam-admin" : "sl-exam-test-delete",
      label: t("exam.tests.deleteTest"),
      armed: test.started ? t("exam.tests.deleteTestWrittenArmed", { count: written }) : t("exam.tests.deleteTestArmed"),
      action: async () => {
        try {
          await examApi(`/tests/${test.id}`, { method: "DELETE" });
          window.location.assign(`/exam/tests?course=${test.course.id}`);
        } catch (error) {
          this.message.textContent = refusal(error);
        }
      },
    });
    return h("p", {}, button);
  }
}

defineExamElement("test-detail", TestDetail);
