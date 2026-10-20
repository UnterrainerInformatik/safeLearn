/**
 * The administration pages for teachers (`teacher-admin-pages`): the menu's
 * Administration section, `/admin/attachments` and `/admin/directory`, their
 * two session data routes, and the gate all of them share.
 *
 * The attachments page is compared with what the server itself logged for
 * this run (`[Attachments] unreferenced: …`), so it proves the page shows the
 * list the attachment gate refuses, not merely some list. The directory page
 * is compared with the bearer route the Obsidian plugin reads, at the same
 * moment, and is shown not to start a fetch by being opened.
 *
 * This is a module, not a test file: `test/content.test.js` imports it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { accessToken, applicationOutput, applicationUrl, render, setPreferences, sharedSession } from "../harness.js";
import { createFormat } from "../../i18n/format.js";

const pages = { attachments: "/admin/attachments", directory: "/admin/directory" };
const dataRoutes = ["/admin/api/attachments", "/admin/api/directory/status"];
const unservedPath = "/no-route-is-registered-here-7d1f";
const anyPage = "/md/test-md-file.md";

/** A file of the test corpus nothing references (see `test/checks/attachments.js`). */
const knownUnreferenced = "assets/test-attachment-unreferenced.png";

const catalogs = Object.fromEntries(
  ["en", "de"].map((lang) => [
    lang,
    JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "..", "i18n", `${lang}.json`), "utf8")).app.admin,
  ])
);

/** Requests `reference` from the test process with the session's cookies, not following a redirect. */
async function requestUnfollowed(session, reference, headers = {}) {
  const cookies = await session.page.cookies(applicationUrl);
  const response = await fetch(new URL(reference, applicationUrl), {
    redirect: "manual",
    headers: { cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "), ...headers },
  });
  return {
    status: response.status,
    location: response.headers.get("location"),
    contentType: response.headers.get("content-type"),
    body: await response.text(),
  };
}

async function json(session, reference, headers = {}) {
  const answer = await requestUnfollowed(session, reference, headers);
  assert.equal(answer.status, 200, `${reference} should answer 200 for the ${session.role} session, but answered ${answer.status}`);
  return JSON.parse(answer.body);
}

/**
 * The last complete list the server logged: the `unreferenced:` lines that
 * precede its last count line. Null when this run did not start the server
 * (an adopted instance), whose log the harness cannot read.
 */
function loggedUnreferenced() {
  const lines = applicationOutput().split("\n");
  let current = [];
  let last = null;
  for (const line of lines) {
    const listed = /\[Attachments\] unreferenced: (.+)$/.exec(line);
    if (listed) {
      current.push(listed[1]);
      continue;
    }
    const counted = /\[Attachments\] (\d+) unreferenced attachment\(s\)/.exec(line);
    if (counted) {
      last = { count: Number(counted[1]), paths: current };
      current = [];
    }
  }
  return last;
}

/**
 * Opens the settings menu of the page shown and waits until it has opened and
 * stopped moving: a click during its transition lands beside the button.
 */
async function openMenu(session) {
  await session.page.evaluate(() => toggleTopdownMenu());
  await session.page.waitForFunction(() => document.querySelector("#topdown-menu").classList.contains("width-reveal"));
  await session.page.evaluate(async () => {
    const menu = document.querySelector("#topdown-menu");
    const box = () => JSON.stringify(menu.getBoundingClientRect());
    let before = box();
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const now = box();
      if (now === before) return;
      before = now;
    }
  });
}

/** Loads an administration page and waits until its client has drawn. */
async function openAdminPage(session, pagePath) {
  await render(session, pagePath);
  await session.page.waitForFunction(() => {
    const root = document.querySelector("#slAdmin");
    return root && root.querySelector("p, dl, section, h2") !== null;
  });
}

/** The paths the attachments page lists, rebuilt from its folders and names. */
function listedPaths(session, topFolder) {
  return session.page.evaluate((top) => {
    const paths = [];
    for (const block of document.querySelectorAll(".sl-admin-folder")) {
      const folder = block.querySelector(".sl-admin-folder-name").textContent;
      for (const name of block.querySelectorAll(".sl-admin-paths li")) {
        paths.push(folder === top ? name.textContent : `${folder}${name.textContent}`);
      }
    }
    return paths;
  }, topFolder);
}

