const connectors = {
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    color: "#0a66c2",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "r_organization_admin", "r_organization_social", "r_ads", "r_ads_reporting"]
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    color: "#c13584",
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    scopes: ["instagram_basic", "instagram_manage_insights"]
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    color: "#ff0033",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"]
  },
  ga4: {
    id: "ga4",
    name: "GA4",
    color: "#f9ab00",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"]
  }
};

const defaultState = {
  sources: {
    linkedin: { connected: false },
    instagram: { connected: false },
    youtube: { connected: false },
    ga4: { connected: false }
  },
  posts: [],
  history: { daily: [], weekly: [], monthly: [] },
  rules: [
    { id: "rule-spike", title: "Spike detection", detail: "Flag posts whose engagement grows more than 35%." }
  ],
  settings: { companyName: "Northstar Studio", defaultKpi: "Engagement rate", autoRefresh: true },
  schedule: { frequency: "Weekly", day: "Monday", recipients: "team@example.com", autoIngest: false, sources: ["linkedin"], lastRunAt: null },
  reports: []
};

export default {
  async fetch(request, env, ctx) {
    try {
      if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), env);
      const url = new URL(request.url);
      const route = `${request.method} ${url.pathname}`;

      if (route === "GET /api/health") return json({ ok: true, service: "MetricFlow Worker API" }, env);
      if (route === "POST /api/signup" || route === "POST /api/auth/signup") return json(await signup(request, env), env, 201);
      if (route === "POST /api/login" || route === "POST /api/auth/login") return json(await login(request, env), env);
      if (route === "POST /api/password/forgot" || route === "POST /api/auth/password/forgot") return json(await requestPasswordReset(request, env), env);
      if (route === "POST /api/password/reset" || route === "POST /api/auth/password/reset") return json(await resetPassword(request, env), env);
      if (route === "GET /api/state") {
        const account = await requireAccount(request, env);
        return json(await userStatePayload(env, account.id), env);
      }
      if (route === "GET /api/connectors") {
        const account = await requireAccount(request, env);
        return json({ connectors: connectorStatus(await buildUserState(env, account.id), env, url) }, env);
      }
      if (route === "GET /api/linkedin/organizations") return json(await linkedinOrganizations(request, env), env);
      if (route === "GET /api/posts") {
        const account = await requireAccount(request, env);
        return json({ posts: filterPosts(await loadUserJson(env, userLinkedInKey(account.id, "posts"), []), url.searchParams) }, env);
      }
      if (route === "GET /api/reports") {
        const account = await requireAccount(request, env);
        return json({ reports: await loadUserJson(env, userDataKey(account.id, "reports"), []) }, env);
      }
      if (route === "GET /api/export.csv") {
        const account = await requireAccount(request, env);
        return csv(await buildUserState(env, account.id), env);
      }

      const oauthAuthorize = url.pathname.match(/^\/oauth\/([^/]+)\/authorize$/);
      if (request.method === "GET" && oauthAuthorize) return authorize(oauthAuthorize[1], request, env);

      const oauthCallback = url.pathname.match(/^\/oauth\/([^/]+)\/callback$/);
      if (request.method === "GET" && oauthCallback) return callback(oauthCallback[1], request, env);

      const ingest = url.pathname.match(/^\/api\/ingest\/([^/]+)$/);
      if (request.method === "POST" && ingest) {
        const account = await requireAccount(request, env);
        return json(await ingestSource(ingest[1], await readJson(request), env, account.id), env);
      }

      const connectorSync = url.pathname.match(/^\/api\/connectors\/([^/]+)\/sync$/);
      if (request.method === "POST" && connectorSync) {
        const account = await requireAccount(request, env);
        const result = await ingestSource(connectorSync[1], await readJson(request), env, account.id);
        return json({ ...result, state: await userStatePayload(env, account.id) }, env);
      }

      const connectorConnect = url.pathname.match(/^\/api\/connectors\/([^/]+)\/connect$/);
      if (request.method === "GET" && connectorConnect) {
        const session = url.searchParams.get("session") ? `?session=${encodeURIComponent(url.searchParams.get("session"))}` : "";
        return Response.redirect(`${url.origin}/oauth/${connectorConnect[1]}/authorize${session}`, 302);
      }

      if (request.method === "POST" && url.pathname === "/api/linkedin/select-organization") {
        return json(await selectLinkedInOrganization(request, env), env);
      }

      const connectorPatch = url.pathname.match(/^\/api\/connectors\/([^/]+)$/);
      if (request.method === "PATCH" && connectorPatch) {
        const account = await requireAccount(request, env);
        const state = await buildUserState(env, account.id);
        const body = await readJson(request);
        state.sources[connectorPatch[1]] = { ...(state.sources[connectorPatch[1]] || {}), connected: Boolean(body.connected) };
        return json({ connector: { id: connectorPatch[1], ...state.sources[connectorPatch[1]] }, summary: summary(state) }, env);
      }

      if (request.method === "POST" && url.pathname === "/api/ingest/run") {
        const account = await requireAccount(request, env);
        const state = await buildUserState(env, account.id);
        const results = [];
        for (const [source, sourceState] of Object.entries(state.sources || {})) {
          if (sourceState.connected && connectors[source]) results.push(await ingestSource(source, {}, env, account.id));
        }
        return json({ results, state: await userStatePayload(env, account.id) }, env);
      }

      if (request.method === "POST" && url.pathname === "/api/reports") {
        const account = await requireAccount(request, env);
        const state = await buildUserState(env, account.id);
        const body = await readJson(request);
        const report = createReport(state, body);
        const reports = [report, ...(await loadUserJson(env, userDataKey(account.id, "reports"), []))].slice(0, 20);
        await saveUserJson(env, userDataKey(account.id, "reports"), reports);
        return json({ report, reports }, env, 201);
      }

      if (request.method === "PUT" && url.pathname === "/api/schedule") {
        const account = await requireAccount(request, env);
        const schedule = { ...defaultState.schedule, ...(await loadUserJson(env, userDataKey(account.id, "schedule"), {})), ...(await readJson(request)) };
        await saveUserJson(env, userDataKey(account.id, "schedule"), schedule);
        return json({ schedule }, env);
      }

      if (request.method === "PUT" && url.pathname === "/api/settings") {
        const account = await requireAccount(request, env);
        const settings = { ...defaultState.settings, ...(await loadUserJson(env, userDataKey(account.id, "settings"), {})), ...(await readJson(request)) };
        await saveUserJson(env, userDataKey(account.id, "settings"), settings);
        return json({ settings }, env);
      }

      if (request.method === "POST" && url.pathname === "/api/rules") {
        const account = await requireAccount(request, env);
        const body = await readJson(request);
        const rule = { id: `rule-${Date.now()}`, title: body.title || "Post movement", detail: body.detail || "Notify the team when a normalized post changes materially." };
        const rules = [...(await loadUserJson(env, userDataKey(account.id, "rules"), defaultState.rules)), rule];
        await saveUserJson(env, userDataKey(account.id, "rules"), rules);
        return json({ rule, rules }, env, 201);
      }

      const ruleDelete = url.pathname.match(/^\/api\/rules\/([^/]+)$/);
      if (request.method === "DELETE" && ruleDelete) {
        const account = await requireAccount(request, env);
        const rules = (await loadUserJson(env, userDataKey(account.id, "rules"), defaultState.rules)).filter((rule) => rule.id !== ruleDelete[1]);
        await saveUserJson(env, userDataKey(account.id, "rules"), rules);
        return json({ rules }, env);
      }

      return json({ message: "API route not found" }, env, 404);
    } catch (error) {
      return json({ message: error.message || "Worker error" }, env, error.status || 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledIngestion(env));
  }
};

