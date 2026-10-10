import fs from "fs";
import session from "express-session";
import passport from "passport";
import { Issuer, Strategy } from "openid-client";

export let client;
let issuerUrl;
export let keycloakIssuer;
/**
 * The parsed `keycloak.json`, read once here at startup. `getClientRoles` in
 * `permission-context.js` reads `resource` from it; it used to open the file
 * with `fs.readFileSync` once per permission check, which put a synchronous
 * disk read on the event loop in the middle of every rendered page.
 */
export let keycloakConfig;

function base64urlToUtf8(str) {
  // base64url -> base64
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  // padding
  const pad = str.length % 4;
  if (pad) str += "=".repeat(4 - pad);
  return Buffer.from(str, "base64").toString("utf8");
}

function jwtDecode(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const header = JSON.parse(base64urlToUtf8(parts[0]));
    const payload = JSON.parse(base64urlToUtf8(parts[1]));
    return { header, payload };
  } catch {
    return null;
  }
}

export async function initKeycloak(app) {
  // Load keycloak.json
  keycloakConfig = JSON.parse(fs.readFileSync("keycloak.json", "utf8"));
  issuerUrl =
    keycloakConfig["auth-server-url"] + "realms/" + keycloakConfig.realm;
  keycloakIssuer = await Issuer.discover(issuerUrl);
  // console.log("Discovered issuer %s %O", keycloakIssuer.issuer, keycloakIssuer.metadata);

  const serverUrl =
    process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8080";
  client = new keycloakIssuer.Client({
    client_id: keycloakConfig.resource,
    client_secret: keycloakConfig.credentials.secret,
    redirect_uris: [serverUrl + "/auth/callback"],
    post_logout_redirect_uris: [serverUrl + "/logout/callback"],
    response_types: ["code"],
  });
  // The secret that signs session cookies belongs to the deployment, not to
  // this source. A literal here would be the same in every instance built from
  // a public repository, which makes the signature worth nothing. There is no
  // fallback and no development default on purpose: a generated one would start
  // fine and quietly log everyone out on every restart, so the misconfiguration
  // would be found by users instead of at startup.
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.trim() === "") {
    console.error(
      "SESSION_SECRET is not set, and SafeLearn signs its session cookies with it.\n" +
        "Set SESSION_SECRET to a long random value in the .env file this deployment reads " +
        "(/app/.env in the container image, or the .env next to app.js when running from a " +
        "working tree), or pass it to the container as an environment variable.\n" +
        "It is only ever compared against itself, so any long random string will do — but it " +
        "must be different in every deployment, and changing it logs every user out once."
    );
    process.exit(1);
  }
  // Sessions are held in this process, deliberately. One container serving one
  // school does not need a session service to run, back up and monitor, and the
  // price is stated rather than implied: every session is discarded when the
  // application restarts or is redeployed, and a second instance behind a load
  // balancer would not recognize the first one's sessions. This store has to be
  // replaced before a second instance can be added — see docs-building.md.
  var memoryStore = new session.MemoryStore();
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: true,
      store: memoryStore,
    })
  );
  // ################### Passport ###################
  app.use(passport.initialize());
  app.use(passport.authenticate("session"));
  // this creates the strategy
  passport.use(
    "oidc",
    new Strategy({ client, passReqToCallback: true }, (req, tokenSet, userinfo, done) => {
      // The tokenSet object contains the tokens
      const idToken = tokenSet.id_token;
      const accessToken = tokenSet.access_token;
      const refreshToken = tokenSet.refresh_token;
      // Decode the ID token to get the user profile
      const id = jwtDecode(idToken);
      const userProfile = id?.payload;
      // Include the access token in the user profile
      userProfile.accessToken = accessToken;
      userProfile.accessTokenDecoded = jwtDecode(accessToken)?.payload;
      userProfile.refreshToken = refreshToken;
      userProfile.keycloakConfig = keycloakConfig;
      // hasRoles() in utils.js reads req.user.rolesCalculated unconditionally
      // and JSON.parse(undefined) throws, so this has to exist from the first
      // request onward - it must not wait for the near-expiry refresh in
      // refreshAccessToken() to compute it for the first time.
      userProfile.rolesCalculated = JSON.stringify(deriveRoles(userProfile.ldap));
      done(null, userProfile, { returnTo: req.session.originalUrl });
    })
  );
  passport.serializeUser(function (user, done) {
    done(null, user);
  });
  passport.deserializeUser(function (user, done) {
    done(null, user);
  });
  //################### REFRESH ###################
  // Express 4 does not catch a rejected async middleware, and Node terminates
  // on an unhandled rejection - which took every other user's session with it.
  // So nothing in here may reject: an ended session continues to
  // checkAuthenticated as a request without one, everything else goes to the
  // error handler.
  app.use(async (req, res, next) => {
    try {
      if (req.user) {
        const exp = req.user.accessTokenDecoded?.exp;
        if (typeof exp !== "number") {
          // Nothing left to renew from, so there is nothing to keep either.
          await endSession(req);
        } else if (exp - Math.floor(Date.now() / 1000) <= 60) {
          await refreshAccessToken(req);
        }
      }
    } catch (error) {
      if (!(error instanceof SessionEndedError)) {
        return next(error);
      }
    }
    next();
  });
  //################### TEST ###################
  // default protected route /test
  app.get("/test", (req, res, next) => {
    passport.authenticate("oidc")(req, res, next);
  });
  // callback always routes to test
  app.get("/auth/callback", (req, res, next) => {
    passport.authenticate("oidc", (err, user, info) => {
      if (err) { return next(err); }
      if (!user) { return res.redirect('/login'); }
      req.logIn(user, function(err) {
        if (err) { return next(err); }
        // Set returnTo in the session here
        req.session.returnTo = info.returnTo || '/';
        res.redirect(req.session.returnTo);
      });
    })(req, res, next);
  });
  // start logout request
  app.get("/logout", (req, res) => {
    res.redirect(client.endSessionUrl());
  });

  // logout callback
  app.get("/logout/callback", (req, res, next) => {
    // clears the persisted user from the local storage and
    // redirects the user to a public route
    req.logout(function (err) {
      if (err) {
        return next(err);
      }
      res.redirect("/");
    });
  });
}

