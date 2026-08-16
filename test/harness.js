/**
 * Browser verification harness for SafeLearn.
 *
 * Brings the application up from the working tree (or adopts an instance that is
 * already listening), drives a real browser through the Keycloak OIDC flow for a
 * named role and hands back a page that is displaying authenticated application
 * content.
 *
 * Everything here is a plain async function. No test-framework type crosses this
 * boundary, so the runner above it can be replaced without touching the harness.
 *
 * Configuration comes from the environment; the defaults are the public demo
 * values published in README.md. Nothing here is a secret and nothing new is
 * introduced by this file.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import puppeteer from "puppeteer";

const projectRoot = path.resolve(import.meta.dirname, "..");
const runtimeDir = path.join(import.meta.dirname, ".runtime");
const profileDir = path.join(runtimeDir, `browser-profile-${process.pid}`);

const port = process.env.SAFELEARN_TEST_PORT || process.env.NEXT_PUBLIC_PORT || "8080";

/** Base URL of the application under test. */
export const applicationUrl = (
  process.env.SAFELEARN_TEST_SERVER_URL || `http://localhost:${port}`
).replace(/\/$/, "");

/** The realm the login form is expected to belong to. */
const realm = process.env.SAFELEARN_TEST_REALM || "safeLearn";

/** Identity provider the flow is expected to pass through. */
const identityProviderUrl = process.env.SAFELEARN_TEST_IDP_URL || "https://auth.unterrainer.info/";

/**
 * The path a session is opened on. It is protected, so requesting it starts the
 * OIDC flow.
 */
const entryPath = process.env.SAFELEARN_TEST_ENTRY_PATH || "/test";

/**
 * The page a fresh session is put on once the flow has completed. It is
 * addressed by path on purpose: where the flow lands on its own depends on
 * `lastVisitedUrl`, which is a preference of the shared demo account and
 * therefore not ours to rely on.
 */
export const contentPath = process.env.SAFELEARN_TEST_CONTENT_PATH || "/md/test-md-file.md";

const startupTimeoutMs = Number(process.env.SAFELEARN_TEST_STARTUP_TIMEOUT_MS || 120000);
const navigationTimeoutMs = Number(process.env.SAFELEARN_TEST_NAVIGATION_TIMEOUT_MS || 45000);
const headed = ["1", "true", "yes"].includes(String(process.env.SAFELEARN_TEST_HEADED).toLowerCase());

const accounts = {
  student: {
    username: process.env.SAFELEARN_TEST_STUDENT_USER || "student",
    password: process.env.SAFELEARN_TEST_STUDENT_PASSWORD || "student",
  },
  teacher: {
    username: process.env.SAFELEARN_TEST_TEACHER_USER || "teacher",
    password: process.env.SAFELEARN_TEST_TEACHER_PASSWORD || "teacher",
  },
};

/** The roles this harness knows how to log in as. */
export const knownRoles = Object.keys(accounts);

/**
 * The hosts a page opened for a content check may talk to: the application
 * itself and the identity provider. Everything else is refused, so a check
 * cannot start depending on a content delivery network, a font service or a
 * diagram service by accident — and so `hostsContactedWhile` reports a request
 * to one of them whether or not it would have been answered.
 */
const reachableHosts = new Set([
  new URL(applicationUrl).host,
  new URL(identityProviderUrl).host,
]);

/**
 * What a host contacted by a page is to this run. A check reads this instead of
 * comparing host names, which are configuration and differ per deployment.
 */
export const hostKinds = Object.freeze({
  application: "application",
  identityProvider: "identity provider",
  external: "external",
});

/** Which of the three a host is. */
function hostKind(host) {
  if (host === new URL(applicationUrl).host) return hostKinds.application;
  if (host === new URL(identityProviderUrl).host) return hostKinds.identityProvider;
  return hostKinds.external;
}

