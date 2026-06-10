const connectors = {
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    color: "#0a66c2",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "r_organization_admin", "r_organization_social", "w_organization_social", "r_ads", "r_ads_reporting"]
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
      if (route === "POST /api/signup" || route === "POST /api/auth/signup") return authJson(await signup(request, env), request, env, 201);
      if (route === "POST /api/login" || route === "POST /api/auth/login") return authJson(await login(request, env), request, env);
      if (route === "POST /api/logout" || route === "POST /api/auth/logout") return authJson({ message: "Logged out" }, request, env, 200, { clear: true });
      if (route === "POST /api/password/forgot" || route === "POST /api/auth/password/forgot") return json(await requestPasswordReset(request, env), env);
      if (route === "POST /api/password/reset" || route === "POST /api/auth/password/reset") return json(await resetPassword(request, env), env);
      if (route === "GET /api/state") {
        const account = await requireAccount(request, env);
        return json(await userStatePayload(env, account.id), env);
      }
      const dashboardRoute = url.pathname.match(/^\/(?:api\/)?dashboard\/(summary|timeseries|top-posts|media-performance|hashtag-performance|insights)$/);
      if (request.method === "GET" && dashboardRoute) {
        const account = await requireAccount(request, env);
        return json(await dashboardPayload(dashboardRoute[1], request, env, account), env);
      }
      if (route === "GET /api/connectors") {
        const account = await requireAccount(request, env);
        return json({ connectors: connectorStatus(await buildUserState(env, account.id), env, url) }, env);
      }
      if (route === "GET /api/linkedin/organizations") return json(await linkedinOrganizations(request, env), env);
      if (route === "GET /api/linkedin/ad-library") {
        const account = await requireAccount(request, env);
        return json(await fetchAdLibraryInspiration(request, env, account.id), env);
      }
      if (route === "GET /api/posts") {
        const account = await requireAccount(request, env);
        const selectedOrganization = linkedinOrganizationUrn(await loadUserJson(env, userLinkedInKey(account.id, "organization"), null)) || null;
        const posts = selectedOrganizationPosts(await loadUserJson(env, userLinkedInKey(account.id, "posts"), []), selectedOrganization);
        return json({ posts: filterPosts(posts, url.searchParams) }, env);
      }
      if (route === "GET /api/drafts") {
        const account = await requireAccount(request, env);
        return json({ drafts: await loadDrafts(env, account.id) }, env);
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
        const result = await syncConnector(connectorSync[1], await readJson(request), env, account.id);
        return json({ ...result, state: await userStatePayload(env, account.id) }, env, result.error ? (result.statusCode || 500) : 200);
      }

      const connectorDisconnect = url.pathname.match(/^\/api\/connectors\/([^/]+)\/disconnect$/);
      if (request.method === "POST" && connectorDisconnect) {
        const account = await requireAccount(request, env);
        return json(await disconnectConnector(connectorDisconnect[1], env, account.id), env);
      }

      const connectorConnect = url.pathname.match(/^\/api\/connectors\/([^/]+)\/connect$/);
      if (request.method === "GET" && connectorConnect) {
        const session = url.searchParams.get("session") ? `?session=${encodeURIComponent(url.searchParams.get("session"))}` : "";
        return Response.redirect(`${url.origin}/oauth/${connectorConnect[1]}/authorize${session}`, 302);
      }

      if (request.method === "POST" && url.pathname === "/api/linkedin/select-organization") {
        return json(await selectLinkedInOrganization(request, env), env);
      }
      if (request.method === "POST" && url.pathname === "/api/linkedin/organization-name") {
        return json(await updateLinkedInOrganizationName(request, env), env);
      }

      if (request.method === "POST" && url.pathname === "/api/drafts") {
        const account = await requireAccount(request, env);
        const result = await createDraft(request, env, account.id);
        return json(result, env, 201);
      }

      const draftPublishRoute = url.pathname.match(/^\/api\/drafts\/([^/]+)\/publish$/);
      if (draftPublishRoute && request.method === "POST") {
        const account = await requireAccount(request, env);
        return json(await publishDraft(env, account.id, draftPublishRoute[1]), env);
      }

      const draftRoute = url.pathname.match(/^\/api\/drafts\/([^/]+)$/);
      if (draftRoute && request.method === "PUT") {
        const account = await requireAccount(request, env);
        return json(await updateDraft(request, env, account.id, draftRoute[1]), env);
      }

      if (draftRoute && request.method === "DELETE") {
        const account = await requireAccount(request, env);
        return json(await deleteDraft(env, account.id, draftRoute[1]), env);
      }

      if (request.method === "POST" && url.pathname === "/api/linkedin/publish") {
        const account = await requireAccount(request, env);
        return json(await publishLinkedInPayload(request, env, account.id), env);
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

      return json({ message: "This page or feature is not available yet." }, env, 404);
    } catch (error) {
      return json({ message: publicErrorMessage(error), code: error.code || undefined }, env, error.status || 500);
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

function cookieToken(request) {
  const cookies = Object.fromEntries((request.headers.get("cookie") || "").split(";").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("=") || "")];
  }).filter(([key]) => key));
  return cookies.metrillix_session || "";
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
  const token = bearerToken(request) || cookieToken(request) || requestUrl.searchParams.get("session") || "";
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
  const organizationLabels = await loadUserJson(env, userLinkedInKey(accountId, "organizationLabels"), {});
  const selectedOrganization = linkedinOrganizationUrn(await loadUserJson(env, userLinkedInKey(accountId, "organization"), null)) || null;
  const allPosts = await loadUserJson(env, userLinkedInKey(accountId, "posts"), []);
  const posts = selectedOrganizationPosts(allPosts, selectedOrganization);
  const analytics = await loadUserJson(env, userLinkedInKey(accountId, "analytics"), null);
  const sync = await loadUserJson(env, userLinkedInKey(accountId, "sync"), null);
  const settings = { ...defaultState.settings, ...(await loadUserJson(env, userDataKey(accountId, "settings"), {})) };
  const schedule = { ...defaultState.schedule, ...(await loadUserJson(env, userDataKey(accountId, "schedule"), {})) };
  const rules = await loadUserJson(env, userDataKey(accountId, "rules"), defaultState.rules);
  const reports = await loadUserJson(env, userDataKey(accountId, "reports"), []);
  const drafts = await loadDrafts(env, accountId);
  const history = generateHistory(posts);

  return {
    ...structuredClone(defaultState),
    sources: {
      ...structuredClone(defaultState.sources),
      linkedin: {
        connected: Boolean(token?.accessToken),
        selectedOrganization,
        selectedOrganizationName: linkedinOrganizationName(selectedOrganization, organizationLabels),
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
    drafts,
    linkedin: {
      organizations: linkedinOrganizationDisplayNames(organizations, organizationLabels),
      organizationOptions: linkedinOrganizationOptions(organizations, organizationLabels, selectedOrganization),
      selectedOrganization,
      selectedOrganizationName: linkedinOrganizationName(selectedOrganization, organizationLabels),
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
  const emailSent = await sendWelcomeEmail(env, account, `${env.PAGES_URL || new URL(request.url).origin}/dashboard/onboarding`);
  return { ...authPayload(account, await createSession(env, account)), emailSent };
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
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const html = `
      <p>Hi ${escapeHtml(account.name)},</p>
      <p>Use the secure link below to reset your Metrillix password.</p>
      <p><a href="${escapeHtml(resetUrl)}">Reset your password</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `;
    const text = `Hi ${account.name},\n\nUse this secure link to reset your Metrillix password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`;
    return sendResendEmail(env, {
      to: account.email,
      subject: "Reset your Metrillix password",
      html,
      text,
      idempotencyKey: `password-reset:${account.id}:${resetUrl}`
    });
  }

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

async function sendWelcomeEmail(env, account, appUrl) {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    const html = `
      <p>Hi ${escapeHtml(account.name)},</p>
      <p>Welcome to Metrillix. Your workspace is ready for LinkedIn company page analytics.</p>
      <p><a href="${escapeHtml(appUrl)}">Connect LinkedIn</a></p>
      <p>You can disconnect and reconnect LinkedIn any time from your dashboard.</p>
    `;
    const text = `Hi ${account.name},\n\nWelcome to Metrillix. Your workspace is ready for LinkedIn company page analytics.\n\nConnect LinkedIn: ${appUrl}\n\nYou can disconnect and reconnect LinkedIn any time from your dashboard.`;
    return sendResendEmail(env, {
      to: account.email,
      subject: "Welcome to Metrillix",
      html,
      text,
      idempotencyKey: `signup-welcome:${account.id}`
    });
  }

  const webhookUrl = env.SIGNUP_WELCOME_WEBHOOK_URL || env.WELCOME_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) return false;
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.SIGNUP_WELCOME_WEBHOOK_SECRET ? { authorization: `Bearer ${env.SIGNUP_WELCOME_WEBHOOK_SECRET}` } : {})
      },
      body: JSON.stringify({
        type: "signup_welcome",
        to: account.email,
        name: account.name,
        subject: "Welcome to Metrillix",
        appUrl
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sendResendEmail(env, message) {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": message.idempotencyKey
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {})
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
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
    <title>Metrillix LinkedIn setup required</title>
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
      <p>Metrillix</p>
      <h1>LinkedIn setup required</h1>
      <p>LinkedIn connection setup is not complete yet. Missing setting: <code>${missingName}</code>.</p>
      <p>This is an app-level LinkedIn setting for Metrillix. It is not a personal LinkedIn token.</p>
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
      const existingLabels = await loadUserJson(env, userLinkedInKey(oauthState.accountId, "organizationLabels"), {});
      const linkedInNames = await fetchLinkedInOrganizationNames(token.access_token, organizations, env);
      const organizationLabels = linkedinOrganizationLabels(organizations, existingLabels, linkedInNames);
      const previousOrganization = linkedinOrganizationUrn(await loadUserJson(env, userLinkedInKey(oauthState.accountId, "organization"), null));
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
      await saveUserJson(env, userLinkedInKey(oauthState.accountId, "organizationLabels"), organizationLabels);
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
  const selectedOrganization = env.LINKEDIN_DEMO_MODE === "true" ? "urn:li:organization:demo" : await loadUserJson(env, userLinkedInKey(accountId, "organization"), null);
  const orgUrn = linkedinOrganizationUrn(selectedOrganization);
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
  const normalized = normalizeLinkedInPosts(rawPosts, rawMetrics, orgUrn);
  const diagnostics = linkedinSyncDiagnostics(rawPosts, normalized, rawMetrics);

  const existingPosts = await loadUserJson(env, userLinkedInKey(accountId, "posts"), []);
  const posts = mergePosts(existingPosts.filter((post) => !linkedInPostBelongsToOrganization(post, orgUrn)), normalized);
  const selectedPosts = selectedOrganizationPosts(posts, orgUrn);
  const history = generateHistory(selectedPosts);
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
  return { source, fetched: rawPosts.length, saved: normalized.length, diagnostics, posts: selectedPosts };
}

async function syncConnector(source, options, env, accountId) {
  const attemptedAt = new Date().toISOString();
  try {
    const result = await ingestSource(source, options, env, accountId);
    if (source === "linkedin") {
      const sync = await loadUserJson(env, userLinkedInKey(accountId, "sync"), {});
      await saveUserJson(env, userLinkedInKey(accountId, "sync"), {
        ...sync,
        status: "success",
        lastAttemptedAt: attemptedAt,
        lastError: null
      });
    }
    return result;
  } catch (error) {
    if (source === "linkedin") {
      await saveLinkedInSyncFailure(env, accountId, error, attemptedAt);
    }
    return {
      source,
      error: true,
      statusCode: error.status || 500,
      message: publicErrorMessage(error, "LinkedIn sync failed")
    };
  }
}

async function saveLinkedInSyncFailure(env, accountId, error, attemptedAt) {
  const existing = await loadUserJson(env, userLinkedInKey(accountId, "sync"), {});
  await saveUserJson(env, userLinkedInKey(accountId, "sync"), {
    ...existing,
    status: "failed",
    lastAttemptedAt: attemptedAt,
    lastError: publicErrorMessage(error, "LinkedIn sync failed")
  });
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

async function fetchLinkedInOrganizationNames(accessToken, organizations, env) {
  const entries = [];
  for (const organization of organizations) {
    const urn = linkedinOrganizationUrn(organization);
    const name = await fetchLinkedInOrganizationName(accessToken, urn, env).catch(() => "");
    if (urn && name) entries.push([urn, name]);
  }
  return Object.fromEntries(entries);
}

async function fetchLinkedInOrganizationName(accessToken, organizationUrn, env) {
  const id = linkedinOrganizationId(organizationUrn);
  if (!id) return "";
  const response = await fetch(`https://api.linkedin.com/rest/organizations/${encodeURIComponent(id)}`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "linkedin-version": env.LINKEDIN_VERSION || "202605",
      "x-restli-protocol-version": "2.0.0"
    }
  });
  const payload = await response.json();
  if (!response.ok) throw httpError(payload.message || `LinkedIn Organization Lookup failed for ${organizationUrn}`, response.status);
  return String(payload.localizedName || payload.name?.localized?.en_US || payload.vanityName || "").trim();
}

