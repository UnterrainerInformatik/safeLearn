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

// ################### Application lifecycle ###################

/** `null`, or `{ adopted, child, output }` for the instance under test. */
let server = null;
let browser = null;
const openContexts = new Set();

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
 * Hands back a browser page that has completed the Keycloak login for `role` and
 * is displaying authenticated application content. Starts the application if
 * nothing is listening yet, and throws if the flow ends anywhere else.
 *
 * Each role gets its own browser context, so sessions in one run share neither
 * cookies nor storage and the order they are opened in does not matter.
 */
export async function openSession(role) {
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

  try {
    const identity = await logIn(page, role, account);
    return {
      role,
      username: identity.username,
      page,
      context,
      close: () => closeSession(context),
    };
  } catch (error) {
    await closeSession(context);
    throw error;
  }
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
  for (const context of [...openContexts]) await closeSession(context);
  await closeBrowser();
  await stopServer();
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