/**
 * The preference block every content check starts from. It is stated in full
 * rather than inherited, because `POST /userattributes` serializes the whole
 * request body into one Keycloak attribute: a partial write erases the keys it
 * omits.
 *
 * `sl: 0` keeps `/` from resolving to the shared account's `lastVisitedUrl`.
 * `vt: 1` is the teacher view; `vt == 0` is what downgrades a teacher to a
 * student.
 */
export const preferenceBaseline = Object.freeze({
  fs: 18,
  t: 2,
  nt: 1,
  s: 1.6,
  dm: 0,
  sl: 0,
  vt: 1,
  va: 0,
  ve: 0,
});

/** The views the same Markdown source is served in, and how each is addressed. */
const views = {
  page: { query: null, root: "#markdown-content" },
  presentation: { query: "reveal=true", root: "#revealContent" },
  document: { query: "document=true", root: "#markdown-content" },
};

// ################### Application lifecycle ###################

/** `null`, or `{ adopted, child, output }` for the instance under test. */
let server = null;
let browser = null;
const openContexts = new Set();

/** Role -> promise of the session shared by every check that asks for it. */
const sharedSessions = new Map();

/** How many complete OIDC flows this process has walked. */
let logins = 0;

/**
 * The number of real logins this run has performed. Every one of them is a
 * round-trip against a public identity provider shared with other people, so
 * the count is asserted rather than assumed.
 */
export function loginCount() {
  return logins;
}

/**
 * Asks the configured port for a response. Any answer counts, including a
 * redirect: `app.listen` only runs once the initial `scanFiles` has resolved, so
 * a socket that answers at all is a meaningful readiness signal.
 */
