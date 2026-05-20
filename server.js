const express = require("express");
const path = require("node:path");
const {
  loadState,
  saveState,
  savePosts,
  mergePosts
} = require("./storage");
const {
  generateDailyRollups,
  generateWeeklyRollups,
  generateMonthlyRollups,
  upsertRollups
} = require("./rollups");
const { startScheduler } = require("./scheduler");

const linkedin = require("./connectors/linkedin");
const instagram = require("./connectors/instagram");
const youtube = require("./connectors/youtube");
const ga4 = require("./connectors/ga4");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(ROOT));

const connectorRegistry = {
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    color: "#0a66c2",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    scopes: ["openid", "profile", "r_organization_admin", "r_organization_social", "r_ads", "r_ads_reporting"],
    envPrefix: "LINKEDIN",
    module: linkedin
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    color: "#c13584",
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    scopes: ["instagram_basic", "instagram_manage_insights"],
    envPrefix: "INSTAGRAM",
    module: instagram
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    color: "#ff0033",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"],
    envPrefix: "YOUTUBE",
    module: youtube
  },
  ga4: {
    id: "ga4",
    name: "GA4",
    color: "#f9ab00",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    envPrefix: "GA4",
    module: ga4
  }
};

function sourceConfig(source, request) {
  const connector = connectorRegistry[source];
  if (!connector) return null;
  const prefix = connector.envPrefix;
  const host = request.get("host") || `localhost:${PORT}`;
  const protocol = host.includes("localhost") ? "http" : "https";
  const fallbackRedirectUri = `${protocol}://${host}/oauth/${source}/callback`;
  return {
    ...connector,
    clientId: process.env[`${prefix}_CLIENT_ID`] || "",
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`] || "",
    redirectUri: process.env[`${prefix}_REDIRECT_URI`] || fallbackRedirectUri
  };
}

function oauthAuthorizeUrl(config) {
  if (!config.clientId) throw new Error(`Missing ${config.envPrefix}_CLIENT_ID`);
  const url = new URL(config.authUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  if (config.id === "youtube" || config.id === "ga4") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }
  return url.toString();
}

async function ingestSource(source, options = {}) {
  const state = await loadState();
  const connector = connectorRegistry[source];
  if (!connector) {
    const error = new Error(`Unsupported source: ${source}`);
    error.status = 404;
    throw error;
  }

  const sourceState = state.sources?.[source];
  if (!sourceState?.accessToken && sourceState?.mode !== "demo" && process.env.LINKEDIN_DEMO_MODE !== "true") {
    const error = new Error(`OAuth token missing for ${source}`);
    error.status = 401;
    throw error;
  }

  const accessToken = sourceState?.accessToken || "demo-token";
  const organizationUrn = source === "linkedin" ? (options.organizationUrn || sourceState?.selectedOrganization) : undefined;
  if (source === "linkedin" && process.env.LINKEDIN_DEMO_MODE !== "true" && !organizationUrn) {
    const error = new Error("LinkedIn organization selection required before ingestion");
    error.status = 409;
    throw error;
  }

  // 1. Fetch raw platform posts.
  const rawPosts = await connector.module.fetchPosts(accessToken, organizationUrn, options);
  const postIds = rawPosts.map((post) => String(post.id || post.urn || post.activity || post.post_id));

  // 2. Fetch raw platform metrics for each post.
  const rawMetrics = await connector.module.fetchMetrics(accessToken, organizationUrn, postIds, options);

  // 3. Normalize every API shape into Metricflow's internal schema.
  const normalizedPosts = connector.module.normalizePosts(rawPosts, rawMetrics);

  // 4. Merge normalized records into durable JSON storage.
  const savedPosts = await savePosts(source, normalizedPosts);
  const nextState = await loadState();
  generateAndAttachRollups(nextState);
  await saveState(nextState);

  return {
    source,
    fetched: rawPosts.length,
    saved: normalizedPosts.length,
    posts: savedPosts
  };
}

function generateAndAttachRollups(state) {
  const now = new Date();
  state.history = {
    daily: upsertRollups(state.history?.daily || [], generateDailyRollups(state.posts || [], now.toISOString().slice(0, 10))),
    weekly: upsertRollups(state.history?.weekly || [], generateWeeklyRollups(state.posts || [], now)),
    monthly: upsertRollups(state.history?.monthly || [], generateMonthlyRollups(state.posts || [], now))
  };
}

function filterPosts(posts, query) {
  return posts.filter((post) => {
    if (query.source && post.source !== query.source) return false;
    const published = String(post.published_at || "").slice(0, 10);
    if (query.from && published < query.from) return false;
    if (query.to && published > query.to) return false;
    return true;
  });
}

function analyticsSummary(state) {
  const posts = state.posts || [];
  const totals = posts.reduce((sum, post) => {
    sum.reach += Number(post.reach || 0);
    sum.engagements += Number(post.engagements || 0);
    sum.conversions += Number(post.conversions || 0);
    return sum;
  }, { reach: 0, engagements: 0, conversions: 0 });

  return {
    totalReach: totals.reach,
    totalEngagement: totals.engagements,
    totalConversions: totals.conversions,
    engagementRate: totals.reach ? (totals.engagements / totals.reach) * 100 : 0,
    connectedSources: Object.values(state.sources || {}).filter((source) => source.connected).length,
    totalSources: Object.keys(connectorRegistry).length,
    trackedPosts: posts.length,
    timeSavedHours: Number((posts.length * 0.2 + 2.8).toFixed(1))
  };
}

function rankPosts(posts) {
  return [...posts]
    .map((post) => ({
      ...post,
      metrics: {
        reach: post.reach,
        engagements: post.engagements,
        conversions: post.conversions
      },
      title: post.text || post.post_id,
      connector: post.source,
      mediaType: post.media_type,
      contentPillar: "normalized",
      engagementChange: 0,
      score: Number((Number(post.engagements || 0) * 0.5 + Number(post.conversions || 0) * 15 + Number(post.clicks || 0) * 2).toFixed(1))
    }))
    .sort((a, b) => b.score - a.score);
}

function statePayload(state) {
  const posts = state.posts || [];
  const ranked = rankPosts(posts);
  return {
    ...state,
    connectors: Object.values(connectorRegistry).map((connector) => ({
      id: connector.id,
      name: connector.name,
      color: connector.color,
      connected: Boolean(state.sources?.[connector.id]?.connected),
      configured: Boolean(state.sources?.[connector.id]?.accessToken || process.env[`${connector.envPrefix}_CLIENT_ID`]),
      lastSyncAt: state.sources?.[connector.id]?.lastIngestedAt || null
    })),
    summary: analyticsSummary(state),
    postRankings: ranked,
    insights: buildInsights(ranked),
    patterns: buildPatterns(posts),
    contentIntelligence: buildContentIntelligence(ranked),
    normalizedSchema: {
      post: [
        "source",
        "post_id",
        "author_id",
        "published_at",
        "url",
        "text",
        "media_type",
        "reach",
        "impressions",
        "engagements",
        "likes",
        "comments",
        "shares",
        "saves",
        "clicks",
        "conversions",
        "platform_raw"
      ]
    }
  };
}

function buildInsights(ranked) {
  const top = ranked[0];
  return [
    {
      type: "ranking",
      title: top ? `${top.text || top.post_id} leads normalized posts` : "No normalized posts yet",
      detail: top ? "This post has the strongest combined engagement, click, and conversion score." : "Connect LinkedIn and run ingestion to populate post intelligence."
    }
  ];
}

function buildPatterns(posts) {
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
  return [...groups.values()].map((group) => ({
    ...group,
    engagementRate: group.reach ? (group.engagements / group.reach) * 100 : 0,
    conversionRate: group.reach ? (group.conversions / group.reach) * 100 : 0
  }));
}

function buildContentIntelligence(ranked) {
  const top = ranked[0];
  return {
    winningFormats: [],
    recommendations: [
      top ? `Create a follow-up to ${top.text || top.post_id}; it has the strongest normalized score.` : "Run LinkedIn ingestion to generate recommendations."
    ],
    nextBrief: {
      contentPillar: "normalized",
      format: top?.media_type || "text",
      angle: "Use normalized post metrics to choose the next creative test."
    }
  };
}

function createReport(state, payload = {}) {
  const summary = analyticsSummary(state);
  const top = rankPosts(state.posts || [])[0];
  return {
    id: `report-${Date.now()}`,
    title: payload.title || "Post intelligence report",
    audience: payload.audience || "Leadership team",
    sections: Array.isArray(payload.sections) ? payload.sections : [],
    createdAt: new Date().toISOString(),
    summary,
    recommendation: top ? `Prioritize follow-up content based on ${top.post_id}.` : "Run ingestion before generating recommendations."
  };
}

app.get("/api/health", (request, response) => {
  response.json({ ok: true, service: "MetricFlow API" });
});

app.get("/api/state", async (request, response, next) => {
  try {
    response.json(statePayload(await loadState()));
  } catch (error) {
    next(error);
  }
});

app.get("/oauth/:source/authorize", (request, response, next) => {
  try {
    const config = sourceConfig(request.params.source, request);
    if (!config) return response.status(404).json({ message: "Unsupported source" });
    response.redirect(oauthAuthorizeUrl(config));
  } catch (error) {
    next(error);
  }
});

app.get("/oauth/:source/callback", async (request, response, next) => {
  try {
    const config = sourceConfig(request.params.source, request);
    if (!config) return response.status(404).json({ message: "Unsupported source" });
    if (request.query.error) throw new Error(String(request.query.error));
    if (!request.query.code) return response.status(400).json({ message: "Missing OAuth code" });
    if (!config.clientId || !config.clientSecret) throw new Error(`Missing ${config.envPrefix}_CLIENT_ID or ${config.envPrefix}_CLIENT_SECRET`);

    const token = await config.module.exchangeCodeForToken(
      String(request.query.code),
      config.redirectUri,
      config.clientId,
      config.clientSecret
    );

    const state = await loadState();
    state.sources[config.id] = {
      ...(state.sources[config.id] || {}),
      connected: true,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null,
      tokenType: token.token_type,
      connectedAt: new Date().toISOString()
    };
    await saveState(state);
    response.redirect("/?connector=connected");
  } catch (error) {
    next(error);
  }
});

app.post("/api/ingest/:source", async (request, response, next) => {
  try {
    response.json(await ingestSource(request.params.source, request.body || {}));
  } catch (error) {
    next(error);
  }
});

app.get("/api/posts", async (request, response, next) => {
  try {
    const state = await loadState();
    response.json({ posts: filterPosts(state.posts || [], request.query) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/connectors", async (request, response, next) => {
  try {
    response.json({ connectors: statePayload(await loadState()).connectors });
  } catch (error) {
    next(error);
  }
});

app.get("/api/connectors/:source/connect", (request, response) => {
  response.redirect(`/oauth/${encodeURIComponent(request.params.source)}/authorize`);
});

app.post("/api/connectors/:source/sync", async (request, response, next) => {
  try {
    const result = await ingestSource(request.params.source, request.body || {});
    response.json({ ...result, state: statePayload(await loadState()) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ingest/run", async (request, response, next) => {
  try {
    const state = await loadState();
    const sources = Object.entries(state.sources || {}).filter(([, value]) => value.connected).map(([source]) => source);
    const results = [];
    for (const source of sources) {
      if (connectorRegistry[source]) results.push(await ingestSource(source, request.body || {}));
    }
    response.json({ results, state: statePayload(await loadState()) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/sources/:name", async (request, response, next) => {
  try {
    const state = await loadState();
    const source = request.params.name.toLowerCase();
    state.sources[source] = {
      ...(state.sources[source] || {}),
      connected: Boolean(request.body.connected)
    };
    await saveState(state);
    response.json({ source: state.sources[source], summary: analyticsSummary(state) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/connectors/:source", async (request, response, next) => {
  try {
    const state = await loadState();
    const source = request.params.source;
    state.sources[source] = {
      ...(state.sources[source] || {}),
      connected: Boolean(request.body.connected)
    };
    await saveState(state);
    response.json({ connector: { id: source, ...state.sources[source] }, summary: analyticsSummary(state) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports", async (request, response, next) => {
  try {
    response.json({ reports: (await loadState()).reports || [] });
  } catch (error) {
    next(error);
  }
});

app.post("/api/reports", async (request, response, next) => {
  try {
    const state = await loadState();
    const report = createReport(state, request.body || {});
    state.reports = [report, ...(state.reports || [])].slice(0, 20);
    await saveState(state);
    response.status(201).json({ report, reports: state.reports });
  } catch (error) {
    next(error);
  }
});

app.put("/api/schedule", async (request, response, next) => {
  try {
    const state = await loadState();
    state.schedule = { ...state.schedule, ...(request.body || {}) };
    await saveState(state);
    response.json({ schedule: state.schedule });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings", async (request, response, next) => {
  try {
    const state = await loadState();
    state.settings = { ...state.settings, ...(request.body || {}) };
    await saveState(state);
    response.json({ settings: state.settings });
  } catch (error) {
    next(error);
  }
});

app.post("/api/rules", async (request, response, next) => {
  try {
    const state = await loadState();
    const rule = {
      id: `rule-${Date.now()}`,
      title: request.body.title || "Post movement",
      detail: request.body.detail || "Notify the team when a normalized post changes materially."
    };
    state.rules = [...(state.rules || []), rule];
    await saveState(state);
    response.status(201).json({ rule, rules: state.rules });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/rules/:id", async (request, response, next) => {
  try {
    const state = await loadState();
    state.rules = (state.rules || []).filter((rule) => rule.id !== request.params.id);
    await saveState(state);
    response.json({ rules: state.rules });
  } catch (error) {
    next(error);
  }
});

app.get("/api/export.csv", async (request, response, next) => {
  try {
    const state = await loadState();
    const rows = [["source", "post_id", "published_at", "reach", "impressions", "engagements", "clicks", "conversions"]];
    for (const post of state.posts || []) {
      rows.push([post.source, post.post_id, post.published_at, post.reach, post.impressions, post.engagements, post.clicks, post.conversions]);
    }
    response.setHeader("content-type", "text/csv; charset=utf-8");
    response.setHeader("content-disposition", "attachment; filename=\"metricflow-posts.csv\"");
    response.send(rows.map((row) => row.join(",")).join("\n"));
  } catch (error) {
    next(error);
  }
});

app.get("*", (request, response) => {
  response.sendFile(path.join(ROOT, "index.html"));
});

app.use((error, request, response, next) => {
  const status = error.status || 500;
  response.status(status).json({ message: error.message || "Server error" });
});

startScheduler({
  loadState,
  saveState,
  ingestSource,
  generateRollups: generateAndAttachRollups
});

app.listen(PORT, () => {
  console.log(`MetricFlow running at http://localhost:${PORT}`);
});
