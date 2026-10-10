/**
 * What happens to a session that ends at the identity provider while one of
 * its pages is still open.
 *
 * Signing out of Keycloak - directly, or in another application on the same
 * realm - used to leave the local session looking authenticated with its tokens
 * nulled out. The page the next click asked for still arrived, every request
 * after it threw in the refresh middleware, and the unhandled rejection
 * terminated the process: a white page for the user who signed out, and a lost
 * session for everybody else. This check signs a session out at Keycloak the
 * way a user does, clicks a link on the page that is still open, and asserts
 * all three halves: the click lands at the login, a sub-resource asked for with
 * the dead cookie is refused rather than redirected, and the application - with
 * every other session in its memory - is still the one that was running.
 *
 * The link is clicked straight away, not after the access token's renewal
 * window: rendering a Markdown page renews the tokens anyway, and that renewal
 * is where a logout made elsewhere has to be noticed.
 *
 * This check costs exactly one login on top of the one per role the rest of the
 * content suite needs. It cannot use a shared session, because ending a session
 * is the point of it and a shared session is needed by every check after it.
 * `test/content.test.js` counts that login.
 *
 * This is a module, not a test file: `test/content.test.js` imports it so the
 * whole content suite runs in one process.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";

import {
  applicationStillRunning,
  applicationUrl,
  contentPath,
  currentUser,
  openSession,
  render,
  sharedSession,
} from "../harness.js";

/** The realm's own end-session page, which asks before it signs the browser out. */
function endSessionUrl() {
  const config = JSON.parse(readFileSync("keycloak.json", "utf8"));
  const server = config["auth-server-url"].replace(/\/$/, "");
  return `${server}/realms/${config.realm}/protocol/openid-connect/logout`;
}

/** The session cookies a request from the browser would carry, as a header. */
function cookieHeader(cookies) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

describe("a session that ends at the identity provider", () => {
  let bystander;
  let ending;
  let deadCookies;
  let clickedTarget;

  before(async () => {
    // Opened first, so it is a session the application already holds when the
    // other one ends - the one a crash would have discarded.
    bystander = await sharedSession("student");
    ending = await openSession("student");
    deadCookies = cookieHeader(await ending.page.cookies(applicationUrl));

    // Signed out at Keycloak in the same browser context, in a second tab, the
    // way a user does it - the page in the first tab stays open on content.
    const keycloak = await ending.context.newPage();
    await keycloak.goto(endSessionUrl(), { waitUntil: "domcontentloaded" });
    const confirm = await keycloak.$('form [type="submit"]');
    assert.ok(confirm, `the end-session page at ${keycloak.url()} offers no button to confirm the logout`);
    await Promise.all([keycloak.waitForNavigation({ waitUntil: "domcontentloaded" }), confirm.click()]);
    await keycloak.close();

    // A link on the open page to another page of the corpus.
    const current = new URL(ending.page.url()).pathname;
    clickedTarget = await ending.page.evaluate((current) => {
      const link = [...document.querySelectorAll("a[href]")].find((a) => {
        const target = new URL(a.href, location.href);
        return target.origin === location.origin && target.pathname.endsWith(".md") && target.pathname !== current;
      });
      return link ? new URL(link.href, location.href).pathname : null;
    }, current);
    assert.ok(clickedTarget, `the page at ${ending.page.url()} links to no other page of the corpus`);
    await Promise.all([
      ending.page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      ending.page.evaluate((target) => {
        [...document.querySelectorAll("a[href]")]
          .find((a) => new URL(a.href, location.href).pathname === target)
          .click();
      }, clickedTarget),
    ]);
  });

  after(async () => {
    await ending?.close();
  });

  test("the next click on the open page lands at the login", async () => {
    const landedOn = new URL(ending.page.url());
    assert.notEqual(
      landedOn.origin,
      new URL(applicationUrl).origin,
      `clicking ${clickedTarget} after signing out at Keycloak stayed in the application at ${landedOn}`
    );
    const form = await ending.page.$('form:has(input[type="password"])');
    assert.ok(form, `clicking ${clickedTarget} after signing out at Keycloak ended at ${landedOn}, not at a login form`);
    const action = await form.evaluate((element) => element.action);
    assert.match(action, /\/realms\//, `the form at ${landedOn} is not an identity provider's login (it posts to ${action})`);
  });

  test("a script asked for with the ended session's cookie gets 401, not the login", async () => {
    const response = await fetch(`${applicationUrl}/obsidian-page.js`, {
      redirect: "manual",
      headers: {
        Cookie: deadCookies,
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Dest": "script",
        Accept: "*/*",
      },
    });
    assert.equal(
      response.status,
      401,
      `a script request with the ended session's cookie was answered ${response.status}` +
        (response.headers.get("location") ? ` with a redirect to ${response.headers.get("location")}` : "")
    );
    assert.equal(response.headers.get("location"), null);
  });

  test("the application keeps running and other sessions stay valid", async () => {
    assert.ok(
      await applicationStillRunning(),
      "the application under test is no longer the process this run started - an ended session took it down"
    );
    await render(bystander, contentPath);
    assert.equal(
      await currentUser(bystander),
      bystander.username,
      "a session that was open before another one ended at Keycloak is no longer recognized"
    );
  });
});
