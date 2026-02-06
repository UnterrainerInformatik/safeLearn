import fs from "fs";
import session from "express-session";
import passport from "passport";
import { Issuer, Strategy } from "openid-client";

export let client;
export let issuerUrl;
export let keycloakIssuer;

function base64urlToUtf8(str) {
  // base64url -> base64
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  // padding
  const pad = str.length % 4;
  if (pad) str += "=".repeat(4 - pad);
  return Buffer.from(str, "base64").toString("utf8");
}

export function jwtDecode(token) {
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
  const kcConfig = JSON.parse(fs.readFileSync("keycloak.json", "utf8"));
  issuerUrl = kcConfig["auth-server-url"] + "realms/" + kcConfig.realm;
  keycloakIssuer = await Issuer.discover(issuerUrl);
  // console.log("Discovered issuer %s %O", keycloakIssuer.issuer, keycloakIssuer.metadata);

  const serverUrl =
    process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8080";
  client = new keycloakIssuer.Client({
    client_id: kcConfig.resource,
    client_secret: kcConfig.credentials.secret,
    redirect_uris: [serverUrl + "/auth/callback"],
    post_logout_redirect_uris: [serverUrl + "/logout/callback"],
    response_types: ["code"],
  });
  // ################### Express Session ###################
  var memoryStore = new session.MemoryStore();
  app.use(
    session({
      secret: "ofwjrfmv348vutm38095v7q83vm597356nb39wq5nv94w5b68wp0459m",
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
      userProfile.keycloakConfig = kcConfig;
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
  app.use(async (req, res, next) => {
    if (req.user) {
      const now = Math.floor(Date.now() / 1000);
      const diff = req.user.accessTokenDecoded.exp - now;
      if (diff <= 0) {
        refreshAccessToken(req);
      } else {
        // console.log("Token still valid for ", diff, " seconds");
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
  app.get("/logout/callback", (req, res) => {
    // clears the persisted user from the local storage and
    // redirects the user to a public route
    req.logout(function (err) {
      if (err) {
        return next(err);
      }
      res.redirect("/");
    });
  });
  // Before redirecting to the login page, store the original URL in the session
  app.use((req, res, next) => {
    if (!req.user && req.path !== "/auth/callback") {
      req.session.originalUrl = req.originalUrl;
    }
    next();
  });
}

// function to check weather user is authenticated, req.isAuthenticated is populated by password.js
// use this function to protect all routes
export var checkAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/test");
};

/**
 * Function ignores the expiration time of the access-token and refreshes it by force.
 * Used to get a new access-token when the current one holds claims or data that you know for sure is expired.
 */
export async function refreshAccessToken(req) {
  if (!req || !req.user.refreshToken) {
    return null;
  }
  try {
    const tokenSet = await client.refresh(req.user.refreshToken);
    req.user.accessToken = tokenSet.access_token;
    const access = jwtDecode(tokenSet.access_token);
    req.user.accessTokenDecoded = access?.payload;
    req.user.refreshToken = tokenSet.refresh_token;
    req.user.rolesCalculated = JSON.stringify(getLdapGroups(req));
    // Get updated user information
    const userinfo = await client.userinfo(req.user.accessToken);
    // Merge the updated user information with the user profile
    req.user = { ...req.user, ...userinfo };
    // console.log("Token refreshed", req.user);
  } catch (err) {
    console.error("Error refreshing token: ", err);
  }
}

export function getLdapGroups(req) {
  let r = {};
  if (!req || !req.user || !req.user.ldap) {
    return r;
  }
  const ldap = req.user.ldap;
  // console.log("LDAP-String", ldap)
  
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
  // console.log("LDAP-Groups", r);
  return r;
}

export async function getUserAttributes(req, getAll = false) {
  if (!req || !req.user || !req.user.accessToken ||!req.user.keycloakConfig) {
    return null;
  }
  const keycloakConfig = req.user.keycloakConfig;
  const realm = keycloakConfig.realm;
  const u = keycloakConfig["auth-server-url"];
  const url = `${u.endsWith("/") ? u.slice(0, -1) : u}/realms/${realm}/account`;

  // Fetch current user attributes
  const currentAttributes = await fetch(url, {
    headers: {
      Authorization: "Bearer " + req.user.accessToken,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      return response.json();
    })
    .then((data) => {
      // console.log("data of user attributes", data);
      for(let key in data.attributes) {
        data.attributes[key] = data.attributes[key][0];
      }
      if(getAll) {
        // Remove fields from the object that are not needed.
        let { userProfileMetadata, id, username, emailVerified, ...d} = data;
        return d;
      }
      return data;
    })
    .catch((error) => {
      console.error("Error fetching current attributes:", error);
      return {};
    });
    console.log("current attributes fetched", currentAttributes);
  return currentAttributes;
}

export async function setUserAttribute(req, attributeName, attributeValue) {
  if (!req || !req.user || !req.user.accessToken || !req.user.keycloakConfig) {
    return null;
  }
  const keycloakConfig = req.user.keycloakConfig;
  const realm = keycloakConfig.realm;
  const u = keycloakConfig["auth-server-url"];
  const url = `${u.endsWith("/") ? u.slice(0, -1) : u}/realms/${realm}/account`;

  // Fetch current user attributes
  const currentAttributes = await getUserAttributes(req, true);
  // console.log("current attributes", currentAttributes);

  // Merge current and new attributes
  const mas = { ...currentAttributes.attributes, [attributeName]: attributeValue };
  const mergedAttributes = { ...currentAttributes, attributes: mas };  
  // console.log("merged attributes before saving", mergedAttributes);

  const result = fetch(url, {
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
  return result;
}