/** Waits until no directory fetch runs, so the session's reads are of a settled state. */
async function directorySettled(session) {
  const deadline = Date.now() + 120_000;
  for (;;) {
    const status = await json(session, "/admin/api/directory/status");
    if (!status.fetching) return status;
    assert.ok(Date.now() < deadline, `a directory fetch was still running after 120 s: ${JSON.stringify(status)}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** That `session` gets neither the section, nor the pages, nor their data. */
async function assertRefused(session, why) {
  await render(session, anyPage);
  assert.equal(await session.page.$(".sl-menu-admin"), null, `the menu should offer no Administration section to ${why}`);
  const unserved = await requestUnfollowed(session, unservedPath);
  for (const pagePath of [...Object.values(pages), "/admin/assets/attachments.js"]) {
    const answer = await requestUnfollowed(session, pagePath);
    assert.equal(answer.status, unserved.status, `${pagePath} should answer ${why} as an unserved path does`);
    assert.equal(answer.location, unserved.location, `${pagePath} should lead ${why} where an unserved path leads`);
  }
  for (const route of dataRoutes) {
    const answer = await requestUnfollowed(session, route);
    assert.equal(answer.status, 403, `${route} should be refused with 403 for ${why}`);
    assert.deepEqual(JSON.parse(answer.body), { error: "Forbidden" }, `${route} should carry nothing but the refusal`);
  }
}

describe("the administration pages", () => {
  let teacher;
  let student;

  before(async () => {
    teacher = await sharedSession("teacher");
    student = await sharedSession("student");
  });

  after(async () => {
    await teacher?.page.setViewport({ width: 1280, height: 900 });
    if (teacher) await setPreferences(teacher);
    if (student) await setPreferences(student);
  });

  test("a teacher's menu offers the section, and each button opens its page", async () => {
    await setPreferences(teacher);
    for (const [name, pagePath] of Object.entries(pages)) {
      await render(teacher, anyPage);
      await openMenu(teacher);
      const section = await teacher.page.$eval(".sl-menu-admin", (element) => ({
        label: element.querySelector(".sl-menu-admin-label").textContent,
        buttons: [...element.querySelectorAll("button")].map((button) => button.dataset.adminPage),
      }));
      assert.equal(section.label, catalogs.en.section);
      assert.deepEqual(section.buttons, Object.values(pages));
      const navigated = teacher.page.waitForNavigation({ waitUntil: "domcontentloaded" });
      await teacher.page.click(`.sl-menu-admin button[data-admin-page="${pagePath}"]`);
      await navigated;
      assert.equal(new URL(teacher.page.url()).pathname, pagePath, `the ${name} button should open ${pagePath}`);
      await openAdminPage(teacher, pagePath);
      const heading = await teacher.page.$eval("#markdown-content h1", (element) => element.textContent);
      assert.equal(heading, catalogs.en[name].title);
    }
  });

  test("the attachments page lists exactly what the server logged as unreferenced", async (t) => {
    const logged = loggedUnreferenced();
    if (logged === null) {
      t.skip("this run adopted a server it did not start, so its log cannot be read");
      return;
    }
    assert.equal(logged.paths.length, logged.count, "the log's list and its count line agree");
    assert.ok(logged.paths.includes(knownUnreferenced), `the corpus fixture ${knownUnreferenced} is unreferenced`);

    await setPreferences(teacher);
    const data = await json(teacher, "/admin/api/attachments");
    assert.deepEqual(data.paths, logged.paths, "the data route answers the logged list");
    assert.equal(data.count, logged.count);
    assert.ok(!Number.isNaN(Date.parse(data.scannedAt)), "the time of the scan is answered");

    await openAdminPage(teacher, pages.attachments);
    // Grouped by folder, so a subfolder's files follow the folder's own; in a
    // folder they keep the sorted order.
    const listed = await listedPaths(teacher, catalogs.en.attachments.topFolder);
    assert.deepEqual([...listed].sort(), logged.paths, "the page lists every logged path and no other");
    const folderOf = (entry) => entry.slice(0, Math.max(entry.lastIndexOf("/"), 0));
    for (const folder of new Set(listed.map(folderOf))) {
      const inFolder = listed.filter((entry) => folderOf(entry) === folder);
      assert.deepEqual(inFolder, [...inFolder].sort(), `the files of ${folder || "the top folder"} are listed sorted`);
      const first = listed.findIndex((entry) => folderOf(entry) === folder);
      assert.deepEqual(listed.slice(first, first + inFolder.length), inFolder, `${folder || "the top folder"} is one group`);
    }
    const count = await teacher.page.$eval(".sl-admin-count", (element) => element.textContent);
    assert.ok(
      count.includes(createFormat("de-AT", "en").number(logged.count, 0)),
      `the page should state the count ${logged.count}, but says "${count}"`
    );
    const scanned = await teacher.page.$eval(".sl-admin-scanned", (element) => element.textContent);
    assert.ok(scanned.includes(createFormat("de-AT", "en").dateTime(data.scannedAt)), `the scan time is shown: "${scanned}"`);
  });

  test("Copy paths puts every listed path on the clipboard, one per line", async () => {
    await setPreferences(teacher);
    await teacher.context.overridePermissions(applicationUrl, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
    const data = await json(teacher, "/admin/api/attachments");
    await openAdminPage(teacher, pages.attachments);
    await teacher.page.click(".sl-admin-copy");
    await teacher.page.waitForFunction(() => document.querySelector(".sl-admin-copy-status").textContent !== "");
    const status = await teacher.page.$eval(".sl-admin-copy-status", (element) => element.textContent);
    assert.equal(status, catalogs.en.attachments.copied, "the page confirms the copy beside the button");
    const clipboard = await teacher.page.evaluate(() => navigator.clipboard.readText());
    assert.equal(clipboard, data.paths.join("\n"));
  });

  test("the directory page shows the report the bearer route gives, and opening it starts no fetch", async () => {
    await setPreferences(teacher);
    const settled = await directorySettled(teacher);
    const [session, bearer] = await Promise.all([
      json(teacher, "/admin/api/directory/status"),
      fetch(`${applicationUrl}/api/admin/directory/status`, {
        headers: { Authorization: `Bearer ${await accessToken(teacher)}` },
      }).then((response) => response.json()),
    ]);
    assert.deepEqual(session, bearer, "the session route and the bearer route answer the same report");

    await openAdminPage(teacher, pages.directory);
    const shown = await teacher.page.$eval("#slAdmin", (element) => ({ text: element.textContent, phase: element.dataset.phase }));
    assert.ok(shown.text.includes(catalogs.en.directory.fetchIdle), "the page says no fetch is running");
    if (settled.entries === null) {
      assert.ok(shown.text.includes(catalogs.en.directory.nothingHeld), "the page says no directory data is held");
    } else {
      const format = createFormat("de-AT", "en");
      assert.ok(shown.text.includes(format.number(settled.entries, 0)), `the page shows the ${settled.entries} entries`);
      assert.ok(shown.text.includes(catalogs.en.directory.skipped), "the page shows the skipped count");
    }

    // The page's own read and a reload of it, then the state once more.
    await openAdminPage(teacher, pages.directory);
    const afterwards = await json(teacher, "/admin/api/directory/status");
    assert.equal(afterwards.phase, "idle", "opening the page started no fetch");
    assert.equal(afterwards.builtAt, settled.builtAt, "the held data was not rebuilt");
  });

  test("a student gets neither the section, nor the pages, nor their data", async () => {
    await setPreferences(student);
    await assertRefused(student, "a student");
  });

  test("a teacher in student view is refused like a student, and switching back restores everything", async () => {
    await setPreferences(teacher, { vt: 0 });
    await assertRefused(teacher, "a teacher in student view");

    await setPreferences(teacher, { vt: 1 });
    await render(teacher, anyPage);
    assert.notEqual(await teacher.page.$(".sl-menu-admin"), null, "the section is back in the teacher view");
    for (const pagePath of Object.values(pages)) await openAdminPage(teacher, pagePath);
    for (const route of dataRoutes) await json(teacher, route);
  });

  test("the menu and both pages speak German to a German reader", async () => {
    await setPreferences(teacher, { lang: "de" });
    try {
      await render(teacher, anyPage);
      const menu = await teacher.page.$eval(".sl-menu-admin", (element) => element.textContent);
      for (const text of [catalogs.de.section, catalogs.de.attachments.title, catalogs.de.directory.title]) {
        assert.ok(menu.includes(text), `the menu should say "${text}"`);
      }
      await openAdminPage(teacher, pages.attachments);
      const attachments = await teacher.page.$eval("#markdown-content", (element) => element.textContent);
      assert.ok(attachments.includes(catalogs.de.attachments.title));
      assert.ok(attachments.includes(catalogs.de.attachments.copyPaths));
      assert.ok(!attachments.includes(catalogs.en.attachments.copyPaths), "no English text is left on the page");

      await openAdminPage(teacher, pages.directory);
      const directory = await teacher.page.$eval("#markdown-content", (element) => element.textContent);
      for (const text of [catalogs.de.directory.title, catalogs.de.directory.fetchHeading, catalogs.de.directory.heldHeading]) {
        assert.ok(directory.includes(text), `the directory page should say "${text}"`);
      }
      assert.ok(!directory.includes(catalogs.en.directory.heldHeading), "no English text is left on the page");
    } finally {
      await setPreferences(teacher);
    }
  });

  test("both pages fit a 390px viewport without scrolling sideways", async () => {
    await setPreferences(teacher);
    await teacher.page.setViewport({ width: 390, height: 900 });
    try {
      for (const pagePath of Object.values(pages)) {
        await openAdminPage(teacher, pagePath);
        const measured = await teacher.page.evaluate(() => ({
          layout: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        assert.equal(measured.layout, 390);
        assert.ok(measured.scroll <= measured.layout + 1, `${pagePath} scrolls sideways to ${measured.scroll}px at 390px`);
      }
    } finally {
      await teacher.page.setViewport({ width: 1280, height: 900 });
    }
  });
});
