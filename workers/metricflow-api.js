const STORE_KEY = "metricflow:state";

const connectors = {
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    color: "#0a66c2",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["r_liteprofile", "r_organization_social", "rw_organization_admin"]
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
      if (route === "GET /api/state") return json(statePayload(await loadState(env)), env);
      if (route === "GET /api/connectors") return json({ connectors: connectorStatus(await loadState(env), env, url) }, env);
      if (route === "GET /api/posts") return json({ posts: filterPosts((await loadState(env)).posts || [], url.searchParams) }, env);
      if (route === "GET /api/reports") return json({ reports: (await loadState(env)).reports || [] }, env);
      if (route === "GET /api/export.csv") return csv(await loadState(env), env);

      const oauthAuthorize = url.pathname.match(/^\/oauth\/([^/]+)\/authorize$/);
      if (request.method === "GET" && oauthAuthorize) return authorize(oauthAuthorize[1], request, env);

      const oauthCallback = url.pathname.match(/^\/oauth\/([^/]+)\/callback$/);
      if (request.method === "GET" && oauthCallback) return callback(oauthCallback[1], request, env);

      const ingest = url.pathname.match(/^\/api\/ingest\/([^/]+)$/);
      if (request.method === "POST" && ingest) return json(await ingestSource(ingest[1], await readJson(request), env), env);

      const connectorSync = url.pathname.match(/^\/api\/connectors\/([^/]+)\/sync$/);
      if (request.method === "POST" && connectorSync) {
        const result = await ingestSource(connectorSync[1], await readJson(request), env);
        return json({ ...result, state: statePayload(await loadState(env)) }, env);
      }

      const connectorConnect = url.pathname.match(/^\/api\/connectors\/([^/]+)\/connect$/);
      if (request.method === "GET" && connectorConnect) {
        return Response.redirect(`${url.origin}/oauth/${connectorConnect[1]}/authorize`, 302);
      }

      const connectorPatch = url.pathname.match(/^\/api\/connectors\/([^/]+)$/);
      if (request.method === "PATCH" && connectorPatch) {
        const state = await loadState(env);
        const body = await readJson(request);
        state.sources[connectorPatch[1]] = { ...(state.sources[connectorPatch[1]] || {}), connected: Boolean(body.connected) };
        await saveState(env, state);
        return json({ connector: { id: connectorPatch[1], ...state.sources[connectorPatch[1]] }, summary: summary(state) }, env);
      }

      if (request.method === "POST" && url.pathname === "/api/ingest/run") {
        const state = await loadState(env);
        const results = [];
        for (const [source, sourceState] of Object.entries(state.sources || {})) {
          if (sourceState.connected && connectors[source]) results.push(await ingestSource(source, {}, env));
        }
        return json({ results, state: statePayload(await loadState(env)) }, env);
      }

      if (request.method === "POST" && url.pathname === "/api/reports") {
        const state = await loadState(env);
        const body = await readJson(request);
        const report = createReport(state, body);
        state.reports = [report, ...(state.reports || [])].slice(0, 20);
        await saveState(env, state);
        return json({ report, reports: state.reports }, env, 201);
      }

      if (request.method === "PUT" && url.pathname === "/api/schedule") {
        const state = await loadState(env);
        state.schedule = { ...state.schedule, ...(await readJson(request)) };
        await saveState(env, state);
        return json({ schedule: state.schedule }, env);
      }

      if (request.method === "PUT" && url.pathname === "/api/settings") {
        const state = await loadState(env);
        state.settings = { ...state.settings, ...(await readJson(request)) };
        await saveState(env, state);
        return json({ settings: state.settings }, env);
      }

      if (request.method === "POST" && url.pathname === "/api/rules") {
        const state = await loadState(env);
        const body = await readJson(request);
        const rule = { id: `rule-${Date.now()}`, title: body.title || "Post movement", detail: body.detail || "Notify the team when a normalized post changes materially." };
        state.rules = [...(state.rules || []), rule];
        await saveState(env, state);
        return json({ rule, rules: state.rules }, env, 201);
      }

      const ruleDelete = url.pathname.match(/^\/api\/rules\/([^/]+)$/);
      if (request.method === "DELETE" && ruleDelete) {
        const state = await loadState(env);
        state.rules = (state.rules || []).filter((rule) => rule.id !== ruleDelete[1]);
        await saveState(env, state);
        return json({ rules: state.rules }, env);
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

async function loadState(env) {
  const raw = await env.METRICFLOW_STORE?.get(STORE_KEY);
  if (!raw) return structuredClone(defaultState);
  return migrateState(JSON.parse(raw));
}

async function saveState(env, state) {
  await env.METRICFLOW_STORE.put(STORE_KEY, JSON.stringify(migrateState(state), null, 2));
}

function migrateState(state = {}) {
  return {
    ...defaultState,
    ...state,
    sources: { ...defaultState.sources, ...(state.sources || {}) },
    posts: Array.isArray(state.posts) ? state.posts : [],
    history: { ...defaultState.history, ...(state.history || {}) },
    rules: state.rules || defaultState.rules,
    settings: state.settings || defaultState.settings,
    schedule: { ...defaultState.schedule, ...(state.schedule || {}) },
    reports: state.reports || []
  };
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
  if (!config.clientId) return json({ message: `Missing ${source.toUpperCase()}_CLIENT_ID` }, env, 400);

  const target = new URL(config.connector.authUrl);
  target.searchParams.set("client_id", config.clientId);
  target.searchParams.set("redirect_uri", config.redirectUri);
  target.searchParams.set("response_type", "code");
  target.searchParams.set("scope", config.connector.scopes.join(" "));
  if (source === "youtube" || source === "ga4") {
    target.searchParams.set("access_type", "offline");
    target.searchParams.set("prompt", "consent");
  }
  return Response.redirect(target.toString(), 302);
}

async function callback(source, request, env) {
  const requestUrl = new URL(request.url);
  const config = sourceEnv(source, env, requestUrl);
  if (!config.connector) return json({ message: "Unsupported source" }, env, 404);
  if (requestUrl.searchParams.get("error")) throw new Error(requestUrl.searchParams.get("error"));
  const code = requestUrl.searchParams.get("code");
  if (!code) return json({ message: "Missing OAuth code" }, env, 400);
  if (!config.clientId || !config.clientSecret) throw new Error(`Missing ${source.toUpperCase()} OAuth credentials`);

  const token = await exchangeCodeForToken(config.connector.tokenUrl, code, config.redirectUri, config.clientId, config.clientSecret);
  const state = await loadState(env);
  state.sources[source] = {
    ...(state.sources[source] || {}),
    connected: true,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null,
    tokenType: token.token_type,
    connectedAt: new Date().toISOString()
  };
  await saveState(env, state);
  return Response.redirect(env.PAGES_URL ? `${env.PAGES_URL}/?connector=connected` : `${requestUrl.origin}/?connector=connected`, 302);
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
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || payload.error || "OAuth token exchange failed");
  return payload;
}

async function ingestSource(source, options, env) {
  const state = await loadState(env);
  const sourceState = state.sources[source];
  if (!connectors[source]) {
    const error = new Error(`Unsupported source: ${source}`);
    error.status = 404;
    throw error;
  }
  if (!sourceState?.accessToken && env.LINKEDIN_DEMO_MODE !== "true") {
    const error = new Error(`OAuth token missing for ${source}`);
    error.status = 401;
    throw error;
  }
  if (source !== "linkedin") {
    const error = new Error(`${connectors[source].name} ingestion is scaffolded but not implemented in the Worker yet`);
    error.status = 501;
    throw error;
  }

  const rawPosts = env.LINKEDIN_DEMO_MODE === "true" ? demoLinkedInPosts() : await fetchLinkedInPosts(sourceState.accessToken, env, options);
  const postIds = rawPosts.map((post) => post.id || post.urn || post.activity);
  const rawMetrics = env.LINKEDIN_DEMO_MODE === "true" ? Object.fromEntries(postIds.map((id, index) => [id, demoLinkedInMetric(index)])) : await fetchLinkedInMetrics(sourceState.accessToken, postIds, env);
  const normalized = normalizeLinkedInPosts(rawPosts, rawMetrics);

  state.posts = mergePosts(state.posts || [], normalized);
  state.sources[source] = { ...(state.sources[source] || {}), connected: true, lastIngestedAt: new Date().toISOString() };
  state.history = generateHistory(state.posts);
  await saveState(env, state);
  return { source, fetched: rawPosts.length, saved: normalized.length, posts: normalized };
}

async function fetchLinkedInPosts(accessToken, env, options = {}) {
  if (!env.LINKEDIN_AUTHOR_URN) throw new Error("Missing LINKEDIN_AUTHOR_URN");
  const url = new URL("https://api.linkedin.com/v2/ugcPosts");
  url.searchParams.set("q", "authors");
  url.searchParams.set("authors", `List(${env.LINKEDIN_AUTHOR_URN})`);
  url.searchParams.set("sortBy", "LAST_MODIFIED");
  url.searchParams.set("count", String(options.count || 25));
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}`, "x-restli-protocol-version": "2.0.0" } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "LinkedIn UGC Posts API request failed");
  return payload.elements || [];
}

async function fetchLinkedInMetrics(accessToken, postIds, env) {
  const metrics = {};
  for (const postId of postIds) {
    const social = await fetchLinkedInSocialActions(accessToken, postId);
    const analytics = env.LINKEDIN_ORGANIZATION_URN ? await fetchLinkedInAnalytics(accessToken, postId, env.LINKEDIN_ORGANIZATION_URN) : {};
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

async function fetchLinkedInAnalytics(accessToken, postId, organizationUrn) {
  const url = new URL("https://api.linkedin.com/v2/organizationalEntityShareStatistics");
  url.searchParams.set("q", "organizationalEntity");
  url.searchParams.set("organizationalEntity", organizationUrn);
  url.searchParams.set("shares", `List(${postId})`);
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}`, "x-restli-protocol-version": "2.0.0" } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `LinkedIn Analytics API failed for ${postId}`);
  const row = payload.elements?.[0] || {};
  return {
    reach: numberOrNull(row.uniqueImpressionsCount),
    impressions: numberOrNull(row.impressionCount),
    engagements: numberOrNull(row.engagement),
    shares: numberOrNull(row.shareCount),
    clicks: numberOrNull(row.clickCount)
  };
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
  const state = await loadState(env);
  if (!state.schedule?.autoIngest) return;
  const lastRun = state.schedule.lastRunAt ? new Date(state.schedule.lastRunAt).getTime() : 0;
  if (Date.now() - lastRun < scheduleMs(state.schedule.frequency)) return;
  for (const source of state.schedule.sources || ["linkedin"]) {
    if (state.sources?.[source]?.connected) await ingestSource(source, {}, env);
  }
  const nextState = await loadState(env);
  nextState.schedule.lastRunAt = new Date().toISOString();
  await saveState(env, nextState);
}

function scheduleMs(frequency = "Weekly") {
  if (String(frequency).toLowerCase() === "daily") return 24 * 60 * 60 * 1000;
  if (String(frequency).toLowerCase() === "monthly") return 30 * 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
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