async function saveUserState(env, userId, userState) {
  if (!env.USER_STATE) throw new Error("Missing USER_STATE KV binding");
  await env.USER_STATE.put(userId, JSON.stringify(userState, null, 2));
}

async function loadUserJson(env, key, fallback = null) {
  const raw = await env.USER_STATE?.get(key);
  return raw ? JSON.parse(raw) : fallback;
}

async function saveUserJson(env, key, value) {
  if (!env.USER_STATE) throw new Error("Missing USER_STATE KV binding");
  await env.USER_STATE.put(key, JSON.stringify(value, null, 2));
}

function userDataKey(accountId, name) {
  return `user:${accountId}:${name}`;
}

function userLinkedInKey(accountId, name) {
  return `user:${accountId}:linkedin:${name}`;
}

function sessionKey(token) {
  return `session:${token}`;
}

function passwordResetKey(token) {
  return `password-reset:${token}`;
}

function oauthStateKey(token) {
  return `oauth:state:${token}`;
}

function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function createSession(env, account) {
  const token = `session_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  await saveUserJson(env, sessionKey(token), {
    accountId: account.id,
    name: account.name,
    email: account.email,
    expiresAt,
    createdAt: new Date().toISOString()
  });
  return token;
}

async function requireAccount(request, env) {
  const requestUrl = new URL(request.url);
  const token = bearerToken(request) || requestUrl.searchParams.get("session") || "";
  if (!token) {
    const error = new Error("Authentication required");
    error.status = 401;
    throw error;
  }
  const session = await loadUserJson(env, sessionKey(token), null);
  if (!session || !session.accountId || new Date(session.expiresAt).getTime() <= Date.now()) {
    const error = new Error("Invalid or expired session");
    error.status = 401;
    throw error;
  }
  return {
    id: session.accountId,
    name: session.name,
    email: session.email,
    token
  };
}

async function buildUserState(env, accountId) {
  const token = await loadUserJson(env, userLinkedInKey(accountId, "token"), null);
  const organizations = await loadUserJson(env, userLinkedInKey(accountId, "organizations"), []);
  const selectedOrganization = await loadUserJson(env, userLinkedInKey(accountId, "organization"), null);
  const posts = await loadUserJson(env, userLinkedInKey(accountId, "posts"), []);
  const analytics = await loadUserJson(env, userLinkedInKey(accountId, "analytics"), null);
  const sync = await loadUserJson(env, userLinkedInKey(accountId, "sync"), null);
  const settings = { ...defaultState.settings, ...(await loadUserJson(env, userDataKey(accountId, "settings"), {})) };
  const schedule = { ...defaultState.schedule, ...(await loadUserJson(env, userDataKey(accountId, "schedule"), {})) };
  const rules = await loadUserJson(env, userDataKey(accountId, "rules"), defaultState.rules);
  const reports = await loadUserJson(env, userDataKey(accountId, "reports"), []);
  const history = analytics?.history || generateHistory(posts);

  return {
    ...structuredClone(defaultState),
    sources: {
      ...structuredClone(defaultState.sources),
      linkedin: {
        connected: Boolean(token?.accessToken),
        selectedOrganization,
        organizationCount: organizations.length,
        lastIngestedAt: sync?.lastIngestedAt || null
      }
    },
    posts,
    history,
    rules,
    settings,
    schedule,
    reports,
    linkedin: {
      organizations,
      selectedOrganization,
      sync,
      connected: Boolean(token?.accessToken)
    }
  };
}

async function userStatePayload(env, accountId) {
  return statePayload(await buildUserState(env, accountId));
}

async function signup(request, env) {
  const body = await readJson(request);
  const name = String(body.name || "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!name || !email || !password) {
    const error = new Error("Name, email, and password are required");
    error.status = 400;
    throw error;
  }
  if (password.length < 8) {
    const error = new Error("Password must be at least 8 characters");
    error.status = 400;
    throw error;
  }

  const accountKey = authAccountKey(email);
  const existing = await env.USER_STATE?.get(accountKey);
  if (existing) {
    const error = new Error("An account already exists for this email");
    error.status = 409;
    throw error;
  }

  const id = `acct_${crypto.randomUUID()}`;
  const salt = crypto.randomUUID();
  const passwordHash = await hashPassword(password, salt);
  const account = {
    id,
    name,
    email,
    salt,
    passwordHash,
    createdAt: new Date().toISOString()
  };
  await saveUserState(env, accountKey, account);
  await saveUserState(env, `auth:id:${id}`, { email });
  return authPayload(account, await createSession(env, account));
}

async function login(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const raw = await env.USER_STATE?.get(authAccountKey(email));
  const account = raw ? JSON.parse(raw) : null;
  const passwordHash = account ? await hashPassword(password, account.salt) : "";
  if (!account || passwordHash !== account.passwordHash) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }
  return authPayload(account, await createSession(env, account));
}

async function requestPasswordReset(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const generic = {
    message: "If an account exists for that email, password reset instructions will be sent."
  };
  if (!email) return generic;

  const raw = await env.USER_STATE?.get(authAccountKey(email));
  const account = raw ? JSON.parse(raw) : null;
  if (!account) return generic;

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
  await saveUserJson(env, passwordResetKey(token), {
    accountId: account.id,
    email: account.email,
    createdAt: new Date().toISOString(),
    expiresAt
  });

  const appUrl = env.PAGES_URL || new URL(request.url).origin;
  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const emailSent = await sendPasswordResetEmail(env, account, resetUrl);
  return {
    ...generic,
    emailSent,
    resetUrl: env.PASSWORD_RESET_DEBUG_LINK === "true" ? resetUrl : undefined
  };
}

async function resetPassword(request, env) {
  const body = await readJson(request);
  const token = String(body.token || "").trim();
  const password = String(body.password || "");
  if (!token || !password) {
    const error = new Error("Reset token and new password are required");
    error.status = 400;
    throw error;
  }
  if (password.length < 8) {
    const error = new Error("Password must be at least 8 characters");
    error.status = 400;
    throw error;
  }

  const reset = await loadUserJson(env, passwordResetKey(token), null);
  if (!reset || new Date(reset.expiresAt).getTime() <= Date.now()) {
    const error = new Error("Invalid or expired password reset link");
    error.status = 400;
    throw error;
  }

  const raw = await env.USER_STATE?.get(authAccountKey(reset.email));
  const account = raw ? JSON.parse(raw) : null;
  if (!account || account.id !== reset.accountId) {
    const error = new Error("Invalid or expired password reset link");
    error.status = 400;
    throw error;
  }

  account.salt = crypto.randomUUID();
  account.passwordHash = await hashPassword(password, account.salt);
  account.passwordUpdatedAt = new Date().toISOString();
  await saveUserState(env, authAccountKey(account.email), account);
  await env.USER_STATE?.delete(passwordResetKey(token));
  return { message: "Password updated. You can now log in with your new password." };
}

async function sendPasswordResetEmail(env, account, resetUrl) {
  if (!env.PASSWORD_RESET_WEBHOOK_URL) return false;
  const response = await fetch(env.PASSWORD_RESET_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.PASSWORD_RESET_WEBHOOK_SECRET ? { authorization: `Bearer ${env.PASSWORD_RESET_WEBHOOK_SECRET}` } : {})
    },
    body: JSON.stringify({
      type: "password_reset",
      to: account.email,
      name: account.name,
      resetUrl,
      subject: "Reset your Metrillix password"
    })
  });
  if (!response.ok) {
    const error = new Error("Password reset email could not be sent");
    error.status = 502;
    throw error;
  }
  return true;
}

function authPayload(account, token) {
  return {
    id: account.id,
    userId: account.id,
    name: account.name,
    email: account.email,
    token
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function authAccountKey(email) {
  return `auth:account:${email}`;
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sourceEnv(source, env, requestUrl) {
  const key = source.toUpperCase();
  const connector = connectors[source];
  return {
    connector,
    clientId: env[`${key}_CLIENT_ID`] || "",
    clientSecret: env[`${key}_CLIENT_SECRET`] || "",
    redirectUri: env[`${key}_REDIRECT_URI`] || `${requestUrl.origin}/oauth/${source}/callback`
  };
}

function authorize(source, request, env) {
  const url = new URL(request.url);
  const config = sourceEnv(source, env, url);
  if (!config.connector) return json({ message: "Unsupported source" }, env, 404);
  if (!config.clientId) return oauthSetupRequired(source, env, `${source.toUpperCase()}_CLIENT_ID`);
  if (!config.clientSecret) return oauthSetupRequired(source, env, `${source.toUpperCase()}_CLIENT_SECRET`);

  return authorizeWithAccount(source, request, env, config);
}

async function authorizeWithAccount(source, request, env, config) {
  const account = await requireAccount(request, env);
  const target = new URL(config.connector.authUrl);
  const scopes = env[`${source.toUpperCase()}_SCOPES`]
    ? env[`${source.toUpperCase()}_SCOPES`].split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean)
    : config.connector.scopes;
  const stateToken = crypto.randomUUID();
  await saveUserJson(env, oauthStateKey(stateToken), {
    accountId: account.id,
    source,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 10).toISOString()
  });
  target.searchParams.set("client_id", config.clientId);
  target.searchParams.set("redirect_uri", config.redirectUri);
  target.searchParams.set("response_type", "code");
  target.searchParams.set("scope", scopes.join(" "));
  target.searchParams.set("state", stateToken);
  if (source === "linkedin") target.searchParams.set("prompt", "login");
  if (source === "youtube" || source === "ga4") {
    target.searchParams.set("access_type", "offline");
    target.searchParams.set("prompt", "consent");
  }
  return Response.redirect(target.toString(), 302);
}

function oauthSetupRequired(source, env, missingName) {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MetricFlow OAuth setup required</title>
    <style>
      body { margin: 0; font-family: Inter, Arial, sans-serif; background: #fff; color: #14171a; }
      main { width: min(680px, calc(100% - 40px)); margin: 96px auto; }
      p { color: #667085; line-height: 1.7; }
      code { background: #eaf8fd; color: #1689ba; padding: 3px 6px; border-radius: 6px; }
      a { color: #1689ba; font-weight: 800; }
    </style>
  </head>
  <body>
    <main>
      <p>MetricFlow</p>
      <h1>LinkedIn OAuth setup required</h1>
      <p>The app-level LinkedIn OAuth secret <code>${missingName}</code> is not configured on the Cloudflare Worker yet.</p>
      <p>This is not a personal LinkedIn token. It belongs to the MetricFlow LinkedIn Developer app and lets each user connect their own LinkedIn account through OAuth.</p>
      <p>Required redirect URI: <code>${env.LINKEDIN_REDIRECT_URI || "https://metricflow-api.vsooriarachchi.workers.dev/oauth/linkedin/callback"}</code></p>
      <p><a href="${env.PAGES_URL || "https://metricflow-analytics.pages.dev"}/dashboard/onboarding">Return to onboarding</a></p>
    </main>
  </body>
</html>`;
  return cors(new Response(html, {
    status: 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  }), env);
}

