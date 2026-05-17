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
  reports: []
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
      summary: analyticsSummary(store),
      insights: buildInsights(store)
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
