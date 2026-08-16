/**
 * Link and path resolution, the table of contents and the navigation tree.
 *
 * Reads `md/test-md-file.md`, `md/test-presentation.md`,
 * `md/presentations/test-presentation.md`,
 * `md/presentations/test - name - with - spaces.md` and the folders under
 * `md/folder-tests/`.
 *
 * These are the cases that broke before: a basename that exists in two folders,
 * names carrying spaces, and folder names carrying spaces, special characters
 * and excessive length.
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
const nameWithSpaces = "/md/presentations/test - name - with - spaces.md";

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
