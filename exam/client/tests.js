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

import { defineExamElement, ExamApiError, ExamElement, examApi, h, markRows } from "./frame.js";
import { displayClass, displayPerson } from "./classes.js";

const stateLabels = { scheduled: "scheduled", open: "open", over: "over" };

const viennaTime = new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", dateStyle: "short", timeStyle: "short" });
const viennaClock = new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", timeStyle: "short" });

/** A timestamp as a teacher in Vienna reads it. */
export function displayTime(iso) {
  return viennaTime.format(new Date(iso));
}

/** A sitting's window, the end without its date when it closes on the day it opens. */
export function displayWindow({ opensAt, closesAt }) {
  const sameDay = viennaTime.format(new Date(opensAt)).split(",")[0] === viennaTime.format(new Date(closesAt)).split(",")[0];
  return `${displayTime(opensAt)} – ${sameDay ? viennaClock.format(new Date(closesAt)) : displayTime(closesAt)}`;
}

/** A list of tests, one group per course. */
class TestList extends ExamElement {
  async load() {
    const { course, class: klass, year } = this.params;
    const query = course ? `?course=${course}` : klass ? `?class=${klass}` : year ? `?year=${year}` : "";
    return examApi(`/tests${query}`);
  }

  render(list) {
    if (list.groups.length === 0) {
      return h("div", { class: "sl-exam" }, h("p", {}, list.year ? `${list.year.name} has no course yet.` : "There is no school year yet."));
    }
    return h(
      "div",
      { class: "sl-exam sl-exam-tests" },
      list.groups.map((group) => this.group(group, list.scope === "course"))
    );
  }