function linkedInMarketingVersion(env) {
  return env.LINKEDIN_VERSION || "202605";
}

function linkedInAdLibraryVersion(env) {
  return env.LINKEDIN_AD_LIBRARY_VERSION || linkedInMarketingVersion(env);
}

const linkedinAdLibraryService = {
  async fetchTrendingAds({ accessToken, keyword, countries = [], count = 6, start = 0, advertiser = "", dateRange = null, env }) {
    if (!accessToken) throw httpError("Reconnect LinkedIn", 401);
    const cleanKeyword = String(keyword || "").trim();
    const cleanCountries = countries.map(normalizeAdLibraryCountry).filter(Boolean).slice(0, 8);
    const safeCount = Math.min(Math.max(Number(count) || 6, 1), 24);
    const safeStart = Math.max(Number(start) || 0, 0);
    const buildUrl = (includeCountries = true) => {
      const url = new URL("https://api.linkedin.com/rest/adLibrary");
      url.searchParams.set("q", "criteria");
      if (cleanKeyword) url.searchParams.set("keyword", cleanKeyword);
      if (advertiser) url.searchParams.set("advertiser", String(advertiser).trim());
      if (dateRange?.start) url.searchParams.set("dateRange.start", String(dateRange.start));
      if (dateRange?.end) url.searchParams.set("dateRange.end", String(dateRange.end));
      url.searchParams.set("start", String(safeStart));
      url.searchParams.set("count", String(safeCount));
      return includeCountries && cleanCountries.length ? withRawRestliQuery(url, "countries", restliList(cleanCountries)) : url;
    };
    const headers = {
      authorization: `Bearer ${accessToken}`,
      "x-restli-protocol-version": "2.0.0",
      "linkedin-version": linkedInAdLibraryVersion(env)
    };
    const fetchAds = async (includeCountries = true) => {
      const response = await fetch(buildUrl(includeCountries), { headers });
      const payload = await response.json();
      return { response, payload };
    };

    let { response, payload } = await fetchAds(true);
    if (response.status === 400 && cleanCountries.length && isLinkedInParamValidationError(payload)) {
      ({ response, payload } = await fetchAds(false));
    }
    if (response.status === 401) throw httpError("Reconnect LinkedIn", 401);
    if (response.status === 403) throw httpError("Ad Library access unavailable", 403);
    if (!response.ok) throw httpError(adLibraryErrorMessage(payload), response.status);
    return {
      paging: payload.paging || { start: safeStart, count: safeCount, total: 0 },
      ads: (payload.elements || []).map(cleanLinkedInAdLibraryElement)
    };
  }
};

