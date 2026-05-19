const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

const CONNECTORS = [
  {
    id: "instagram",
    name: "Instagram",
    color: "#c13584",
    kind: "social",
    authUrl: "https://api.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scopes: ["instagram_basic", "instagram_manage_insights"]
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    color: "#0a66c2",
    kind: "social",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["r_liteprofile", "r_organization_social", "rw_organization_admin"]
  },
  {
    id: "youtube",
    name: "YouTube",
    color: "#ff0033",
    kind: "social",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"]
  },
  {
    id: "ga4",
    name: "GA4",
    color: "#f9ab00",
    kind: "web",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"]
  }
];

const today = "2026-05-19";

const seedStore = {
  connectors: CONNECTORS.map((connector, index) => ({
    ...connector,
    connected: index < 4,
    status: index < 4 ? "ready" : "needs_setup",
    lastSyncAt: `2026-05-${18 - index}T09:15:00.000Z`
  })),
  connections: {
    instagram: { mode: "demo", connectedAt: "2026-05-10T09:00:00.000Z" },
    linkedin: { mode: "demo", connectedAt: "2026-05-10T09:00:00.000Z" },
    youtube: { mode: "demo", connectedAt: "2026-05-10T09:00:00.000Z" },
    ga4: { mode: "demo", propertyId: "demo-property", connectedAt: "2026-05-10T09:00:00.000Z" }
  },
  posts: [
    normalizedPost("linkedin", "li-001", "Webinar recap: five retention signals", "document", "Lifecycle", "education", "2026-05-12T10:30:00Z", ["webinar", "retention"]),
    normalizedPost("instagram", "ig-001", "Carousel: before and after onboarding audit", "carousel", "Product Education", "proof", "2026-05-14T15:10:00Z", ["carousel", "audit"]),
    normalizedPost("youtube", "yt-001", "How to read content ROI in 12 minutes", "video", "Content Strategy", "education", "2026-05-11T18:00:00Z", ["roi", "tutorial"]),
    normalizedPost("instagram", "ig-002", "Founder story: why teams miss attribution", "reel", "Brand", "story", "2026-05-16T12:45:00Z", ["founder", "attribution"]),
    normalizedPost("linkedin", "li-002", "Checklist: campaign reporting handoff", "text", "Operations", "utility", "2026-05-17T08:20:00Z", ["checklist", "ops"]),
    normalizedPost("ga4", "ga4-landing-content-roi", "Landing page: content ROI guide", "landing_page", "Demand Gen", "conversion", "2026-05-09T00:00:00Z", ["guide", "organic"])
  ],
  metrics: [
    metric("linkedin", "li-001", "2026-05-12", 11200, 780, 54, 42, 23),
    metric("linkedin", "li-001", "2026-05-18", 16400, 1420, 96, 71, 39),
    metric("instagram", "ig-001", "2026-05-14", 18800, 1960, 122, 88, 41),
    metric("instagram", "ig-001", "2026-05-18", 30500, 4120, 270, 141, 63),
    metric("youtube", "yt-001", "2026-05-11", 9200, 610, 38, 255, 18),
    metric("youtube", "yt-001", "2026-05-18", 14800, 1180, 76, 510, 34),
    metric("instagram", "ig-002", "2026-05-16", 12600, 920, 81, 22, 11),
    metric("instagram", "ig-002", "2026-05-18", 21800, 2360, 188, 45, 21),
    metric("linkedin", "li-002", "2026-05-17", 7400, 430, 28, 19, 9),
    metric("linkedin", "li-002", "2026-05-18", 10200, 760, 43, 35, 15),
    metric("ga4", "ga4-landing-content-roi", "2026-05-09", 8200, 520, 31, 0, 86),
    metric("ga4", "ga4-landing-content-roi", "2026-05-18", 17100, 980, 64, 0, 194)
  ],
  rules: [
    { id: "rule-spike", title: "Spike detection", detail: "Flag posts whose engagement grows more than 35% versus their prior observation." },
    { id: "rule-drop", title: "Drop detection", detail: "Escalate connected channels with reach or conversion drops above 20%." },
    { id: "rule-pattern", title: "Pattern detection", detail: "Surface content pillars and formats that repeatedly outperform the post median." }
  ],
  settings: {
    companyName: "Northstar Studio",
    defaultKpi: "Engagement rate",
    autoRefresh: true
  },
  schedule: {
    frequency: "Weekly",
    day: "Monday",
    recipients: "team@example.com"
  },
  reports: []
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

function normalizedPost(connector, externalId, title, mediaType, campaign, pillar, publishedAt, tags = []) {
  return {
    id: `${connector}-${externalId}`,
    connector,
    externalId,
    canonicalUrl: connector === "ga4" ? `/content/${externalId}` : `https://example.com/${connector}/${externalId}`,
    title,
    caption: title,
    author: "Northstar Studio",
    mediaType,
    campaign,
    contentPillar: pillar,
    tags,
    publishedAt,
    ingestedAt: `${today}T08:00:00.000Z`
  };
}

function metric(connector, externalPostId, date, reach, engagements, reactions, watchSeconds, conversions) {
  return {
    id: `${connector}-${externalPostId}-${date}`,
    connector,
    externalPostId,
    postId: `${connector}-${externalPostId}`,
    period: "daily",
    capturedAt: `${date}T23:59:00.000Z`,
    date,
    reach,
    impressions: Math.round(reach * 1.32),
    engagements,
    reactions,
    comments: Math.round(engagements * 0.07),
    shares: Math.round(engagements * 0.045),
    saves: Math.round(engagements * 0.035),
    clicks: Math.round(engagements * 0.19),
    videoViews: watchSeconds ? Math.round(watchSeconds / 14) : 0,
    watchSeconds,
    conversions,
    revenue: conversions * 47
  };
}

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await writeStore(seedStore);
  }
}