async function answers(timeoutMs) {
  try {
    await fetch(`${applicationUrl}${entryPath}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Makes sure the application is reachable. Adopts an instance that is already
 * listening, otherwise starts one from the working tree.
 */
async function ensureServer() {
  if (server) return server;

  if (await answers(3000)) {
    server = { adopted: true, child: null, output: [] };
    return server;
  }

  const output = [];
  // `node app.js`, not `npm start`: nodemon would restart the server on any file
  // touched during a run and leaves a process tree that is awkward to kill.
  const child = spawn(process.execPath, ["app.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NEXT_PUBLIC_PORT: String(port),
      NEXT_PUBLIC_SERVER_URL: applicationUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));

  let exit = null;
  child.once("exit", (code, signal) => {
    exit = { code, signal };
  });

  server = { adopted: false, child, output };

  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline && !exit) {
    if (await answers(3000)) return server;
    await delay(250);
  }

  await stopServer();
  const ended = exit ? ` It exited with code ${exit.code}, signal ${exit.signal}.` : "";
  throw new Error(
    `SafeLearn did not answer on ${applicationUrl} within ${startupTimeoutMs} ms.${ended}\n` +
      `--- application output ---\n${output.join("") || "(none)"}\n--- end of application output ---`
  );
}

/** Stops the application, but only if this run is the one that started it. */
async function stopServer() {
  const running = server;
  server = null;
  if (!running || running.adopted) return;

  const child = running.child;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  const ended = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const hard = setTimeout(() => child.kill("SIGKILL"), 5000);
  await ended;
  clearTimeout(hard);
}

// ################### Browser ###################

async function ensureBrowser() {
  if (browser) return browser;
  await rm(profileDir, { recursive: true, force: true });
  await mkdir(runtimeDir, { recursive: true });
  browser = await puppeteer.launch({
    headless: !headed,
    userDataDir: profileDir,
    defaultViewport: { width: 1400, height: 900 },
  });
  return browser;
}

async function closeBrowser() {
  const running = browser;
  browser = null;
  openContexts.clear();
  if (!running) return;
  await running.close().catch(() => {});
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

// ################### Authentication ###################

/**
 * Builds the failure an unfinished login raises. The role and the URL the flow
 * stopped at are the two pieces of information that tell a wrong password apart
 * from an unregistered redirect URI.
 */
async function loginFailure(page, role, reason) {
  const stoppedAt = page.url();
  let screenshot = null;
  try {
    await mkdir(runtimeDir, { recursive: true });
    screenshot = path.join(runtimeDir, `failure-${role}-${process.pid}.png`);
    await page.screenshot({ path: screenshot });
  } catch {
    screenshot = null;
  }
  const shot = screenshot ? ` A screenshot is at ${path.relative(projectRoot, screenshot)}.` : "";
  return new Error(
    `Verification as "${role}" failed: ${reason}. The flow stopped at ${stoppedAt}.${shot}`
  );
}

/**
 * Reads who the session belongs to, from inside the page and with its own
 * cookies. Only the username is carried back out — the endpoint also returns
 * tokens, which have no business in a test process.
 */
async function readIdentity(page) {
  return page.evaluate(async (url) => {
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) return null;
      const user = await response.json();
      return { username: user.preferred_username ?? null, name: user.name ?? null };
    } catch {
      return null;
    }
  }, `${applicationUrl}/userattributes`);
}

/**
 * Walks the OIDC flow and leaves the page on authenticated application content.
 * Success is asserted positively: the flow fails by redirecting, not by
 * throwing, so "no exception was raised" proves nothing.
 */
async function logIn(page, role, account) {
  await page.goto(`${applicationUrl}${entryPath}`, { waitUntil: "domcontentloaded" });

  // Addressed by form semantics, not by the ids of the realm's current theme.
  const form = await page.$('form:has(input[type="password"])');
  const usernameField = form && (await form.$('input[name="username"], input[autocomplete="username"]'));
  const passwordField = form && (await form.$('input[type="password"]'));
  if (!form || !usernameField || !passwordField) {
    throw await loginFailure(page, role, "login form not recognized");
  }

  const action = await form.evaluate((element) => element.action);
  if (!action.includes(`/realms/${realm}/`)) {
    throw await loginFailure(
      page,
      role,
      `login form does not belong to realm "${realm}" (it posts to ${action})`
    );
  }

  await usernameField.type(account.username);
  await passwordField.type(account.password);
  const submit = await form.$('[type="submit"]');
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    submit ? submit.click() : form.evaluate((element) => element.submit()),
  ]);

  if (new URL(page.url()).origin !== new URL(applicationUrl).origin) {
    const provider = new URL(identityProviderUrl).host;
    throw await loginFailure(
      page,
      role,
      new URL(page.url()).host === provider
        ? "the flow never left the identity provider"
        : "the flow did not return to the application"
    );
  }
  if (await page.$('input[type="password"]')) {
    throw await loginFailure(page, role, "the flow ended back on a login form");
  }

  // Address the content by path rather than trusting where the flow landed:
  // `/` resolves to the shared account's `lastVisitedUrl` when it is configured
  // to, and that is a preference no check may depend on.
  await page.goto(`${applicationUrl}${contentPath}`, { waitUntil: "domcontentloaded" });
  if (!(await page.$("#markdown-content"))) {
    throw await loginFailure(page, role, "the application did not render its page shell");
  }

  const identity = await readIdentity(page);
  if (!identity?.username) {
    throw await loginFailure(page, role, "the application does not consider the session authenticated");
  }
  if (identity.username !== account.username) {
    throw await loginFailure(
      page,
      role,
      `the session belongs to "${identity.username}" instead of "${account.username}"`
    );
  }
  return identity;
}

// ################### Sessions ###################

/**
 * Paths of the application a session's page is currently made to hang on, by
 * page. Filled by `whileUnanswered`, read by the interception below.
 */
const unanswered = new WeakMap();

/**
 * Runs `load` with every request the session makes to `pathname` left open —
 * neither answered nor refused — and releases it afterwards.
 *
 * Hanging rather than refusing, because the two are not the same situation for
 * this application: a refused `/userattributes` rejects the fetch in
 * `getUserAttributes`, whose `catch` reloads the page, so the page would never
 * sit still long enough to show what it does while it waits. A request that
 * never answers is the case a bounded wait exists for.
 *
 * Only a session that intercepts requests can do this — `sharedSession` does,
 * `openSession` does not.
 */
export async function whileUnanswered(session, pathname, load) {
  const paths = unanswered.get(session.page);
  if (!paths) {
    throw new Error(
      `The ${session.role} session does not intercept its requests, so ${pathname} cannot be ` +
        `left unanswered. Use sharedSession("${session.role}").`
    );
  }
  paths.add(pathname);
  try {
    return await load();
  } finally {
    paths.delete(pathname);
  }
}

/**
 * Refuses every request to a host that is neither the application nor the
 * identity provider, and records which hosts were turned away so a check can
 * report on them.
 *
 * The application's own hot-reload stream is refused too. It is an endless
 * server-sent-events response, and a page that opens one holds a connection for
 * as long as it lives. A check walks dozens of pages through one browser page,
 * so those connections pile up against the browser's per-host connection limit
 * until navigations start queueing behind them for tens of seconds. The script
 * that opens the stream is still in the markup and can still be asserted; only
 * the stream itself is refused.
 */
async function refuseForeignHosts(page, refused) {
  await page.setRequestInterception(true);
  unanswered.set(page, new Set());
  page.on("request", (request) => {
    const resume = () => request.continue().catch(() => {});
    const address = request.url();
    if (/^(data|blob|about|chrome-extension):/i.test(address)) {
      resume();
      return;
    }
    let parsed;
    try {
      parsed = new URL(address);
    } catch {
      resume();
      return;
    }
    if (parsed.host === new URL(applicationUrl).host && parsed.pathname === "/hot-reload") {
      request.abort("blockedbyclient").catch(() => {});
      return;
    }
    // Neither continued nor aborted: the request stays open for as long as
    // `whileUnanswered` holds the path, which is what a request that never
    // answers looks like from inside the page.
    if (unanswered.get(page)?.has(parsed.pathname)) return;
    if (reachableHosts.has(parsed.host)) {
      resume();
      return;
    }
    refused.add(parsed.host);
    request.abort("blockedbyclient").catch(() => {});
  });
}

/**
 * Opens one session: its own browser context, a completed OIDC flow, and a page
 * on authenticated application content.
 */
async function newSession(role, { confineToKnownHosts = false } = {}) {
  const account = accounts[role];
  if (!account) {
    throw new Error(`Unknown role "${role}". Known roles: ${knownRoles.join(", ")}.`);
  }

  await ensureServer();
  const running = await ensureBrowser();
  const context = await running.createBrowserContext();
  openContexts.add(context);

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(navigationTimeoutMs);
  page.setDefaultTimeout(navigationTimeoutMs);

  const refusedHosts = new Set();
  if (confineToKnownHosts) await refuseForeignHosts(page, refusedHosts);

  try {
    logins++;
    const identity = await logIn(page, role, account);
    return {
      role,
      username: identity.username,
      page,
      context,
      refusedHosts,
      close: () => closeSession(context),
    };
  } catch (error) {
    await closeSession(context);
    throw error;
  }
}

/**
 * Hands back a browser page that has completed the Keycloak login for `role` and
 * is displaying authenticated application content. Starts the application if
 * nothing is listening yet, and throws if the flow ends anywhere else.
 *
 * Each role gets its own browser context, so sessions in one run share neither
 * cookies nor storage and the order they are opened in does not matter. The
 * session belongs to the caller, who closes it.
 */
export async function openSession(role) {
  return newSession(role);
}

/**
 * Hands back the one session this run uses for `role`, logging in on first use.
 * Released by `shutdown()`, never by the caller: the point of sharing it is that
 * the number of logins follows from the roles the checks need rather than from
 * how many files the checks live in.
 *
 * Pages of a shared session only reach the application and the identity
 * provider. Everything a corpus page addresses elsewhere is asserted as the
 * address that was emitted.
 */
export async function sharedSession(role) {
  if (!accounts[role]) {
    throw new Error(`Unknown role "${role}". Known roles: ${knownRoles.join(", ")}.`);
  }
  let pending = sharedSessions.get(role);
  if (!pending) {
    pending = newSession(role, { confineToKnownHosts: true }).then((session) => ({
      ...session,
      close() {
        throw new Error(
          `The shared ${role} session is released by shutdown(), not by a check. ` +
            `Use openSession("${role}") if a check needs a session of its own.`
        );
      },
    }));
    // A failed login must not be remembered as "the" session for this role.
    pending.catch(() => sharedSessions.delete(role));
    sharedSessions.set(role, pending);
  }
  return pending;
}

/**
 * Asks the application who it thinks the session belongs to, right now. Useful
 * for proving that two sessions in one run really are two sessions.
 */
export async function currentUser(session) {
  const identity = await readIdentity(session.page);
  return identity?.username ?? null;
}

/** Releases a session. Safe to call more than once. */
async function closeSession(context) {
  if (!openContexts.delete(context)) return;
  await context.close().catch(() => {});
}

/**
 * Ends the run: closes every context and the browser, and stops the application
 * if this run started it. An adopted instance is left alone.
 */
export async function shutdown() {
  sharedSessions.clear();
  for (const context of [...openContexts]) await closeSession(context);
  await closeBrowser();
  await stopServer();
}

// ################### Roles ###################

/**
 * The Keycloak client whose roles count as this application's roles. Read from
 * `keycloak.json` in the working directory, the same file `utils.js` reads. A
 * deployment that keeps its configuration elsewhere falls back to the client the
 * token was issued to.
 */
function configuredResource() {
  try {
    return JSON.parse(readFileSync("keycloak.json", "utf8")).resource ?? null;
  } catch {
    return null;
  }
}

/**
 * The roles a session actually carries, so a check can derive what it is allowed
 * to see instead of hardcoding the group memberships of an account nobody here
 * owns.
 *
 * The set holds the client roles, the LDAP groups the application resolved
 * (already renamed `teachers` -> `teacher` and `students` -> `student` by
 * `getLdapGroups`), and the account's own display name — the three things a
 * `@@@` directive can address. Values are trimmed and lowercased, the way
 * `utils.js` normalizes the roles it compares them against.
 *
 * `GET /userattributes` answers with the whole user, tokens included. Only the
 * role set crosses back out of the page.
 */
export async function roles(session) {
  const answer = await session.page.evaluate(
    async (url, configuredResourceName) => {
      try {
        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) return { error: `the application answered ${response.status}` };
        const user = await response.json();
        const token = user?.accessTokenDecoded ?? {};
        const resource = configuredResourceName || token.azp || null;
        const clientRoles = resource ? token.resource_access?.[resource]?.roles ?? [] : [];
        let calculated = {};
        try {
          calculated = JSON.parse(user?.rolesCalculated ?? "{}") ?? {};
        } catch {
          calculated = {};
        }
        return {
          clientRoles: Array.isArray(clientRoles) ? clientRoles : [],
          groups: Object.keys(calculated).filter((group) => calculated[group]),
          name: typeof user?.name === "string" ? user.name : null,
        };
      } catch (error) {
        return { error: String(error) };
      }
    },
    `${applicationUrl}/userattributes`,
    configuredResource()
  );

  if (!answer || answer.error) {
    throw new Error(
      `Could not read the roles of the ${session.role} session: ${answer?.error ?? "no answer"}.`
    );
  }

  const carried = new Set();
  const add = (value) => {
    if (typeof value !== "string") return;
    const normalized = value.trim().toLowerCase();
    if (normalized) carried.add(normalized);
  };
  answer.clientRoles.forEach(add);
  answer.groups.forEach(add);
  add(answer.name);
  return carried;
}

// ################### Preferences ###################

/** The preference block the application is rendering this session with. */
async function effectivePreferences(session) {
  return session.page.evaluate(async (url) => {
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) return null;
      const user = await response.json();
      const raw = user?.accessTokenDecoded?.config;
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, `${applicationUrl}/userattributes`);
}

/**
 * Puts the session's preferences into a known state and proves they arrived.
 *
 * `values` is merged over `preferenceBaseline` and the complete block is
 * written, because the application stores it as one attribute. Nothing is
 * restored afterwards: the accounts are shared and two runs cannot take turns,
 * so the contract is that every check writes what it depends on.
 */
export async function setPreferences(session, values = {}) {
  const unknown = Object.keys(values).filter((key) => !(key in preferenceBaseline));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown preference${unknown.length > 1 ? "s" : ""} ${unknown.join(", ")}. ` +
        `The application knows ${Object.keys(preferenceBaseline).join(", ")}.`
    );
  }
  const wanted = { ...preferenceBaseline, ...values };

  const written = await session.page.evaluate(
    async (url, block) => {
      try {
        const response = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(block),
        });
        if (!response.ok) return { error: `the application answered ${response.status}` };
        const result = await response.json().catch(() => null);
        if (result && result.success === false) {
          return { error: "the identity provider refused the write" };
        }
        return { ok: true };
      } catch (error) {
        return { error: String(error) };
      }
    },
    `${applicationUrl}/userattributes`,
    wanted
  );
  if (written?.error) {
    throw new Error(
      `Could not set the preferences of the ${session.role} session: ${written.error}.`
    );
  }

  // Reload so the page in hand is the one the new block rendered, then confirm
  // against the block the application is actually reading.
  await session.page.reload({ waitUntil: "domcontentloaded" });

  let effective = null;
  let mismatch = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    effective = await effectivePreferences(session);
    mismatch = Object.entries(wanted).find(
      ([key, value]) => Number(effective?.[key]) !== Number(value)
    );
    if (!mismatch) return wanted;
    await delay(250);
  }

  const [key, value] = mismatch;
  const inEffect = effective && key in effective ? effective[key] : "nothing";
  throw new Error(
    `Preference "${key}" of the ${session.role} session was set to ${value}, ` +
      `but the application renders with ${inEffect}. The page it would render is not the page this check means.`
  );
}

