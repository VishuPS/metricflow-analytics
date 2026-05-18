const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

const seedStore = {
  sources: [
    { name: "LinkedIn", color: "#0a66c2", reach: 48200, engagement: 2840, conversions: 126, trend: 12.4, connected: true },
    { name: "Instagram", color: "#c13584", reach: 75600, engagement: 6120, conversions: 218, trend: 8.7, connected: true },
    { name: "Facebook", color: "#1877f2", reach: 38900, engagement: 1930, conversions: 81, trend: -2.8, connected: false },
    { name: "TikTok", color: "#111111", reach: 92400, engagement: 8480, conversions: 174, trend: 18.9, connected: true },
    { name: "YouTube", color: "#ff0000", reach: 44100, engagement: 2360, conversions: 96, trend: 6.2, connected: true },
    { name: "Google Analytics", color: "#f9ab00", reach: 53800, engagement: 3190, conversions: 312, trend: 4.1, connected: true }
  ],
  rules: [
    { id: "rule-engagement-spike", title: "Engagement spike", detail: "Alert when any platform grows engagement by more than 15% week over week." },
    { id: "rule-report-ready", title: "Report ready", detail: "Generate a summary every Monday at 9:00 and stage it for review." },
    { id: "rule-conversion-dip", title: "Conversion dip", detail: "Flag channels where conversions fall by more than 8%." }
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
  reports: [],
  googleConnection: null,
  metricSnapshots: []
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

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
  return JSON.parse(content);
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function activeSources(store) {
  return store.sources.filter((source) => source.connected);
}

function analyticsSummary(store) {
  const active = activeSources(store);
  const reach = active.reduce((sum, source) => sum + Number(source.reach || 0), 0);
  const engagement = active.reduce((sum, source) => sum + Number(source.engagement || 0), 0);
  const conversions = active.reduce((sum, source) => sum + Number(source.conversions || 0), 0);
  const engagementRate = reach ? (engagement / reach) * 100 : 0;

  return {
    totalReach: reach,
    totalEngagement: engagement,
    totalConversions: conversions,
    engagementRate,
    connectedSources: active.length,
    totalSources: store.sources.length,
    timeSavedHours: Number((active.length * 1.1 + 0.9).toFixed(1))
  };
}

function buildInsights(store) {
  const active = activeSources(store);
  const byReach = [...active].sort((a, b) => b.reach - a.reach)[0];
  const byConversions = [...active].sort((a, b) => b.conversions - a.conversions)[0];
  const declining = active.find((source) => source.trend < 0);

  return [
    {
      title: `${byReach?.name || "Top channel"} is driving reach`,
      detail: `Prioritize the content format that lifted ${byReach?.name || "your leading platform"} over the last reporting period.`
    },
    {
      title: `${byConversions?.name || "Conversion channel"} is closest to revenue`,
      detail: "Use this channel as the benchmark for landing-page and campaign attribution."
    },
    {
      title: declining ? `${declining.name} needs attention` : "No channel is declining",
      detail: declining ? "Engagement is softening. Queue a content audit before next week's report." : "Current connected sources show positive movement across the board."
    }
  ];
}

function parseCsv(text) {
  const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
  const rows = lines.slice(1);
  return rows.map((row, index) => {
    const [name, reach, engagement, conversions] = row.split(",").map((cell) => cell.trim());
    return {
      name: name || `Imported ${index + 1}`,
      color: index % 2 ? "#8f5f2a" : "#3d6b52",
      reach: Number(reach) || 0,
      engagement: Number(engagement) || 0,
      conversions: Number(conversions) || 0,
      trend: 3 + index,
      connected: true,
      imported: true
    };
  });
}

function createReport(store, payload = {}) {
  const summary = analyticsSummary(store);
  const active = activeSources(store);
  const top = [...active].sort((a, b) => b.engagement - a.engagement)[0];
  const report = {
    id: `report-${Date.now()}`,
    title: payload.title || "Weekly performance report",
    audience: payload.audience || "Leadership team",
    sections: Array.isArray(payload.sections) ? payload.sections : [],
    createdAt: new Date().toISOString(),
    summary,
    recommendation: `${top?.name || "Your strongest channel"} is the current engagement leader. Shift one additional campaign test into that channel next period and watch conversion efficiency.`
  };
  return report;
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

function csvForSources(store) {
  const rows = [["platform", "reach", "engagement", "conversions", "trend"]];
  activeSources(store).forEach((source) => {
    rows.push([source.name, source.reach, source.engagement, source.conversions, source.trend]);
  });
  return rows.map((row) => row.join(",")).join("\n");
}

function getGoogleConfig(request) {
  const host = request.headers.host || `localhost:${PORT}`;
  const protocol = host.includes("localhost") ? "http" : "https";
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/google/callback`,
    propertyId: process.env.GA4_PROPERTY_ID || ""
  };
}

function googleStatus(store, request) {
  const config = getGoogleConfig(request);
  const connection = store.googleConnection || {};
  return {
    configured: Boolean(config.clientId && config.clientSecret),
    connected: Boolean(connection.refreshToken || connection.accessToken),
    propertyId: connection.propertyId || config.propertyId || ""
  };
}

function requireGoogleConfig(request) {
  const config = getGoogleConfig(request);
  if (!config.clientId || !config.clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }
  return config;
}

function googleAuthUrl(request) {
  const config = requireGoogleConfig(request);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/analytics.readonly");
  return url.toString();
}

async function exchangeGoogleCode(request, code) {
  const config = requireGoogleConfig(request);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code"
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || payload.error || "Google token exchange failed");
  return payload;
}

async function refreshGoogleToken(request, store) {
  const config = requireGoogleConfig(request);
  const connection = store.googleConnection;
  if (!connection?.refreshToken) throw new Error("Google Analytics is not connected");
  const expiresAt = connection.expiresAt ? new Date(connection.expiresAt).getTime() : 0;
  if (connection.accessToken && expiresAt > Date.now() + 60_000) return connection.accessToken;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token"
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error_description || payload.error || "Google token refresh failed");

  connection.accessToken = payload.access_token;
  connection.expiresAt = new Date(Date.now() + Number(payload.expires_in || 3600) * 1000).toISOString();
  return connection.accessToken;
}

function upsertGoogleSource(store, snapshot, trend) {
  const source = store.sources.find((item) => item.name === "Google Analytics");
  const data = {
    name: "Google Analytics",
    color: "#f9ab00",
    reach: snapshot.reach,
    engagement: snapshot.engagement,
    conversions: snapshot.conversions,
    trend,
    connected: true
  };
  if (source) Object.assign(source, data);
  else store.sources.push(data);
}

function buildGoogleSnapshot(report) {
  const rows = report.rows || [];
  const totals = rows.reduce((sum, row) => {
    const values = row.metricValues || [];
    sum.reach += Number(values[0]?.value || 0);
    sum.sessions += Number(values[1]?.value || 0);
    sum.engagementRate += Number(values[2]?.value || 0);
    sum.conversions += Number(values[3]?.value || 0);
    return sum;
  }, { reach: 0, sessions: 0, engagementRate: 0, conversions: 0 });
  const avgEngagementRate = rows.length ? totals.engagementRate / rows.length : 0;
  return {
    id: `snapshot-google-analytics-${Date.now()}`,
    source: "Google Analytics",
    snapshotDate: new Date().toISOString().slice(0, 10),
    reach: Math.round(totals.reach),
    engagement: Math.round(totals.sessions * avgEngagementRate),
    conversions: Math.round(totals.conversions),
    raw: report
  };
}

function googleTrend(store, snapshot) {
  const previous = [...(store.metricSnapshots || [])]
    .filter((item) => item.source === "Google Analytics")
    .sort((a, b) => String(b.snapshotDate).localeCompare(String(a.snapshotDate)))[0];
  if (!previous || !previous.reach) return 0;
  return Number((((snapshot.reach - previous.reach) / previous.reach) * 100).toFixed(1));
}

async function syncGoogleAnalytics(request, store) {
  const config = getGoogleConfig(request);
  const propertyId = store.googleConnection?.propertyId || config.propertyId;
  if (!propertyId) throw new Error("Missing GA4_PROPERTY_ID");
  const accessToken = await refreshGoogleToken(request, store);

  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "engagementRate" },
        { name: "conversions" }
      ]
    })
  });
  const report = await response.json();
  if (!response.ok) throw new Error(report.error?.message || "Google Analytics report failed");

  const snapshot = buildGoogleSnapshot(report);
  const trend = googleTrend(store, snapshot);
  store.metricSnapshots = [...(store.metricSnapshots || []), snapshot].slice(-100);
  upsertGoogleSource(store, snapshot, trend);
  return snapshot;
}

async function routeApi(request, response, url) {
  const store = await readStore();
  const method = request.method || "GET";
  const parts = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, { ok: true, service: "MetricFlow API" });
  }

  if (method === "GET" && url.pathname === "/api/state") {
    return sendJson(response, 200, {
      ...store,
      googleAnalytics: googleStatus(store, request),
      summary: analyticsSummary(store),
      insights: buildInsights(store)
    });
  }

  if (method === "GET" && url.pathname === "/api/google/status") {
    return sendJson(response, 200, googleStatus(store, request));
  }

  if (method === "GET" && url.pathname === "/api/google/connect") {
    try {
      response.writeHead(302, { location: googleAuthUrl(request) });
      return response.end();
    } catch (error) {
      return sendJson(response, 400, { message: error.message });
    }
  }

  if (method === "GET" && url.pathname === "/api/google/callback") {
    try {
      if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error"));
      const code = url.searchParams.get("code");
      if (!code) throw new Error("Missing Google authorization code");
      const token = await exchangeGoogleCode(request, code);
      const config = getGoogleConfig(request);
      store.googleConnection = {
        propertyId: config.propertyId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token || store.googleConnection?.refreshToken,
        expiresAt: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(),
        connectedAt: new Date().toISOString()
      };
      await writeStore(store);
      response.writeHead(302, { location: "/?ga=connected" });
      return response.end();
    } catch (error) {
      response.writeHead(302, { location: `/?ga=error&message=${encodeURIComponent(error.message)}` });
      return response.end();
    }
  }

  if (method === "POST" && url.pathname === "/api/sources/google-analytics/sync") {
    const snapshot = await syncGoogleAnalytics(request, store);
    await writeStore(store);
    return sendJson(response, 200, {
      snapshot,
      sources: store.sources,
      googleAnalytics: googleStatus(store, request),
      summary: analyticsSummary(store)
    });
  }

  if (method === "GET" && url.pathname === "/api/export.csv") {
    response.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=\"metricflow-report.csv\""
    });
    return response.end(csvForSources(store));
  }

  if (method === "PATCH" && parts[1] === "sources" && parts[2]) {
    const body = await readBody(request);
    const sourceName = decodeURIComponent(parts.slice(2).join("/"));
    const source = store.sources.find((item) => item.name === sourceName);
    if (!source) return sendJson(response, 404, { message: "Source not found" });
    source.connected = Boolean(body.connected);
    await writeStore(store);
    return sendJson(response, 200, { source, summary: analyticsSummary(store) });
  }

  if (method === "POST" && url.pathname === "/api/import-csv") {
    const body = await readBody(request);
    const imports = parseCsv(body.csv);
    store.sources = store.sources.filter((source) => !source.imported).concat(imports);
    await writeStore(store);
    return sendJson(response, 201, { imported: imports.length, sources: store.sources, summary: analyticsSummary(store) });
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
      title: body.title || "Audience shift",
      detail: body.detail || "Notify the team when a channel's audience growth outpaces its engagement growth."
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