async function callback(source, request, env) {
  const requestUrl = new URL(request.url);
  const config = sourceEnv(source, env, requestUrl);
  if (!config.connector) return json({ message: "Unsupported source" }, env, 404);
  if (requestUrl.searchParams.get("error")) return oauthCallbackFailure(requestUrl.searchParams.get("error"), requestUrl, env);
  const code = requestUrl.searchParams.get("code");
  if (!code) return oauthCallbackFailure("Missing OAuth code", requestUrl, env);
  if (!config.clientId || !config.clientSecret) return oauthCallbackFailure(`Missing ${source.toUpperCase()} OAuth credentials`, requestUrl, env);
  const oauthState = await consumeOAuthState(requestUrl.searchParams.get("state"), source, env);

  try {
    const token = await exchangeCodeForToken(config.connector.tokenUrl, code, config.redirectUri, config.clientId, config.clientSecret);
    if (source === "linkedin") {
      const expiresAt = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null;
      // Step 1: identify the LinkedIn member who completed OAuth.
      const profile = await fetchLinkedInProfile(token.access_token);
      if (!profile.id) throw new Error("LinkedIn profile response did not include an id");

      // Step 2: discover every organization this member administers.
      const organizations = await fetchLinkedInOrganizations(token.access_token);
      const previousOrganization = await loadUserJson(env, userLinkedInKey(oauthState.accountId, "organization"), null);
      const selectedOrganization = organizations.includes(previousOrganization)
        ? previousOrganization
        : null;

      // Step 3: persist account-scoped credentials and tenant choices in USER_STATE.
      await saveUserJson(env, userLinkedInKey(oauthState.accountId, "token"), {
        accessToken: token.access_token,
        refreshToken: token.refresh_token || null,
        expiresAt,
        tokenType: token.token_type,
        linkedInUserId: profile.id,
        connectedAt: new Date().toISOString()
      });
      await saveUserJson(env, userLinkedInKey(oauthState.accountId, "profile"), profile);
      await saveUserJson(env, userLinkedInKey(oauthState.accountId, "organizations"), organizations);
      await saveUserJson(env, userLinkedInKey(oauthState.accountId, "organization"), selectedOrganization);
      const redirectTarget = env.PAGES_URL ? new URL(env.PAGES_URL) : new URL("/", requestUrl.origin);
      redirectTarget.searchParams.set("connector", "connected");
      return Response.redirect(redirectTarget.toString(), 302);
    }

    await saveUserJson(env, userDataKey(oauthState.accountId, `${source}:token`), token);
    return Response.redirect(env.PAGES_URL ? `${env.PAGES_URL}/?connector=connected` : `${requestUrl.origin}/?connector=connected`, 302);
  } catch (error) {
    return oauthCallbackFailure(error.message || "LinkedIn OAuth callback failed", requestUrl, env);
  }
}