// ################### Rendered pages ###################

/** Percent-encodes each segment, the way the application encodes its own links. */
function encodeSegments(rawPath) {
  return rawPath.split("/").map(encodeURIComponent).join("/");
}

/**
 * Navigates the session to `pagePath` in `view` and returns once the application
 * has rendered it.
 *
 * Fails — rather than returning an empty result a check could mistake for an
 * empty page — when the application redirects somewhere else instead, or when
 * the view's content never appears.
 */
export async function render(session, pagePath, { view = "page" } = {}) {
  const requested = views[view];
  if (!requested) {
    throw new Error(
      `Unknown view "${view}". The application serves ${Object.keys(views).join(", ")}.`
    );
  }

  const address =
    `${applicationUrl}${encodeSegments(pagePath)}` +
    (requested.query ? `?${requested.query}` : "");
  await session.page.goto(address, { waitUntil: "domcontentloaded" });

  const landedOn = session.page.url();
  let landedPath;
  try {
    landedPath = decodeURIComponent(new URL(landedOn).pathname);
  } catch {
    landedPath = new URL(landedOn).pathname;
  }
  if (landedPath !== pagePath) {
    throw new Error(
      `${pagePath} as a ${view} did not render for the ${session.role} session: ` +
        `the application sent it to ${landedOn} instead.`
    );
  }

  try {
    await session.page.waitForSelector(requested.root, { timeout: navigationTimeoutMs });
  } catch {
    throw new Error(
      `${pagePath} as a ${view} never showed its content for the ${session.role} session: ` +
        `${requested.root} did not appear. The page ended up at ${session.page.url()}.`
    );
  }

  const text = await session.page.$eval(requested.root, (element) => element.textContent);
  return { page: session.page, text, url: session.page.url(), view, path: pagePath };
}