  group(group, single) {
    const title = `${displayClass(group.className)} ${group.subject}`;
    const assemble = h("a", { href: `/exam/pool?course=${group.courseId}` }, "assemble one in the question pool");
    return h(
      "section",
      { class: "sl-exam-tests-course", "data-course": String(group.courseId) },
      single ? null : h("h2", {}, h("a", { href: `/exam/tests?course=${group.courseId}` }, title)),
      group.tests.length === 0
        ? h("p", { class: "sl-exam-quiet" }, "No online test yet - ", assemble, ".")
        : markRows(
            h(
              "table",
              { class: "sl-exam-table" },
              h("thead", {}, h("tr", {}, h("th", {}, "Test"), h("th", {}, "Questions"), h("th", {}, "Sittings"), h("th", {}, "Submitted"))),
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
                        ? h("span", { class: "sl-exam-quiet" }, "none yet")
                        : h(
                            "ul",
                            { class: "sl-exam-tests-sittings" },
                            test.sittings.map((sitting) =>
                              h(
                                "li",
                                { "data-state": sitting.state },
                                `${sitting.makeup ? "Make-up " : ""}${displayWindow(sitting)} · ${stateLabels[sitting.state]}`,
                                sitting.state !== "over" ? [" · ", h("a", { href: `/exam/sittings/${sitting.id}/live` }, "live view")] : null
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
  return error instanceof ExamApiError && error.status < 500 ? error.message : "That could not be saved. Please try again.";
}


/** A `datetime-local` value for an ISO timestamp, in the browser's time zone. */
function localInput(iso) {
  const date = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** One test for its teacher. */
class TestDetail extends ExamElement {
  async load() {
    const test = await examApi(`/tests/${this.params.test}`);
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
        ` (${course.yearName}) · ${en ? "English" : "Deutsch"} · ${test.questions.length} ${test.questions.length === 1 ? "question" : "questions"} · `,
        test.started ? `written by ${test.attempts.started}, ${test.attempts.submitted} submitted` : "not written yet"
      ),
      this.renameForm(test),
      this.message,
      this.sittingsSection(test),
      h("h2", {}, "Questions"),
      test.started
        ? h("p", { class: "sl-exam-quiet" }, "This test has been written; its questions cannot change any more.")
        : h("p", { class: "sl-exam-quiet" }, h("a", { href: `/exam/pool?course=${course.id}` }, "Add questions from the pool"), "."),
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
                  h("span", { class: "sl-exam-pool-mark", "aria-label": answer.correct ? "correct" : "wrong" }, answer.correct ? "✓" : "✗"),
                  storedMarkup(en ? answer.textEn : answer.textDe, "sl-exam-pool-answer")
                )
              )
            ),
            test.started || test.questions.length === 1
              ? null
              : h("button", { type: "button", class: "sl-exam-test-remove", onClick: () => this.removeQuestion(question.questionId) }, "Remove from the test")
          )
        )
      ),
      test.started ? null : this.deleteButton(test)
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
        ? h("p", { class: "sl-exam-quiet" }, "No sitting yet.")
        : h(
            "ul",
            { class: "sl-exam-test-sittings" },
            test.sittings.map((sitting) =>
              h(
                "li",
                { "data-sitting": String(sitting.id), "data-state": sitting.state },
                h("strong", {}, sitting.makeup ? "Make-up: " : "Sitting: "),
                `${displayWindow(sitting)}, ${Math.round(sitting.durationS / 60)} min per attempt · ${sitting.state} · `,
                sitting.makeup || sitting.participants.length < this.roster.length
                  ? sitting.participants.map((username) => names.get(username) ?? username).join(", ")
                  : "the whole class",
                sitting.state !== "over" ? [" · ", h("a", { href: `/exam/sittings/${sitting.id}/live` }, "live view")] : null,
                sitting.state === "scheduled"
                  ? [
                      " ",
                      h("button", { type: "button", class: "sl-exam-sitting-edit", onClick: () => this.editSitting(test, sitting) }, "Change"),
                      " ",
                      h("button", { type: "button", class: "sl-exam-sitting-delete", onClick: () => this.deleteSitting(sitting) }, "Delete"),
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
      h("h2", {}, "Sittings"),
      list,
      this.sittingForm
    );
  }

  /** The form for a new sitting, or for changing `sitting`. */
  drawSittingForm(test, sitting) {
    const first = test.sittings.find((candidate) => !candidate.makeup) ?? null;
    const makeup = sitting ? sitting.makeup : first !== null;
    const start = new Date(Date.now() + 60 * 60 * 1000);
    start.setMinutes(0, 0, 0);
    const opensAt = h("input", { type: "datetime-local", name: "opensAt", required: true, value: localInput(sitting?.opensAt ?? start.toISOString()) });
    const closesAt = h("input", {
      type: "datetime-local",
      name: "closesAt",
      required: true,
      value: localInput(sitting?.closesAt ?? new Date(start.getTime() + 50 * 60 * 1000).toISOString()),
    });
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
            opensAt: new Date(opensAt.value).toISOString(),
            closesAt: new Date(closesAt.value).toISOString(),
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
      h("h3", {}, sitting ? "Change the sitting" : makeup ? "Schedule a make-up sitting" : "Schedule the sitting"),
      h("label", {}, "Opens ", opensAt),
      h("label", {}, "Closes ", closesAt),
      h("label", {}, "Minutes per attempt ", duration),
      makeup
        ? h(
            "p",
            { class: "sl-exam-quiet" },
            "A make-up sitting is a later chance to write this test, for students who missed the first sitting. ",
            "Only the students you tick below can write it, and they get the same minutes per attempt as the first sitting. ",
            "Anyone who has already submitted the test cannot write it again."
          )
        : h("label", {}, whole, " The whole class"),
      people,
      h("p", {}, h("button", { type: "submit", class: "sl-exam-primary" }, sitting ? "Save" : "Schedule"), sitting ? [" ", h("button", { type: "button", onClick: () => this.drawSittingForm(test, null) }, "Cancel")] : null),
      message
    );
    this.sittingForm.replaceChildren(form);
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
    const name = h("input", { type: "text", name: "name", value: test.name, maxlength: "80", "aria-label": "Name of the test", required: true });
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
      h("button", { type: "submit" }, "Rename")
    );
  }

  removeQuestion(questionId) {
    const questionIds = this.test.questions.map((question) => question.questionId).filter((id) => id !== questionId);
    this.change({ questionIds });
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

  /** Deleting takes a second click on the same button, so one click alone never deletes. */
  deleteButton(test) {
    const button = h("button", { type: "button", class: "sl-exam-test-delete" }, "Delete this test");
    button.addEventListener("click", async () => {
      if (button.dataset.armed !== "1") {
        button.dataset.armed = "1";
        button.textContent = "Click again to delete it with its sittings";
        return;
      }
      try {
        await examApi(`/tests/${test.id}`, { method: "DELETE" });
        window.location.assign(`/exam/tests?course=${test.course.id}`);
      } catch (error) {
        this.message.textContent = refusal(error);
      }
    });
    return h("p", {}, button);
  }
}

defineExamElement("test-detail", TestDetail);