async function consumeOAuthState(stateToken, source, env) {
  if (!stateToken) {
    const error = new Error("Missing OAuth state");
    error.status = 401;
    throw error;
  }
  const state = await loadUserJson(env, oauthStateKey(stateToken), null);
  if (!state || state.source !== source || new Date(state.expiresAt).getTime() <= Date.now()) {
    const error = new Error("Invalid or expired OAuth state");
    error.status = 401;
    throw error;
  }
  await env.USER_STATE?.delete(oauthStateKey(stateToken));
  return state;
}

function oauthCallbackFailure(message, requestUrl, env) {
  const redirectTarget = env.PAGES_URL ? new URL("/dashboard/onboarding", env.PAGES_URL) : new URL("/dashboard/onboarding", requestUrl.origin);
  redirectTarget.searchParams.set("connector", "error");
  redirectTarget.searchParams.set("message", message);
  return Response.redirect(redirectTarget.toString(), 302);
}

async function exchangeCodeForToken(tokenUrl, code, redirectUri, clientId, clientSecret) {
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  const text = await response.text();
  const payload = parseJson(text);
  if (!response.ok) throw new Error(payload.error_description || payload.error || "OAuth token exchange failed");
  return payload;
}

function parseJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

async function ingestSource(source, options, env, accountId) {
  if (!accountId) {
    const error = new Error("Account id is required for ingestion");
    error.status = 401;
    throw error;
  }
  if (!connectors[source]) {
    const error = new Error(`Unsupported source: ${source}`);
    error.status = 404;
    throw error;
  }
  if (source !== "linkedin") {
    const error = new Error(`${connectors[source].name} ingestion is scaffolded but not implemented in the Worker yet`);
    error.status = 501;
    throw error;
  }

  const token = env.LINKEDIN_DEMO_MODE === "true" ? null : await loadUserJson(env, userLinkedInKey(accountId, "token"), null);
  const accessToken = token?.accessToken;
  const orgUrn = env.LINKEDIN_DEMO_MODE === "true" ? "urn:li:organization:demo" : await loadUserJson(env, userLinkedInKey(accountId, "organization"), null);
  if (env.LINKEDIN_DEMO_MODE !== "true" && !accessToken) {
    const error = new Error("OAuth token missing for linkedin");
    error.status = 401;
    throw error;
  }
  if (env.LINKEDIN_DEMO_MODE !== "true" && !orgUrn) {
    const error = new Error("LinkedIn organization selection required before ingestion");
    error.status = 409;
    throw error;
  }

  // Use the selected organization as the author and analytics entity for all LinkedIn API calls.
  const rawPosts = env.LINKEDIN_DEMO_MODE === "true" ? demoLinkedInPosts() : await fetchLinkedInPosts(accessToken, orgUrn, options);
  const postIds = rawPosts.map((post) => post.id || post.urn || post.activity);
  const rawMetrics = env.LINKEDIN_DEMO_MODE === "true" ? Object.fromEntries(postIds.map((id, index) => [id, demoLinkedInMetric(index)])) : await fetchLinkedInMetrics(accessToken, orgUrn, postIds);
  const normalized = normalizeLinkedInPosts(rawPosts, rawMetrics);
  const diagnostics = linkedinSyncDiagnostics(rawPosts, normalized, rawMetrics);

  const existingPosts = await loadUserJson(env, userLinkedInKey(accountId, "posts"), []);
  const posts = mergePosts(existingPosts, normalized);
  const history = generateHistory(posts);
  const syncedAt = new Date().toISOString();
  await saveUserJson(env, userLinkedInKey(accountId, "posts"), posts);
  await saveUserJson(env, userLinkedInKey(accountId, "analytics"), {
    history,
    lastMetrics: rawMetrics,
    updatedAt: syncedAt
  });
  await saveUserJson(env, userLinkedInKey(accountId, "sync"), {
    lastIngestedAt: syncedAt,
    fetched: rawPosts.length,
    saved: normalized.length,
    organization: orgUrn,
    diagnostics
  });
  return { source, fetched: rawPosts.length, saved: normalized.length, diagnostics, posts: normalized };
}

