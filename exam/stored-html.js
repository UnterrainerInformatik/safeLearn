/**
 * The one way a question's or an answer's text becomes stored HTML
 * (exam-question-editor design D2), shared by the Moodle import and the
 * question editor: the renderer's sanitizer without inline layout, and every
 * image source replaced through the caller's resolver, so no stored text
 * points anywhere but the module's own image route.
 */

import { JSDOM } from "jsdom";

import { sanitizeHtml } from "../sanitize.js";

/** Inline layout, which the instance's own styles replace. */
const forbiddenAttributes = ["style", "dir", "class", "role"];

/** What a true/false question's two answers read in each language. */
export const trueFalseText = {
  de: { true: "Richtig", false: "Falsch" },
  en: { true: "True", false: "False" },
};

/**
 * `html` sanitized, with each `<img>`'s source replaced by what
 * `resolveImage(src, where)` returns. The resolver throws to refuse a source;
 * `where` names the text for that refusal.
 */
export function cleanStoredHtml(html, resolveImage, where) {
  const clean = sanitizeHtml(html, { FORBID_ATTR: forbiddenAttributes });
  const fragment = JSDOM.fragment(`<div>${clean}</div>`).firstChild;
  for (const img of fragment.querySelectorAll("img")) {
    img.setAttribute("src", resolveImage(img.getAttribute("src") ?? "", where));
  }
  return fragment.innerHTML;
}
