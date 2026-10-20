/**
 * An instance without an identity provider (`anonymous-publishing`), started
 * from the working tree with `AUTH=none`.
 *
 * Needs no Keycloak, no account and no network: every instance here is started
 * by `startAnonymous`, one at a time, on a port of its own, and every reader is
 * a fresh browser context that opens the start page directly. The test corpus
 * is the specification, as in the content suite: `md/test-perms.md`,
 * `md/test-fileperms-*.md`, `md/test-exam-practice-question.md` and
 * `md/test-attachments.md`.
 *
 * A reader holding `teacher` starts with the teacher view off, as a session
 * does whose account stores no preferences: the defaults narrow. Every check
 * therefore writes the preferences it depends on first, through the page's own
 * endpoint, as the content suite does against the shared accounts.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { expectRefusedStart, render, setPreferences, shutdown, startAnonymous } from "./harness.js";

const permissionsPage = "/md/test-perms.md";
const teacherBlock = "Only visible to teachers.";
const classBlock = "Only visible to 5BHIF.";
const nameBlock = "Only visible to Stu Dent";
const unrestrictedHeading = "Simple Permission";

const restrictedFiles = [
  { path: "/md/test-fileperms-teachers.md", content: "Only visible to teachers" },
  { path: "/md/test-fileperms-4bhif-5bhif-2ahif.md", content: "Special visibility" },
  { path: "/md/test-fileperms-nobody.md", content: "NIEMANDSDATEI" },
  { path: "/md/test-search-teacher-file.md", content: "KLAUSURSCHLUESSEL" },
];
const refusal = "You do not have the required permissions to view this content.";

const examPage = "/md/test-exam-practice-question.md";
const examVariant = "Exam-question: Webservices, REST, SQL-Databases";
const practiceVariant = "Practice-question: Webservices, REST, SQL-Databases";

const teacherAttachment = "/md/assets/test-attachment-teacher.png";
const publicAttachment = "/md/assets/test-attachment-public.png";

/** The paths that start or end a login, all absent without an identity provider. */
const loginPaths = ["/test", "/auth/callback", "/logout", "/logout/callback"];
const directoryPaths = ["/api/admin/directory/search?q=teacher", "/api/admin/directory/status"];
const unservedPath = "/no-route-is-registered-here-7d1f";
/** The administration pages and their data routes (`teacher-admin-pages`), absent without an identity provider. */
const adminPaths = ["/admin/attachments", "/admin/directory", "/admin/api/attachments", "/admin/api/directory/status"];

/** The preference cookie a forged request carries, URL-encoded as the server writes it. */
const forgedConfig = (block) => `safelearn_config=${encodeURIComponent(JSON.stringify(block))}`;

/** Requests `reference` from the test process, without following a redirect. */
async function requestUnfollowed(base, reference, headers = {}) {
  const response = await fetch(new URL(reference, base), { redirect: "manual", headers });
  return {
    status: response.status,
    location: response.headers.get("location"),
    contentType: response.headers.get("content-type"),
    setCookie: response.headers.getSetCookie(),
    body: await response.text(),
  };
}

/** Requests `reference` from inside the reader's page, with its cookies. */
function requestFromPage(reader, reference) {
  return reader.page.evaluate(async (address) => {
    const response = await fetch(address, { credentials: "include" });
    const buffer = await response.arrayBuffer();
    return {
      status: response.status,
      redirected: response.redirected,
      bytes: buffer.byteLength,
      text: new TextDecoder().decode(buffer),
    };
  }, new URL(reference, reader.baseUrl).href);
}

const served = (answer) => answer.status === 200 && !answer.redirected && answer.bytes > 0;

/** The navigation tree of the page the reader is looking at. */
const treeEntries = (reader) =>
  reader.page.evaluate(() =>
    [...document.querySelectorAll(".sidebar-dirlist a")].map((entry) =>
      decodeURIComponent(entry.getAttribute("href"))
    )
  );

after(async () => {
  await shutdown();
});