async function fetchLinkedInProfile(accessToken) {
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}`, "x-restli-protocol-version": "2.0.0" }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "LinkedIn profile API request failed");
  return { id: payload.sub || payload.id, ...payload };
}

async function fetchLinkedInOrganizations(accessToken) {
  const url = new URL("https://api.linkedin.com/v2/organizationAcls");
  url.searchParams.set("q", "roleAssignee");
  url.searchParams.set("role", "ADMINISTRATOR");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, "x-restli-protocol-version": "2.0.0" }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "LinkedIn organization ACLs API request failed");
  return [...new Set((payload.elements || []).map((row) => row.organization).filter(Boolean))];
}

async function fetchLinkedInPosts(accessToken, organizationUrn, options = {}) {
  if (!organizationUrn) throw new Error("Missing LinkedIn organization URN");
  const url = new URL("https://api.linkedin.com/v2/ugcPosts");
  url.searchParams.set("q", "authors");
  url.searchParams.set("authors", `List(${organizationUrn})`);
  url.searchParams.set("sortBy", "LAST_MODIFIED");
  url.searchParams.set("count", String(options.count || 25));
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}`, "x-restli-protocol-version": "2.0.0" } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "LinkedIn UGC Posts API request failed");
  return payload.elements || [];
}

async function fetchLinkedInMetrics(accessToken, organizationUrn, postIds) {
  const metrics = {};
  for (const postId of postIds) {
    const social = await fetchLinkedInSocialActions(accessToken, postId);
    const analytics = await fetchOrganizationAnalytics(accessToken, organizationUrn, postId);
    metrics[postId] = {
      ...analytics,
      likes: social.likesSummary?.totalLikes ?? null,
      comments: social.commentsSummary?.totalFirstLevelComments ?? null,
      platform_raw: { social, analytics }
    };
  }
  return metrics;
}

