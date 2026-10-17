/**
 * The one HTML sanitizer: the DOMPurify instance the renderer passes every
 * page through. A module of its own so that whatever else stores HTML - the
 * exam module's question import - sanitizes with exactly the same setup.
 */

import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

/** `html`, sanitized; `options` are DOMPurify's, for a caller that forbids more. */
export function sanitizeHtml(html, options) {
  return options === undefined ? DOMPurify.sanitize(html) : DOMPurify.sanitize(html, options);
}
