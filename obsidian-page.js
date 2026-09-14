/**
 * This fixes the auto-scrolling issue when clicking on a link with a hash.
 * The problem is that the browser does not take into account the fixed header when scrolling to the element.
 */
window.addEventListener("hashchange", function () {
  window.scrollBy(0, -50); // 50 is the height of your fixed header.
});

window.addEventListener("scroll", function () {
  markTopAnchor();
});

/**
 * Opens print-document-as-pdf or print-presentation-as-pdf page in new tab.
 */
window.addEventListener(
  "keydown",
  (event) => {
    if (event.defaultPrevented) {
      return; // Do nothing if the event was already processed
    }
    if (event.ctrlKey && event.altKey) {
      if (event.key === "p" || event.key === "P") {
        console.log("Opening print-presentation page");
        openAsPresentation(true, true);
        event.preventDefault();
      }
      if (event.key === "d" || event.key === "D") {
        console.log("Opening print-document page");
        openAsDocument(true);
        event.preventDefault();
      }
      return;
    }
  },
  true
);

function markTopAnchor() {
  const mainAnchors = document.querySelectorAll(".docanchor");
  const sidebarAnchors = document.querySelectorAll(".sidebar-anchors a");
  sidebarAnchors.forEach((anchor) => anchor.classList.remove("highlight"));

  let closest = null;
  let closestDistance = Infinity;
  mainAnchors.forEach((anchor) => {
    const rect = anchor.getBoundingClientRect();
    const distance = Math.abs(rect.top - 50);
    if (distance < closestDistance) {
      closest = anchor;
      closestDistance = distance;
    }
  });
  if (closest) {
    const sidebarAnchor = document.querySelector(
      `.sidebar-anchors a[href="#${closest.id}"]`
    );
    if (sidebarAnchor) {
      sidebarAnchor.classList.add("highlight");
    }
  }
}
markTopAnchor();

document.addEventListener("DOMContentLoaded", (event) => {
  const collapsibles = document.querySelectorAll(".obsidian-collapsable");
  collapsibles.forEach((collapsible) => {
    const trigger = collapsible.querySelector(".obsidian-collapsable-trigger");
    trigger.addEventListener("click", () => {
      const content = collapsible.querySelector(".obsidian-callout-content");
      const chevron = collapsible.querySelector(".obsidian-callout-chevron");
      if (content) {
        // If the content is open, close it
        if (content.classList.contains("open")) {
          content.style.maxHeight = "0px";
          content.classList.remove("open");
          chevron.classList.remove("rotated");
        } else {
          // If the content is closed, open it
          // Temporarily make the content visible to calculate the actual height
          content.style.display = "block";
          content.style.visibility = "hidden";
          content.style.maxHeight = "none";
          // Force a reflow to ensure that scrollHeight is calculated correctly
          void content.offsetHeight;
          const height = content.scrollHeight;
          // Set max-height back to 0 and then to the height so it transitions
          content.style.maxHeight = "0px";
          window.getComputedStyle(content).height; // Force repaint
          content.style.maxHeight = height + "px";
          // Make the content invisible again and let the transition make it visible
          content.style.display = "";
          content.style.visibility = "";
          content.classList.add("open");
          chevron.classList.add("rotated");
        }
      }
    });
  });
});

function toggleSidebar() {
  const sidebar = document.querySelector("#sidebar");
  if (sidebar) {
    if (sidebar.classList.contains("width-reveal")) {
      sidebar.style.maxWidth = "0px";
      sidebar.classList.remove("width-reveal");
    } else {
      sidebar.style.display = "block !important";
      sidebar.style.visibility = "hidden";
      sidebar.style.maxWidth = "none";
      // Force a reflow to ensure that scrollWidth is calculated correctly
      void sidebar.offsetWidth;
      const width = sidebar.scrollWidth;
      // Set max-height back to 0 and then to the height so it transitions
      sidebar.style.maxWidth = "0px";
      window.getComputedStyle(sidebar).width; // Force repaint
      sidebar.style.maxWidth = width + "px";
      // Make the content invisible again and let the transition make it visible
      sidebar.style.display = "";
      sidebar.style.visibility = "";
      sidebar.classList.add("width-reveal");
    }
  }

  const burger = document.querySelector(".topbar-burger");
  if (burger) {
    if (burger.classList.contains("force-rotate-left")) {
      burger.classList.remove("force-rotate-left");
    } else {
      burger.classList.add("force-rotate-left");
    }
  }
}