async function fetchLinkedInSocialActions(accessToken, postId) {
  const response = await fetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(postId)}`, {
    headers: { authorization: `Bearer ${accessToken}`, "x-restli-protocol-version": "2.0.0" }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `LinkedIn Social Actions API failed for ${postId}`);
  return payload;
}

async function fetchOrganizationAnalytics(accessToken, organizationUrn, postId) {
  if (!organizationUrn) throw new Error("Missing LinkedIn organization URN");
  const url = new URL("https://api.linkedin.com/v2/organizationalEntityShareStatistics");
  url.searchParams.set("q", "organizationalEntity");
  url.searchParams.set("organizationalEntity", organizationUrn);
  url.searchParams.set("shares", `List(${postId})`);
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}`, "x-restli-protocol-version": "2.0.0" } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `LinkedIn Analytics API failed for ${postId}`);
  const row = payload.elements?.[0] || {};
  const stats = row.totalShareStatistics || row;
  return {
    reach: numberOrNull(stats.uniqueImpressionsCount),
    impressions: numberOrNull(stats.impressionCount),
    engagements: numberOrNull(stats.engagement),
    shares: numberOrNull(stats.shareCount),
    clicks: numberOrNull(stats.clickCount)
  };
}

function linkedinSyncDiagnostics(rawPosts, normalizedPosts, rawMetrics) {
  const withValue = (key) => normalizedPosts.filter((post) => post[key] !== null && post[key] !== undefined).length;
  return {
    fetchedPosts: rawPosts.length,
    normalizedPosts: normalizedPosts.length,
    metricsFetched: Object.keys(rawMetrics || {}).length,
    postsWithReach: withValue("reach"),
    postsWithImpressions: withValue("impressions"),
    postsWithEngagements: withValue("engagements"),
    postsWithClicks: withValue("clicks"),
    postsWithSocialActions: normalizedPosts.filter((post) => post.likes !== null || post.comments !== null).length
  };
}

async function linkedinOrganizations(request, env) {
  const account = await requireAccount(request, env);
  const organizations = await loadUserJson(env, userLinkedInKey(account.id, "organizations"), []);
  const selectedOrganization = await loadUserJson(env, userLinkedInKey(account.id, "organization"), null);
  const token = await loadUserJson(env, userLinkedInKey(account.id, "token"), null);
  return {
    userId: account.id,
    connected: Boolean(token?.accessToken),
    organizations,
    selectedOrganization
  };
}

