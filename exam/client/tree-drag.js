/**
 * Dragging in a tree with Pointer Events (exam-ui-consistency, design D3), so
 * it works with a mouse and on a touch screen alike - HTML5 drag-and-drop does
 * not work on touch. No library: the module loads no third-party client code.
 *
 * - A mouse drag starts after 6 px of movement. On touch it starts after a
 *   300 ms press, so a plain swipe still scrolls.
 * - A ghost with the dragged item's label follows the pointer.
 * - `targetAt(x, y, item)` names the element under the pointer and its zone
 *   (`into`, `before`, `after`); the element is marked `is-drop-<zone>`, which
 *   the styles draw as a highlight or a line.
 * - Near the top or bottom edge of `scroller` the tree scrolls by itself.
 * - Escape cancels; a drop calls `drop(item, element, zone)`.
 *
 * The click a drag ends with is swallowed, so dropping never also chooses.
 */

const MOVE_PX = 6;
const PRESS_MS = 300;
const EDGE_PX = 32;
const SCROLL_STEP = 8;

/**
 * Makes the items under `root` draggable. `sourceOf(element)` answers the item
 * a press on `element` would drag (any value, with a `label`), or null.
 */
export function enableTreeDrag(root, { sourceOf, targetAt, drop, scroller }) {
  let pending = null;
  let drag = null;

  const clearMark = () => {
    if (drag?.marked) drag.marked.classList.remove("is-drop-into", "is-drop-before", "is-drop-after");
    if (drag) drag.marked = null;
  };

  const locate = () => {
    clearMark();
    const found = targetAt(drag.x, drag.y, drag.item);
    drag.target = found;
    if (found) {
      found.element.classList.add(`is-drop-${found.zone}`);
      drag.marked = found.element;
    }
  };

  const autoScroll = () => {
    if (!drag) return;
    if (scroller) {
      const box = scroller.getBoundingClientRect();
      const step = drag.y < box.top + EDGE_PX ? -SCROLL_STEP : drag.y > box.bottom - EDGE_PX ? SCROLL_STEP : 0;
      if (step !== 0 && drag.y >= box.top - EDGE_PX && drag.y <= box.bottom + EDGE_PX) {
        scroller.scrollTop += step;
        locate();
      }
    }
    drag.frame = requestAnimationFrame(autoScroll);
  };

  // While a touch drag runs, the page must not scroll under it.
  const holdStill = (event) => {
    if (drag) event.preventDefault();
  };
  const noMenu = (event) => {
    if (pending || drag) event.preventDefault();
  };

  const start = () => {
    const { item, x, y, source } = pending;
    clearTimeout(pending.timer);
    pending = null;
    const ghost = document.createElement("div");
    ghost.className = "sl-exam-drag-ghost";
    ghost.textContent = item.label;
    ghost.classList.toggle("is-dark", document.querySelector("#markdown-content.dark-mode") !== null);
    document.body.append(ghost);
    source.classList.add("is-dragged");
    drag = { item, x, y, ghost, source, target: null, marked: null, frame: 0 };
    placeGhost();
    locate();
    drag.frame = requestAnimationFrame(autoScroll);
  };

  const placeGhost = () => {
    drag.ghost.style.left = `${drag.x + 12}px`;
    drag.ghost.style.top = `${drag.y + 12}px`;
  };

  const stop = () => {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    window.removeEventListener("keydown", onKey, true);
    if (pending) clearTimeout(pending.timer);
    pending = null;
    if (drag) {
      cancelAnimationFrame(drag.frame);
      clearMark();
      drag.ghost.remove();
      drag.source.classList.remove("is-dragged");
      drag = null;
    }
  };

  const swallowClick = () => {
    const swallow = (event) => {
      event.stopPropagation();
      event.preventDefault();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
  };

  const onMove = (event) => {
    if (pending && event.pointerId === pending.pointerId) {
      const far = Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > MOVE_PX;
      if (!far) return;
      // A touch that moves before its press is long enough is a scroll.
      if (pending.touch) return stop();
      pending.x = event.clientX;
      pending.y = event.clientY;
      start();
      return;
    }
    if (!drag) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    placeGhost();
    locate();
  };

  const onUp = (event) => {
    if (drag) {
      const { item, target } = drag;
      swallowClick();
      stop();
      if (target) drop(item, target.element, target.zone);
      event.preventDefault();
      return;
    }
    stop();
  };

  const onCancel = () => stop();

  const onKey = (event) => {
    if (event.key === "Escape" && (drag || pending)) {
      event.preventDefault();
      event.stopPropagation();
      stop();
    }
  };

  root.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || drag || pending) return;
    const item = sourceOf(event.target);
    if (!item) return;
    const touch = event.pointerType !== "mouse";
    pending = { item, x: event.clientX, y: event.clientY, pointerId: event.pointerId, touch, source: item.element ?? event.target, timer: 0 };
    if (touch) pending.timer = setTimeout(() => pending && start(), PRESS_MS);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("keydown", onKey, true);
  });
  // Registered from the start and not passive, so the browser lets a touch
  // drag stop the scrolling from its first move.
  root.addEventListener("touchmove", holdStill, { passive: false });
  root.addEventListener("contextmenu", noMenu);
}
