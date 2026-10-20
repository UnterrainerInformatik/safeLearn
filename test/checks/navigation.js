/**
 * Link and path resolution, the table of contents and the navigation tree.
 *
 * Reads `md/test-md-file.md`, `md/test-presentation.md`,
 * `md/presentations/test-presentation.md`, `md/test-chapter-10.md`,
 * `md/presentations/test-chapter-10.md`,
 * `md/presentations/test - name - with - spaces.md`, `md/test-content-list.md`,
 * `md/test-search-jump.md` and the folders under `md/folder-tests/`.
 *
 * These are the cases that broke before: a basename that exists in two folders —
 * with a digit in the name and without one, because the path that disambiguates
 * it is built by string surgery whose failure depends on the characters in the
 * name — names carrying spaces, and folder names carrying spaces, special
 * characters and excessive length.
 *
 * This is a module, not a test file: `test/content.test.js` imports it.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { before, describe, test } from "node:test";

import { render, roles, setPreferences, sharedSession } from "../harness.js";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const corpusRoot = path.join(projectRoot, "md");

const corpusPage = "/md/test-md-file.md";
const duplicatePage = "/md/test-presentation.md";
const duplicateInFolder = "/md/presentations/test-presentation.md";
const digitPage = "/md/test-chapter-10.md";
const digitInFolder = "/md/presentations/test-chapter-10.md";
const nameWithSpaces = "/md/presentations/test - name - with - spaces.md";
const contentListPage = "/md/test-content-list.md";
const teacherHeadingPage = "/md/test-search-jump.md";
const teacherHeading = "Nur fuer Lehrende";
const modulePage = "/admin/attachments";

/** The Content list of the page the session is looking at, or `null` when it has none. */
const contentList = (session) =>
  session.page.evaluate(() => {
    const anchors = document.querySelector(".sidebar-anchors");
    if (!anchors && !document.querySelector(".sidebar-title-content")) return null;
    return [...(anchors?.querySelectorAll("a") ?? [])].map((entry) => ({
      target: entry.getAttribute("href"),
      text: entry.textContent.trim(),
      markup: entry.innerHTML,
    }));
  });

/** Every Markdown file of the corpus, as the path the application serves it on. */
function corpusFiles(directory = corpusRoot, collected = []) {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) corpusFiles(full, collected);
    else if (path.extname(entry) === ".md") collected.push(full);
  }
  return collected;
}

/**
 * The roles a file's first line restricts it to, or `null` when it is
 * unrestricted. A window on any entry means the answer depends on the clock, so
 * such a file is reported rather than predicted.
 */
function wholeFileDirective(file) {
  const firstLine = readFileSync(file, "utf8").split("\n")[0];
  const match = firstLine.match(/^\s*@@@\s*(.+)$/);
  if (!match) return null;
  const entries = match[1].split(",").map((entry) => entry.trim().toLowerCase());
  if (entries.some((entry) => entry.includes("["))) return { timed: true, roles: [] };
  return { timed: false, roles: entries.filter(Boolean) };
}