async function selectLinkedInOrganization(request, env) {
  const body = await readJson(request);
  const organizationUrn = body.organizationUrn;
  const account = await requireAccount(request, env);
  const organizations = await loadUserJson(env, userLinkedInKey(account.id, "organizations"), []);
  if (!organizations.includes(organizationUrn)) {
    const error = new Error("Organization is not available for this LinkedIn user");
    error.status = 400;
    throw error;
  }

  await saveUserJson(env, userLinkedInKey(account.id, "organization"), organizationUrn);
  return { userId: account.id, organizations, selectedOrganization: organizationUrn };
}

function normalizeLinkedInPosts(rawPosts, rawMetrics = {}) {
  return rawPosts.map((post) => {
    const postId = String(post.id || post.urn || post.activity || "");
    const metrics = rawMetrics[postId] || {};
    const text = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || post.text || "";
    return {
      source: "linkedin",
      post_id: postId,
      author_id: String(post.author || ""),
      published_at: linkedInDate(post.created?.time || post.published_at),
      url: post.permalink || post.url || `https://www.linkedin.com/feed/update/${postId}`,
      text,
      media_type: inferLinkedInMediaType(post),
      reach: numberOrNull(metrics.reach),
      impressions: numberOrNull(metrics.impressions),
      engagements: numberOrNull(metrics.engagements),
      likes: numberOrNull(metrics.likes),
      comments: numberOrNull(metrics.comments),
      shares: numberOrNull(metrics.shares),
      saves: null,
      clicks: numberOrNull(metrics.clicks),
      conversions: numberOrNull(metrics.conversions),
      platform_raw: { post, metrics }
    };
  });
}

function inferLinkedInMediaType(post) {
  const media = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.media || [];
  if (!media.length) return "text";
  if (media.length > 1) return "carousel";
  const category = String(media[0].media || media[0].status || media[0].type || "").toLowerCase();
  return category.includes("video") ? "video" : "image";
}

function linkedInDate(value) {
  if (!value) return new Date().toISOString();
  if (Number.isFinite(Number(value))) return new Date(Number(value)).toISOString();
  return new Date(value).toISOString();
}

function demoLinkedInPosts() {
  return [{ id: "urn:li:share:demo-001", author: "urn:li:organization:demo", created: { time: Date.now() - 86400000 }, text: "Demo LinkedIn post for Metricflow Worker ingestion.", url: "https://www.linkedin.com/feed/update/urn:li:share:demo-001" }];
}

function demoLinkedInMetric(index) {
  return { reach: 12000 + index * 1000, impressions: 16400 + index * 1200, engagements: 920 + index * 80, likes: 640 + index * 35, comments: 48 + index * 4, shares: 31 + index * 3, clicks: 174 + index * 9, conversions: 12 + index };
}

function mergePosts(existing, newPosts) {
  const byKey = new Map(existing.map((post) => [`${post.source}:${post.post_id}`, post]));
  for (const post of newPosts) byKey.set(`${post.source}:${post.post_id}`, { ...(byKey.get(`${post.source}:${post.post_id}`) || {}), ...post });
  return [...byKey.values()].sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
}

function generateHistory(posts) {
  const now = new Date();
  return {
    daily: rollup(posts, "daily", now.toISOString().slice(0, 10), (post) => String(post.published_at).slice(0, 10) === now.toISOString().slice(0, 10)),
    weekly: rollup(posts, "weekly", weekKey(now), (post) => weekKey(new Date(post.published_at)) === weekKey(now)),
    monthly: rollup(posts, "monthly", now.toISOString().slice(0, 7), (post) => String(post.published_at).slice(0, 7) === now.toISOString().slice(0, 7))
  };
}

function rollup(posts, period, periodKey, predicate) {
  const groups = new Map();
  for (const post of posts.filter(predicate)) {
    const row = groups.get(post.source) || { id: `${period}:${post.source}:${periodKey}`, source: post.source, period, periodKey, postCount: 0, reach: 0, impressions: 0, engagements: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, conversions: 0, generatedAt: new Date().toISOString() };
    row.postCount += 1;
    for (const key of ["reach", "impressions", "engagements", "likes", "comments", "shares", "saves", "clicks", "conversions"]) row[key] += Number(post[key] || 0);
    groups.set(post.source, row);
  }
  return [...groups.values()];
}

async function runScheduledIngestion(env) {
  // Scheduled ingestion was disabled when analytics became user-scoped. A cron
  // worker must enumerate opted-in accounts before syncing; this Worker does not
  // maintain a global account index yet.
  return null;
}

function filterPosts(posts, params) {
  return posts.filter((post) => {
    if (params.get("source") && post.source !== params.get("source")) return false;
    const date = String(post.published_at || "").slice(0, 10);
    if (params.get("from") && date < params.get("from")) return false;
    if (params.get("to") && date > params.get("to")) return false;
    return true;
  });
}