/**
 * Raised by `refreshAccessToken` once the identity provider has refused to
 * renew a session and the local session has been ended because of it. A route
 * handler that runs into it stops where it is - it has no `req.user` left to
 * render for - and the error handler in app.js answers the request the way
 * `checkAuthenticated` answers one without a session.
 */
export class SessionEndedError extends Error {
  constructor() {
    super("the identity provider no longer honours this session");
    this.name = "SessionEndedError";
  }
}

/** Logs the user out locally. Passport regenerates the session while doing so. */
function endSession(req) {
  return new Promise((resolve, reject) => {
    req.logout((error) => (error ? reject(error) : resolve()));
  });
}

/**
 * Whether the browser is loading a page, as opposed to a page loading
 * something. Read from Fetch Metadata, which every target browser sends; a
 * client without it counts as navigating when it asks for HTML.
 */
function isNavigation(req) {
  const mode = req.get("Sec-Fetch-Mode");
  if (mode) {
    return mode === "navigate";
  }
  return (req.get("Accept") ?? "").includes("text/html");
}

/**
 * The answer to a request without a valid session. A navigation is sent into
 * the login and comes back to the address it asked for. Anything a page
 * requests on its own - a script, a module, a stylesheet, an image, a `fetch` -
 * gets an empty 401: a redirect would hand it the identity provider's login
 * page, which it can do nothing with.
 */
export function answerUnauthenticated(req, res) {
  if (isNavigation(req)) {
    // Remembered here and only here, so a sub-resource that arrives without a
    // session cannot overwrite the page the login is supposed to return to.
    req.session.originalUrl = req.originalUrl;
    res.redirect("/test");
    return;
  }
  res.status(401).end();
}