function isLinkedInParamValidationError(payload) {
  return /param validation|input validation/i.test(String(payload?.message || ""));
}

function adLibraryErrorMessage(payload) {
  if (isLinkedInParamValidationError(payload)) return "LinkedIn rejected these filters. Try a keyword-only search.";
  return payload?.message || "LinkedIn Ad Library request failed";
}

async function fetchAdLibraryInspiration(request, env, accountId) {
  const requestUrl = new URL(request.url);
  const token = await loadUserJson(env, userLinkedInKey(accountId, "token"), null);
  const countries = (requestUrl.searchParams.get("countries") || "").split(",");
  const dateRange = {
    start: requestUrl.searchParams.get("dateRange.start"),
    end: requestUrl.searchParams.get("dateRange.end")
  };
  const result = await linkedinAdLibraryService.fetchTrendingAds({
    accessToken: token?.accessToken,
    keyword: requestUrl.searchParams.get("keyword") || "marketing automation",
    advertiser: requestUrl.searchParams.get("advertiser") || "",
    countries,
    count: requestUrl.searchParams.get("count") || 6,
    start: requestUrl.searchParams.get("start") || 0,
    dateRange,
    env
  });
  return {
    keyword: requestUrl.searchParams.get("keyword") || "marketing automation",
    countries: countries.map(normalizeAdLibraryCountry).filter(Boolean),
    ...result
  };
}

function normalizeAdLibraryCountry(country) {
  const value = String(country || "").trim();
  if (!value) return "";
  const aliases = {
    "SRI LANKA": "LK",
    SRILANKA: "LK",
    CEYLON: "LK",
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    USA: "US",
    AMERICA: "US",
    "UNITED KINGDOM": "GB",
    UK: "GB",
    "GREAT BRITAIN": "GB",
    ENGLAND: "GB"
  };
  const normalized = value.toUpperCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (aliases[normalized]) return aliases[normalized];
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "";
}

function cleanLinkedInAdLibraryElement(element) {
  const details = element.details || {};
  const advertiser = details.advertiser || {};
  const statistics = details.statistics || {};
  const content = details.content || details.creative || element.content || {};
  const headline = firstString(content.title, content.headline, content.name, details.headline, element.headline);
  const description = firstString(content.text, content.commentary, content.description, content.body, details.text, element.text);
  const imageUrl = firstString(
    content.imageUrl,
    content.image?.url,
    content.thumbnailUrl,
    content.thumbnail?.url,
    details.imageUrl,
    element.imageUrl
  );
  return {
    adUrl: element.adUrl || "",
    adType: details.adType || "Sponsored update",
    advertiserName: firstString(advertiser.localizedName, advertiser.name, advertiser.name?.localized?.en_US, advertiser.vanityName, advertiser.id, "LinkedIn advertiser"),
    headline,
    description,
    publicText: adLibraryPublicText(element, [headline, description]),
    imageUrl,
    impressionsFrom: numberOrNull(statistics.impressionsFrom),
    impressionsTo: numberOrNull(statistics.impressionsTo),
    firstImpressionDate: linkedInDateOrNull(statistics.firstImpressionDate),
    latestImpressionDate: linkedInDateOrNull(statistics.latestImpressionDate),
    isRestricted: Boolean(element.isRestricted)
  };
}