function toggleDirList(name) {
  const list = document.querySelector(`.${name}`);
  if (list) {
    if (list.classList.contains("normal-reveal")) {
      list.style.maxHeight = "0px";
      list.classList.remove("normal-reveal");
    } else {
      list.style.maxHeight = "2000px";
      // Make the content invisible again and let the transition make it visible
      list.style.display = "";
      list.style.visibility = "";
      list.classList.add("normal-reveal");
    }
  }
  const chevron = document.querySelector(`.${name}-chevron`);
  if (chevron) {
    if (chevron.classList.contains("force-rotate-right")) {
      chevron.classList.remove("force-rotate-right");
    } else {
      chevron.classList.add("force-rotate-right");
    }
  }
}

function toggleTopdownMenu() {
  const sidebar = document.querySelector("#topdown-menu");
  if (sidebar) {
    if (sidebar.classList.contains("width-reveal")) {
      sidebar.style.maxWidth = "0px";
      sidebar.classList.remove("width-reveal");
    } else {
      sidebar.style.display = "block !important";
      sidebar.style.visibility = "hidden";
      sidebar.style.maxWidth = "none";
      // Force a reflow to ensure that scrollWidth is calculated correctly
      void sidebar.offsetWidth;
      const width = sidebar.scrollWidth;
      // Set max-height back to 0 and then to the height so it transitions
      sidebar.style.maxWidth = "0px";
      window.getComputedStyle(sidebar).width; // Force repaint
      sidebar.style.maxWidth = width + "px";
      // Make the content invisible again and let the transition make it visible
      sidebar.style.display = "";
      sidebar.style.visibility = "";
      sidebar.classList.add("width-reveal");
    }
  }

  const chevron = document.querySelector(".topdown-menu-chevron");
  if (chevron) {
    if (chevron.classList.contains("force-rotate-right")) {
      chevron.classList.remove("force-rotate-right");
    } else {
      chevron.classList.add("force-rotate-right");
    }
  }
}

function openAsPresentation(print, sameWindow = false) {
  let url = new URL(window.location.href);
  if (print) {
    url.searchParams.set("print-pdf", "true");
  }
  url.searchParams.set("reveal", "true");
  if (sameWindow) {
    window.location.href = url;
  } else {
    window.open(url, "_blank");
  }
}

function openAsDocument(sameWindow = false) {
  const url = new URL(window.location.href);
  url.searchParams.set("document", "true");
  if (sameWindow) {
    window.location.href = url;
  } else {
    window.open(url, "_blank");
  }
}

/*
 * The search beside the navigation tree.
 *
 * Everything shown here comes from one answer of `/search`, which the server
 * derived from the files themselves, filtered for this session. Nothing is kept
 * between two queries and nothing is assembled locally out of two answers: a
 * result list is replaced whole, so what stands there is always the answer to
 * the query in the field.
 *
 * There is deliberately no completion, no suggestion and no correction. Any of
 * the three would have to be derived from a vocabulary, and a vocabulary
 * assembled over the corpus is exactly the thing this search may not hand to a
 * reader. If one is ever added it has to be built from filtered content only.
 */

/** The debounce in flight, so a keystroke can cancel the one before it. */
let searchTimer = null;

/**
 * Which query the list on screen belongs to. Answers can arrive out of order —
 * a broad query started first can come back after a narrower one started later
 * — and a list is only replaced by an answer that is still the current one.
 */
let searchGeneration = 0;