/**
 * Every reference the rendered document makes to this application, requested
 * with the session's own cookies.
 *
 * Redirects are followed rather than refused, because that is how a reference
 * that falls through `express.static` to the catch-all shows itself: it answers
 * 200 with the start page instead of the file that was asked for.
 */
export async function sameOriginReferences(page) {
  return page.evaluate((origin) => {
    const collected = new Map();
    for (const element of document.querySelectorAll("[href], [src]")) {
      const raw = element.getAttribute("href") ?? element.getAttribute("src");
      if (!raw || raw.startsWith("#") || /^(data|blob|javascript|mailto|tel):/i.test(raw)) {
        continue;
      }
      let resolved;
      try {
        resolved = new URL(raw, document.baseURI);
      } catch {
        continue;
      }
      if (resolved.origin !== origin) continue;
      resolved.hash = "";
      const key = resolved.href;
      if (collected.has(key)) continue;
      collected.set(key, {
        reference: raw,
        address: key,
        element: element.tagName.toLowerCase(),
        rel: element.getAttribute("rel") ?? null,
      });
    }

    return Promise.all(
      [...collected.values()].map(async (entry) => {
        try {
          const response = await fetch(entry.address, { credentials: "include" });
          return {
            ...entry,
            status: response.status,
            contentType: response.headers.get("content-type"),
            servedFrom: response.url,
            redirected: response.redirected,
          };
        } catch (error) {
          return { ...entry, status: null, contentType: null, servedFrom: null, redirected: false, error: String(error) };
        }
      })
    );
  }, new URL(applicationUrl).origin);
}

