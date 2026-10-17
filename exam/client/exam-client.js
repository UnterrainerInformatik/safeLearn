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

import { elementFor } from "./frame.js";
import "./classes.js";
import "./gradebook.js";

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
    status.textContent = "This element is not available on this instance yet.";
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

// A module script runs after the document has been parsed, so every
// placeholder is already there.
mountAll();