/**
 * The node the reader's selection stands on, or `null` while it stands nowhere.
 *
 * A direct reference rather than an index into anything kept beside the DOM: a
 * list is replaced whole by every answer, and the one line that gives the
 * selection up sits at the top of `showSearchResults`, before the nodes it
 * could point at are detached.
 */
let searchSelection = null;

/**
 * The node the selection was last handed back from, for as long as the query
 * stands. Cleared on every keystroke below, which is also what keeps it from
 * ever naming a node in a list the reader is no longer looking at: a list is
 * only ever replaced by an answer to a query that was typed.
 */
let searchResume = null;

function onSearchInput() {
  const field = document.getElementById("searchField");
  if (!field) return;

  // Typed, so the way back into the list is given up - before the debounce and
  // before the minimum length is looked at, because the rule the reader knows is
  // *as long as nothing is typed* rather than *until a new answer arrives*.
  searchResume = null;

  clearTimeout(searchTimer);
  const query = field.value.trim();
  const minimum = Number(field.dataset.minimumLength || 3);

  if (query.length < minimum) {
    // Below the minimum nothing is asked and nothing is shown. The field says
    // what it wants in its placeholder; the empty list says nothing about the
    // corpus, which is the point.
    searchGeneration++;
    showSearchResults([]);
    return;
  }

  const wait = Number(field.dataset.debounceMs || 250);
  searchTimer = setTimeout(() => runSearch(query), wait);
}

/**
 * Asks the application, as this session, what it may be told about `query`.
 *
 * `no-store` rather than a default fetch: an answer served out of the browser's
 * cache would be an answer that was authorized once and shown again, and every
 * query has to be authorized as it is answered.
 */
