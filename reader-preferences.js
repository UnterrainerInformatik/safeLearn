/**
 * A reader's preferences and last visited page on an instance without an
 * identity provider (`anonymous-publishing`).
 *
 * There is no account to keep them in, so they stay in the reader's browser.
 * Not in `localStorage`, though: the server needs the view preferences while it
 * renders, and only a cookie reaches it. The two cookies carry exactly what
 * Keycloak stores as the user attributes `config` and `lastVisitedUrl`, so
 * everything that reads those reads these unchanged.
 *
 * Read only where there is no identity. Under Keycloak the account is the one
 * store, and a cookie of these names is neither read nor touched - otherwise
 * anything able to set a cookie for the origin could change what a signed-in
 * teacher is shown (design.md of publishing-without-keycloak, D4).
 */

export const configCookie = "safelearn_config";
export const lastVisitedCookie = "safelearn_last";

/** One year: a preference is kept until the reader changes it. */
const cookieMaxAgeSeconds = 365 * 24 * 60 * 60;

/**
 * The largest preference block that is stored. A browser drops a cookie over
 * 4 KB without a word, so a block that would not fit is refused instead.
 */
export const maxConfigBytes = 3 * 1024;

/** A last visited page longer than this is not remembered. */
const maxLastVisitedLength = 2048;

/**
 * The value of cookie `name` on this request, or null. Read from the header
 * directly, rather than through a parser dependency for two names.
 */
export function readCookie(req, name) {
  const header = req?.headers?.cookie;
  if (typeof header !== "string") return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/** Sets cookie `name` on the response, beside any other cookie it sets. */
function writeCookie(req, res, name, value) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${cookieMaxAgeSeconds}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  // `trust proxy` is on, so this is true behind a proxy that terminated HTTPS.
  if (req.secure) attributes.push("Secure");
  res.append("Set-Cookie", attributes.join("; "));
}

/** The stored preference block, if it parses as one; otherwise undefined. */
function storedConfig(req) {
  const raw = readCookie(req, configCookie);
  if (raw === null) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? raw : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A path on this instance, or null. The root redirects to the last visited
 * page, so a value that names another host would make the instance an open
 * redirect for whoever can plant the cookie.
 */
function samePath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

/**
 * The account as this request carries it, in the shape the account endpoint
 * answers with, so the permission context and the `/` redirect read it as they
 * read Keycloak's. A block that does not parse is handed on as it is: the
 * context reads it as the default preferences, as it would a stored one.
 */
export function accountFromCookies(req) {
  return {
    attributes: {
      config: readCookie(req, configCookie) ?? undefined,
      lastVisitedUrl: samePath(readCookie(req, lastVisitedCookie)) ?? undefined,
    },
  };
}

/** The preference store of an instance without an identity provider. */
export const readerPreferences = {
  /**
   * The body `GET /userattributes` answers with: the one field the page reads
   * from it, built from the cookie. A block that does not parse is left out, so
   * the page starts from its defaults rather than failing on it.
   */
  async read(req) {
    return { accessTokenDecoded: { config: storedConfig(req) } };
  },

  /** Stores the preference block in the cookie; resolves to whether it was stored. */
  async write(req, res, block) {
    if (block === null || typeof block !== "object" || Array.isArray(block)) {
      return false;
    }
    const value = JSON.stringify(block);
    if (Buffer.byteLength(encodeURIComponent(value)) > maxConfigBytes) {
      return false;
    }
    writeCookie(req, res, configCookie, value);
    return true;
  },

  /** Remembers the page this request serves. Called before the page is sent. */
  rememberLastVisited(req, res) {
    const url = samePath(req.originalUrl);
    if (url === null || url.length > maxLastVisitedLength) return;
    writeCookie(req, res, lastVisitedCookie, url);
  },
};