describe("without an identity provider and without reader roles", () => {
  let instance;
  let reader;

  before(async () => {
    instance = await startAnonymous({ readerRoles: [] });
    reader = await instance.reader();
  });

  after(async () => {
    await instance?.stop();
  });

  test("an unrestricted page is reachable without a login, and its restricted blocks are absent", async () => {
    const { text } = await render(reader, permissionsPage);
    assert.ok(text.includes(unrestrictedHeading), `${permissionsPage} should render its unrestricted part`);
    for (const block of [teacherBlock, classBlock, nameBlock]) {
      assert.ok(!text.includes(block), `a reader without roles should not see "${block}"`);
    }
  });

  test("every file whose first line restricts it is refused by direct path and absent from the tree", async () => {
    await render(reader, permissionsPage);
    const tree = await treeEntries(reader);
    assert.ok(tree.length > 0, "the navigation tree should list the unrestricted files");
    for (const file of restrictedFiles) {
      assert.ok(!tree.includes(file.path), `${file.path} should not be in the navigation tree`);
      const { text } = await render(reader, file.path);
      assert.ok(!text.includes(file.content), `${file.path} should not show its content`);
      assert.ok(text.includes(refusal), `${file.path} should show the refusal`);
    }
  });

  test("the login paths and the directory endpoints are answered like a path nothing serves", async () => {
    const unserved = await requestUnfollowed(instance.url, unservedPath);
    assert.equal(unserved.status, 302, "an unserved path is redirected to the start page");
    for (const reference of [...loginPaths, ...directoryPaths]) {
      for (const headers of [{}, { authorization: "Bearer not-a-token" }]) {
        const answer = await requestUnfollowed(instance.url, reference, headers);
        assert.equal(answer.status, unserved.status, `${reference} should answer as an unserved path does`);
        assert.equal(answer.location, unserved.location, `${reference} should lead where an unserved path leads`);
        assert.ok(!/json/i.test(answer.contentType ?? ""), `${reference} should return no directory data`);
      }
    }
  });

  test("no page offers a logout, and no response sets a session cookie", async () => {
    await render(reader, permissionsPage);
    const logout = await reader.page.evaluate(
      () => [...document.querySelectorAll("[onclick], a[href]")].filter((element) =>
        /\/logout/.test(element.getAttribute("onclick") ?? element.getAttribute("href") ?? "")
      ).length
    );
    assert.equal(logout, 0, "the menu should contain no logout control");
    const answer = await requestUnfollowed(instance.url, permissionsPage);
    assert.ok(
      !answer.setCookie.some((cookie) => /^connect\.sid=/.test(cookie)),
      "an instance without an identity provider keeps no session"
    );
  });

  test("the teacher switch is not offered to a reader without the teacher role", async () => {
    await render(reader, permissionsPage);
    assert.equal(await reader.page.$("#studentTeacherFs"), null);
  });

  test("a preference cookie with the exam view on still gets the practice variant", async () => {
    const answer = await requestUnfollowed(instance.url, examPage, {
      cookie: forgedConfig({ vt: 1, ve: 1 }),
    });
    assert.ok(answer.body.includes(practiceVariant), "a reader without teacher should see the practice variant");
    assert.ok(!answer.body.includes(examVariant), "a reader without teacher should never see the exam variant");
  });

  test("an attachment referenced only inside a teacher block is refused, an unrestricted one served", async () => {
    await render(reader, "/md/test-attachments.md");
    assert.ok(served(await requestFromPage(reader, publicAttachment)), `${publicAttachment} should be served`);
    assert.ok(!served(await requestFromPage(reader, teacherAttachment)), `${teacherAttachment} should be refused`);
  });
});