/**
 * The hosts the browser contacted while `load` ran, each with the addresses that
 * caused it and what the host is to this run (`hostKinds`).
 *
 * Read off the browser's requests, not off the document: a stylesheet pulls a
 * further host in with an `@import` or a `url()` without any element naming it,
 * and `sameOriginReferences` — which walks `href`/`src` and drops everything
 * cross-origin — cannot see that. A check that wants to prove a view is
 * self-contained has to ask what was requested.
 *
 * A request is recorded when it is issued, so a host appears whether the answer
 * arrived, failed or was refused. That is what lets a check fail on a third
 * party without the third party being reachable — and pages of a shared session
 * refuse every host but the two above, so it is the only way such a host can be
 * reported at all.
 *
 * `load` is usually a `render(...)`, which returns once the view's content is
 * there. A stylesheet's own requests can trail that moment, so recording
 * continues until nothing new has been requested for `quietMs`, and at most
 * until `timeoutMs` after `load` returned.
 */
export async function hostsContactedWhile(session, load, { quietMs = 500, timeoutMs = 5000 } = {}) {
  const contacted = new Map();
  let lastRequestAt = Date.now();

  const record = (request) => {
    const address = request.url();
    if (/^(data|blob|about|chrome-extension|javascript):/i.test(address)) return;
    let host;
    try {
      host = new URL(address).host;
    } catch {
      return;
    }
    if (!host) return;
    lastRequestAt = Date.now();
    const entry = contacted.get(host) ?? { host, kind: hostKind(host), addresses: new Set() };
    entry.addresses.add(address);
    contacted.set(host, entry);
  };

  session.page.on("request", record);
  try {
    await load();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && Date.now() - lastRequestAt < quietMs) {
      await delay(50);
    }
  } finally {
    session.page.off("request", record);
  }

  return [...contacted.values()]
    .map((entry) => ({ ...entry, addresses: [...entry.addresses].sort() }))
    .sort((one, other) => one.host.localeCompare(other.host));
}

// ################### Teardown on interruption ###################

/**
 * Last resort, and synchronous: an interrupted run must not leave a browser or
 * an application process behind. Puppeteer installs its own signal handlers and
 * may end the process before an async teardown gets a turn, so the work that
 * must not be skipped happens on `exit`.
 */
function killChildren() {
  const child = server && !server.adopted ? server.child : null;
  if (child && child.exitCode === null && child.signalCode === null) {
    try {
      child.kill("SIGKILL");
    } catch {
      // The process is already gone.
    }
  }
  const browserProcess = browser?.process();
  if (browserProcess && browserProcess.exitCode === null) {
    try {
      browserProcess.kill("SIGKILL");
    } catch {
      // The process is already gone.
    }
  }
}

process.once("exit", killChildren);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => {
    killChildren();
    process.exit(signal === "SIGINT" ? 130 : 1);
  });
}
