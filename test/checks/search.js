/**
 * What a search may return, and what it may never reveal.
 *
 * Reads `md/test-search-blocks.md`, `md/test-search-teacher-file.md`,
 * `md/test-search-jump.md` and the two `md/test-search-staleness-*.md` files.
 * Each of them carries words in capitals that occur in that one file and nowhere
 * else in the corpus, so a term coming back is a statement about exactly one
 * passage having been read.
 *
 * The negative checks are the point of this file. A search that leaks does not
 * fail loudly - it answers, correctly-looking, with one word too many - so every
 * channel is driven separately: a whole file the session may not open, a block
 * inside a file it may, a block addressed to somebody else by name, and the seam
 * a removed block leaves behind. Each of them has to come back as nothing, and
 * as the same nothing a word that is not in the corpus at all comes back as.
 *
 * Two of the checks edit the corpus while the application is running and put it
 * back afterwards. That is the only way to drive the window between a change on
 * disk and the scan that would notice it, which is where an index that answered
 * for itself would leak.
 *
 * This is a module, not a test file: `test/content.test.js` imports it so the
 * whole content suite runs in one process and logs in twice.
 */

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import {
  accountLookups,
  applicationUrl,
  render,
  roles,
  setPreferences,
  sharedSession,
} from "../harness.js";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const corpusFile = (name) => path.join(projectRoot, "md", name);

/** The term that reaches the seam only once the two passages are joined. */
const seamTerm = "NAHTLINKS\nNAHTRECHTS";

/** A term that is in no corpus file, and the answer every refusal must look like. */
const absentTerm = "ZZZNICHTIMKORPUS";

/**
 * The four channels through which a search could tell a session about content it
 * may not read. Each is a word that occurs exactly once in the corpus, in the
 * passage named.
 */
const hidden = [
  {
    what: "a term that occurs only in a file whose first line is `@@@ teacher`",
    term: "KLAUSURSCHLUESSEL",
    file: "/md/test-search-teacher-file.md",
  },
  {
    what: "a term that occurs only inside a `@@@ teacher` block",
    term: "LEHRERGEHEIMNIS",
    file: "/md/test-search-blocks.md",
  },
  {
    what: "a term that occurs only in a block addressed to another person by name",
    term: "ERIKAGEHEIMNIS",
    file: "/md/test-search-blocks.md",
  },
  {
    what: "a term that exists only across the seam a removed block leaves behind",
    term: seamTerm,
    file: "/md/test-search-blocks.md",
  },
];

/** A term every session may see, so the negatives above are not vacuous. */
const openTerm = "OFFENERBEGRIFF";

const jumpPage = "/md/test-search-jump.md";
const repeatedHeading = "Wiederholte Ueberschrift";
const teacherOnlyHeading = "Nur fuer Lehrende";