// function to check weather user is authenticated, req.isAuthenticated is populated by password.js
// use this function to protect all routes
export var checkAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  answerUnauthenticated(req, res);
};

/**
 * Function ignores the expiration time of the access-token and refreshes it by force.
 * Used to get a new access-token when the current one holds claims or data that you know for sure is expired.
 *
 * Answers `true` once the tokens are renewed and `null` when they could not be
 * for a reason that says nothing about the session (no answer, a server error).
 * When the identity provider refuses the renewal because the session no longer
 * exists there, the local session is ended and a `SessionEndedError` is thrown.
 */
export async function refreshAccessToken(req) {
  if (!req || !req.user) {
    return null;
  }
  if (!req.user.refreshToken) {
    await endSession(req);
    throw new SessionEndedError();
  }
  let tokenSet;
  try {
    tokenSet = await client.refresh(req.user.refreshToken);
  } catch (err) {
    // invalid_grant / Token is not active -> RT expired/rotated/revoked, which
    // is what a logout at the identity provider (or in another application of
    // the realm) looks like from here.
    if (err?.error === "invalid_grant") {
      await endSession(req);
      throw new SessionEndedError();
    }
    // Unreachable, or a server error: that says nothing about the session, and
    // logging the user out would only send them to a login that is itself
    // unreachable. The request goes on with the token it has.
    console.error("Error refreshing token:", err);
    return null;
  }
  req.user.accessToken = tokenSet.access_token;
  const access = jwtDecode(tokenSet.access_token);
  req.user.accessTokenDecoded = access?.payload;
  req.user.refreshToken = tokenSet.refresh_token;
  req.user.rolesCalculated = JSON.stringify(getLdapGroups(req));
  try {
    // Get updated user information
    const userinfo = await client.userinfo(req.user.accessToken);
    // Merge the updated user information with the user profile
    req.user = { ...req.user, ...userinfo };
  } catch (err) {
    // The tokens are renewed; only the user information that follows failed.
    console.error("Error refreshing user information:", err);
  }
  // The roles and the claims this request would be judged by have just been
  // replaced, so a context assembled from the old ones must not be answered
  // from. The next check builds one from what is now in the session.
  req.permissionContext = null;
  // console.log("Token refreshed", req.user);
  return true;
}

/**
 * Parses the `OU=...` entries out of a raw LDAP claim/attribute string into a
 * role/group map. Independent of `req` so it can be run against an
 * introspected token's `ldap` claim or a directory user's `ldap` attribute,
 * not only the current session's.
 */
export function deriveRoles(ldap) {
  let r = {};
  if (!ldap) {
    return r;
  }
  // Regular expression to match "OU=..."
  const regex = /OU=[^,]*/gi;
  const matches = ldap.match(regex);

  if (matches) {
    // Remove "OU=" from the matches and add them to the object
    matches.forEach(match => {
      let value = match.replace('OU=', '').trim().toLowerCase();
      if (value === 'teachers') value = 'teacher';
      if (value === 'students') value = 'student';
      r[value] = true;
    });
  }
  return r;
}

export function getLdapGroups(req) {
  if (!req || !req.user || !req.user.ldap) {
    return {};
  }
  return deriveRoles(req.user.ldap);
}

/** The account endpoint of the realm this session was issued by. */
function accountUrl(req) {
  const sessionConfig = req.user.keycloakConfig;
  const u = sessionConfig["auth-server-url"];
  return `${u.endsWith("/") ? u.slice(0, -1) : u}/realms/${sessionConfig.realm}/account`;
}

/**
 * The one GET against the account endpoint a request makes, and the only place
 * this application asks the identity provider for the stored attributes.
 *
 * It raises rather than swallowing, because the caller has to be able to tell a
 * lookup that failed from an account that simply carries no attributes: the
 * first is logged once for the request and settles it on the default
 * preferences, the second is an ordinary answer.
 *
 * Every attribute arrives as a single-element array and is unwrapped here, so
 * the shape everything above reads is `account.attributes.<name>`.
 */