async function runSearch(query) {
  const generation = ++searchGeneration;
  try {
    const response = await fetch(`/search?q=${encodeURIComponent(query)}`, {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      if (generation === searchGeneration) showSearchResults([]);
      return;
    }
    const answer = await response.json();
    if (generation !== searchGeneration) return;
    showSearchResults(Array.isArray(answer.results) ? answer.results : []);
  } catch (error) {
    console.warn("[search] The query could not be answered:", error);
    if (generation === searchGeneration) showSearchResults([]);
  }
}

/**
 * Puts a result list on screen.
 *
 * Built with `createElement` and `textContent` throughout. A snippet is corpus
 * text quoted back, and corpus text is written by people who may write angle
 * brackets; assembling this list as markup would make every document that
 * contains a `<script>` in a code fence a hazard on the way to the reader.
 */
function showSearchResults(results) {
  const list = document.getElementById("searchResults");
  if (!list) return;
  // A position in the previous list names nothing in this one, so the selection
  // is given up here rather than cleaned up afterwards - and before the node it
  // points at is detached.
  selectSearchNode(null);
  list.replaceChildren();

  // Names a node for this render and for no other. The list is rebuilt whole, so
  // an id from the render before means nothing, exactly as a heading's id in a
  // rendered page does.
  let nodeIndex = 0;

  for (const result of results) {
    const entry = document.createElement("div");
    entry.className = "sl-search-result";

    const row = document.createElement("div");
    row.className = "sl-search-result-row";

    const headings = Array.isArray(result.headings) ? result.headings : [];
    const expanded = document.createElement("div");
    expanded.className = "sl-search-headings collapsed";

    if (headings.length > 0) {
      const toggle = document.createElement("span");
      toggle.className = "sl-search-expand";
      toggle.textContent = "❯";
      toggle.title = "Show the headings the matches are under";
      toggle.addEventListener("click", () =>
        setSearchEntryExpanded(entry, !searchEntryHeadings(entry).expanded)
      );
      row.appendChild(toggle);
      row.setAttribute("aria-expanded", "false");
    }

    // The page view, whatever view the reader is in right now: the print and
    // presentation renderings display the same Markdown source and are selected
    // by query parameter, so a hit belongs to the document rather than to one of
    // its renderings.
    const link = document.createElement("a");
    link.className = "sl-search-name";
    link.id = `sl-search-node-${++nodeIndex}`;
    link.setAttribute("role", "option");
    link.href = result.path;
    link.textContent = result.name;
    row.appendChild(link);
    entry.appendChild(row);

    if (result.snippet) {
      const snippet = document.createElement("span");
      snippet.className = "sl-search-snippet";
      snippet.textContent = result.snippet;
      entry.appendChild(snippet);
    }

    for (const heading of headings) {
      const anchor = document.createElement("a");
      anchor.className = "sl-search-heading";
      anchor.id = `sl-search-node-${++nodeIndex}`;
      anchor.setAttribute("role", "option");
      // Which heading, not which anchor: a heading's id is generated fresh on
      // every render, so it means nothing outside the render that produced it.
      // The text and its occurrence are counted over the content this session
      // is served, and the page counts them again the same way.
      anchor.href =
        `${result.path}?heading=${encodeURIComponent(heading.text)}` +
        `&occurrence=${encodeURIComponent(heading.occurrence)}`;
      anchor.textContent = heading.text || "(untitled)";
      expanded.appendChild(anchor);
    }
    if (headings.length > 0) entry.appendChild(expanded);

    list.appendChild(entry);
  }

  // The preferences were applied to the page at init(), before any of this
  // existed, so a result list built afterwards has to be told about dark mode.
  if (attributes.dm === 1) {
    for (const element of list.querySelectorAll("a")) element.classList.add("dark-mode");
    list.classList.add("dark-mode");
  }

  // What the field says it controls: a list with something in it, or none.
  document
    .getElementById("searchField")
    ?.setAttribute("aria-expanded", String(results.length > 0));
}

/*
 * Driving the result list from the keyboard.
 *
 * The list has two levels - results, and the headings of an expanded result -
 * and everything below walks exactly the nodes the reader is looking at. None
 * of it asks anything: a node is on screen because `corpus-search` already
 * decided this session may see it, so a walk cannot reach further than reading
 * the list already does, and holding a key measures nothing.
 *
 * The search field keeps the focus the whole time and the selection is a mark
 * rather than a focus ring, so the query can still be refined while a result is
 * selected. That is why arrow-left and arrow-up lead back out of the list: while
 * something is selected, left and right mean the tree rather than the caret, and
 * the reader needs a way back to a caret they can move.
 */

/**
 * Sets whether a result's headings are shown.
 *
 * `expanded` on the chevron, `collapsed` on the container and `aria-expanded`
 * on the row are one state written three ways, and they are written only here.
 * The chevron's listener and the arrow keys are two callers of one function
 * rather than two notions of what an expanded result is.
 */
function setSearchEntryExpanded(entry, shown) {
  const toggle = entry?.querySelector(".sl-search-expand");
  const container = entry?.querySelector(".sl-search-headings");
  if (!toggle || !container) return;

  toggle.classList.toggle("expanded", shown);
  container.classList.toggle("collapsed", !shown);
  entry.querySelector(".sl-search-result-row")?.setAttribute("aria-expanded", String(shown));

  // A node that is not displayed cannot be the selected one. Closing a heading
  // list the selection stands in therefore leaves it on the result that list
  // belongs to - whichever of the two callers closed it.
  if (!shown && searchSelection && container.contains(searchSelection)) {
    selectSearchNode(entry.querySelector("a.sl-search-name"));
  }
}

/**
 * Whether a result has headings at all, and whether they are currently shown.
 * The one place either question is asked; nothing else reads the two classes.
 */
function searchEntryHeadings(entry) {
  const container = entry ? entry.querySelector(".sl-search-headings") : null;
  return {
    expandable: container !== null,
    expanded: container !== null && !container.classList.contains("collapsed"),
  };
}

/**
 * The nodes the selection can stand on, top to bottom: every result, with the
 * headings of an expanded result spliced in beneath it.
 *
 * Derived on every key press out of the DOM the reader is looking at rather
 * than kept, so an expand and a collapse have nothing to invalidate and a node
 * that is not displayed cannot be walked onto.
 */
function searchWalkOrder() {
  const list = document.getElementById("searchResults");
  if (!list) return [];
  return [...list.querySelectorAll("a.sl-search-name, a.sl-search-heading")].filter(
    (anchor) => !anchor.closest(".sl-search-headings.collapsed")
  );
}

/**
 * Moves the mark to `anchor`, or gives it up when there is none.
 *
 * The mark is `.highlight`, the same one the content list uses to say *this is
 * where you are*; it lands on an `<a>`, which is what `a.dark-mode.highlight`
 * needs to reach it in dark mode. `aria-activedescendant` is written from here
 * too, so what is seen and what is announced cannot disagree.
 */
function selectSearchNode(anchor) {
  const field = document.getElementById("searchField");
  if (searchSelection) searchSelection.classList.remove("highlight");
  searchSelection = anchor || null;

  if (!searchSelection) {
    field?.removeAttribute("aria-activedescendant");
    return;
  }
  searchSelection.classList.add("highlight");
  field?.setAttribute("aria-activedescendant", searchSelection.id);
  // `nearest` is the smallest movement that brings the node into view, which for
  // a node inside the list's own 40vh scroller is that scroller and not the page
  // behind the sidebar.
  searchSelection.scrollIntoView({ block: "nearest" });
}

/**
 * Gives the selection up and puts the caret at the end of the query, keeping
 * the node it stood on.
 *
 * The caret's position is not cosmetic: the end of the query is the one place
 * from which arrow-right means the list, so leaving it there is what makes the
 * way out the way back in.
 */
function handBackSearchSelection() {
  const field = document.getElementById("searchField");
  searchResume = searchSelection;
  selectSearchNode(null);
  if (!field) return;
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
}

/**
 * The keys the result list answers to.
 *
 * A decision table over the key and where the selection stands. `return` means
 * the press was not ours and is left entirely alone - which is what keeps
 * arrow-left and arrow-right moving the caret while the caret is what the reader
 * is using; `break` means the search acted on it, and every one of those presses
 * is consumed at the end, so a walk never moves the caret and never scrolls the
 * page.
 *
 * Modified presses are none of ours before anything else is looked at. The only
 * other key listener on the page is the Ctrl+Alt print shortcut, registered on
 * `window` in the capture phase; the two cannot meet over a key.
 */
function onSearchKeyDown(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return;

  const field = document.getElementById("searchField");
  if (!field) return;

  const order = searchWalkOrder();
  // Read back out of the walk order rather than trusted: a chevron may have
  // closed the list the selection stood in since the last press.
  const at = searchSelection ? order.indexOf(searchSelection) : -1;
  const selected = at === -1 ? null : searchSelection;
  const entry = selected ? selected.closest(".sl-search-result") : null;

  switch (event.key) {
    case "ArrowDown":
      // The node below where the reader is, and from the field that is the first
      // result whatever happened earlier - which is also the only way back to the
      // top of a list without walking up it.
      if (!selected) {
        if (order.length === 0) return;
        selectSearchNode(order[0]);
        break;
      }
      selectSearchNode(order[Math.min(at + 1, order.length - 1)]);
      break;

    case "ArrowUp":
      if (!selected) return;
      if (at === 0) handBackSearchSelection();
      else selectSearchNode(order[at - 1]);
      break;

    case "ArrowRight": {
      if (!selected) {
        // One step right, and when there is nothing left to the right, one level
        // in. Anywhere but the end of the query there is still text to the right,
        // so the press belongs to the field: a selected query collapses, a caret
        // inside it moves one character.
        const end = field.value.length;
        if (field.selectionStart !== end || field.selectionEnd !== end) return;
        if (order.length === 0) return;
        selectSearchNode(order.includes(searchResume) ? searchResume : order[0]);
        break;
      }
      if (selected.classList.contains("sl-search-heading")) return;
      const { expandable, expanded } = searchEntryHeadings(entry);
      if (!expandable) break;
      if (expanded) selectSearchNode(order[at + 1]);
      else setSearchEntryExpanded(entry, true);
      break;
    }

    case "ArrowLeft":
      if (!selected) return;
      // One level up, and from a result that has no level above it inside the
      // list, out of the list and back to the field.
      if (selected.classList.contains("sl-search-heading")) setSearchEntryExpanded(entry, false);
      else if (searchEntryHeadings(entry).expanded) setSearchEntryExpanded(entry, false);
      else handBackSearchSelection();
      break;

    case "Enter":
      if (!selected) return;
      // Followed by the very code the pointer follows it with, `href` and all,
      // rather than by a second way of opening the same two kinds of node.
      selected.click();
      break;

    default:
      return;
  }

  event.preventDefault();
}

/**
 * The press the field is taking focus from, and how far it has travelled.
 * Recorded on `pointerdown`, read by the `focus` that follows it, and let go of
 * as soon as either that focus or the press itself is over.
 */
let searchPress = null;

/**
 * The press whose focus selected the query, kept until its `mouseup` - the one
 * event whose default would collapse that selection again.
 */
let searchFocusPress = null;

/** How far a press may travel and still be a click rather than a drag. */
const searchPressSlack = 3;

/**
 * Offers the previous query for replacement, unless a finger put the caret
 * where it is.
 *
 * The decision is made from the press this focus followed rather than from what
 * the machine is capable of, so a laptop with a touchscreen gets the convenience
 * from its trackpad and the old behaviour from its screen without being asked
 * which kind of machine it is. A focus that arrives with no press at all - Tab,
 * or a script - selects, because a keyboard focus is by definition not a finger.
 *
 * The touch path is this early return and nothing else.
 */
function onSearchFocus(event) {
  const press = searchPress;
  searchPress = null;
  if (press?.pointerType === "touch") return;

  event.target.select();
  // The press that caused this focus still has its `mouseup` to come, and the
  // browser places the caret there. Remembered so that one mouseup - and no
  // other - can be kept from undoing what was just selected.
  searchFocusPress = press ? { x: press.x, y: press.y } : null;
}

function onSearchMouseUp(event) {
  const press = searchFocusPress;
  searchFocusPress = null;
  if (!press) return;

  // A press that travelled is a drag, and a drag selects what was dragged
  // across. Only a press that stayed where it went down is the click this guard
  // is for.
  const moved =
    Math.abs(event.clientX - press.x) > searchPressSlack ||
    Math.abs(event.clientY - press.y) > searchPressSlack;
  if (!moved) event.preventDefault();
}

/**
 * Binds the field to everything above. Absent in the document view, which has no
 * sidebar and therefore no field.
 */
function initSearchField() {
  const field = document.getElementById("searchField");
  if (!field) return;

  field.addEventListener("keydown", onSearchKeyDown);
  field.addEventListener("pointerdown", (event) => {
    searchPress = { pointerType: event.pointerType, x: event.clientX, y: event.clientY };
  });
  field.addEventListener("pointerup", () => {
    searchPress = null;
  });
  field.addEventListener("focus", onSearchFocus);
  field.addEventListener("mouseup", onSearchMouseUp);
  field.addEventListener("blur", () => {
    searchPress = null;
    searchFocusPress = null;
  });
}

document.addEventListener("DOMContentLoaded", initSearchField);

let mainFontsArray = [];

let navFontsArray = [];

function initFonts(mainFonts, navFonts) {
  mainFontsArray = JSON.parse(mainFonts);
  navFontsArray = JSON.parse(navFonts);
}

async function getUserAttributes() {
  try {
    const r = await fetch("/userattributes", {
      method: "GET",
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
    const result = r.json();
    return result;
  } catch (error) {
    console.error("An error occurred:", error);
    location.reload();
  }
}
async function setUserAttributes(attributesObject) {
  try {
    await fetch("/userattributes", {
      method: "POST",
      body: JSON.stringify(attributesObject),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
  } catch (error) {
    console.error("An error occurred:", error);
    location.reload();
  }
}
async function setParam(key, value) {
  attributes[key] = value;
  await setUserAttributes(attributes);
  applyAttributes();
}

let attributes = {};

/**
 * How long a page view stays hidden waiting for its preferences before showing
 * itself without them. Seconds rather than milliseconds on purpose: this exists
 * to survive a request that never answers, not to race a slow one.
 */
const revealBoundMs = 5000;
let pageRevealed = false;
let revealBound = null;

/**
 * The one place a page view is shown. `wrapInPage` and `wrapAsDocument` serve
 * the body hidden so the preferences below — font size, theme, dark mode —
 * cannot flash in their defaults before the session's own arrive; this is where
 * that period ends. Nothing else in a page view writes the property, in either
 * direction: the hot-reload script restores a scroll position and leaves
 * visibility alone.
 *
 * The value is `""` rather than a display mode. It hands the element back to the
 * stylesheets, which is what a page should do; asserting `block` would overwrite
 * whatever `css/` says about `body`. That is nothing today, and it is luck
 * rather than a guarantee.
 *
 * The second reason the period exists — a scroll offset saved before a hot
 * reload — is put back here too, and deliberately after the property is
 * cleared: a hidden body has no scroll height, so scrolling it would land at the
 * top. Both statements are one task and the browser paints once, so the first
 * frame the session sees is already at the restored offset.
 *
 * A page opened from a search result scrolls to the heading the result named,
 * in the same task and for the same reason. It runs only when the restore put
 * nothing back: the two want the same page at different offsets in exactly one
 * case — a hot reload of a page that was opened from a search — and there the
 * reader has scrolled since, so what they scrolled to wins.
 *
 * Called twice or more, it does nothing the second time: the preference request
 * and the bound `init()` arms are two callers, and whichever arrives first is
 * the one that counts. Clearing that bound is part of revealing, so the two
 * cannot both show the page and the bound cannot log after a normal load.
 */
function revealPage() {
  if (pageRevealed) return;
  pageRevealed = true;
  clearTimeout(revealBound);
  revealBound = null;

  document.body.style.display = "";
  const restored = window.safeLearnRestorePosition?.();
  if (!restored) window.safeLearnJumpToHeading?.();
}

function init() {
  // The bound on the hidden period, armed before the request it bounds. A page
  // shown in the default appearance is a worse page; a page that is never shown
  // is not a page — so the wait ends either way, and the console says which of
  // the two happened.
  revealBound = setTimeout(() => {
    console.warn(
      `[bootstrap] Showing this page without the session's preferences: ` +
        `/userattributes did not answer within ${revealBoundMs} ms.`
    );
    revealPage();
  }, revealBoundMs);

  getUserAttributes().then((user) => {
    const a = user.accessTokenDecoded.config
      ? JSON.parse(user.accessTokenDecoded.config)
      : {};
    attributes = {
      fs: a.fs || 18,
      t: a.t || 2,
      nt: a.nt || 1,
      s: a.s || 1.6,
      dm: a.dm || 0,
      sl: a.sl || 1,
      vt: a.vt || 0,
      va: a.va || 0,
      ve: a.ve || 0,
    };
    applyAttributes();
    revealPage();
  });
}

const darkModeAffectedElements = [
  "body",
  "#markdown-content",
  "#sidebar",
  "#topbar",
  "#topdown-menu",
  "#searchField",
  ".sidebar-dirlist a",
  ".sidebar-anchors a",
];

function applyAttributes() {
  for (const qs of darkModeAffectedElements) {
    const darkModeElements = document.querySelectorAll(qs);
    darkModeElements.forEach((element) => {
      if (attributes.dm === 1) {
        element.classList.add("dark-mode");
      } else {
        element.classList.remove("dark-mode");
      }
    });
  }
  const mainContent = document.getElementById("markdown-content");
  if (mainContent) {
    mainContent.style.fontSize = attributes.fs + "px";
    let index = attributes.t;
    if (mainFontsArray.length <= index) index = 0;
    let font = mainFontsArray[index];
    mainContent.style.fontFamily = "main " + font;
    mainContent.style.lineHeight = attributes.s;
  }

  const slcb = document.getElementById("startWithLastPageCheckbox");
  if (slcb) {
    slcb.checked = attributes.sl === 1;
  }

  let tscb = document.getElementById("studentTeacherFs");
  if (tscb) {
    tscb.checked = attributes.vt === 0;
  }
  tscb = document.getElementById("answersFs");
  if (tscb) {
    tscb.checked = attributes.va === 0;
  }
  tscb = document.getElementById("examFs");
  if (tscb) {
    tscb.checked = attributes.ve === 0;
  }

  const navFont = document.querySelectorAll(".nav-font");
  navFont.forEach((item) => {
    let index = attributes.nt;
    if (navFontsArray.length <= index) index = 0;
    let font = navFontsArray[index];
    item.style.fontFamily = "nav " + font;
  });

  const selectControl = document.getElementById("mainFontSelect");
  if (selectControl) {
    selectControl.value = attributes.t;
  }
  const navSelectControl = document.getElementById("navFontSelect");
  if (navSelectControl) {
    navSelectControl.value = attributes.nt;
  }
}
function fontBigger() {
  let v = attributes.fs + 1;
  if (v > 50) v = 50;
  setParam("fs", v);
}
function fontStandard() {
  setParam("fs", 18);
}
function fontSmaller() {
  let v = attributes.fs - 1;
  if (v < 1) v = 1;
  setParam("fs", v);
}
function spacingBigger() {
  let v = attributes.s + 0.1;
  if (v > 5) v = 5;
  setParam("s", v);
}
function spacingStandard() {
  setParam("s", 1.6);
}
function spacingSmaller() {
  let v = attributes.s - 0.1;
  if (v < 1) v = 1;
  setParam("s", v);
}

function mainFontChange(index) {
  setParam("t", index);
}
function navFontChange(index) {
  setParam("nt", index);
}

function toggleLightDark() {
  let v = attributes.dm === 0 ? 1 : 0;
  setParam("dm", v).then(() => {
    setTimeout(() => {
      location.reload();
    }, 1000);
  });
}

function toggleStartWithLastPage() {
  let v = attributes.sl === 0 ? 1 : 0;
  setParam("sl", v);
}

function toggleViewTeacher() {
  let v = attributes.vt === 0 ? 1 : 0;
  setParam("vt", v).then(() => {
    setTimeout(() => {
      location.reload();
    }, 1000);
  });
}
function toggleViewAnswer() {
  let v = attributes.va === 0 ? 1 : 0;
  setParam("va", v).then(() => {
    setTimeout(() => {
      location.reload();
    }, 1000);
  });
}
function toggleViewExam() {
  let v = attributes.ve === 0 ? 1 : 0;
  setParam("ve", v).then(() => {
    setTimeout(() => {
      location.reload();
    }, 1000);
  });
}

/*
 * This script is used to resize the right panel by dragging the border.
 */
const BORDER_SIZE = 4;
const panel = document.getElementById("sidebar");

let m_pos;
function resize(e) {
  const dx = m_pos - e.x;
  m_pos = e.x;
  panel.style.width = parseInt(getComputedStyle(panel, "").width) - dx + "px";
}

panel.addEventListener(
  "mousedown",
  function (e) {
    const cs = getComputedStyle(panel, "");
    const w =
      parseInt(cs.width) + parseInt(cs.paddingLeft) + parseInt(cs.paddingRight);
    if (e.offsetX >= w - BORDER_SIZE) {
      m_pos = e.x;
      document.addEventListener("mousemove", resize, false);
    }
  },
  false
);

document.addEventListener(
  "mouseup",
  function () {
    document.removeEventListener("mousemove", resize, false);
  },
  false
);
