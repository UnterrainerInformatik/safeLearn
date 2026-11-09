/**
 * The exam module's client (design.md, D4): a plain ES module with custom
 * elements, no framework and no build step.
 *
 * A page view loads this script only when the module is active and the page
 * carries at least one placeholder (`<div class="sl-embed" data-sl-embed=…>`).
 * It mounts one element per placeholder. It takes no part in revealing the
 * page: the page is shown by its usual owner, and each element shows its own
 * loading and error state inside its own area (`exam-embedding`).
 *
 * The shared frame is `frame.js`; each phase's elements are a module of their
 * own, imported here before anything is mounted.
 */

import { elementFor, t } from "./frame.js";
import { connectBar } from "./bar.js";
import "./date-input.js";
import "./classes.js";
import "./gradebook.js";
import "./pool.js";
import "./question-editor.js";
import "./pool-import.js";
import "./tests.js";
import "./attempt.js";
import "./review.js";
import "./live.js";

export { ExamElement, defineExamElement, examApi } from "./frame.js";

/**
 * A kind the module places but whose element is not built yet shows that in
 * its own area instead of loading forever.
 */
function mount(placeholder) {
  const kind = placeholder.dataset.slEmbed;
  const name = elementFor(kind);
  if (!name) {
    const status = placeholder.querySelector(".sl-embed-status") ?? placeholder;
    status.classList.add("sl-embed-error");
    status.textContent = t("exam.frame.notAvailable");
    return;
  }
  const element = document.createElement(name);
  for (const [key, value] of Object.entries(placeholder.dataset)) {
    element.dataset[key] = value;
  }
  placeholder.replaceChildren(element);
}

function mountAll() {
  for (const placeholder of document.querySelectorAll(".sl-embed[data-sl-embed]")) {
    if (placeholder.dataset.slMounted) continue;
    placeholder.dataset.slMounted = "1";
    mount(placeholder);
  }
}

// The student's Exams page hides its results while a test is written there,
// and draws them anew once it is submitted, so they hold the new result. Only
// that page carries the section, so a content page's results stay as placed.
// A section the server rendered hidden belongs to an attempt already running.
// The same events hide the page's chrome (css/exam.css): `sl-writing` on
// <html> for a real attempt, `sl-previewing` for a teacher's preview, which
// hides the same chrome but leaves hot reload on. The server renders either
// class for a reload, and this sets it for every other page once its element
// announces. A preview never touches the results sections.
let writing = document.querySelector(".sl-exam-my-results[hidden]") ||
  document.documentElement.classList.contains("sl-writing") ? true : null;
if (writing) document.documentElement.classList.add("sl-writing");
window.addEventListener("sl-exam-writing", (event) => {
  const on = event.detail?.writing === true;
  const preview = event.detail?.preview === true;
  document.documentElement.classList.toggle("sl-previewing", on && preview);
  if (preview) return;
  const now = on;
  const ended = writing === true && !now;
  writing = now;
  document.documentElement.classList.toggle("sl-writing", now);
  for (const section of document.querySelectorAll(".sl-exam-my-results")) {
    section.hidden = now;
    if (ended) for (const results of section.querySelectorAll("sl-exam-results")) results.reload();
  }
});

// A module script runs after the document has been parsed, so every
// placeholder - and a teacher page's module bar - is already there.
mountAll();
for (const bar of document.querySelectorAll(".sl-exam-bar")) connectBar(bar);