describe("without an identity provider, with teacher as the reader role", () => {
  let instance;
  let reader;

  before(async () => {
    instance = await startAnonymous({ readerRoles: ["Teacher"] });
    reader = await instance.reader();
  });

  after(async () => {
    await instance?.stop();
  });

  test("the menu draws no Administration section and the administration routes are answered like a path nothing serves", async () => {
    await setPreferences(reader, { vt: 1 });
    await render(reader, permissionsPage);
    assert.equal(await reader.page.$(".sl-menu-admin"), null, "the menu should offer no Administration section");
    const unserved = await requestUnfollowed(instance.url, unservedPath);
    for (const reference of adminPaths) {
      const answer = await requestUnfollowed(instance.url, reference);
      assert.equal(answer.status, unserved.status, `${reference} should answer as an unserved path does`);
      assert.equal(answer.location, unserved.location, `${reference} should lead where an unserved path leads`);
      assert.ok(!/json/i.test(answer.contentType ?? ""), `${reference} should return no data`);
    }
  });

  test("a fresh reader starts in the student view: the defaults narrow", async () => {
    const fresh = await instance.reader();
    try {
      const { text } = await render(fresh, permissionsPage);
      assert.ok(!text.includes(teacherBlock), "without a stored teacher view, teacher content stays hidden");
    } finally {
      await fresh.close();
    }
  });

  test("with the teacher view on, teacher content is shown and other classes' stays hidden", async () => {
    await setPreferences(reader, { vt: 1 });
    const { text } = await render(reader, permissionsPage);
    assert.ok(text.includes(teacherBlock), "a reader holding teacher should see the teacher block");
    assert.ok(!text.includes(classBlock), "the 5bhif block is not addressed to teacher");
    assert.ok(!text.includes(nameBlock), "a block addressed to a person by name is granted to no reader");
  });

  test("the page's own teacher switch hides the teacher content on the next page, and shows it again", async () => {
    await setPreferences(reader, { vt: 1 });
    await render(reader, permissionsPage);
    const reloaded = reader.page.waitForNavigation({ waitUntil: "domcontentloaded" });
    await reader.page.click('label[for="studentTeacherFs"]');
    await reloaded;
    let { text } = await render(reader, permissionsPage);
    assert.ok(!text.includes(teacherBlock), "after switching the teacher view off, the teacher block is gone");

    const back = reader.page.waitForNavigation({ waitUntil: "domcontentloaded" });
    await reader.page.click('label[for="studentTeacherFs"]');
    await back;
    ({ text } = await render(reader, permissionsPage));
    assert.ok(text.includes(teacherBlock), "after switching it back on, the teacher block is there again");
  });

  test("the exam switch moves between the exam and the practice variant", async () => {
    await setPreferences(reader, { vt: 1, ve: 0 });
    let { text } = await render(reader, examPage);
    assert.ok(text.includes(practiceVariant) && !text.includes(examVariant), "exam view off: practice only");
    const reloaded = reader.page.waitForNavigation({ waitUntil: "domcontentloaded" });
    await reader.page.evaluate(() => toggleViewExam());
    await reloaded;
    ({ text } = await render(reader, examPage));
    assert.ok(text.includes(examVariant) && !text.includes(practiceVariant), "exam view on: exam only");
  });

  test("a second browser keeps preferences of its own", async () => {
    await setPreferences(reader, { vt: 1, ve: 1 });
    const second = await instance.reader();
    try {
      const { text } = await render(second, examPage);
      assert.ok(text.includes(practiceVariant), "the second browser holds no exam view and sees the practice variant");
      const first = await render(reader, examPage);
      assert.ok(first.text.includes(examVariant), "the first browser still sees the variant it chose");
    } finally {
      await second.close();
    }
  });

  test("with start with the last page on, the root sends the reader to the page it read last", async () => {
    await setPreferences(reader, { vt: 1, sl: 1 });
    await render(reader, examPage);
    await reader.page.goto(`${instance.url}/`, { waitUntil: "domcontentloaded" });
    assert.equal(new URL(reader.page.url()).pathname, examPage);
  });

  test("a preference block that does not parse renders with the defaults", async () => {
    const answer = await requestUnfollowed(instance.url, permissionsPage, { cookie: "safelearn_config=%7Bbroken" });
    assert.equal(answer.status, 200, "the request is not refused");
    assert.ok(answer.body.includes(unrestrictedHeading), "the page renders");
    assert.ok(!answer.body.includes(teacherBlock), "the defaults keep the teacher view off");
  });

  test("an attachment referenced only inside a teacher block follows the teacher view", async () => {
    await setPreferences(reader, { vt: 1 });
    assert.ok(served(await requestFromPage(reader, teacherAttachment)), "served with the teacher view on");
    await setPreferences(reader, { vt: 0 });
    assert.ok(!served(await requestFromPage(reader, teacherAttachment)), "refused with the teacher view off");
    await setPreferences(reader, { vt: 1 });
    assert.ok(served(await requestFromPage(reader, teacherAttachment)), "served again with it back on");
  });

  test("every presentation of a page carries the same permitted content", async () => {
    for (const vt of [1, 0]) {
      await setPreferences(reader, { vt });
      for (const query of ["", "?reveal=true", "?document=true", "?reveal=true&print-pdf=true"]) {
        const answer = await requestFromPage(reader, `${permissionsPage}${query}`);
        assert.equal(
          answer.text.includes(teacherBlock),
          vt === 1,
          `${permissionsPage}${query} with the teacher view ${vt === 1 ? "on" : "off"}`
        );
        assert.ok(!answer.text.includes(classBlock), `${permissionsPage}${query} should never show the 5bhif block`);
      }
    }
  });

  test("a bookmarked presentation opens in a fresh browser without cookies", async () => {
    const fresh = await instance.reader();
    try {
      const { text } = await render(fresh, permissionsPage, { view: "presentation" });
      assert.ok(text.includes(unrestrictedHeading), "the presentation view is shown");
      assert.ok(!text.includes(teacherBlock), "within what a reader with the default preferences may see");
    } finally {
      await fresh.close();
    }
  });
});

describe("a start that is refused", () => {
  test("AUTH with an unknown value", async () => {
    const output = await expectRefusedStart({ AUTH: "off" });
    assert.match(output, /AUTH/);
    assert.match(output, /keycloak/);
    assert.match(output, /none/);
  });

  test("AUTH=none together with EXAM_MODULE=on", async () => {
    const output = await expectRefusedStart({ AUTH: "none", EXAM_MODULE: "on" });
    assert.match(output, /AUTH=none/);
    assert.match(output, /EXAM_MODULE/);
  });

  test("no AUTH and no keycloak.json", async () => {
    // A working directory without keycloak.json and without an .env, so the
    // file is missing by mistake rather than by choice.
    const directory = mkdtempSync(path.join(os.tmpdir(), "safelearn-no-keycloak-"));
    try {
      const environment = { AUTH: undefined, SESSION_SECRET: "a-secret-so-that-is-not-the-refusal" };
      const output = await expectRefusedStart(environment, { cwd: directory });
      assert.match(output, /keycloak\.json/);
      assert.match(output, /AUTH=none/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