describe("search", () => {
  const carried = new Map();
  const sessions = new Map();

  before(async () => {
    for (const role of ["student", "teacher"]) {
      const session = await sharedSession(role);
      carried.set(role, await roles(session));
      await setPreferences(session, {});
      sessions.set(role, session);
    }
  });

  /** The raw answer of `/search`, status and body text, as this session. */
  const search = (session, query) =>
    session.page.evaluate(async (url) => {
      try {
        const response = await fetch(url, { credentials: "include", cache: "no-store" });
        return { status: response.status, body: await response.text() };
      } catch (error) {
        return { status: 0, body: String(error) };
      }
    }, `${applicationUrl}/search?q=${encodeURIComponent(query)}`);

  /** The parsed results of a query, failing rather than returning nothing on an error. */
  const results = async (session, query) => {
    const answer = await search(session, query);
    assert.equal(
      answer.status,
      200,
      `the ${session.role} session searching ${JSON.stringify(query)} was answered ` +
        `${answer.status}, not 200: ${answer.body.slice(0, 200)}`
    );
    return JSON.parse(answer.body).results;
  };

  // ---- The channels that must stay closed ----

  for (const channel of hidden) {
    test(`${channel.what} returns nothing to a session that may not read it`, async () => {
      const session = sessions.get("student");
      assert.ok(
        !carried.get("student").has("teacher") && !carried.get("student").has("admin"),
        `the student session carries ${[...carried.get("student")].join(", ")}, which includes a role ` +
          `that may read ${channel.file}; there is nothing for this check to be about`
      );

      const answer = await search(session, channel.term);
      const nothing = await search(session, absentTerm);

      assert.equal(
        answer.status,
        nothing.status,
        `${channel.what} was answered ${answer.status} while a term that is in no file at all was ` +
          `answered ${nothing.status}. The two have to be indistinguishable.`
      );
      assert.equal(
        answer.body,
        nothing.body,
        `${channel.what} was answered differently from a term that is in no file at all. ` +
          `answer: ${answer.body.slice(0, 300)}`
      );
      assert.ok(
        !answer.body.includes(channel.file) && !answer.body.includes("test-search"),
        `the answer names ${channel.file}. A search may not disclose the path or the name of a file ` +
          `a session may not see: ${answer.body.slice(0, 300)}`
      );
    });
  }

  test("the same terms do come back for a session that may read them, so the checks above are not vacuous", async () => {
    const session = sessions.get("teacher");
    const held = carried.get("teacher");
    assert.ok(
      held.has("teacher") || held.has("admin"),
      `the teacher session carries ${[...held].join(", ")} and may read none of the hidden passages`
    );
    for (const channel of hidden) {
      if (channel.term === seamTerm) continue; // Nobody may have this one - see below.
      if (channel.term === "ERIKAGEHEIMNIS") continue; // Addressed to a person nobody here is.
      const found = await results(session, channel.term);
      assert.ok(
        found.some((result) => result.path === channel.file),
        `the teacher session may read ${channel.file} but searching ${channel.term} did not return it`
      );
    }
    const everyone = await results(sessions.get("student"), openTerm);
    assert.ok(
      everyone.some((result) => result.path === "/md/test-search-blocks.md"),
      `the student session should find ${openTerm}, which stands in a passage every session may read`
    );
  });

  // ---- The seam, asserted against the document as it is joined ----

  test("the joined document contains the seam term and the answer does not report it", async () => {
    // Built here rather than taken from the application: the check has to know
    // that the term really is in the text a naive search would have matched.
    const written = readFileSync(corpusFile("test-search-blocks.md"), "utf8");
    const joined = written.replace(/^[ \t]*@@@(.*?)\n([\s\S]*?)@@@/gms, "");
    assert.ok(
      joined.includes(seamTerm),
      `removing the blocks of md/test-search-blocks.md does not produce ${JSON.stringify(seamTerm)}, ` +
        `so this check is no longer about a seam`
    );
    assert.ok(
      !written.includes(seamTerm),
      `${JSON.stringify(seamTerm)} stands in md/test-search-blocks.md as written, so finding it would be correct`
    );

    for (const role of ["student", "teacher"]) {
      const found = await results(sessions.get(role), seamTerm);
      assert.equal(
        found.length,
        0,
        `the ${role} session was told about ${JSON.stringify(seamTerm)}, which exists only where a removed ` +
          `block used to stand. A match across that seam is a match on text nobody wrote.`
      );
    }
  });

  // ---- The toggle: the same session, the same query, the two views ----

  test("the teacher view changes what a search returns exactly as it changes the rendered page", async () => {
    const session = sessions.get("teacher");
    assert.ok(
      carried.get("teacher").has("teacher"),
      "the teacher session does not carry `teacher`, so the toggle changes nothing for it"
    );

    await setPreferences(session, { vt: 1 });
    const asTeacher = await results(session, "LEHRERGEHEIMNIS");
    const pageAsTeacher = await render(session, "/md/test-search-blocks.md");

    await setPreferences(session, { vt: 0 });
    const asStudent = await results(session, "LEHRERGEHEIMNIS");
    const pageAsStudent = await render(session, "/md/test-search-blocks.md");

    // Restore the view every other check in this file runs under.
    await setPreferences(session, {});

    assert.equal(
      pageAsTeacher.text.includes("LEHRERGEHEIMNIS"),
      true,
      "the teacher view should render the teacher block of md/test-search-blocks.md"
    );
    assert.equal(
      pageAsStudent.text.includes("LEHRERGEHEIMNIS"),
      false,
      "the student view should not render the teacher block of md/test-search-blocks.md"
    );
    assert.equal(
      asTeacher.length > 0,
      pageAsTeacher.text.includes("LEHRERGEHEIMNIS"),
      "the search and the rendered page disagree about the teacher view"
    );
    assert.equal(
      asStudent.length > 0,
      pageAsStudent.text.includes("LEHRERGEHEIMNIS"),
      "the search and the rendered page disagree about the student view"
    );
  });

  // ---- The window between a change on disk and the scan that notices it ----

  /**
   * Edits a corpus file, runs `load`, and puts the file back exactly as it was —
   * whatever `load` does. Nothing rescans while the suite runs (the watcher is
   * off unless NEXT_AUTOSCAN is set), which is the window these two checks are
   * about: the index still holds what the last scan read, and the answer has to
   * come from the file as it now stands.
   */
  async function whileEdited(name, edit, load) {
    const file = corpusFile(name);
    const original = readFileSync(file, "utf8");
    try {
      writeFileSync(file, edit(original));
      return await load();
    } finally {
      writeFileSync(file, original);
    }
  }

  test("a file restricted after the last scan is not returned", async () => {
    const found = await whileEdited(
      "test-search-staleness-open.md",
      (text) => `@@@ teacher\n${text}`,
      () => results(sessions.get("student"), "STALEOFFEN")
    );
    assert.equal(
      found.length,
      0,
      `the student session was returned a file whose first line now restricts it to teachers. ` +
        `The index still records it as open; the file on disk is what decides.`
    );
  });

  test("a file relaxed after the last scan is returned", async () => {
    const found = await whileEdited(
      "test-search-staleness-restricted.md",
      (text) => text.split("\n").slice(1).join("\n"),
      () => results(sessions.get("student"), "STALEGESCHLOSSEN")
    );
    assert.ok(
      found.some((result) => result.path === "/md/test-search-staleness-restricted.md"),
      `the student session was not returned a file whose whole-file directive has been removed. ` +
        `The index still records it as restricted; the file on disk is what decides.`
    );
  });

  test("the two staleness files are back the way the suite found them", () => {
    assert.match(
      readFileSync(corpusFile("test-search-staleness-restricted.md"), "utf8"),
      /^@@@ teacher\n/,
      "md/test-search-staleness-restricted.md lost its directive; the checks above must put it back"
    );
    assert.doesNotMatch(
      readFileSync(corpusFile("test-search-staleness-open.md"), "utf8"),
      /^@@@/,
      "md/test-search-staleness-open.md kept the directive a check added; it must be put back"
    );
  });

  // ---- What a search is allowed to say about quantity ----

  /**
   * Everything an answer may carry, named. A total taken before filtering, or a
   * mark saying that something was left out, would measure the part of the
   * corpus the session may not see - so this is an allowlist rather than a list
   * of things to look for, and a field added later fails here until somebody has
   * thought about what it discloses.
   */
  const answerShape = {
    body: ["results"],
    result: ["name", "path", "snippet", "headings"],
    heading: ["text", "occurrence"],
  };

  test("an answer carries the results and no number taken over anything else", async () => {
    // A query over the file names of this file's own corpus cases: two of the
    // five carry a whole-file directive, so the two sessions are answered with
    // different sets of documents and the check is made over a corpus where they
    // really do differ.
    const seen = new Map();
    for (const role of ["student", "teacher"]) {
      const answer = await search(sessions.get(role), "test-search");
      const body = JSON.parse(answer.body);
      seen.set(role, body.results.length);

      assert.deepEqual(
        Object.keys(body).sort(),
        [...answerShape.body].sort(),
        `the answer to the ${role} session carries more than its results: ${Object.keys(body).join(", ")}`
      );
      for (const result of body.results) {
        assert.deepEqual(
          Object.keys(result).sort(),
          [...answerShape.result].sort(),
          `a result carries a field this check has not seen: ${Object.keys(result).join(", ")}`
        );
        for (const heading of result.headings) {
          assert.deepEqual(
            Object.keys(heading).sort(),
            [...answerShape.heading].sort(),
            `a heading carries a field this check has not seen: ${Object.keys(heading).join(", ")}`
          );
        }
      }
    }

    assert.ok(
      seen.get("student") > 0 && seen.get("teacher") > seen.get("student"),
      `the student session was returned ${seen.get("student")} results and the teacher session ` +
        `${seen.get("teacher")}. Two of this file's corpus cases are restricted to teachers, so the ` +
        `teacher has to be answered with strictly more - otherwise the shape above was not checked over a ` +
        `corpus where the two sessions differ.`
    );
  });

  test("every occurrence a result reports is an occurrence the session can see", async () => {
    for (const role of ["student", "teacher"]) {
      const session = sessions.get(role);
      const found = await results(session, "Ueberschrift");
      const result = found.find((entry) => entry.path === jumpPage);
      assert.ok(result, `${jumpPage} should answer "Ueberschrift" for the ${role} session`);

      const page = await render(session, jumpPage);
      const shown = await page.page.evaluate(() =>
        [...document.querySelectorAll(".docanchor")].map((anchor) =>
          (anchor.textContent || "").replace(/\s+/g, " ").trim()
        )
      );
      for (const heading of result.headings) {
        const visible = shown.filter((text) => text === heading.text).length;
        assert.ok(
          heading.occurrence <= visible,
          `the ${role} session was told about occurrence ${heading.occurrence} of "${heading.text}", ` +
            `but only ${visible} of them are on the page it is served. A number a reader is shown has to ` +
            `be a number about what they are shown.`
        );
      }
      assert.ok(
        result.headings.every((heading) => heading.text !== teacherOnlyHeading) ||
          carried.get(role).has("teacher") ||
          carried.get(role).has("admin"),
        `the ${role} session was offered "${teacherOnlyHeading}", which stands in a block it may not read`
      );
    }
  });

  // ---- Following a result ----

  /** Opens a page view with query parameters, and waits until it is on screen. */
  async function open(session, pagePath, parameters = {}) {
    const query = new URLSearchParams(parameters).toString();
    const address =
      applicationUrl +
      pagePath.split("/").map(encodeURIComponent).join("/") +
      (query ? `?${query}` : "");
    await session.page.evaluate(() => sessionStorage.clear());
    await session.page.goto(address, { waitUntil: "domcontentloaded" });
    await session.page.waitForSelector("#markdown-content");
    await session.page.waitForFunction(() => document.body.style.display === "");
    return session.page;
  }

  /**
   * Every heading anchor of the page in front of the session, in document order,
   * with where it sits relative to the viewport.
   *
   * Which one the reader is looking at is read as "the one nearest the bottom of
   * the fixed header", the same way markTopAnchor decides which entry of the
   * content list to highlight. Asking that rather than for an exact pixel keeps
   * the check about landing on the right heading, which is what it is about,
   * rather than about a font that finished loading a frame later.
   */
  const anchorsOf = (page) =>
    page.evaluate(() =>
      [...document.querySelectorAll(".docanchor")].map((anchor, index) => ({
        index,
        text: (anchor.textContent || "").replace(/\s+/g, " ").trim(),
        top: anchor.getBoundingClientRect().top,
      }))
    );

  /** The anchor sitting closest to the bottom edge of the fixed header. */
  const landedOn = (anchors) =>
    anchors.reduce((best, anchor) =>
      Math.abs(anchor.top - 50) < Math.abs(best.top - 50) ? anchor : best
    );

  test("following a result lands on the heading it was found under", async () => {
    const page = await open(sessions.get("student"), jumpPage, {
      heading: repeatedHeading,
      occurrence: "1",
    });
    const scrolled = await page.evaluate(() => window.scrollY);
    assert.ok(
      scrolled > 0,
      `${jumpPage} opened at its top although a heading was named. The jump runs after the reveal, in the ` +
        `same task, so the first painted frame is already in position.`
    );

    const anchors = await anchorsOf(page);
    const wanted = anchors.filter((anchor) => anchor.text === repeatedHeading);
    assert.equal(
      wanted.length,
      2,
      `${jumpPage} should show "${repeatedHeading}" twice; it shows it ${wanted.length} times`
    );
    const here = landedOn(anchors);
    assert.equal(
      here.index,
      wanted[0].index,
      `the reader landed on "${here.text}" rather than on the first "${repeatedHeading}"`
    );
    assert.ok(
      Math.abs(here.top - 50) < 40,
      `"${here.text}" is ${Math.round(here.top)} px from the top of the viewport rather than just below ` +
        `the 50 px header. The jump applies that offset instead of correcting it afterwards.`
    );
  });

  test("a repeated heading lands on the occurrence the search found", async () => {
    const page = await open(sessions.get("student"), jumpPage, {
      heading: repeatedHeading,
      occurrence: "2",
    });
    const anchors = await anchorsOf(page);
    const wanted = anchors.filter((anchor) => anchor.text === repeatedHeading);
    const here = landedOn(anchors);
    assert.equal(
      here.index,
      wanted[1].index,
      `the reader landed on "${here.text}" rather than on the second "${repeatedHeading}". A document that ` +
        `repeats a heading has to send the reader to the occurrence the search counted.`
    );
    assert.ok(
      wanted[0].top < 0,
      `the first "${repeatedHeading}" is still on screen at ${Math.round(wanted[0].top)} px, so the page ` +
        `never moved past it`
    );
  });

  test("a hand-written target naming a heading the session may not see leaves the page at its top", async () => {
    const session = sessions.get("student");
    const page = await open(session, jumpPage, { heading: teacherOnlyHeading, occurrence: "1" });
    const scrolled = await page.evaluate(() => window.scrollY);
    assert.equal(
      scrolled,
      0,
      `${jumpPage} scrolled somewhere although the heading named is not in the page as filtered for the ` +
        `student session. A target that is not found has to be a silent no-op.`
    );
    const shown = await page.$eval("#markdown-content", (element) => element.textContent);
    assert.ok(
      !shown.includes(teacherOnlyHeading),
      `"${teacherOnlyHeading}" is in the page the student session is served, so this check is not about a ` +
        `heading it may not see`
    );
  });

  test("typing in the field and following a result's heading lands on that heading", async () => {
    const session = sessions.get("student");
    const page = (await render(session, jumpPage)).page;

    // Typed rather than assigned, so the debounce the field waits is exercised
    // the way a reader exercises it.
    await page.click("#searchField");
    await page.type("#searchField", "SPRUNGZWEI", { delay: 20 });
    await page.waitForSelector(".sl-search-result a.sl-search-name");

    const named = await page.$eval(".sl-search-result a.sl-search-name", (link) => ({
      text: link.textContent,
      href: link.getAttribute("href"),
    }));
    assert.equal(
      named.href,
      jumpPage,
      `the result links to ${named.href} rather than to the page view of ${jumpPage}`
    );

    await page.click(".sl-search-expand");
    const heading = await page.$eval(".sl-search-heading", (link) => link.getAttribute("href"));
    assert.match(
      heading,
      /\?heading=.+&occurrence=\d+$/,
      `a result's heading links to ${heading}, which carries no heading and occurrence`
    );

    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.click(".sl-search-heading"),
    ]);
    await page.waitForSelector("#markdown-content");
    await page.waitForFunction(() => document.body.style.display === "");

    const anchors = await anchorsOf(page);
    const wanted = anchors.filter((entry) => entry.text === repeatedHeading);
    const here = landedOn(anchors);
    assert.equal(
      here.index,
      wanted[1].index,
      `following the result for SPRUNGZWEI landed on "${here.text}". The word stands under the second ` +
        `"${repeatedHeading}", which is the occurrence the search counted.`
    );
  });

  test("a query below the minimum length is refused rather than answered", async () => {
    const answer = await search(sessions.get("student"), "ab");
    assert.equal(
      answer.status,
      400,
      `a two-character query was answered ${answer.status}. A query that short returns most of the corpus ` +
        `whatever it says, which is the cheapest probe there is.`
    );
    assert.ok(
      !answer.body.includes("results"),
      `the refusal of a short query carries results: ${answer.body.slice(0, 200)}`
    );
  });

  test("the search is refused to a request that carries no session", async () => {
    const answered = await sessions.get("student").page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "omit", redirect: "manual" });
      return { status: response.status, type: response.type };
    }, `${applicationUrl}/search?q=${encodeURIComponent(openTerm)}`);
    assert.notEqual(
      answered.status,
      200,
      `the search answered a request carrying no session with ${answered.status}. Every other content ` +
        `route refuses one.`
    );
  });

  // ---- What the answers cost ----

  test("a query costs the identity provider at most one account lookup", async () => {
    for (const role of ["student", "teacher"]) {
      const session = sessions.get(role);
      const before = await accountLookups(session);
      const found = await results(session, "Ueberschrift");
      assert.ok(
        found.length > 0,
        `"Ueberschrift" returned nothing for the ${role} session, so there is no query to have counted`
      );
      const afterwards = await accountLookups(session);
      assert.ok(
        afterwards - before <= 1,
        `one query cost the ${role} session ${afterwards - before} account lookups. A query opens every ` +
          `candidate file and decides every directive in it against one context, so one lookup answers all ` +
          `of them; more than one means something asked the identity provider behind the context's back.`
      );
    }
  });

  // ---- Matching ----

  test("a query matches inside a longer word and ignores case", async () => {
    const session = sessions.get("student");
    const compound = await results(session, "OFFENER");
    assert.ok(
      compound.some((result) => result.path === "/md/test-search-blocks.md"),
      `searching the first element of ${openTerm} should return the file the compound stands in`
    );
    const lowered = await results(session, openTerm.toLowerCase());
    assert.deepEqual(
      lowered.map((result) => result.path),
      (await results(session, openTerm)).map((result) => result.path),
      "the same term in a different case returned a different set of documents"
    );
  });

  test("a match in a name or a heading outranks a match in body text", async () => {
    const found = await results(sessions.get("student"), "Ueberschrift");
    const named = found.findIndex((result) => result.path === jumpPage);
    assert.ok(named >= 0, `${jumpPage} should be among the results for "Ueberschrift"`);
    const bodyOnly = found.findIndex((result) => result.headings.length === 0);
    if (bodyOnly >= 0) {
      assert.ok(
        named < bodyOnly,
        `${jumpPage} matches in its headings but is ranked below ${found[bodyOnly].path}, which matches ` +
          `only in body text`
      );
    }
  });

  after(async () => {
    // The view every other check in the suite expects, whatever this file left
    // behind while driving the toggle.
    const session = sessions.get("teacher");
    if (session) await setPreferences(session, {});
  });
});
