/**
 * What a running instance publishes over HTTP, beyond the pages it renders.
 *
 * Static files are served from an allowlist of mounts in `app.js` rather than
 * from the application directory, so this check asserts both directions: the
 * files that must never leave the server do not, and the ones a rendered page
 * needs still do. The negative half is what makes a later "just add the root
 * back" visible; the positive half is what keeps the allowlist from quietly
 * dropping an asset nobody looked at.
 *
 * Reads `md/test-md-file.md` in all three views and walks every reference the
 * rendered document makes to this application. That walk is the check that would
 * catch an asset the mount list forgot, so it addresses the page view too, where
 * the navigation tree lives.
 *
 * Every request carries the session's own cookies, and every assertion is about
 * what came back rather than about a status code: an unmounted path falls
 * through to the catch-all in `app.js`, which answers 200 with the start page.
 *
 * This is a module, not a test file: `test/content.test.js` imports it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { before, describe, test } from "node:test";

import { applicationUrl, render, sameOriginReferences, setPreferences, sharedSession } from "../harness.js";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");

/** The page the reference walk is performed on, in each of the three views. */
const corpusPath = "/md/test-md-file.md";

/**
 * Application files that sit in the directory `express.static` used to serve,
 * and that no rendered page references. `keycloak.json` has a check of its own
 * below — it is the reason this change exists.
 */
const notPublished = ["/app.js", "/utils.js", "/obsidian.js", "/package.json", "/package-lock.json"];

/** What a rendered page asks for, and what each answer claims to be. */
const published = [
  { reference: "/css/main.css", type: /css/i },
  { reference: "/assets/favicon.ico", type: /image|icon/i },
  { reference: "/obsidian-page.js", type: /javascript|ecmascript/i },
  // Addressed from Markdown, not from a wrapper: `README.md` embeds it relative
  // to itself, and `README.md` is the start page of more than one deployment.
  // The walk below reads a corpus page and would not have caught this one.
  { reference: "/logo-128.png", type: /image/i },
  // Nothing links to it, and it is served anyway: `getStartPage` falls back to
  // it when a deployment configures no start page, and an unmatched path is
  // answered with the start page — so a fallback without a mount redirects to
  // itself for as long as the browser is willing.
  { reference: "/index.html", type: /html/i },
  { reference: "/node_modules/mermaid/dist/mermaid.esm.min.mjs", type: /javascript|ecmascript/i },
  {
    reference: "/node_modules/@mermaid-js/layout-elk/dist/mermaid-layout-elk.esm.min.mjs",
    type: /javascript|ecmascript/i,
  },
];

/** A path no deployment has a file for, used as the shape of "not there". */
const absent = "/no-deployment-has-a-file-at-this-path-4f2a7c.json";

/**
 * Requests `reference` from inside the page, so it carries the session's
 * cookies, and reports what came back.
 *
 * Redirects are followed rather than refused: an unmounted path answers 200 with
 * the start page, and `redirected` is how that shows itself. `textLimit` keeps a
 * megabyte-sized asset from crossing back out of the browser when only its size
 * and its type are being asserted.
 */
async function request(session, reference, { textLimit = 262144 } = {}) {
  return session.page.evaluate(
    async (address, limit) => {
      try {
        const response = await fetch(address, { credentials: "include" });
        const buffer = await response.arrayBuffer();
        return {
          status: response.status,
          contentType: response.headers.get("content-type"),
          servedFrom: response.url,
          redirected: response.redirected,
          bytes: buffer.byteLength,
          text: limit > 0 ? new TextDecoder().decode(buffer).slice(0, limit) : "",
        };
      } catch (error) {
        return { error: String(error) };
      }
    },
    `${applicationUrl}${reference}`,
    textLimit
  );
}

/**
 * The opening of a file on disk, distinctive enough that finding it in a
 * response means the file was served. Used instead of comparing the whole
 * contents, which would let a partial answer through.
 */
function opening(contents) {
  return contents.slice(0, 120);
}

