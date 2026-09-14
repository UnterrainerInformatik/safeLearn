/**
 * Driving the search from the keyboard.
 *
 * The reader's hands are already on the keys when the query is typed, and every
 * step after it - see which headings a document matched under, follow one, throw
 * the query away and start again - used to need the mouse back. This module
 * checks the keys that took those steps over, and it checks them in a browser
 * because half of what they promise is about what a key does *not* do: a walk
 * through the results must not move the caret inside the query, and a key the
 * search does not act on must still do what it did before.
 *
 * Nothing here is about what a search may return - `test/checks/search.js` holds
 * that contract. Every node walked below is a node `corpus-search` already
 * decided this session may see. What this file does assert about disclosure is
 * the one thing the keyboard could have added: that entering the list, walking
 * it and leaving it issue no query at all, counted over the session rather than
 * reasoned about.
 *
 * The two fixtures are the corpus as it stands. `searc` matches several files,
 * which is a list long enough for "the third" and "the first" to be different
 * answers; `Absatz` stands in `md/test-search-jump.md` alone, under three
 * headings a student session may see. Both shapes are asserted before they are
 * relied on, so a later corpus edit fails loudly here rather than quietly
 * turning a walk into a one-step walk.
 *
 * This is a module, not a test file: `test/content.test.js` imports it so the
 * whole content suite runs in one process and logs in twice.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { render, setPreferences, sharedSession } from "../harness.js";

/** Taller than a window, so a key that scrolled the page would show it. */
const jumpPage = "/md/test-search-jump.md";

/** A page that is not the one the fixtures resolve to, for following a result. */
const otherPage = "/md/test-md-file.md";

/** A query several files answer, one character short of its full form. */
const listQuery = "searc";

/** The single result that expands, and the headings it expands to. */
const oneQuery = "Absatz";

/**
 * Those headings, named rather than counted, so a corpus edit says which one it
 * moved. The document's own title is among them: `Absatz` stands in the
 * paragraphs below it as well, and a heading is a heading at any level.
 */
const oneHeadings = [
  "Search: landing on the heading a result names",
  "Wiederholte Ueberschrift",
  "Zwischenueberschrift",
  "Wiederholte Ueberschrift",
];

/** As long as a real query and in no file, so results are displayed: none. */
const absentQuery = "ZZZNICHTIMKORPUS";