export async function fetchAccount(req) {
  // Counted on the session, because this is the one number that says whether
  // the permission context is doing its job, and nothing else would notice it
  // growing back. `GET /userattributes` answers with the whole user, so a check
  // reads it before and after a rendered page and compares - see
  // test/checks/permissions.js. The count is diagnostic and nothing reads it to
  // decide anything.
  req.user.accountLookups = (req.user.accountLookups ?? 0) + 1;
  const request = () =>
    fetch(accountUrl(req), {
      headers: {
        Authorization: "Bearer " + req.user.accessToken,
        "Content-Type": "application/json",
      },
    });
  let response = await request();
  // The account endpoint refuses a token whose session has ended at the
  // identity provider, long before the token itself expires - which is the
  // earliest a route that renews only near expiry can learn of a logout made
  // elsewhere. One forced renewal settles it: refused, it ends the session and
  // throws; granted, the lookup is asked once more with the new token.
  if (response.status === 401 && (await refreshAccessToken(req))) {
    response = await request();
  }
  if (!response.ok) {
    throw new Error(`the account endpoint answered ${response.status}`);
  }
  const data = await response.json();
  for (let key in data.attributes) {
    data.attributes[key] = data.attributes[key][0];
  }
  return data;
}

/**
 * The account as this request holds it. Both shapes are derived from the
 * permission context rather than fetched: the context made the one lookup this
 * request is allowed, and a second fetch here would answer a question already
 * answered - possibly differently, halfway through a page.
 *
 * `getAll` strips the fields the account endpoint will not take back on a write.
 *
 * A request that has not built a context yet - `POST /userattributes`, which
 * evaluates no directive - falls back to fetching, and that fetch is then the
 * one lookup of that request.
 */
export async function getUserAttributes(req, getAll = false) {
  if (!req || !req.user || !req.user.accessToken || !req.user.keycloakConfig) {
    return null;
  }

  let account;
  if (req.permissionContext) {
    // A failed lookup resolves the context with no account at all, and `{}` is
    // what this function has always answered with in that case.
    account = (await req.permissionContext).account ?? {};
  } else {
    account = await fetchAccount(req).catch((error) => {
      console.error("Error fetching current attributes:", error);
      return {};
    });
  }

  if (getAll) {
    // Remove fields from the object that are not needed.
    let { userProfileMetadata, id, username, emailVerified, ...d } = account;
    return d;
  }
  return account;
}

export async function setUserAttribute(req, attributeName, attributeValue) {
  if (!req || !req.user || !req.user.accessToken || !req.user.keycloakConfig) {
    return null;
  }

  // Reads from the permission context when this request has one, so storing
  // `lastVisitedUrl` after a rendered page costs no lookup of its own.
  const currentAttributes = await getUserAttributes(req, true);
  // console.log("current attributes", currentAttributes);

  // Merge current and new attributes
  const mas = { ...currentAttributes.attributes, [attributeName]: attributeValue };
  const mergedAttributes = { ...currentAttributes, attributes: mas };
  // console.log("merged attributes before saving", mergedAttributes);

  const result = await fetch(accountUrl(req), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + req.user.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mergedAttributes),
  })
    .then((response) => {
      if (!response.ok) {
        // console.log('url', url);
        // console.log('response', JSON.stringify(response, null, 2));
        throw new Error("Failed to update attribute " + JSON.stringify({ mergedAttributes: mergedAttributes }, null, 2));
      }
      return true;
    })
    .catch((error) => {
      console.error("Error updating attribute:", error);
      return false;
    });

  // What was just written is what the rest of this request has to read. The
  // context is handed the value rather than asked to fetch it again, and it
  // knows how to fold a written preference block into the preferences a check
  // reads - this file does not.
  if (result && req.permissionContext) {
    (await req.permissionContext).applyWrittenAttribute(attributeName, attributeValue);
  }
  return result;
}