async function readStore() {
  await ensureStore();
  const content = await fs.readFile(STORE_FILE, "utf8");
  return migrateStore(JSON.parse(content));
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, `${JSON.stringify(migrateStore(store), null, 2)}\n`, "utf8");
}

function migrateStore(store) {
  if (Array.isArray(store.posts) && Array.isArray(store.metrics)) {
    return {
      ...seedStore,
      ...store,
      connectors: mergeConnectors(store.connectors || seedStore.connectors),
      connections: store.connections || seedStore.connections,
      rules: store.rules || seedStore.rules,
      settings: store.settings || seedStore.settings,
      schedule: store.schedule || seedStore.schedule,
      reports: store.reports || []
    };
  }
  return structuredClone(seedStore);
}

function mergeConnectors(connectors) {
  return CONNECTORS.map((connector) => ({
    ...connector,
    ...(connectors.find((item) => item.id === connector.id) || {})
  }));
}

function latestMetricForPost(store, postId) {
  return [...store.metrics]
    .filter((item) => item.postId === postId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

function previousMetricForPost(store, postId, date) {
  return [...store.metrics]
    .filter((item) => item.postId === postId && item.date < date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

function pctChange(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return current ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function activeConnectors(store) {
  return store.connectors.filter((connector) => connector.connected);
}

function postRows(store) {
  return store.posts.map((post) => {
    const latest = latestMetricForPost(store, post.id) || {};
    const previous = previousMetricForPost(store, post.id, latest.date || "9999-99-99") || {};
    const engagementRate = latest.reach ? (Number(latest.engagements || 0) / Number(latest.reach)) * 100 : 0;
    return {
      ...post,
      metrics: latest,
      previousMetrics: previous,
      engagementRate,
      reachChange: pctChange(Number(latest.reach || 0), Number(previous.reach || 0)),
      engagementChange: pctChange(Number(latest.engagements || 0), Number(previous.engagements || 0)),
      conversionChange: pctChange(Number(latest.conversions || 0), Number(previous.conversions || 0))
    };
  });
}

function analyticsSummary(store) {
  const rows = postRows(store);
  const current = rows.reduce((sum, post) => {
    sum.reach += Number(post.metrics.reach || 0);
    sum.engagements += Number(post.metrics.engagements || 0);
    sum.conversions += Number(post.metrics.conversions || 0);
    sum.revenue += Number(post.metrics.revenue || 0);
    return sum;
  }, { reach: 0, engagements: 0, conversions: 0, revenue: 0 });
  const previous = rows.reduce((sum, post) => {
    sum.reach += Number(post.previousMetrics.reach || 0);
    sum.engagements += Number(post.previousMetrics.engagements || 0);
    sum.conversions += Number(post.previousMetrics.conversions || 0);
    return sum;
  }, { reach: 0, engagements: 0, conversions: 0 });

  return {
    totalReach: current.reach,
    totalEngagement: current.engagements,
    totalConversions: current.conversions,
    attributedRevenue: current.revenue,
    engagementRate: current.reach ? (current.engagements / current.reach) * 100 : 0,
    connectedSources: activeConnectors(store).length,
    totalSources: store.connectors.length,
    trackedPosts: rows.length,
    currentPeriod: { label: "Latest observation", ...current },
    previousPeriod: { label: "Previous observation", ...previous },
    deltas: {
      reach: pctChange(current.reach, previous.reach),
      engagement: pctChange(current.engagements, previous.engagements),
      conversions: pctChange(current.conversions, previous.conversions)
    },
    timeSavedHours: Number((activeConnectors(store).length * 1.4 + rows.length * 0.18).toFixed(1))
  };
}

function rankPosts(store) {
  return postRows(store)
    .map((post) => ({
      ...post,
      score: Number((
        Number(post.metrics.engagements || 0) * 0.42 +
        Number(post.metrics.conversions || 0) * 18 +
        Number(post.engagementChange || 0) * 9 +
        Number(post.metrics.shares || 0) * 3
      ).toFixed(1))
    }))
    .sort((a, b) => b.score - a.score);
}

function detectPatterns(store) {
  const grouped = new Map();
  for (const post of postRows(store)) {
    const key = `${post.contentPillar} / ${post.mediaType}`;
    const group = grouped.get(key) || { key, posts: 0, reach: 0, engagements: 0, conversions: 0 };
    group.posts += 1;
    group.reach += Number(post.metrics.reach || 0);
    group.engagements += Number(post.metrics.engagements || 0);
    group.conversions += Number(post.metrics.conversions || 0);
    grouped.set(key, group);
  }
  return [...grouped.values()]
    .map((group) => ({
      ...group,
      engagementRate: group.reach ? (group.engagements / group.reach) * 100 : 0,
      conversionRate: group.reach ? (group.conversions / group.reach) * 100 : 0
    }))
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 5);
}

function buildInsights(store) {
  const summary = analyticsSummary(store);
  const ranked = rankPosts(store);
  const spike = ranked.find((post) => post.engagementChange >= 35);
  const drop = ranked.find((post) => post.reachChange <= -20 || post.conversionChange <= -20);
  const pattern = detectPatterns(store)[0];
  const top = ranked[0];

  return [
    spike ? {
      type: "spike",
      title: `${spike.title} spiked ${spike.engagementChange}%`,
      detail: `${spike.connectorLabel || connectorName(spike.connector)} engagement outpaced its previous observation. Reuse its ${spike.mediaType} format and ${spike.contentPillar} angle.`
    } : {
      type: "comparison",
      title: `Engagement is ${summary.deltas.engagement >= 0 ? "up" : "down"} ${Math.abs(summary.deltas.engagement)}%`,
      detail: "The comparison engine is reading current post observations against prior observations instead of static templates."
    },
    drop ? {
      type: "drop",
      title: `${drop.title} needs triage`,
      detail: `Reach changed ${drop.reachChange}% and conversions changed ${drop.conversionChange}%. Check distribution timing and CTA placement.`
    } : {
      type: "ranking",
      title: `${top?.title || "Top post"} leads the post ranking`,
      detail: `It ranks highest on weighted engagement, conversion, sharing, and growth signals.`
    },
    {
      type: "pattern",
      title: `${pattern?.key || "Content mix"} is the strongest pattern`,
      detail: `${pattern?.posts || 0} post${pattern?.posts === 1 ? "" : "s"} averaged ${Number(pattern?.engagementRate || 0).toFixed(1)}% engagement rate.`
    }
  ];
}

function buildContentIntelligence(store) {
  const ranked = rankPosts(store);
  const patterns = detectPatterns(store);
  const best = ranked[0];
  const weakest = [...ranked].reverse()[0];
  return {
    winningFormats: patterns,
    recommendations: [
      best ? `Expand ${best.contentPillar} with another ${best.mediaType}; it is carrying the highest post score.` : "Ingest posts before creating format recommendations.",
      weakest ? `Refresh the hook on ${weakest.title}; its relative score is lowest in the current set.` : "No weak post detected.",
      "Create one controlled test per connector so spikes can be attributed to format, audience, or distribution timing."
    ],
    nextBrief: {
      contentPillar: patterns[0]?.key.split(" / ")[0] || "Product Education",
      format: patterns[0]?.key.split(" / ")[1] || "carousel",
      angle: "Turn the strongest comparison insight into a reusable tactical checklist."
    }
  };
}

function connectorName(id) {
  return CONNECTORS.find((connector) => connector.id === id)?.name || id;
}

function connectorEnv(id) {
  const prefix = id.toUpperCase();
  return {
    clientId: process.env[`${prefix}_CLIENT_ID`] || (id === "ga4" ? process.env.GOOGLE_CLIENT_ID : ""),
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`] || (id === "ga4" ? process.env.GOOGLE_CLIENT_SECRET : ""),
    redirectUri: process.env[`${prefix}_REDIRECT_URI`] || process.env.GOOGLE_REDIRECT_URI || "",
    propertyId: process.env.GA4_PROPERTY_ID || ""
  };
}

function connectionStatus(store, request) {
  return store.connectors.map((connector) => {
    const env = connectorEnv(connector.id);
    const connection = store.connections?.[connector.id] || null;
    return {
      ...connector,
      connected: Boolean(connection || connector.connected),
      configured: Boolean(env.clientId && env.clientSecret) || connection?.mode === "demo",
      propertyId: connection?.propertyId || env.propertyId || "",
      lastSyncAt: connector.lastSyncAt || null,
      callbackUrl: `${request.headers.host?.includes("localhost") ? "http" : "https"}://${request.headers.host || `localhost:${PORT}`}/api/connectors/${connector.id}/callback`
    };
  });
}

function connectorAuthUrl(request, connector) {
  const env = connectorEnv(connector.id);
  if (!env.clientId || !env.clientSecret) throw new Error(`Missing ${connector.id.toUpperCase()} OAuth credentials`);
  const host = request.headers.host || `localhost:${PORT}`;
  const protocol = host.includes("localhost") ? "http" : "https";
  const redirectUri = env.redirectUri || `${protocol}://${host}/api/connectors/${connector.id}/callback`;
  const url = new URL(connector.authUrl);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", connector.scopes.join(" "));
  if (connector.id === "youtube" || connector.id === "ga4") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }
  return url.toString();
}

async function exchangeConnectorCode(request, connector, code) {
  const env = connectorEnv(connector.id);
  const host = request.headers.host || `localhost:${PORT}`;
  const protocol = host.includes("localhost") ? "http" : "https";
  const redirectUri = env.redirectUri || `${protocol}://${host}/api/connectors/${connector.id}/callback`;
  const response = await fetch(connector.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || payload.error || `${connector.name} token exchange failed`);
  return payload;
}

function demoRawPosts(connectorId) {
  const samples = {
    instagram: [
      { id: `ig-${Date.now()}`, caption: "Reel: three reporting mistakes to stop this week", media_type: "VIDEO", timestamp: new Date().toISOString(), permalink: "https://example.com/instagram/new" }
    ],
    linkedin: [
      { id: `li-${Date.now()}`, commentary: "Mini case study: pipeline lift from better campaign tags", contentType: "article", createdAt: new Date().toISOString(), url: "https://example.com/linkedin/new" }
    ],
    youtube: [
      { id: `yt-${Date.now()}`, snippet: { title: "Content intelligence walkthrough", publishedAt: new Date().toISOString() }, statistics: { viewCount: 8400, likeCount: 412, commentCount: 39 } }
    ],
    ga4: [
      { id: `ga4-${Date.now()}`, pageTitle: "Organic content attribution playbook", pagePath: "/playbooks/content-attribution" }
    ]
  };
  return samples[connectorId] || [];
}

function normalizeRawPost(connectorId, raw) {
  const title = raw.caption || raw.commentary || raw.snippet?.title || raw.pageTitle || "Untitled content";
  const externalId = String(raw.id || raw.pagePath || `${connectorId}-${Date.now()}`);
  const mediaType = raw.media_type === "VIDEO" ? "reel" : raw.contentType || (connectorId === "youtube" ? "video" : connectorId === "ga4" ? "landing_page" : "post");
  return normalizedPost(
    connectorId,
    externalId,
    title,
    mediaType,
    connectorId === "ga4" ? "Demand Gen" : "Always-on",
    inferPillar(title),
    raw.timestamp || raw.createdAt || raw.snippet?.publishedAt || new Date().toISOString(),
    [connectorId, mediaType]
  );
}

function normalizeRawMetric(connectorId, post, raw = {}) {
  const reach = Number(raw.reach || raw.viewCount || raw.statistics?.viewCount || 6000 + Math.round(Math.random() * 9000));
  const engagements = Number(raw.engagements || raw.likeCount || raw.statistics?.likeCount || Math.round(reach * 0.08));
  const conversions = Number(raw.conversions || Math.round(engagements * (connectorId === "ga4" ? 0.2 : 0.035)));
  return {
    ...metric(connectorId, post.externalId, new Date().toISOString().slice(0, 10), reach, engagements, Math.round(engagements * 0.6), connectorId === "youtube" ? reach * 11 : 0, conversions),
    postId: post.id
  };
}

function inferPillar(text) {
  const value = String(text).toLowerCase();
  if (value.includes("case") || value.includes("proof")) return "proof";
  if (value.includes("attribution") || value.includes("pipeline")) return "conversion";
  if (value.includes("mistake") || value.includes("checklist")) return "utility";
  return "education";
}

async function fetchConnectorPosts(store, connectorId) {
  const connection = store.connections?.[connectorId];
  if (!connection?.accessToken || connection.mode === "demo") return demoRawPosts(connectorId);
  throw new Error(`${connectorName(connectorId)} fetch adapter is configured but needs its API endpoint mapping.`);
}

async function syncConnector(store, connectorId) {
  const connector = store.connectors.find((item) => item.id === connectorId);
  if (!connector) throw new Error("Connector not found");
  const rawPosts = await fetchConnectorPosts(store, connectorId);
  const normalizedPosts = rawPosts.map((raw) => normalizeRawPost(connectorId, raw));
  const normalizedMetrics = normalizedPosts.map((post, index) => normalizeRawMetric(connectorId, post, rawPosts[index]));

  for (const post of normalizedPosts) {
    const index = store.posts.findIndex((item) => item.id === post.id);
    if (index >= 0) store.posts[index] = { ...store.posts[index], ...post, ingestedAt: new Date().toISOString() };
    else store.posts.push(post);
  }
  for (const item of normalizedMetrics) {
    const index = store.metrics.findIndex((existing) => existing.id === item.id);
    if (index >= 0) store.metrics[index] = item;
    else store.metrics.push(item);
  }
  connector.connected = true;
  connector.status = "ready";
  connector.lastSyncAt = new Date().toISOString();
  store.connections = store.connections || {};
  store.connections[connectorId] = store.connections[connectorId] || { mode: "demo", connectedAt: new Date().toISOString() };
  return { posts: normalizedPosts, metrics: normalizedMetrics };
}

async function runIngestion(store) {
  const results = [];
  for (const connector of activeConnectors(store)) {
    results.push({ connector: connector.id, ...(await syncConnector(store, connector.id)) });
  }
  return results;
}

function csvForPosts(store) {
  const rows = [["connector", "post_id", "title", "published_at", "reach", "engagements", "conversions", "engagement_rate", "engagement_change"]];
  rankPosts(store).forEach((post) => {
    rows.push([
      connectorName(post.connector),
      post.externalId,
      JSON.stringify(post.title),
      post.publishedAt,
      post.metrics.reach || 0,
      post.metrics.engagements || 0,
      post.metrics.conversions || 0,
      Number(post.engagementRate || 0).toFixed(2),
      post.engagementChange
    ]);
  });
  return rows.map((row) => row.join(",")).join("\n");
}

function createReport(store, payload = {}) {
  const summary = analyticsSummary(store);
  const top = rankPosts(store)[0];
  const intelligence = buildContentIntelligence(store);
  return {
    id: `report-${Date.now()}`,
    title: payload.title || "Post intelligence report",
    audience: payload.audience || "Leadership team",
    sections: Array.isArray(payload.sections) ? payload.sections : [],
    createdAt: new Date().toISOString(),
    summary,
    recommendation: intelligence.recommendations[0] || `${top?.title || "Top content"} is the strongest current opportunity.`,
    topPost: top?.title || ""
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text, type = "text/plain; charset=utf-8") {
  response.writeHead(status, { "content-type": type });
  response.end(text);
}

function statePayload(store, request) {
  const summary = analyticsSummary(store);
  return {
    ...store,
    connectors: connectionStatus(store, request),
    summary,
    insights: buildInsights(store),
    postRankings: rankPosts(store),
    patterns: detectPatterns(store),
    contentIntelligence: buildContentIntelligence(store),
    normalizedSchema: {
      post: ["id", "connector", "externalId", "canonicalUrl", "title", "caption", "author", "mediaType", "campaign", "contentPillar", "tags", "publishedAt", "ingestedAt"],
      metric: ["id", "postId", "connector", "period", "date", "reach", "impressions", "engagements", "clicks", "videoViews", "watchSeconds", "conversions", "revenue"]
    }
  };
}

async function routeApi(request, response, url) {
  const store = await readStore();
  const method = request.method || "GET";
  const parts = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, { ok: true, service: "MetricFlow API" });
  }

  if (method === "GET" && url.pathname === "/api/state") {
    return sendJson(response, 200, statePayload(store, request));
  }

  if (method === "GET" && url.pathname === "/api/connectors") {
    return sendJson(response, 200, { connectors: connectionStatus(store, request), schema: statePayload(store, request).normalizedSchema });
  }

  if (method === "GET" && parts[1] === "connectors" && parts[3] === "connect") {
    const connector = CONNECTORS.find((item) => item.id === parts[2]);
    if (!connector) return sendJson(response, 404, { message: "Connector not found" });
    try {
      response.writeHead(302, { location: connectorAuthUrl(request, connector) });
      return response.end();
    } catch (error) {
      return sendJson(response, 400, { message: error.message });
    }
  }

  if (method === "GET" && parts[1] === "connectors" && parts[3] === "callback") {
    const connector = CONNECTORS.find((item) => item.id === parts[2]);
    try {
      if (!connector) throw new Error("Connector not found");
      if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error"));
      const code = url.searchParams.get("code");
      if (!code) throw new Error("Missing authorization code");
      const token = await exchangeConnectorCode(request, connector, code);
      store.connections = store.connections || {};
      store.connections[connector.id] = {
        accessToken: token.access_token,
        refreshToken: token.refresh_token || store.connections?.[connector.id]?.refreshToken,
        expiresAt: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(),
        propertyId: connector.id === "ga4" ? connectorEnv("ga4").propertyId : "",
        connectedAt: new Date().toISOString()
      };
      const target = store.connectors.find((item) => item.id === connector.id);
      if (target) target.connected = true;
      await writeStore(store);
      response.writeHead(302, { location: "/?connector=connected" });
      return response.end();
    } catch (error) {
      response.writeHead(302, { location: `/?connector=error&message=${encodeURIComponent(error.message)}` });
      return response.end();
    }
  }

  if (method === "POST" && parts[1] === "connectors" && parts[3] === "sync") {
    const result = await syncConnector(store, parts[2]);
    await writeStore(store);
    return sendJson(response, 200, { ...result, state: statePayload(store, request) });
  }

  if (method === "POST" && url.pathname === "/api/ingest/run") {
    const results = await runIngestion(store);
    await writeStore(store);
    return sendJson(response, 200, { results, state: statePayload(store, request) });
  }

  if (method === "GET" && url.pathname === "/api/export.csv") {
    response.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=\"metricflow-posts.csv\""
    });
    return response.end(csvForPosts(store));
  }

  if (method === "PATCH" && parts[1] === "connectors" && parts[2]) {
    const body = await readBody(request);
    const connector = store.connectors.find((item) => item.id === parts[2]);
    if (!connector) return sendJson(response, 404, { message: "Connector not found" });
    connector.connected = Boolean(body.connected);
    connector.status = connector.connected ? "ready" : "paused";
    await writeStore(store);
    return sendJson(response, 200, { connector, summary: analyticsSummary(store) });
  }

  if (method === "PUT" && url.pathname === "/api/settings") {
    const body = await readBody(request);
    store.settings = {
      companyName: body.companyName || store.settings.companyName,
      defaultKpi: body.defaultKpi || store.settings.defaultKpi,
      autoRefresh: Boolean(body.autoRefresh)
    };
    await writeStore(store);
    return sendJson(response, 200, { settings: store.settings });
  }

  if (method === "PUT" && url.pathname === "/api/schedule") {
    const body = await readBody(request);
    store.schedule = {
      frequency: body.frequency || store.schedule.frequency,
      day: body.day || store.schedule.day,
      recipients: body.recipients || store.schedule.recipients
    };
    await writeStore(store);
    return sendJson(response, 200, { schedule: store.schedule });
  }

  if (method === "POST" && url.pathname === "/api/rules") {
    const body = await readBody(request);
    const rule = {
      id: `rule-${Date.now()}`,
      title: body.title || "Pattern watch",
      detail: body.detail || "Notify the team when a content format beats its historical median twice in a row."
    };
    store.rules.push(rule);
    await writeStore(store);
    return sendJson(response, 201, { rule, rules: store.rules });
  }

  if (method === "DELETE" && parts[1] === "rules" && parts[2]) {
    const id = decodeURIComponent(parts[2]);
    store.rules = store.rules.filter((rule) => rule.id !== id);
    await writeStore(store);
    return sendJson(response, 200, { rules: store.rules });
  }

  if (method === "GET" && url.pathname === "/api/reports") {
    return sendJson(response, 200, { reports: store.reports });
  }

  if (method === "POST" && url.pathname === "/api/reports") {
    const body = await readBody(request);
    const report = createReport(store, body);
    store.reports.unshift(report);
    store.reports = store.reports.slice(0, 20);
    await writeStore(store);
    return sendJson(response, 201, { report, reports: store.reports });
  }

  return sendJson(response, 404, { message: "API route not found" });
}

async function routeStatic(request, response, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requested));

  if (!filePath.startsWith(ROOT)) {
    return sendText(response, 403, "Forbidden");
  }

  try {
    const content = await fs.readFile(filePath);
    const type = contentTypes[path.extname(filePath)] || "application/octet-stream";
    response.writeHead(200, { "content-type": type });
    response.end(content);
  } catch {
    sendText(response, 404, "Not found");
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(request, response, url);
    } else {
      await routeStatic(request, response, url);
    }
  } catch (error) {
    sendJson(response, 500, { message: error.message || "Server error" });
  }
});

ensureStore()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`MetricFlow running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