describe("search keyboard", () => {
  let session = null;

  before(async () => {
    session = await sharedSession("student");
    await setPreferences(session, {});
  });

  // ---- Reading what the reader sees ----

  /**
   * Every node the selection could stand on, with whether it is displayed and
   * whether it carries the mark.
   *
   * `offsetParent` rather than the `collapsed` class: what a heading list being
   * closed means is that its headings are not on screen, and asking the layout
   * that question keeps this file from restating the rule it is checking.
   */
  const nodesOf = (page) =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "#searchResults a.sl-search-name, #searchResults a.sl-search-heading"
        ),
      ].map((anchor) => ({
        id: anchor.id,
        text: (anchor.textContent || "").trim(),
        heading: anchor.classList.contains("sl-search-heading"),
        marked: anchor.classList.contains("highlight"),
        shown: anchor.offsetParent !== null,
        role: anchor.getAttribute("role"),
      }))
    );

  /** The results as entries: their name, their headings, and what they report. */
  const resultsOf = (page) =>
    page.evaluate(() =>
      [...document.querySelectorAll("#searchResults .sl-search-result")].map((entry, index) => ({
        index,
        id: entry.querySelector("a.sl-search-name").id,
        name: (entry.querySelector("a.sl-search-name").textContent || "").trim(),
        headings: [...entry.querySelectorAll("a.sl-search-heading")].map((anchor) => ({
          id: anchor.id,
          text: (anchor.textContent || "").trim(),
        })),
        expandable: Boolean(entry.querySelector(".sl-search-expand")),
        reportsExpanded: entry.querySelector(".sl-search-result-row").getAttribute("aria-expanded"),
      }))
    );

  /** The field: its text, its caret, its focus, and the node it names. */
  const fieldOf = (page) =>
    page.evaluate(() => {
      const field = document.getElementById("searchField");
      return {
        value: field.value,
        start: field.selectionStart,
        end: field.selectionEnd,
        focused: document.activeElement === field,
        names: field.getAttribute("aria-activedescendant"),
        expanded: field.getAttribute("aria-expanded"),
      };
    });

  /** Both halves at once, because every assertion below is about their agreement. */
  const stateOf = async (page) => ({ nodes: await nodesOf(page), field: await fieldOf(page) });

  /** The nodes that are displayed, top to bottom: the walk the reader can make. */
  const walkOf = (state) => state.nodes.filter((node) => node.shown);

  function assertMark(state, id, what) {
    const marked = state.nodes.filter((node) => node.marked);
    assert.equal(
      marked.length,
      1,
      `${what}: ${marked.length} nodes carry the mark (${marked
        .map((node) => JSON.stringify(node.text))
        .join(", ")}) rather than exactly one`
    );
    const wanted = state.nodes.find((node) => node.id === id);
    assert.equal(
      marked[0].id,
      id,
      `${what}: the mark stands on ${JSON.stringify(marked[0].text)} rather than on ` +
        `${JSON.stringify(wanted ? wanted.text : id)}`
    );
    assert.ok(marked[0].shown, `${what}: the marked node is not displayed`);
    assert.equal(
      state.field.names,
      id,
      `${what}: the field names ${state.field.names} as the selected node while the mark is on ` +
        `${id}. What is seen and what is announced are written from one place so they cannot differ.`
    );
  }

  function assertNoMark(state, what) {
    const marked = state.nodes.filter((node) => node.marked);
    assert.equal(
      marked.length,
      0,
      `${what}: ${marked.map((node) => JSON.stringify(node.text)).join(", ")} still carries the mark`
    );
    assert.equal(
      state.field.names,
      null,
      `${what}: the field still names ${state.field.names} as the selected node`
    );
  }

  /** That the caret came home, which is the position arrow-right reads. */
  function assertCaretAtEnd(state, what) {
    assert.ok(state.field.focused, `${what}: the search field does not hold the focus`);
    assert.equal(
      state.field.start,
      state.field.value.length,
      `${what}: the caret stands at ${state.field.start} rather than at the end of ` +
        `${JSON.stringify(state.field.value)}`
    );
    assert.equal(state.field.end, state.field.start, `${what}: text is selected in the field`);
  }

  // ---- Driving it ----

  /** The page the search is driven from, rendered fresh. */
  async function fresh(pagePath = jumpPage) {
    const { page } = await render(session, pagePath);
    await page.waitForSelector("#searchField");
    return page;
  }

  /**
   * Types `query` into the field the way a reader does, and waits for the answer
   * to it.
   *
   * The delay between keystrokes is far below the field's 250 ms debounce, so the
   * whole word is one query rather than one per character - which is also what
   * makes the list this returns the answer to `query` and not to a prefix of it.
   *
   * The wait is for a list built after the typing rather than for a period of
   * time: every render numbers its nodes from one, so a node's id says nothing
   * across two answers, and a stamp put on the outgoing list is the only thing
   * that tells the two apart.
   */
  async function ask(page, query, { expectResults = true } = {}) {
    await page.evaluate(() => {
      for (const anchor of document.querySelectorAll("#searchResults a")) anchor.dataset.stale = "1";
      document.getElementById("searchField").blur();
    });
    await page.click("#searchField");
    // The click selected whatever stood there, so one press is the whole of
    // clearing it - and below the minimum length that costs no query.
    await page.keyboard.press("Backspace");

    const answered = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/search"
    );
    await page.keyboard.type(query, { delay: 10 });
    await answered;

    if (!expectResults) {
      await page.waitForFunction(
        () => document.querySelectorAll("#searchResults a.sl-search-name").length === 0
      );
      return { page, nodes: [], results: [] };
    }
    await page.waitForFunction(() => {
      const first = document.querySelector("#searchResults a.sl-search-name");
      return Boolean(first) && first.dataset.stale === undefined;
    });
    return { page, nodes: await nodesOf(page), results: await resultsOf(page) };
  }

  /** Types further characters into the field that already holds the focus. */
  async function appendAndWait(page, text) {
    await page.evaluate(() => {
      for (const anchor of document.querySelectorAll("#searchResults a")) anchor.dataset.stale = "1";
    });
    const answered = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/search"
    );
    await page.keyboard.type(text, { delay: 10 });
    await answered;
    await page.waitForFunction(() => {
      const first = document.querySelector("#searchResults a.sl-search-name");
      return Boolean(first) && first.dataset.stale === undefined;
    });
  }

  /** Walks the selection from the field down onto the result at `index`. */
  async function selectResult(page, index) {
    for (let step = 0; step <= index; step++) await page.keyboard.press("ArrowDown");
  }

  /** The heading of the rendered page the reader has been left in front of. */
  const landedOn = (page) =>
    page.evaluate(() => {
      const anchors = [...document.querySelectorAll(".docanchor")];
      if (anchors.length === 0) return null;
      const distance = (anchor) => Math.abs(anchor.getBoundingClientRect().top - 50);
      const nearest = anchors.reduce((best, anchor) =>
        distance(anchor) < distance(best) ? anchor : best
      );
      return (nearest.textContent || "").replace(/\s+/g, " ").trim();
    });

  /** Follows a node and reports where the reader ended up, however it was followed. */
  async function follow(page, act) {
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), act()]);
    await page.waitForSelector("#markdown-content");
    await page.waitForFunction(() => document.body.style.display === "");
    return {
      url: page.url(),
      scrolled: (await page.evaluate(() => window.scrollY)) > 0,
      landed: await landedOn(page),
    };
  }

  // ---- The fixtures these checks stand on ----

  test("the corpus still holds the two shapes the walk needs", async () => {
    const page = await fresh();

    const many = await ask(page, listQuery);
    assert.ok(
      many.results.length >= 4,
      `${JSON.stringify(listQuery)} answers with ${many.results.length} results. The checks below ` +
        `walk a list and tell its third entry from its first, which needs several.`
    );
    assert.ok(
      many.nodes.every((node) => !node.heading || !node.shown),
      `${JSON.stringify(listQuery)} shows headings before anything was expanded, so the walk would ` +
        `not start out one node per result`
    );
    const openable = many.results.findIndex(
      (result) => result.headings.length > 0 && result.index < many.results.length - 1
    );
    assert.ok(
      openable >= 0,
      `no result of ${JSON.stringify(listQuery)} has headings and a result below it. The expand ` +
        `path needs one, because stepping out of a heading list downwards has to land somewhere.`
    );

    const one = await ask(page, oneQuery);
    assert.equal(
      one.results.length,
      1,
      `${JSON.stringify(oneQuery)} answers with ${one.results.length} results rather than the one ` +
        `${jumpPage} it is chosen for`
    );
    assert.deepEqual(
      one.results[0].headings.map((heading) => heading.text),
      oneHeadings,
      `${JSON.stringify(oneQuery)} expands to different headings than the ones a student session ` +
        `sees in ${jumpPage}. The walk into a heading list is driven through them.`
    );
  });

  test("the field and its list say what they are, and every node says what it is", async () => {
    const page = await fresh();
    const asked = await ask(page, oneQuery);

    const shape = await page.evaluate(() => {
      const field = document.getElementById("searchField");
      const list = document.getElementById("searchResults");
      return {
        role: field.getAttribute("role"),
        controls: field.getAttribute("aria-controls"),
        completion: field.getAttribute("autocomplete"),
        list: list.getAttribute("role"),
      };
    });
    assert.equal(shape.role, "combobox", "the field does not present itself as a combobox");
    assert.equal(shape.controls, "searchResults", "the field does not name the list it controls");
    assert.equal(
      shape.list,
      "listbox",
      "the result list does not present itself as the list the field controls"
    );
    // Load-bearing rather than tidy: arrow-down must enter the result list, and
    // on a browser profile several readers share, the list it would otherwise
    // open is other readers' queries.
    assert.equal(shape.completion, "off", "the field offers the values it has held before");

    for (const node of asked.nodes) {
      assert.equal(
        node.role,
        "option",
        `${JSON.stringify(node.text)} is a node the selection can stand on but is not an option of ` +
          `the list`
      );
      assert.ok(node.id, `${JSON.stringify(node.text)} has no id, so nothing can name it`);
    }
    assert.equal(
      new Set(asked.nodes.map((node) => node.id)).size,
      asked.nodes.length,
      "two nodes of one render share an id"
    );
    assert.equal(
      (await fieldOf(page)).expanded,
      "true",
      "the field reports no list while results are displayed"
    );
  });

  // ---- The walk ----

  test("arrow-down enters the list at the first result and stops at its last node", async () => {
    const page = await fresh();
    const asked = await ask(page, listQuery);
    const walk = asked.nodes.filter((node) => node.shown);

    await page.keyboard.press("ArrowDown");
    assertMark(await stateOf(page), walk[0].id, "arrow-down from the field");

    for (let step = 1; step < walk.length; step++) {
      await page.keyboard.press("ArrowDown");
      assertMark(await stateOf(page), walk[step].id, `arrow-down onto node ${step + 1}`);
    }

    await page.keyboard.press("ArrowDown");
    assertMark(
      await stateOf(page),
      walk[walk.length - 1].id,
      "arrow-down at the last node - the list does not wrap"
    );
  });

  test("arrow-right opens a result, steps into it, and the walk runs through its headings", async () => {
    const page = await fresh();
    const asked = await ask(page, listQuery);
    const openable = asked.results.find(
      (result) => result.headings.length > 0 && result.index < asked.results.length - 1
    );
    await selectResult(page, openable.index);
    assertMark(await stateOf(page), openable.id, `the walk down to ${openable.name}`);

    await page.keyboard.press("ArrowRight");
    let state = await stateOf(page);
    assertMark(state, openable.id, "arrow-right on a closed result leaves the mark where it was");
    for (const heading of openable.headings) {
      const node = state.nodes.find((entry) => entry.id === heading.id);
      assert.ok(node.shown, `${JSON.stringify(heading.text)} is still hidden after arrow-right`);
    }
    assert.equal(
      (await resultsOf(page))[openable.index].reportsExpanded,
      "true",
      `${openable.name} does not report itself as expanded`
    );

    await page.keyboard.press("ArrowRight");
    assertMark(await stateOf(page), openable.headings[0].id, "arrow-right into an open result");

    for (let step = 1; step < openable.headings.length; step++) {
      await page.keyboard.press("ArrowDown");
      assertMark(await stateOf(page), openable.headings[step].id, `arrow-down onto heading ${step + 1}`);
    }

    await page.keyboard.press("ArrowDown");
    const next = asked.results[openable.index + 1];
    assertMark(await stateOf(page), next.id, "arrow-down out of the last heading");

    await page.keyboard.press("ArrowUp");
    assertMark(
      await stateOf(page),
      openable.headings[openable.headings.length - 1].id,
      "arrow-up from the result below an open one"
    );
  });

  // ---- The way out, and the way back in ----

  test("arrow-left closes a heading list and lands on the result it belongs to", async () => {
    const page = await fresh();
    const asked = await ask(page, listQuery);
    const openable = asked.results.find((result) => result.headings.length > 0);

    await selectResult(page, openable.index);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    assertMark(await stateOf(page), openable.headings[0].id, "standing on a heading");

    await page.keyboard.press("ArrowLeft");
    const state = await stateOf(page);
    assertMark(state, openable.id, "arrow-left on a heading");
    for (const heading of openable.headings) {
      const node = state.nodes.find((entry) => entry.id === heading.id);
      assert.ok(
        !node.shown,
        `${JSON.stringify(heading.text)} is still shown after arrow-left closed its list`
      );
    }
    assert.equal(
      (await resultsOf(page))[openable.index].reportsExpanded,
      "false",
      `${openable.name} still reports itself as expanded after its list was closed`
    );

    await page.keyboard.press("ArrowLeft");
    const handed = await stateOf(page);
    assertNoMark(handed, "arrow-left on a result that is not open");
    assertCaretAtEnd(handed, "arrow-left on a result that is not open");
  });

  test("arrow-up at the top hands the selection back, and the caret is a caret again", async () => {
    const page = await fresh();
    const asked = await ask(page, listQuery);

    await page.keyboard.press("ArrowDown");
    assertMark(await stateOf(page), asked.results[0].id, "arrow-down from the field");

    await page.keyboard.press("ArrowUp");
    const handed = await stateOf(page);
    assertNoMark(handed, "arrow-up at the first result");
    assertCaretAtEnd(handed, "arrow-up at the first result");

    // The point of handing it back: left and right mean the tree while something
    // is selected, so the reader needs them to mean the caret again afterwards.
    await page.keyboard.press("ArrowLeft");
    const moved = await stateOf(page);
    assertNoMark(moved, "arrow-left after the selection was handed back");
    assert.equal(
      moved.field.start,
      moved.field.value.length - 1,
      `arrow-left left the caret at ${moved.field.start} of ${JSON.stringify(moved.field.value)} ` +
        `rather than moving it one character within the query`
    );
  });

  test("arrow-right resumes where the list was left, and arrow-down starts at its top", async () => {
    const page = await fresh();
    const asked = await ask(page, listQuery);
    const third = asked.results[2];

    await selectResult(page, 2);
    assertMark(await stateOf(page), third.id, "the walk down to the third result");
    await page.keyboard.press("ArrowLeft");
    assertNoMark(await stateOf(page), "arrow-left on the third result");

    await page.keyboard.press("ArrowRight");
    assertMark(await stateOf(page), third.id, "arrow-right with nothing typed since");

    // The two doors mean two things: arrow-right resumes, arrow-down is the node
    // below the field whatever happened earlier.
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowDown");
    assertMark(await stateOf(page), asked.results[0].id, "arrow-down from the same position");
  });

  test("arrow-right in the field means the caret until there is no text to its right", async () => {
    const page = await fresh();
    await ask(page, listQuery);

    // The whole query stands selected, which is what a click into the field does.
    await page.evaluate(() => document.getElementById("searchField").blur());
    await page.click("#searchField");
    let state = await stateOf(page);
    assert.equal(state.field.start, 0, "the click did not select the query");
    assert.equal(state.field.end, state.field.value.length, "the click did not select all of it");

    await page.keyboard.press("ArrowRight");
    state = await stateOf(page);
    assertNoMark(state, "arrow-right with the query selected");
    assertCaretAtEnd(state, "arrow-right with the query selected");

    // The caret inside the query: still text to the right, so still the caret.
    await page.evaluate(() => document.getElementById("searchField").setSelectionRange(2, 2));
    await page.keyboard.press("ArrowRight");
    state = await stateOf(page);
    assertNoMark(state, "arrow-right with the caret inside the query");
    assert.equal(state.field.start, 3, "arrow-right did not move the caret one character");

    // At the end of a query nothing answers: there is nothing to step into.
    await ask(page, absentQuery, { expectResults: false });
    await page.keyboard.press("ArrowRight");
    state = await stateOf(page);
    assertNoMark(state, "arrow-right at the end of a query with no results");
    assert.equal(
      state.field.expanded,
      "false",
      "the field reports a list while no results are displayed"
    );
  });

  test("typing forgets the way back in", async () => {
    const page = await fresh();
    const asked = await ask(page, listQuery);

    await selectResult(page, 2);
    assertMark(await stateOf(page), asked.results[2].id, "the walk down to the third result");
    await page.keyboard.press("ArrowLeft");
    assertNoMark(await stateOf(page), "arrow-left on the third result");

    await appendAndWait(page, "h");
    const grown = await resultsOf(page);
    await page.keyboard.press("ArrowRight");
    assertMark(
      await stateOf(page),
      grown[0].id,
      "arrow-right after a further character was typed - the node the selection was handed back " +
        "from belongs to a list the reader is no longer looking at"
    );
  });

  // ---- Following a selection ----

  test("enter opens what following the node with a pointer opens", async () => {
    // Hosted on a page the results do not resolve to, so following one is a
    // navigation rather than a reload of what is already there.
    let page = await fresh(otherPage);
    await ask(page, oneQuery);
    await page.keyboard.press("ArrowDown");
    const resultByKey = await follow(page, () => page.keyboard.press("Enter"));

    page = await fresh(otherPage);
    await ask(page, oneQuery);
    const resultByPointer = await follow(page, () =>
      page.click("#searchResults a.sl-search-name")
    );
    assert.deepEqual(
      resultByKey,
      resultByPointer,
      "enter on a result and a click on it leave the reader in different places"
    );
    assert.equal(
      resultByKey.scrolled,
      false,
      `following a result left ${jumpPage} scrolled, although a result opens the document at its ` +
        `beginning`
    );

    page = await fresh(otherPage);
    const asked = await ask(page, oneQuery);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    assertMark(await stateOf(page), asked.results[0].headings[0].id, "standing on the first heading");
    const headingByKey = await follow(page, () => page.keyboard.press("Enter"));

    page = await fresh(otherPage);
    await ask(page, oneQuery);
    await page.click("#searchResults .sl-search-expand");
    const headingByPointer = await follow(page, () =>
      page.click("#searchResults a.sl-search-heading")
    );
    assert.deepEqual(
      headingByKey,
      headingByPointer,
      "enter on a heading and a click on it leave the reader in different places"
    );
    assert.ok(
      headingByKey.scrolled,
      `following a heading left ${jumpPage} at its top, so the two comparisons above could both be ` +
        `about a document that never moved`
    );
  });

  // ---- The field, and the pointer that focused it ----

  test("focusing the field offers the query for replacement, unless a finger did it", async () => {
    const page = await fresh();
    await ask(page, listQuery);

    await page.evaluate(() => document.getElementById("searchField").blur());
    await page.click("#searchField");
    let state = await stateOf(page);
    assert.equal(state.field.start, 0, "a click into the field left the query unselected");
    assert.equal(state.field.end, listQuery.length, "a click into the field selected part of it");

    await page.keyboard.press("ArrowRight");
    assertCaretAtEnd(await stateOf(page), "arrow-right on the selected query");
    await page.keyboard.type("x");
    state = await stateOf(page);
    assert.equal(
      state.field.value,
      `${listQuery}x`,
      "the character typed after arrow-right replaced the query instead of extending it"
    );

    // A tap: the record the focus reads says touch, and the whole touch path is
    // that branch returning. The mouseup that follows a tap is dispatched here
    // as well, because "nothing happens" has to include the guard that would
    // otherwise have kept a selection alive - a suppressed default on a touch
    // device is a caret the reader cannot place.
    const suppressed = await page.evaluate(() => {
      const field = document.getElementById("searchField");
      field.blur();
      field.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerType: "touch",
          bubbles: true,
          clientX: 4,
          clientY: 4,
        })
      );
      field.focus();
      const release = new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        clientX: 4,
        clientY: 4,
      });
      field.dispatchEvent(release);
      return release.defaultPrevented;
    });
    assert.equal(
      suppressed,
      false,
      "the release of a tap was suppressed, so the caret a finger placed would be overridden"
    );
    state = await stateOf(page);
    assert.ok(state.field.focused, "the field did not take the focus after a tap");
    assert.equal(
      state.field.start,
      state.field.end,
      `a tap selected ${JSON.stringify(
        state.field.value.slice(state.field.start, state.field.end)
      )}. A touch session has to behave exactly as it does without any of this.`
    );
    assertNoMark(state, "a tap into the field");
  });

  // ---- What a walk costs, and what it leaves alone ----

  test("entering the list, walking it and leaving it ask nothing", async () => {
    const page = await fresh();
    const asked = await ask(page, listQuery);
    const openable = asked.results.find((result) => result.headings.length > 0);
    const before = await fieldOf(page);

    let asks = 0;
    const count = (request) => {
      if (new URL(request.url()).pathname === "/search") asks++;
    };
    page.on("request", count);
    try {
      await selectResult(page, openable.index);
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowUp");
      for (let step = 0; step <= openable.index; step++) await page.keyboard.press("ArrowUp");
    } finally {
      page.off("request", count);
    }

    assert.equal(
      asks,
      0,
      `walking the list made ${asks} request(s) to /search. Nothing about moving a selection over ` +
        `nodes that are already on screen asks the application anything.`
    );
    assert.equal(
      (await fieldOf(page)).value,
      before.value,
      "the query in the field changed while the list was being walked"
    );
  });

  test("a walk moves neither the caret within the query nor the page behind the sidebar", async () => {
    const page = await fresh();
    await ask(page, listQuery);

    await page.evaluate(() => document.getElementById("searchField").setSelectionRange(2, 2));
    const scrolledBefore = await page.evaluate(() => window.scrollY);

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const state = await stateOf(page);
    assert.equal(
      `${state.field.start}:${state.field.end}`,
      "2:2",
      `two arrow-downs left the caret at ${state.field.start} of ` +
        `${JSON.stringify(state.field.value)}. In a one-line field arrow-down is the key that ` +
        `jumps the caret to the end, so a walk that does not suppress it edits from the wrong place.`
    );
    assert.equal(
      await page.evaluate(() => window.scrollY),
      scrolledBefore,
      `${jumpPage} scrolled while the selection was walked`
    );
  });

  test("the print shortcut still works while the caret is in the field", async () => {
    const page = await fresh();
    await ask(page, listQuery);
    await page.keyboard.press("ArrowDown");

    await page.keyboard.down("Control");
    await page.keyboard.down("Alt");
    await page.keyboard.press("d");
    await page.keyboard.up("Alt");
    await page.keyboard.up("Control");

    try {
      await page.waitForFunction(
        () => new URL(window.location.href).searchParams.get("document") === "true"
      );
    } catch {
      assert.fail(
        `CTRL+ALT+D with the caret in the search field did not reach the document view: the page ` +
          `stayed at ${page.url()}. The field's handler has to leave modified presses entirely alone.`
      );
    }
  });

  // ---- One state, two ways of setting it ----

  test("expanded is one state, whichever of the two opened it", async () => {
    const page = await fresh();
    const asked = await ask(page, listQuery);
    const openable = asked.results.find((result) => result.headings.length > 0);

    // Opened by pointer, walked into by key.
    const entries = await page.$$("#searchResults .sl-search-result");
    await (await entries[openable.index].$(".sl-search-expand")).click();
    // Clicking a span moves the focus off the field; the reader's next act is to
    // put it back, and this is that act.
    await page.click("#searchField");
    await selectResult(page, openable.index);
    await page.keyboard.press("ArrowDown");
    assertMark(
      await stateOf(page),
      openable.headings[0].id,
      "arrow-down onto a result the chevron opened"
    );

    // Opened by key, closed by pointer.
    const again = await ask(page, listQuery);
    const openableAgain = again.results.find((result) => result.headings.length > 0);
    await selectResult(page, openableAgain.index);
    await page.keyboard.press("ArrowRight");
    assert.equal(
      (await resultsOf(page))[openableAgain.index].reportsExpanded,
      "true",
      "arrow-right did not open the result"
    );

    const entriesAgain = await page.$$("#searchResults .sl-search-result");
    await (await entriesAgain[openableAgain.index].$(".sl-search-expand")).click();
    const state = await stateOf(page);
    for (const heading of openableAgain.headings) {
      const node = state.nodes.find((entry) => entry.id === heading.id);
      assert.ok(
        !node.shown,
        `${JSON.stringify(heading.text)} is still shown after the chevron closed a list arrow-right ` +
          `had opened. Open and closed is one state or it is two.`
      );
    }
  });

  test("a new answer gives the selection up", async () => {
    const page = await fresh();
    const asked = await ask(page, listQuery);

    await page.keyboard.press("ArrowDown");
    assertMark(await stateOf(page), asked.results[0].id, "arrow-down from the field");

    await appendAndWait(page, "h");
    const narrowed = await stateOf(page);
    assertNoMark(narrowed, "the answer to a narrower query");
    await page.keyboard.press("ArrowDown");
    assertMark(
      await stateOf(page),
      (await resultsOf(page))[0].id,
      "arrow-down into the list a narrower query answered with"
    );

    // Below the minimum there is no answer to stand in at all.
    for (let step = 0; step < 4; step++) await page.keyboard.press("Backspace");
    await page.waitForFunction(
      () => document.querySelectorAll("#searchResults a.sl-search-name").length === 0
    );
    const emptied = await stateOf(page);
    assertNoMark(emptied, "a query that fell below the minimum length");
    assert.equal(
      emptied.field.expanded,
      "false",
      "the field reports a list although the query fell below the minimum length"
    );
  });
});