function adLibraryPublicText(element, preferred = []) {
  const labels = new Set([
    "body",
    "commentary",
    "copy",
    "description",
    "headline",
    "introductoryText",
    "message",
    "name",
    "primaryText",
    "subtitle",
    "text",
    "title"
  ]);
  const blocked = new Set([
    "adUrl",
    "clickUrl",
    "createdAt",
    "firstImpressionDate",
    "id",
    "imageUrl",
    "impressionsFrom",
    "impressionsTo",
    "latestImpressionDate",
    "thumbnailUrl",
    "url",
    "urn",
    "vanityName"
  ]);
  const values = [];
  const visit = (value, key = "", depth = 0) => {
    if (depth > 8 || value === null || value === undefined) return;
    if (typeof value === "string") {
      const clean = value.trim();
      if (clean && labels.has(key) && !/^https?:\/\//i.test(clean) && !/^urn:/i.test(clean)) values.push(clean);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key, depth + 1));
      return;
    }
    if (typeof value === "object") {
      Object.entries(value).forEach(([childKey, childValue]) => {
        if (!blocked.has(childKey)) visit(childValue, childKey, depth + 1);
      });
    }
  };
  visit(element);
  return Array.from(new Set([...preferred, ...values].map((value) => String(value || "").trim()).filter(Boolean))).join(" ");
}

async function fetchLinkedInPosts(accessToken, organizationUrn, options = {}) {
  if (!organizationUrn) throw new Error("Missing LinkedIn organization URN");
  const url = new URL("https://api.linkedin.com/v2/ugcPosts");
  url.searchParams.set("q", "authors");
  url.searchParams.set("sortBy", "LAST_MODIFIED");
  url.searchParams.set("count", String(options.count || 25));
  const response = await fetch(withRawRestliQuery(url, "authors", restliList([organizationUrn])), { headers: { authorization: `Bearer ${accessToken}`, "x-restli-protocol-version": "2.0.0" } });
  const payload = await response.json();
  if (!response.ok) throw httpError(payload.message || "LinkedIn UGC Posts API request failed", response.status);
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
  if (!response.ok) throw httpError(payload.message || `LinkedIn Social Actions API failed for ${postId}`, response.status);
  return payload;
}

async function fetchOrganizationAnalytics(accessToken, organizationUrn, postId) {
  if (!organizationUrn) throw new Error("Missing LinkedIn organization URN");
  const url = new URL("https://api.linkedin.com/v2/organizationalEntityShareStatistics");
  url.searchParams.set("q", "organizationalEntity");
  url.searchParams.set("organizationalEntity", organizationUrn);
  const response = await fetch(withRawRestliQuery(url, "shares", restliList([postId])), { headers: { authorization: `Bearer ${accessToken}`, "x-restli-protocol-version": "2.0.0" } });
  const payload = await response.json();
  if (!response.ok) throw httpError(payload.message || `LinkedIn Analytics API failed for ${postId}`, response.status);
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

async function disconnectConnector(source, env, accountId) {
  if (source !== "linkedin") {
    const error = new Error(`${connectors[source]?.name || source} disconnect is not implemented yet`);
    error.status = connectors[source] ? 501 : 404;
    throw error;
  }
  const keys = ["token", "profile", "organizations", "organization", "organizationLabels", "posts", "analytics", "sync"];
  await Promise.all(keys.map((key) => env.USER_STATE?.delete(userLinkedInKey(accountId, key))));
  return {
    source,
    connected: false,
    cleared: keys,
    state: await userStatePayload(env, accountId)
  };
}

async function linkedinOrganizations(request, env) {
  const account = await requireAccount(request, env);
  const organizations = await loadUserJson(env, userLinkedInKey(account.id, "organizations"), []);
  const organizationLabels = await loadUserJson(env, userLinkedInKey(account.id, "organizationLabels"), {});
  const selectedOrganization = linkedinOrganizationUrn(await loadUserJson(env, userLinkedInKey(account.id, "organization"), null)) || null;
  const token = await loadUserJson(env, userLinkedInKey(account.id, "token"), null);
  return {
    userId: account.id,
    connected: Boolean(token?.accessToken),
    organizations: linkedinOrganizationDisplayNames(organizations, organizationLabels),
    organizationOptions: linkedinOrganizationOptions(organizations, organizationLabels, selectedOrganization),
    selectedOrganization,
    selectedOrganizationName: linkedinOrganizationName(selectedOrganization, organizationLabels)
  };
}

async function selectLinkedInOrganization(request, env) {
  const body = await readJson(request);
  const submittedOrganization = body.organizationUrn;
  const organizationName = String(body.organizationName || "").trim();
  const account = await requireAccount(request, env);
  const organizations = await loadUserJson(env, userLinkedInKey(account.id, "organizations"), []);
  const existingLabels = await loadUserJson(env, userLinkedInKey(account.id, "organizationLabels"), {});
  const fallbackLabels = linkedinOrganizationLabels(organizations, existingLabels);
  const organizationUrn = resolveLinkedInOrganizationUrn(submittedOrganization, organizations, fallbackLabels);
  const organizationUrns = organizations.map(linkedinOrganizationUrn);
  if (!organizationUrns.includes(organizationUrn)) {
    const error = new Error("Organization is not available for this LinkedIn user");
    error.status = 400;
    throw error;
  }

  const organizationLabels = {
    ...fallbackLabels,
    [organizationUrn]: organizationName || linkedinOrganizationName(organizationUrn, existingLabels)
  };
  await saveUserJson(env, userLinkedInKey(account.id, "organizationLabels"), organizationLabels);
  await saveUserJson(env, userLinkedInKey(account.id, "organization"), organizationUrn);
  return {
    userId: account.id,
    organizations: linkedinOrganizationDisplayNames(organizations, organizationLabels),
    organizationOptions: linkedinOrganizationOptions(organizations, organizationLabels, organizationUrn),
    selectedOrganization: organizationUrn,
    selectedOrganizationName: linkedinOrganizationName(organizationUrn, organizationLabels)
  };
}

async function updateLinkedInOrganizationName(request, env) {
  const body = await readJson(request);
  const submittedOrganization = body.organizationUrn;
  const organizationName = String(body.organizationName || "").trim();
  const account = await requireAccount(request, env);
  const organizations = await loadUserJson(env, userLinkedInKey(account.id, "organizations"), []);
  const selectedOrganization = await loadUserJson(env, userLinkedInKey(account.id, "organization"), null);
  const existingLabels = await loadUserJson(env, userLinkedInKey(account.id, "organizationLabels"), {});
  const fallbackLabels = linkedinOrganizationLabels(organizations, existingLabels);
  const organizationUrn = resolveLinkedInOrganizationUrn(submittedOrganization, organizations, fallbackLabels);
  const organizationUrns = organizations.map(linkedinOrganizationUrn);
  if (!organizationUrns.includes(organizationUrn)) {
    const error = new Error("Organization is not available for this LinkedIn user");
    error.status = 400;
    throw error;
  }
  if (!organizationName) {
    const error = new Error("Page name is required");
    error.status = 400;
    throw error;
  }

  const organizationLabels = {
    ...fallbackLabels,
    [organizationUrn]: organizationName
  };
  await saveUserJson(env, userLinkedInKey(account.id, "organizationLabels"), organizationLabels);
  return {
    userId: account.id,
    organizations: linkedinOrganizationDisplayNames(organizations, organizationLabels),
    organizationOptions: linkedinOrganizationOptions(organizations, organizationLabels, selectedOrganization),
    selectedOrganization,
    selectedOrganizationName: linkedinOrganizationName(selectedOrganization, organizationLabels)
  };
}

function linkedinOrganizationUrn(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    return String(value.organizationUrn || value.organization || value.urn || value.id || "").trim();
  }
  return String(value).trim();
}

function linkedinOrganizationLabels(organizations, existingLabels = {}, linkedInNames = {}) {
  return Object.fromEntries(organizations.map((organization) => {
    const urn = linkedinOrganizationUrn(organization);
    const fallback = linkedinDefaultOrganizationName(urn);
    const existing = String(existingLabels[urn] || "").trim();
    const linkedInName = String(linkedInNames[urn] || "").trim();
    const name = existing && existing !== fallback ? existing : linkedInName || existing || fallback;
    return [urn, name];
  }).filter(([urn]) => urn));
}

function linkedinOrganizationOptions(organizations, labels = {}, selectedOrganization = null) {
  return organizations.map((organization) => {
    const urn = linkedinOrganizationUrn(organization);
    return {
      urn,
      name: linkedinOrganizationName(urn, labels),
      selected: urn === selectedOrganization
    };
  }).filter((organization) => organization.urn);
}

function linkedinOrganizationDisplayNames(organizations, labels = {}) {
  return linkedinOrganizationOptions(organizations, labels).map((organization) => organization.name);
}

function linkedinOrganizationName(organizationUrn, labels = {}) {
  const urn = linkedinOrganizationUrn(organizationUrn);
  return String(labels[urn] || linkedinDefaultOrganizationName(urn)).trim();
}

function resolveLinkedInOrganizationUrn(value, organizations, labels = {}) {
  const raw = typeof value === "string" ? value.trim() : linkedinOrganizationUrn(value);
  if (raw.startsWith("urn:li:organization:")) return raw;
  const options = linkedinOrganizationOptions(organizations, labels);
  return options.find((organization) => organization.name === raw)?.urn || raw;
}

function linkedinDefaultOrganizationName(organizationUrn) {
  const id = String(organizationUrn || "").split(":").pop();
  return id ? `LinkedIn page ${id}` : "LinkedIn page";
}

function linkedinOrganizationId(organizationUrn) {
  const urn = linkedinOrganizationUrn(organizationUrn);
  return urn.startsWith("urn:li:organization:") ? urn.split(":").pop() : "";
}

function restliList(values) {
  return `List(${values.map((value) => encodeURIComponent(String(value))).join(",")})`;
}

function withRawRestliQuery(url, key, value) {
  const href = url.toString();
  return `${href}${href.includes("?") ? "&" : "?"}${key}=${value}`;
}

function normalizeLinkedInPosts(rawPosts, rawMetrics = {}, organizationUrn = "") {
  return rawPosts.map((post) => {
    const postId = String(post.id || post.urn || post.activity || "");
    const metrics = rawMetrics[postId] || {};
    const text = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || post.text || "";
    const author = String(post.author || organizationUrn || "");
    return {
      source: "linkedin",
      post_id: postId,
      author_id: author,
      organization_urn: organizationUrn || author,
      published_at: linkedInDate(post.created?.time || post.published_at),
      url: post.permalink || post.url || `https://www.linkedin.com/feed/update/${postId}`,
      text,
      media_type: inferLinkedInMediaType(post),
      thumbnail_url: linkedInThumbnailUrl(post),
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

function linkedInThumbnailUrl(post) {
  const media = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.media || [];
  for (const item of media) {
    const candidate = [
      item.originalUrl,
      item.url,
      item.thumbnail,
      item.thumbnailUrl,
      item.thumbnails?.[0]?.url,
      item.thumbnails?.[0]?.resolvedUrl,
      item.image?.downloadUrl,
      item.image?.downloadUrlExpiresAt ? item.image?.downloadUrl : "",
      item.media?.downloadUrl,
      item.media?.originalUrl
    ].find(Boolean);
    if (candidate && /^https?:\/\//i.test(String(candidate))) return String(candidate);
  }
  return "";
}

function linkedInDate(value) {
  if (!value) return new Date().toISOString();
  if (Number.isFinite(Number(value))) return new Date(Number(value)).toISOString();
  return new Date(value).toISOString();
}

function linkedInDateOrNull(value) {
  if (!value) return null;
  const date = Number.isFinite(Number(value)) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

function selectedOrganizationPosts(posts, selectedOrganization) {
  if (!selectedOrganization) return [];
  return (posts || []).filter((post) => linkedInPostBelongsToOrganization(post, selectedOrganization));
}

function linkedInPostBelongsToOrganization(post, selectedOrganization) {
  const organizationUrn = linkedinOrganizationUrn(selectedOrganization);
  if (!organizationUrn) return false;
  return [
    post.organization_urn,
    post.organizationUrn,
    post.author_id,
    post.authorId,
    post.author,
    post.platform_raw?.post?.author
  ].map(linkedinOrganizationUrn).includes(organizationUrn);
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

async function dashboardPayload(section, request, env, account) {
  const state = await buildUserState(env, account.id);
  const fullAccount = await loadAccountById(env, account.id);
  const plan = dashboardPlan(fullAccount, state.settings || {});
  const filters = dashboardFilters(new URL(request.url).searchParams, plan);
  const allPosts = state.posts || [];
  const posts = filterDashboardPosts(allPosts, filters);
  const previousPosts = previousPeriodPosts(allPosts, filters);
  const context = { state, account: fullAccount || account, plan, filters, posts, previousPosts };

  if (section === "summary") return dashboardSummary(context);
  if (section === "timeseries") return { filters, plan, timeseries: dashboardTimeseries(posts) };
  if (section === "top-posts") return dashboardTopPosts(context);
  if (section === "media-performance") return { filters, plan, mediaPerformance: dashboardMediaPerformance(posts), postingDays: bestPostingDays(posts), postingHours: bestPostingHours(posts) };
  if (section === "hashtag-performance") return { filters, plan, hashtagPerformance: dashboardHashtagPerformance(posts) };
  if (section === "insights") return { filters, plan, insights: dashboardInsights(context) };
  return { filters, plan };
}

async function loadAccountById(env, accountId) {
  const lookup = await loadUserJson(env, `auth:id:${accountId}`, null);
  if (!lookup?.email) return null;
  const raw = await env.USER_STATE?.get(authAccountKey(lookup.email));
  return raw ? JSON.parse(raw) : null;
}

function dashboardPlan(account, settings = {}) {
  const name = String(settings.plan || account?.plan || "trial").toLowerCase();
  const createdAt = account?.createdAt || new Date().toISOString();
  const ageDays = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
  const trialDaysRemaining = Math.max(0, 30 - ageDays);
  const trialActive = name === "trial" && trialDaysRemaining > 0;
  const planName = trialActive ? "trial" : name;
  const rangeLimitDays = planName === "agency" || planName === "pro" || trialActive ? 365 : 30;
  return {
    name: planName,
    label: planName === "agency" ? "Agency" : planName === "pro" ? "Pro" : planName === "basic" ? "Basic" : "Free trial",
    trialActive,
    trialDaysRemaining,
    rangeLimitDays,
    features: {
      insights: trialActive || planName === "pro" || planName === "agency",
      reports: trialActive || planName === "pro" || planName === "agency",
      multiProfile: planName === "agency"
    }
  };
}

function dashboardFilters(params, plan) {
  const requestedRange = String(params.get("range") || "30").toLowerCase();
  const now = new Date();
  let to = validDate(params.get("to")) || now;
  let from;
  if (requestedRange === "custom") {
    from = validDate(params.get("from")) || daysAgo(to, Math.min(30, plan.rangeLimitDays));
  } else {
    const requestedDays = Number(requestedRange || 30);
    const days = Number.isFinite(requestedDays) ? requestedDays : 30;
    from = daysAgo(to, Math.min(days, plan.rangeLimitDays));
  }
  const maxFrom = daysAgo(to, plan.rangeLimitDays);
  if (from < maxFrom) from = maxFrom;
  return {
    range: requestedRange,
    from: startOfDay(from),
    to: endOfDay(to),
    mediaType: String(params.get("mediaType") || "all").toLowerCase(),
    sortBy: String(params.get("sortBy") || "date").toLowerCase(),
    limitedByPlan: requestedRange === "custom" ? from.getTime() === maxFrom.getTime() : Number(requestedRange) > plan.rangeLimitDays
  };
}

function filterDashboardPosts(posts, filters) {
  return (posts || []).filter((post) => {
    const date = postDate(post);
    if (!date || date < filters.from || date > filters.to) return false;
    if (filters.mediaType !== "all" && postMediaType(post) !== filters.mediaType) return false;
    return true;
  }).sort((a, b) => sortDashboardPosts(a, b, filters.sortBy));
}

function previousPeriodPosts(posts, filters) {
  const lengthMs = filters.to.getTime() - filters.from.getTime();
  const previousTo = new Date(filters.from.getTime() - 1);
  const previousFrom = new Date(previousTo.getTime() - lengthMs);
  return (posts || []).filter((post) => {
    const date = postDate(post);
    if (!date || date < previousFrom || date > previousTo) return false;
    if (filters.mediaType !== "all" && postMediaType(post) !== filters.mediaType) return false;
    return true;
  });
}

function dashboardSummary({ posts, previousPosts, filters, plan, state }) {
  const totals = postTotals(posts);
  const previous = postTotals(previousPosts);
  const bestPost = [...posts].sort((a, b) => postScore(b) - postScore(a))[0] || null;
  return {
    filters,
    plan,
    connected: Boolean(state.linkedin?.connected),
    selectedOrganizationName: state.linkedin?.selectedOrganizationName || "",
    totals: {
      impressions: totals.impressions,
      engagement: totals.engagement,
      engagementRate: totals.impressions ? (totals.engagement / totals.impressions) * 100 : 0,
      posts: posts.length,
      followerGrowth: totals.followerGrowth,
      profileViews: totals.profileViews,
      clicks: totals.clicks,
      clickThroughRate: totals.impressions && totals.clicks ? (totals.clicks / totals.impressions) * 100 : null
    },
    deltas: {
      impressions: percentDelta(totals.impressions, previous.impressions),
      engagement: percentDelta(totals.engagement, previous.engagement),
      engagementRate: percentDelta(totals.impressions ? (totals.engagement / totals.impressions) * 100 : 0, previous.impressions ? (previous.engagement / previous.impressions) * 100 : 0),
      posts: percentDelta(posts.length, previousPosts.length)
    },
    bestPost: bestPost ? dashboardPost(bestPost) : null
  };
}

function dashboardTimeseries(posts) {
  const groups = new Map();
  for (const post of posts) {
    const date = isoDate(postDate(post));
    const row = groups.get(date) || { date, posts: 0, reach: 0, impressions: 0, engagement: 0, engagementRate: 0, clicks: 0 };
    row.posts += 1;
    row.reach += postImpressions(post);
    row.impressions += postImpressions(post);
    row.engagement += postEngagement(post);
    row.clicks += postClicks(post);
    groups.set(date, row);
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date)).map((row) => ({
    ...row,
    engagementRate: row.impressions ? (row.engagement / row.impressions) * 100 : 0
  }));
}

function dashboardTopPosts({ posts, filters, plan }) {
  return {
    filters,
    plan,
    byImpressions: [...posts].sort((a, b) => postImpressions(b) - postImpressions(a)).slice(0, 10).map(dashboardPost),
    byEngagementRate: [...posts].sort((a, b) => postEngagementRate(b) - postEngagementRate(a)).slice(0, 10).map(dashboardPost),
    recent: [...posts].sort((a, b) => (postDate(b)?.getTime() || 0) - (postDate(a)?.getTime() || 0)).slice(0, 25).map(dashboardPost),
    underperforming: [...posts].filter((post) => postImpressions(post) > 0).sort((a, b) => postEngagementRate(a) - postEngagementRate(b)).slice(0, 10).map(dashboardPost)
  };
}

function dashboardMediaPerformance(posts) {
  const groups = new Map();
  for (const post of posts) {
    const type = postMediaType(post);
    const row = groups.get(type) || { mediaType: type, posts: 0, impressions: 0, engagement: 0, clicks: 0, engagementRate: 0, clickThroughRate: null };
    row.posts += 1;
    row.impressions += postImpressions(post);
    row.engagement += postEngagement(post);
    row.clicks += postClicks(post);
    groups.set(type, row);
  }
  return [...groups.values()].map((row) => ({
    ...row,
    engagementRate: row.impressions ? (row.engagement / row.impressions) * 100 : 0,
    clickThroughRate: row.impressions && row.clicks ? (row.clicks / row.impressions) * 100 : null
  })).sort((a, b) => b.engagementRate - a.engagementRate);
}

function bestPostingDays(posts) {
  return groupedPostingPerformance(posts, (date) => date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }));
}

function bestPostingHours(posts) {
  return groupedPostingPerformance(posts, (date) => `${String(date.getUTCHours()).padStart(2, "0")}:00`);
}

function groupedPostingPerformance(posts, keyFn) {
  const groups = new Map();
  for (const post of posts) {
    const date = postDate(post);
    if (!date) continue;
    const key = keyFn(date);
    const row = groups.get(key) || { key, posts: 0, impressions: 0, engagement: 0, engagementRate: 0 };
    row.posts += 1;
    row.impressions += postImpressions(post);
    row.engagement += postEngagement(post);
    groups.set(key, row);
  }
  return [...groups.values()].map((row) => ({
    ...row,
    engagementRate: row.impressions ? (row.engagement / row.impressions) * 100 : 0
  })).sort((a, b) => b.engagementRate - a.engagementRate || b.impressions - a.impressions);
}

function dashboardHashtagPerformance(posts) {
  const groups = new Map();
  for (const post of posts) {
    for (const tag of postHashtags(post)) {
      const row = groups.get(tag) || { hashtag: tag, posts: 0, impressions: 0, engagement: 0, clicks: 0, engagementRate: 0 };
      row.posts += 1;
      row.impressions += postImpressions(post);
      row.engagement += postEngagement(post);
      row.clicks += postClicks(post);
      groups.set(tag, row);
    }
  }
  return [...groups.values()].map((row) => ({
    ...row,
    engagementRate: row.impressions ? (row.engagement / row.impressions) * 100 : 0
  })).sort((a, b) => b.engagement - a.engagement || b.engagementRate - a.engagementRate).slice(0, 30);
}

function dashboardInsights({ posts, previousPosts, plan }) {
  if (!plan.features.insights) {
    return [{ title: "Insights are a Pro feature", detail: "Upgrade to Pro or Agency to unlock written performance insights and reports." }];
  }
  if (!posts.length) {
    return [{ title: "No LinkedIn posts synced yet", detail: "Connect LinkedIn and run sync to generate account-level performance insights." }];
  }
  const insights = [];
  const media = dashboardMediaPerformance(posts);
  const text = media.find((row) => row.mediaType === "text");
  const bestMedia = media[0];
  if (bestMedia && text && bestMedia.mediaType !== "text" && text.engagementRate > 0) {
    insights.push({ title: `${titleCase(bestMedia.mediaType)} posts lead performance`, detail: `Your ${bestMedia.mediaType} posts perform ${Math.round(((bestMedia.engagementRate - text.engagementRate) / text.engagementRate) * 100)}% better than text posts by engagement rate.` });
  } else if (bestMedia) {
    insights.push({ title: `${titleCase(bestMedia.mediaType)} is your strongest format`, detail: `${titleCase(bestMedia.mediaType)} posts have the highest engagement rate in this period.` });
  }
  const days = bestPostingDays(posts);
  const hours = bestPostingHours(posts);
  if (days[0] && hours[0]) insights.push({ title: "Best posting time", detail: `Your best posting time appears to be ${days[0].key} around ${hours[0].key}.` });
  const questionPosts = posts.filter((post) => postTextValue(post).includes("?"));
  const nonQuestionPosts = posts.filter((post) => !postTextValue(post).includes("?"));
  const questionRate = average(questionPosts.map((post) => postComments(post)));
  const nonQuestionRate = average(nonQuestionPosts.map((post) => postComments(post)));
  if (questionPosts.length >= 2 && questionRate > nonQuestionRate) insights.push({ title: "Questions drive comments", detail: "Posts with questions receive higher comments than posts without questions." });
  const currentTotals = postTotals(posts);
  const previousTotals = postTotals(previousPosts);
  const currentRate = currentTotals.impressions ? (currentTotals.engagement / currentTotals.impressions) * 100 : 0;
  const previousRate = previousTotals.impressions ? (previousTotals.engagement / previousTotals.impressions) * 100 : 0;
  if (previousPosts.length) {
    const direction = currentRate >= previousRate ? "improving" : "declining";
    insights.push({ title: `Engagement rate is ${direction}`, detail: `Your engagement rate is ${direction} compared with the previous period.` });
  }
  return insights.slice(0, 6);
}

function postTotals(posts) {
  return (posts || []).reduce((sum, post) => {
    sum.impressions += postImpressions(post);
    sum.engagement += postEngagement(post);
    sum.clicks += postClicks(post);
    sum.profileViews += numberMetric(post.profile_views ?? post.profileViews);
    sum.followerGrowth += numberMetric(post.follower_growth ?? post.followerGrowth);
    return sum;
  }, { impressions: 0, engagement: 0, clicks: 0, profileViews: 0, followerGrowth: 0 });
}

function dashboardPost(post) {
  return {
    postId: post.post_id || post.id || "",
    text: postTextValue(post),
    url: post.url || post.post_url || "",
    createdAt: post.published_at || post.created_at || post.createdAt || "",
    mediaType: postMediaType(post),
    hashtags: postHashtags(post),
    impressions: postImpressions(post),
    engagement: postEngagement(post),
    engagementRate: postEngagementRate(post),
    clicks: postClicks(post),
    comments: postComments(post),
    reactions: postReactions(post),
    shares: postShares(post),
    profileViews: numberMetric(post.profile_views ?? post.profileViews),
    followerGrowth: numberMetric(post.follower_growth ?? post.followerGrowth)
  };
}

function sortDashboardPosts(a, b, sortBy) {
  if (sortBy === "impressions") return postImpressions(b) - postImpressions(a);
  if (sortBy === "engagement") return postEngagement(b) - postEngagement(a);
  if (sortBy === "engagement_rate") return postEngagementRate(b) - postEngagementRate(a);
  if (sortBy === "clicks") return postClicks(b) - postClicks(a);
  return (postDate(b)?.getTime() || 0) - (postDate(a)?.getTime() || 0);
}

function postDate(post) {
  const value = post?.published_at || post?.created_at || post?.createdAt || post?.created;
  const date = value && typeof value === "object" && value.time ? new Date(Number(value.time)) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function postTextValue(post) {
  return String(post?.text || post?.post_text || post?.commentary || post?.title || post?.post_id || "").trim();
}

function postMediaType(post) {
  return String(post?.media_type || post?.mediaType || "text").toLowerCase();
}

function postImpressions(post) {
  return numberMetric(post?.impressions ?? post?.metrics?.impressions ?? post?.reach);
}

function postReactions(post) {
  return numberMetric(post?.reactions ?? post?.likes ?? post?.metrics?.likes);
}

function postComments(post) {
  return numberMetric(post?.comments ?? post?.metrics?.comments);
}

function postShares(post) {
  return numberMetric(post?.reposts ?? post?.shares ?? post?.metrics?.shares);
}

function postClicks(post) {
  return numberMetric(post?.clicks ?? post?.metrics?.clicks);
}

function postEngagement(post) {
  const explicit = numberOrNull(post?.engagements ?? post?.engagement ?? post?.total_engagement ?? post?.metrics?.engagements);
  if (explicit !== null) return explicit;
  return postReactions(post) + postComments(post) + postShares(post) + postClicks(post);
}

function postEngagementRate(post) {
  const explicit = numberOrNull(post?.engagement_rate ?? post?.engagementRate);
  if (explicit !== null) return explicit;
  const impressions = postImpressions(post);
  return impressions ? (postEngagement(post) / impressions) * 100 : 0;
}

function postScore(post) {
  return postEngagement(post) * 2 + postClicks(post) + postImpressions(post) / 100;
}

function postHashtags(post) {
  const raw = post?.hashtags;
  if (Array.isArray(raw)) return raw.map(cleanHashtag).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return raw.split(/[,\s]+/).map(cleanHashtag).filter(Boolean);
  return Array.from(postTextValue(post).matchAll(/#[a-z0-9][a-z0-9_]{1,48}/gi)).map((match) => cleanHashtag(match[0])).filter(Boolean);
}

function cleanHashtag(value) {
  const tag = String(value || "").trim().replace(/^#/, "").toLowerCase();
  return tag ? `#${tag}` : "";
}

function numberMetric(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function percentDelta(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return ((current - previous) / previous) * 100;
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysAgo(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - Math.max(1, Number(days || 1)) + 1);
  return next;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setUTCHours(23, 59, 59, 999);
  return next;
}

function isoDate(date) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function average(values) {
  const numbers = values.filter((value) => Number.isFinite(Number(value)));
  return numbers.length ? numbers.reduce((sum, value) => sum + Number(value), 0) / numbers.length : 0;
}

function titleCase(value) {
  return String(value || "").replace(/(^|\s|-)\w/g, (match) => match.toUpperCase());
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
    normalizedSchema: { post: ["source", "post_id", "author_id", "organization_urn", "published_at", "url", "text", "media_type", "thumbnail_url", "reach", "impressions", "engagements", "likes", "comments", "shares", "saves", "clicks", "conversions", "platform_raw"] }
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

async function loadDrafts(env, accountId) {
  const drafts = await loadUserJson(env, userDataKey(accountId, "drafts"), []);
  return Array.isArray(drafts) ? drafts : [];
}

async function saveDrafts(env, accountId, drafts) {
  await saveUserJson(env, userDataKey(accountId, "drafts"), drafts.slice(0, 100));
}

async function createDraft(request, env, accountId) {
  const body = await readJson(request);
  const now = new Date().toISOString();
  const draft = {
    ...await normalizeDraftPayload(env, accountId, body),
    id: `draft-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    status: "draft",
    createdAt: now,
    updatedAt: now
  };
  const drafts = [draft, ...await loadDrafts(env, accountId)];
  await saveDrafts(env, accountId, drafts);
  return { draft, drafts };
}

async function updateDraft(request, env, accountId, draftId) {
  const body = await readJson(request);
  const drafts = await loadDrafts(env, accountId);
  const index = drafts.findIndex((draft) => draft.id === decodeURIComponent(draftId));
  if (index === -1) throw httpError("Draft not found", 404);
  const existing = drafts[index];
  const updated = {
    ...existing,
    ...await normalizeDraftPayload(env, accountId, body, existing),
    id: existing.id,
    status: "draft",
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  };
  drafts[index] = updated;
  await saveDrafts(env, accountId, drafts);
  return { draft: updated, drafts };
}

async function deleteDraft(env, accountId, draftId) {
  const drafts = await loadDrafts(env, accountId);
  const nextDrafts = drafts.filter((draft) => draft.id !== decodeURIComponent(draftId));
  await saveDrafts(env, accountId, nextDrafts);
  return { drafts: nextDrafts };
}

async function publishDraft(env, accountId, draftId) {
  const drafts = await loadDrafts(env, accountId);
  const index = drafts.findIndex((draft) => draft.id === decodeURIComponent(draftId));
  if (index === -1) throw httpError("Draft not found", 404);
  const published = await publishLinkedInDraft(env, accountId, drafts[index]);
  const updated = {
    ...drafts[index],
    status: "published",
    publishedAt: new Date().toISOString(),
    linkedinPostUrn: published.postUrn,
    linkedinPostUrl: published.postUrl
  };
  drafts[index] = updated;
  await saveDrafts(env, accountId, drafts);
  return { draft: updated, drafts, published };
}

async function publishLinkedInPayload(request, env, accountId) {
  const body = await readJson(request);
  const draft = await normalizeDraftPayload(env, accountId, body);
  const published = await publishLinkedInDraft(env, accountId, draft);
  return { published };
}

async function normalizeDraftPayload(env, accountId, body, existing = {}) {
  const topic = cleanText(body.topic, 240);
  const bodyText = cleanText(body.body, 5000);
  if (!topic && !bodyText) throw httpError("Add a post idea or draft before saving", 400);

  const selectedOrganization = linkedinOrganizationUrn(await loadUserJson(env, userLinkedInKey(accountId, "organization"), null)) || "";
  const organizationLabels = await loadUserJson(env, userLinkedInKey(accountId, "organizationLabels"), {});
  const organizationUrn = linkedinOrganizationUrn(body.organizationUrn) || selectedOrganization;
  const organizationName = cleanText(body.organizationName, 120) || linkedinOrganizationName(organizationUrn, organizationLabels) || "LinkedIn page";
  const title = cleanText(body.title, 120) || draftTitle(topic, bodyText);
  const figure = normalizeDraftFigure(body.figure, existing.figure);

  return {
    title,
    topic,
    body: bodyText,
    organizationUrn,
    organizationName,
    figure
  };
}

function draftTitle(topic, bodyText) {
  const source = topic || bodyText || "Untitled draft";
  return source.length > 70 ? `${source.slice(0, 67).trim()}...` : source;
}

function cleanText(value, limit) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
}

function normalizeDraftFigure(figure, existingFigure = null) {
  if (figure === null) return null;
  if (figure === undefined) return existingFigure || null;
  if (!figure || typeof figure !== "object") return null;
  const dataUrl = String(figure.dataUrl || "");
  if (!dataUrl) return null;
  if (!dataUrl.startsWith("data:image/")) throw httpError("Only image figures can be saved", 400);
  if (dataUrl.length > 1600000) throw httpError("Figure is too large. Use an image under about 1 MB.", 413);
  return {
    name: cleanText(figure.name, 160) || "figure",
    type: cleanText(figure.type, 80) || "image",
    size: Number(figure.size || 0),
    dataUrl
  };
}

async function publishLinkedInDraft(env, accountId, draft) {
  const token = await loadUserJson(env, userLinkedInKey(accountId, "token"), null);
  if (!token?.accessToken) throw httpError("Reconnect LinkedIn before publishing", 401);
  const selectedOrganization = linkedinOrganizationUrn(await loadUserJson(env, userLinkedInKey(accountId, "organization"), null)) || "";
  const organizationUrn = linkedinOrganizationUrn(draft.organizationUrn) || selectedOrganization;
  if (!organizationUrn) throw httpError("Select a LinkedIn page before publishing", 400);
  const commentary = cleanLinkedInCommentary(draft.body || draft.topic || "");
  if (!commentary) throw httpError("Add draft text before publishing", 400);

  const media = draft.figure?.dataUrl
    ? [await uploadLinkedInImage(token.accessToken, organizationUrn, draft.figure, env)]
    : [];
  const payload = {
    author: organizationUrn,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: []
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false
  };
  if (media.length) payload.content = { media };

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedInWriteHeaders(token.accessToken, env),
    body: JSON.stringify(payload)
  });
  const responseText = await response.text();
  const responsePayload = parseMaybeJson(responseText);
  if (response.status === 401) throw httpError("Reconnect LinkedIn before publishing", 401);
  if (response.status === 403) throw httpError("LinkedIn publishing unavailable. Reconnect LinkedIn and confirm the selected page allows organization posting.", 403);
  if (!response.ok) throw httpError(responsePayload?.message || responseText || "LinkedIn publish failed", response.status);
  const postUrn = response.headers.get("x-restli-id") || responsePayload?.id || "";
  return {
    postUrn,
    postUrl: postUrn ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}` : "",
    raw: responsePayload || {}
  };
}

async function uploadLinkedInImage(accessToken, ownerUrn, figure, env) {
  const initializeResponse = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: linkedInWriteHeaders(accessToken, env),
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } })
  });
  const initializePayload = await initializeResponse.json().catch(() => ({}));
  if (initializeResponse.status === 401) throw httpError("Reconnect LinkedIn before publishing", 401);
  if (initializeResponse.status === 403) throw httpError("LinkedIn image publishing unavailable. Reconnect LinkedIn with page posting permission.", 403);
  if (!initializeResponse.ok) throw httpError(initializePayload.message || "LinkedIn image upload could not be initialized", initializeResponse.status);
  const value = initializePayload.value || initializePayload;
  const uploadUrl = value.uploadUrl || value.uploadUrlExpiresAt && value.uploadUrl;
  const imageUrn = value.image || value.asset;
  if (!uploadUrl || !imageUrn) throw httpError("LinkedIn image upload response was incomplete", 502);

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": figure.type || "image/png" },
    body: dataUrlBytes(figure.dataUrl)
  });
  if (!uploadResponse.ok) throw httpError("LinkedIn image upload failed", uploadResponse.status);
  return {
    id: imageUrn,
    title: figure.name || "Draft figure"
  };
}

function linkedInWriteHeaders(accessToken, env) {
  return {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    "linkedin-version": linkedInMarketingVersion(env),
    "x-restli-protocol-version": "2.0.0"
  };
}

function cleanLinkedInCommentary(value) {
  return String(value || "").trim().slice(0, 3000);
}

function parseMaybeJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function dataUrlBytes(dataUrl) {
  const match = String(dataUrl || "").match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw httpError("Attached figure is not a valid image", 400);
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
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

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function publicErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  const message = String(error?.message || "").trim();
  const lower = message.toLowerCase();
  const status = Number(error?.status || 0);

  if (!message) return fallback;
  if (status === 401 || /oauth token missing|reconnect linkedin|unauthorized|token.*expired|invalid token/.test(lower)) {
    return "Please reconnect LinkedIn, then try again.";
  }
  if (status === 403 || /forbidden|permission|access denied|not enough permissions|scope/.test(lower)) {
    return "This LinkedIn page does not allow that action yet. Reconnect LinkedIn and confirm the selected page has the right permissions.";
  }
  if (/field value validation failed|param validation|data processing exception|restli|ugc posts api|social actions api|analytics api|organization lookup|linkedin .*api/.test(lower)) {
    return "LinkedIn could not complete this request. Reconnect LinkedIn or choose another company page, then try again.";
  }
  if (/api route not found|worker error|internal error|server error/.test(lower)) {
    return fallback;
  }
  return message;
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

function authJson(payload, request, env, status = 200, options = {}) {
  const response = json(payload, env, status);
  const headers = new Headers(response.headers);
  headers.append("set-cookie", options.clear ? sessionCookie("", request, 0) : sessionCookie(payload.token, request, 1000 * 60 * 60 * 24 * 14));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function sessionCookie(token, request, maxAgeMs) {
  const hostname = new URL(request.url).hostname;
  const domain = hostname === "metrillix.com" || hostname.endsWith(".metrillix.com") ? "; Domain=.metrillix.com" : "";
  const maxAge = Math.floor(maxAgeMs / 1000);
  return `metrillix_session=${encodeURIComponent(token || "")}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax${domain}`;
}

function cors(response, env) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", env.CORS_ORIGIN || "*");
  headers.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization");
  headers.set("access-control-allow-credentials", "true");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