describe("navigation", () => {
  let session;
  let carried;

  before(async () => {
    session = await sharedSession("teacher");
    carried = await roles(session);
    await setPreferences(session, {});
  });

  // ---- 6.1 A basename that exists in two folders ----

  test("a wiki-link to a duplicated basename carries a path, and following it arrives at a page", async () => {
    await render(session, corpusPage);
    const emitted = await session.page.evaluate(() =>
      [...document.querySelectorAll("#markdown-content a")]
        .map((link) => ({ href: link.getAttribute("href"), text: link.textContent.trim() }))
        .find((link) => link.text === "test-presentation")
    );
    assert.ok(emitted, `${corpusPage} should still link to the duplicated basename`);

    const emittedPath = decodeURIComponent(new URL(emitted.href).pathname);
    assert.match(
      emittedPath,
      /^\/md\/(.+\/)?test-presentation\.md$/,
      `the link should carry the path that disambiguates the basename, but is ${emitted.href}`
    );

    // The application resolves the bare name to the copy at the root of the
    // corpus. That copy is the one demonstrating the case, and it links on to
    // its namesake by path.
    const arrived = await render(session, emittedPath);
    assert.ok(
      arrived.text.includes("A file with this name exists twice"),
      `following the link should arrive at the page demonstrating the duplicate, not at the start page`
    );

    const byPath = await session.page.evaluate(() =>
      [...document.querySelectorAll("#markdown-content a")].map((link) => link.getAttribute("href"))
    );
    const disambiguated = byPath
      .map((href) => decodeURIComponent(new URL(href, "http://x").pathname))
      .find((href) => href === duplicateInFolder);
    assert.ok(
      disambiguated,
      `${duplicatePage} should link to its namesake by the path that tells them apart, ` +
        `but links to ${byPath.join(", ")}`
    );

    const namesake = await render(session, duplicateInFolder);
    assert.ok(
      namesake.text.includes("CI-CD"),
      `following the disambiguated link should arrive at ${duplicateInFolder}`
    );
  });

  // ---- 6.1a The same, on a name carrying a digit ----

  test("a wiki-link to a duplicated basename carrying a digit addresses that file and nothing else", async () => {
    await render(session, corpusPage);
    const emitted = await session.page.evaluate(() =>
      [...document.querySelectorAll("#markdown-content a")]
        .map((link) => ({ href: link.getAttribute("href"), text: link.textContent.trim() }))
        .find((link) => link.text === "test-chapter-10")
    );
    assert.ok(emitted, `${corpusPage} should still link to the duplicated basename carrying a digit`);

    const emittedPath = decodeURIComponent(new URL(emitted.href).pathname);
    // The path that disambiguates a duplicate is built by string surgery, and a
    // digit is what makes a wrong instrument visible: a name without one comes
    // back out of the wrong call unharmed, a name with one comes back cut in two.
    const addressed = emittedPath.split("/").pop();
    assert.equal(
      addressed,
      "test-chapter-10.md",
      `the link ends in "${addressed}", so it carries a character the name does not — ` +
        `the emitted path is ${emittedPath}`
    );
    assert.equal(
      emittedPath,
      digitPage,
      "the bare name resolves to the copy at the root of the corpus, as it does for the name without a digit"
    );

    const arrived = await render(session, emittedPath);
    assert.ok(
      arrived.text.includes("This is the copy at the root of the corpus"),
      "following the link should arrive at the intended file, not at the start page"
    );

    const byPath = await session.page.evaluate(() =>
      [...document.querySelectorAll("#markdown-content a")].map((link) => link.getAttribute("href"))
    );
    const disambiguated = byPath
      .map((href) => decodeURIComponent(new URL(href, "http://x").pathname))
      .find((href) => href === digitInFolder);
    assert.ok(
      disambiguated,
      `${digitPage} should link to its namesake by the path that tells them apart, ` +
        `but links to ${byPath.join(", ")}`
    );

    const namesake = await render(session, digitInFolder);
    assert.ok(
      namesake.text.includes("This is the copy in the presentations folder"),
      `following the disambiguated link should arrive at ${digitInFolder}`
    );
  });

  // ---- 6.2 A name carrying spaces ----

  test("a wiki-link to a name containing spaces resolves, renders, and is shown as written", async () => {
    await render(session, corpusPage);
    const emitted = await session.page.evaluate(() =>
      [...document.querySelectorAll("#markdown-content a")]
        .map((link) => ({ href: link.getAttribute("href"), text: link.textContent.trim() }))
        .find((link) => link.text === "test - name - with - spaces")
    );
    assert.ok(emitted, `${corpusPage} should still link to the name containing spaces`);
    assert.equal(
      decodeURIComponent(new URL(emitted.href).pathname),
      nameWithSpaces,
      "the link should address the file whose name carries the spaces"
    );

    const arrived = await render(session, nameWithSpaces);
    assert.ok(
      arrived.text.includes("This file's name contains spaces"),
      "following the link should arrive at that file rather than at the start page"
    );
  });

  // ---- 6.3 Folder names carrying spaces, special characters and length ----

  test("every folder under md/folder-tests/ is reachable and its file renders", async () => {
    const folders = readdirSync(path.join(corpusRoot, "folder-tests")).filter((entry) =>
      statSync(path.join(corpusRoot, "folder-tests", entry)).isDirectory()
    );
    const withFiles = folders.filter((folder) =>
      readdirSync(path.join(corpusRoot, "folder-tests", folder)).some(
        (entry) => path.extname(entry) === ".md"
      )
    );
    assert.ok(
      withFiles.some((folder) => folder.includes(" ")),
      "the corpus should still demonstrate a folder name containing spaces"
    );
    assert.ok(
      withFiles.some((folder) => /[^\w\s-]/.test(folder)),
      "the corpus should still demonstrate a folder name containing special characters"
    );
    assert.ok(
      withFiles.some((folder) => folder.length > 40),
      "the corpus should still demonstrate an excessively long folder name"
    );

    for (const folder of withFiles) {
      for (const file of readdirSync(path.join(corpusRoot, "folder-tests", folder))) {
        if (path.extname(file) !== ".md") continue;
        const address = `/md/folder-tests/${folder}/${file}`;
        // render() fails by itself if the application redirects to the start
        // page instead of serving the file.
        const arrived = await render(session, address);
        assert.equal(
          decodeURIComponent(new URL(arrived.url).pathname),
          address,
          `${address} should be served where it was asked for`
        );
        const shownAs = await session.page.$eval("#topbar .topbar-title", (title) =>
          title.textContent.trim()
        );
        assert.ok(
          shownAs.includes(folder) && shownAs.includes(file),
          `the open page should be named as it is written — "${folder}/${file}" — but is named "${shownAs}"`
        );
      }
    }
  });

  // ---- 6.4 The table of contents ----

  test("the table of contents lists the page's headings and every entry points at an anchor that exists", async () => {
    await render(session, corpusPage);
    const contents = await session.page.evaluate(() => {
      const entries = [...document.querySelectorAll(".sidebar-anchors a")].map((entry) => ({
        target: entry.getAttribute("href"),
        text: entry.textContent.trim(),
        resolves: Boolean(document.querySelector(`[id="${entry.getAttribute("href").slice(1)}"]`)),
      }));
      const headings = [
        ...document.querySelectorAll("#markdown-content h1, #markdown-content h2, #markdown-content h3, #markdown-content h4, #markdown-content h5, #markdown-content h6"),
      ].map((heading) => heading.textContent.trim());
      return { entries, headings };
    });

    assert.ok(contents.headings.length > 0, `${corpusPage} should still have headings`);
    for (const entry of contents.entries) {
      assert.match(entry.target, /^#/, `"${entry.text}" should address an anchor, but addresses ${entry.target}`);
      assert.ok(entry.resolves, `the entry "${entry.text}" addresses ${entry.target}, which is not in the page`);
    }
    for (const heading of contents.headings) {
      assert.ok(
        contents.entries.some((entry) => entry.text === heading),
        `the heading "${heading}" is missing from the table of contents`
      );
    }
  });

  // ---- The Content list belongs to the page it is drawn on ----

  test("a module page after a corpus page has no Content section and none of its headings", async () => {
    await render(session, corpusPage);
    const corpusHeadings = (await contentList(session)).map((entry) => entry.text);
    assert.ok(corpusHeadings.length > 1, `${corpusPage} should list its headings`);

    await render(session, modulePage);
    assert.equal(await contentList(session), null, `${modulePage} should show no Content section`);
    const sidebar = await session.page.$eval("#sidebar", (element) => element.textContent);
    for (const heading of corpusHeadings.filter((heading) => heading !== "TOP")) {
      assert.ok(
        !sidebar.includes(heading),
        `the sidebar of ${modulePage} shows "${heading}", a heading of ${corpusPage}`
      );
    }
  });

  test("two corpus pages requested at the same time each list exactly their own headings", async () => {
    const answers = await session.page.evaluate(async (paths) => {
      const parse = async (pagePath) => {
        const response = await fetch(pagePath, { credentials: "same-origin" });
        const document = new DOMParser().parseFromString(await response.text(), "text/html");
        return {
          pagePath,
          listed: [...document.querySelectorAll(".sidebar-anchors a")].map((entry) =>
            entry.getAttribute("href").slice(1)
          ),
          anchors: [
            ...document.querySelectorAll(
              "#markdown-content #ROOT, #markdown-content h1, #markdown-content h2, #markdown-content h3, #markdown-content h4, #markdown-content h5, #markdown-content h6"
            ),
          ].map((heading) => heading.id),
        };
      };
      // Several rounds, so the renders really do interleave.
      return Promise.all([...Array(4)].flatMap(() => paths.map(parse)));
    }, [corpusPage, contentListPage]);

    for (const answer of answers) {
      assert.ok(answer.anchors.length > 1, `${answer.pagePath} should still have headings`);
      assert.deepEqual(
        answer.listed,
        answer.anchors,
        `the Content list of ${answer.pagePath} should hold exactly that page's headings`
      );
    }
  });

  test("a heading naming a tag reaches the Content list as text, not as markup", async () => {
    await render(session, contentListPage);
    const entry = (await contentList(session)).find((listed) => listed.text.includes("naming"));
    assert.ok(entry, `${contentListPage} should list its heading naming <b>`);
    assert.equal(entry.text, "A heading naming <b> as text");
    assert.ok(!/<b>/i.test(entry.markup), `the entry should not contain a <b> element: ${entry.markup}`);
  });

  test("a student's Content list omits the heading of a section only teachers may see", async () => {
    const student = await sharedSession("student");
    await setPreferences(student, {});
    const studentRoles = await roles(student);
    const mayRead = studentRoles.has("teacher") || studentRoles.has("admin");

    await render(student, teacherHeadingPage);
    const listed = (await contentList(student)).map((entry) => entry.text);
    assert.equal(
      listed.includes(teacherHeading),
      mayRead,
      `the student's Content list of ${teacherHeadingPage} should ${mayRead ? "" : "not "}list "${teacherHeading}"`
    );

    await render(session, teacherHeadingPage);
    const teacherListed = (await contentList(session)).map((entry) => entry.text);
    assert.ok(teacherListed.includes(teacherHeading), `the teacher should still see "${teacherHeading}" listed`);
  });

  // ---- The burger folds the column on a wide window ----

  test("at 1600px the burger folds the column away, the content takes its width, and the next page opens unfolded", async () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 500));
    const measure = () =>
      session.page.evaluate(() => {
        const content = document.querySelector("#markdown-content");
        const style = getComputedStyle(content);
        const box = content.getBoundingClientRect();
        const left = box.left + parseFloat(style.paddingLeft);
        const right = box.right - parseFloat(style.paddingRight);
        return {
          sidebar: document.querySelector("#sidebar").getBoundingClientRect().width,
          burger: getComputedStyle(document.querySelector(".topbar-burger")).opacity,
          contentLeft: left,
          gaps: [left, document.documentElement.clientWidth - right],
          firstLeft: content.firstElementChild?.getBoundingClientRect().left ?? null,
        };
      });
    const click = async () => {
      await session.page.click(".topbar-burger");
      await settle();
    };

    await session.page.setViewport({ width: 1600, height: 900 });
    try {
      await render(session, modulePage);
      await settle();
      const shown = await measure();
      assert.ok(shown.sidebar > 200, `the column should be shown when ${modulePage} opens, but is ${shown.sidebar}px wide`);
      assert.equal(shown.burger, "1", "the burger should be visible at 1600px");

      await click();
      const folded = await measure();
      assert.equal(folded.sidebar, 0, `one click should fold the column, but it is ${folded.sidebar}px wide`);
      assert.ok(folded.firstLeft <= 30, `${modulePage} should run to the left margin, but starts at ${folded.firstLeft}px`);

      await click();
      const back = await measure();
      assert.equal(back.sidebar, shown.sidebar, "a second click should bring the column back at its width");
      assert.equal(back.contentLeft, shown.contentLeft, "and the content back to its place beside it");

      await render(session, corpusPage);
      await click();
      const reading = await measure();
      assert.equal(reading.sidebar, 0, `one click should fold the column on ${corpusPage} too`);
      assert.ok(
        Math.abs(reading.gaps[0] - reading.gaps[1]) <= 2,
        `the reading column should be centred once the column is folded, but its gaps are ${reading.gaps.map(Math.round).join(" and ")}px`
      );

      await render(session, corpusPage);
      const next = await measure();
      assert.equal(next.sidebar, shown.sidebar, "the next page should open with the column shown");
    } finally {
      await session.page.setViewport({ width: 1280, height: 900 });
    }
  });

  // ---- 6.5 The navigation tree ----

  test("the navigation tree lists the folders and files this session may see", async () => {
    await render(session, corpusPage);
    const listed = await session.page.evaluate(() => ({
      files: [...document.querySelectorAll(".sidebar-dirlist a")].map((entry) =>
        decodeURIComponent(entry.getAttribute("href"))
      ),
      folders: [...document.querySelectorAll(".sidebar-dirlist .folder-name")].map((folder) =>
        folder.textContent.trim()
      ),
    }));

    const expectedFiles = [];
    const timed = [];
    for (const file of corpusFiles()) {
      const address = `/md/${path.relative(corpusRoot, file).split(path.sep).join("/")}`;
      const directive = wholeFileDirective(file);
      if (directive?.timed) {
        timed.push(address);
        continue;
      }
      const allowed =
        !directive ||
        directive.roles.some((role) => carried.has(role)) ||
        carried.has("admin");
      if (allowed) expectedFiles.push(address);
      else {
        assert.ok(
          !listed.files.includes(address),
          `${address} is restricted to ${directive.roles.join(", ")} and should not be listed`
        );
      }
    }

    for (const address of expectedFiles) {
      assert.ok(listed.files.includes(address), `${address} should be listed in the navigation tree`);
    }
    for (const address of listed.files) {
      assert.ok(
        expectedFiles.includes(address) || timed.includes(address),
        `the navigation tree lists ${address}, which is not a corpus file this session may see`
      );
    }

    const expectedFolders = new Set();
    for (const address of expectedFiles) {
      const segments = address.replace(/^\/md\//, "").split("/").slice(0, -1);
      for (const segment of segments) expectedFolders.add(segment);
    }
    for (const folder of expectedFolders) {
      assert.ok(
        listed.folders.some((listedFolder) => listedFolder.endsWith(folder)),
        `the folder "${folder}" should be listed in the navigation tree`
      );
    }
  });
});