function connectorStatus(state, env, requestUrl) {
  return Object.values(connectors).map((connector) => ({
    id: connector.id,
    name: connector.name,
    color: connector.color,
    connected: Boolean(state.sources?.[connector.id]?.connected),
    configured: Boolean(state.sources?.[connector.id]?.accessToken || env[`${connector.id.toUpperCase()}_CLIENT_ID`]),
    lastSyncAt: state.sources?.[connector.id]?.lastIngestedAt || null,
    callbackUrl: `${requestUrl.origin}/oauth/${connector.id}/callback`
  }));
}

function statePayload(state) {
  const ranked = rankPosts(state.posts || []);
  return {
    ...state,
    connectors: connectorStatus(state, {}, new URL("https://worker.local")),
    summary: summary(state),
    postRankings: ranked,
    insights: [{ type: "ranking", title: ranked[0] ? `${ranked[0].text || ranked[0].post_id} leads normalized posts` : "No normalized posts yet", detail: ranked[0] ? "This post has the strongest combined engagement, click, and conversion score." : "Connect LinkedIn and run ingestion." }],
    patterns: patterns(state.posts || []),
    contentIntelligence: { winningFormats: patterns(state.posts || []), recommendations: [ranked[0] ? `Create a follow-up to ${ranked[0].text || ranked[0].post_id}.` : "Run LinkedIn ingestion to generate recommendations."], nextBrief: { contentPillar: "normalized", format: ranked[0]?.media_type || "text", angle: "Use normalized post metrics to choose the next creative test." } },
    normalizedSchema: { post: ["source", "post_id", "author_id", "published_at", "url", "text", "media_type", "reach", "impressions", "engagements", "likes", "comments", "shares", "saves", "clicks", "conversions", "platform_raw"] }
  };
}

function rankPosts(posts) {
  return [...posts].map((post) => ({ ...post, title: post.text || post.post_id, connector: post.source, mediaType: post.media_type, contentPillar: "normalized", metrics: { reach: post.reach, engagements: post.engagements, conversions: post.conversions }, engagementChange: 0, score: Number((Number(post.engagements || 0) * 0.5 + Number(post.conversions || 0) * 15 + Number(post.clicks || 0) * 2).toFixed(1)) })).sort((a, b) => b.score - a.score);
}

function patterns(posts) {
  const groups = new Map();
  for (const post of posts) {
    const key = `${post.source} / ${post.media_type}`;
    const group = groups.get(key) || { key, posts: 0, reach: 0, engagements: 0, conversions: 0 };
    group.posts += 1;
    group.reach += Number(post.reach || 0);
    group.engagements += Number(post.engagements || 0);
    group.conversions += Number(post.conversions || 0);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, engagementRate: group.reach ? (group.engagements / group.reach) * 100 : 0, conversionRate: group.reach ? (group.conversions / group.reach) * 100 : 0 }));
}

function summary(state) {
  const totals = (state.posts || []).reduce((sum, post) => {
    sum.reach += Number(post.reach || 0);
    sum.engagements += Number(post.engagements || 0);
    sum.conversions += Number(post.conversions || 0);
    return sum;
  }, { reach: 0, engagements: 0, conversions: 0 });
  return { totalReach: totals.reach, totalEngagement: totals.engagements, totalConversions: totals.conversions, attributedRevenue: totals.conversions * 47, engagementRate: totals.reach ? (totals.engagements / totals.reach) * 100 : 0, connectedSources: Object.values(state.sources || {}).filter((source) => source.connected).length, totalSources: Object.keys(connectors).length, trackedPosts: (state.posts || []).length, deltas: { reach: 0, engagement: 0, conversions: 0 }, timeSavedHours: Number(((state.posts || []).length * 0.2 + 2.8).toFixed(1)) };
}

function createReport(state, body) {
  return { id: `report-${Date.now()}`, title: body.title || "Post intelligence report", audience: body.audience || "Leadership team", sections: body.sections || [], createdAt: new Date().toISOString(), summary: summary(state), recommendation: "Use normalized post rankings to choose the next creative test." };
}

function weekKey(date) {
  const current = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  current.setUTCDate(current.getUTCDate() + 4 - (current.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  return `${current.getUTCFullYear()}-W${String(Math.ceil((((current - yearStart) / 86400000) + 1) / 7)).padStart(2, "0")}`;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function readJson(request) {
  const raw = await request.text();
  if (!raw) return {};
  return JSON.parse(raw);
}

function csv(state, env) {
  const rows = [["source", "post_id", "published_at", "reach", "impressions", "engagements", "clicks", "conversions"], ...(state.posts || []).map((post) => [post.source, post.post_id, post.published_at, post.reach, post.impressions, post.engagements, post.clicks, post.conversions])];
  return cors(new Response(rows.map((row) => row.join(",")).join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=\"metricflow-posts.csv\"" } }), env);
}

function json(payload, env, status = 200) {
  return cors(new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }), env);
}

function cors(response, env) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", env.CORS_ORIGIN || "*");
  headers.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
