import { normalizeRole } from "./permission-context.js";

/**
 * How this instance knows who is reading (`anonymous-publishing`), decided once
 * at start-up and before anything is mounted.
 *
 * `keycloak` is the identity provider as it has always been. `none` runs without
 * one: no login, no session, and every reader holds the roles `READER_ROLES`
 * lists. That mode is opt-in only. An unset `AUTH` means `keycloak`, so an
 * instance whose `keycloak.json` went missing refuses to start rather than
 * turning into a public site.
 */

/** The values `AUTH` accepts. */
export const authModes = Object.freeze(["keycloak", "none"]);

/**
 * Switches whose function depends on knowing who a reader is, as
 * `[variable, value that switches it on]`. Listed here rather than in the
 * module each one turns on, so the refusal works without loading that module -
 * which, with the switch on and no identity, is exactly what must not happen.
 */
export const identityRequiringSwitches = Object.freeze([["EXAM_MODULE", "on"]]);

/** The roles that let a reader see what a teacher sees. */
const privilegedReaderRoles = ["teacher", "teachers", "admin"];

/**
 * Splits `READER_ROLES` into the role names it lists, compared the way every
 * role is compared. Empty entries are dropped, so a trailing comma or an empty
 * value grants nothing.
 */
export function parseReaderRoles(value) {
  if (typeof value !== "string") return new Set();
  return new Set(value.split(",").map(normalizeRole).filter((role) => role.length > 0));
}

/**
 * Decides the mode from `env`. Answers `{ mode, readerRoles }`, or
 * `{ refusal }` with the message a refused start prints. Pure, so a test can
 * ask it without ending its own process.
 */
export function resolveAuthMode(env = process.env) {
  const raw = env.AUTH;
  const mode = raw === undefined ? "keycloak" : String(raw).trim().toLowerCase();
  if (!authModes.includes(mode)) {
    return {
      refusal:
        `AUTH is set to "${raw}", and SafeLearn accepts only "keycloak" (sign-in through ` +
        `Keycloak, the default when AUTH is unset) or "none" (publishing without any sign-in).`,
    };
  }
  if (mode === "keycloak") {
    return { mode, readerRoles: new Set() };
  }
  for (const [variable, on] of identityRequiringSwitches) {
    if (String(env[variable] ?? "").trim().toLowerCase() === on) {
      return {
        refusal:
          `AUTH=none and ${variable}=${on} cannot be combined: ${variable} needs to know who ` +
          `a reader is, and without an identity provider nobody is known. Set AUTH=keycloak, ` +
          `or switch ${variable} off.`,
      };
    }
  }
  return { mode, readerRoles: parseReaderRoles(env.READER_ROLES) };
}

let current = { mode: "keycloak", readerRoles: new Set() };

/**
 * Decides the mode of this process from its environment and keeps it, or ends
 * the process with the refusal - the way a missing `SESSION_SECRET` ends it.
 */
export function establishAuthMode(env = process.env) {
  const resolved = resolveAuthMode(env);
  if (resolved.refusal) {
    console.error(resolved.refusal);
    process.exit(1);
  }
  current = { mode: resolved.mode, readerRoles: resolved.readerRoles };
  if (current.mode === "none") {
    const listed = [...current.readerRoles];
    console.log(`Authentication: none. Every reader holds: ${listed.length > 0 ? listed.join(", ") : "no role"}.`);
    if (privilegedReaderRoles.some((role) => current.readerRoles.has(role))) {
      console.warn(
        `READER_ROLES includes teacher or admin: every reader of this instance sees teacher ` +
          `content, and nobody has to sign in for it.`
      );
    }
  }
  return current;
}

/** The mode this process runs in. `keycloak` until `establishAuthMode` says otherwise. */
export function authMode() {
  return current;
}

/** Whether this process runs without an identity provider. */
export function withoutIdentity() {
  return current.mode === "none";
}