/** The file behind a path that must not be served, read from the working tree. */
function fileBehind(reference) {
  const onDisk = path.join(projectRoot, reference.replace(/^\//, ""));
  try {
    return readFileSync(onDisk, "utf8");
  } catch (error) {
    assert.fail(
      `${reference} has no file behind it in this working tree (${error.message}), so a refusal ` +
        `cannot be told apart from a path that is simply empty and this check would prove nothing. ` +
        `It is part of the application, so a tree that can run this suite has it.`
    );
  }
}

/**
 * The identity-provider configuration this deployment starts with.
 *
 * Read from the working directory the application reads it from, and a hard
 * failure when it is missing: `/keycloak.json` answering with the start page
 * proves nothing where there is no `keycloak.json`, and a check that passes for
 * that reason would report a deployment as hardened when it was only empty. The
 * application reads the same file at startup, so a tree that can run this suite
 * has one.
 */
function keycloakConfiguration() {
  const raw = fileBehind("/keycloak.json");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    assert.fail(`keycloak.json is not readable as JSON (${error.message}); its secret cannot be searched for.`);
  }
  const secret = parsed?.credentials?.secret;
  assert.ok(
    typeof secret === "string" && secret.length > 0,
    "keycloak.json carries no credentials.secret, so the one string that must never be served " +
      "is not known here and this check would pass without looking for anything."
  );
  return { raw, secret };
}

describe("deployment surface", () => {
  let session;

  before(async () => {
    session = await sharedSession("teacher");
    await setPreferences(session, {});
  });

  // ---- The file that carries the client secret ----

  test("the identity-provider configuration is not served", async () => {
    const { raw, secret } = keycloakConfiguration();
    const answer = await request(session, "/keycloak.json");

    assert.ok(!answer.error, `/keycloak.json could not be requested at all: ${answer.error}`);
    assert.ok(
      !answer.text.includes(secret),
      "/keycloak.json answered with the OIDC client secret. Every authenticated user can read it."
    );
    // The field as the file spells it, quotes included: the start page this
    // request is redirected to is prose, and prose says "credentials" too.
    assert.ok(
      !answer.text.includes('"credentials"'),
      "/keycloak.json answered with something carrying its credentials field."
    );
    assert.ok(
      !answer.text.includes(opening(raw)),
      "/keycloak.json answered with the file that sits next to app.js in every deployment."
    );
  });

  test("a path that is not served looks like a path that has no file", async () => {
    const refused = await request(session, "/keycloak.json", { textLimit: 0 });
    const nothing = await request(session, absent, { textLimit: 0 });

    assert.ok(!refused.error && !nothing.error, "both requests should reach the application");
    assert.equal(
      refused.status,
      nothing.status,
      "a request for the identity-provider configuration should not be answerable differently " +
        "from a request for a path no file exists at — the difference confirms the file is there"
    );
    assert.equal(refused.redirected, nothing.redirected, "and it should not be redirected differently");
    assert.equal(refused.servedFrom, nothing.servedFrom, "and it should not end up somewhere else");
    assert.equal(refused.contentType, nothing.contentType, "and it should not be served as something else");
  });

  // ---- The application's own sources and manifests ----

  test("no application source or dependency manifest is served", async () => {
    for (const reference of notPublished) {
      const contents = fileBehind(reference);
      const answer = await request(session, reference);

      assert.ok(!answer.error, `${reference} could not be requested at all: ${answer.error}`);
      assert.ok(
        !answer.text.includes(opening(contents)),
        `${reference} answered with the file itself. Nothing in the application references it, and ` +
          `it is reachable only because a mount is wider than the pages that need it.`
      );
    }
  });

  // ---- What a rendered page needs ----

  test("every asset a rendered page addresses is served", async () => {
    for (const asset of published) {
      const answer = await request(session, asset.reference, { textLimit: 0 });

      assert.ok(!answer.error, `${asset.reference} could not be requested at all: ${answer.error}`);
      assert.equal(
        answer.status,
        200,
        `${asset.reference} answered ${answer.status}; a page that addresses it renders without it`
      );
      assert.ok(
        !answer.redirected,
        `${asset.reference} fell through to ${answer.servedFrom} instead of being served — it has no mount`
      );
      assert.ok(answer.bytes > 0, `${asset.reference} answered with nothing`);
      assert.match(
        answer.contentType ?? "",
        asset.type,
        `${asset.reference} is served as ${answer.contentType ?? "nothing"}`
      );
    }
  });

  test("every reference a rendered page makes to this application resolves, in all three views", async () => {
    for (const view of ["page", "document", "presentation"]) {
      await render(session, corpusPath, { view });
      const references = await sameOriginReferences(session.page);
      assert.ok(
        references.length > 0,
        `${corpusPath} as a ${view} addresses nothing of this application, which cannot be right`
      );

      // A path without a mount is not a 404: the catch-all in `app.js` redirects
      // to the start page, so it answers 200 with a page nobody asked for.
      const unresolved = references
        .filter((entry) => entry.status === null || entry.status >= 400 || entry.redirected)
        .map((entry) => {
          if (entry.status === null) return `${entry.reference} (the request failed: ${entry.error ?? "no answer"})`;
          if (entry.redirected) return `${entry.reference} (falls through to ${entry.servedFrom})`;
          return `${entry.reference} (answers ${entry.status})`;
        });

      assert.deepEqual(
        unresolved,
        [],
        `${corpusPath} as a ${view} addresses references of this application that do not resolve. ` +
          `A reference that falls through to the start page needs its own mount in app.js.`
      );
    }
  });
});
