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

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function requireDb(env) {
  if (!env.DB) throw new Error("Missing Cloudflare D1 binding named DB");
  return env.DB;
}

function sourceToRow(source, index = 0) {
  return {
    name: source.name,
    color: source.color,
    reach: Number(source.reach || 0),
    engagement: Number(source.engagement || 0),
    conversions: Number(source.conversions || 0),
    trend: Number(source.trend || 0),
    connected: source.connected ? 1 : 0,
    imported: source.imported ? 1 : 0,
    position: index,
    updated_at: new Date().toISOString()
  };
}

function sourceFromRow(row) {
  return {
    name: row.name,
    color: row.color,
    reach: Number(row.reach || 0),
    engagement: Number(row.engagement || 0),
    conversions: Number(row.conversions || 0),
    trend: Number(row.trend || 0),
    connected: Boolean(row.connected),
    ...(row.imported ? { imported: true } : {})
  };
}

function reportToRow(report) {
  return {
    id: report.id,
    title: report.title,
    audience: report.audience,
    sections: JSON.stringify(Array.isArray(report.sections) ? report.sections : []),
    summary: JSON.stringify(report.summary || {}),
    recommendation: report.recommendation,
    created_at: report.createdAt || new Date().toISOString()
  };
}

function reportFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    audience: row.audience,
    sections: JSON.parse(row.sections || "[]"),
    createdAt: row.created_at,
    summary: JSON.parse(row.summary || "{}"),
    recommendation: row.recommendation
  };
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
  return {
    id: `report-${Date.now()}`,
    title: payload.title || "Weekly performance report",
    audience: payload.audience || "Leadership team",
    sections: Array.isArray(payload.sections) ? payload.sections : [],
    createdAt: new Date().toISOString(),
    summary,
    recommendation: `${top?.name || "Your strongest channel"} is the current engagement leader. Shift one additional campaign test into that channel next period and watch conversion efficiency.`
  };
}

function csvForSources(store) {
  const rows = [["platform", "reach", "engagement", "conversions", "trend"]];
  activeSources(store).forEach((source) => {
    rows.push([source.name, source.reach, source.engagement, source.conversions, source.trend]);
  });
  return rows.map((row) => row.join(",")).join("\n");
}

function getGoogleConfig(env, requestUrl) {
  return {
    clientId: env.GOOGLE_CLIENT_ID || "",
    clientSecret: env.GOOGLE_CLIENT_SECRET || "",
    redirectUri: env.GOOGLE_REDIRECT_URI || `${requestUrl.origin}/api/google/callback`,
    propertyId: env.GA4_PROPERTY_ID || ""
  };
}

function requireGoogleConfig(env, requestUrl) {
  const config = getGoogleConfig(env, requestUrl);
  if (!config.clientId || !config.clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }
  return config;
}

function googleAuthUrl(env, requestUrl) {
  const config = requireGoogleConfig(env, requestUrl);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/analytics.readonly");
  return url.toString();
}

async function readGoogleConnection(db) {
  const row = await db.prepare("select * from google_connections where id = 'default'").first();
  if (!row) return null;
  return {
    propertyId: row.property_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
    connectedAt: row.connected_at
  };
}

async function writeGoogleConnection(db, connection) {
  await db.prepare(`
    insert into google_connections (id, property_id, access_token, refresh_token, expires_at, connected_at, updated_at)
    values ('default', ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      property_id = excluded.property_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).bind(
    connection.propertyId,
    connection.accessToken,
    connection.refreshToken,
    connection.expiresAt,
    connection.connectedAt || new Date().toISOString(),
    new Date().toISOString()
  ).run();
}

function googleStatus(config, connection) {
  return {
    configured: Boolean(config.clientId && config.clientSecret),
    connected: Boolean(connection?.refreshToken || connection?.accessToken),
    propertyId: connection?.propertyId || config.propertyId || ""
  };
}

async function exchangeGoogleCode(env, requestUrl, code) {
  const config = requireGoogleConfig(env, requestUrl);
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

async function refreshGoogleToken(env, requestUrl, db, connection) {
  const config = requireGoogleConfig(env, requestUrl);
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
  await writeGoogleConnection(db, connection);
  return connection.accessToken;
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

async function googleTrend(db, snapshot) {
  const previous = await db.prepare(`
    select reach from metric_snapshots
    where source = 'Google Analytics'
    order by snapshot_date desc, created_at desc
    limit 1
  `).first();
  if (!previous?.reach) return 0;
  return Number((((snapshot.reach - Number(previous.reach)) / Number(previous.reach)) * 100).toFixed(1));
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

async function writeMetricSnapshot(db, snapshot) {
  await db.prepare(`
    insert into metric_snapshots (id, source, snapshot_date, reach, engagement, conversions, raw_json)
    values (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    snapshot.id,
    snapshot.source,
    snapshot.snapshotDate,
    snapshot.reach,
    snapshot.engagement,
    snapshot.conversions,
    JSON.stringify(snapshot.raw || {})
  ).run();
}

async function syncGoogleAnalytics(env, requestUrl, db, store) {
  const config = getGoogleConfig(env, requestUrl);
  const connection = await readGoogleConnection(db);
  const propertyId = connection?.propertyId || config.propertyId;
  if (!propertyId) throw new Error("Missing GA4_PROPERTY_ID");
  const accessToken = await refreshGoogleToken(env, requestUrl, db, connection);

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
  const trend = await googleTrend(db, snapshot);
  await writeMetricSnapshot(db, snapshot);
  upsertGoogleSource(store, snapshot, trend);
  return { snapshot, connection: { ...connection, propertyId } };
}

async function readBody(request) {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const raw = await request.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function seedTable(db, table, countSql, insertStatements) {
  const row = await db.prepare(countSql).first();
  if (Number(row.total || 0) > 0) return;
  await db.batch(insertStatements);
}

async function ensureD1Store(db) {
  await db.prepare(`
    create table if not exists google_connections (
      id text primary key default 'default',
      property_id text,
      access_token text,
      refresh_token text,
      expires_at text,
      connected_at text not null default current_timestamp,
      updated_at text not null default current_timestamp,
      check (id = 'default')
    )
  `).run();
  await db.prepare(`
    create table if not exists metric_snapshots (
      id text primary key,
      source text not null,
      snapshot_date text not null,
      reach integer not null default 0,
      engagement integer not null default 0,
      conversions integer not null default 0,
      raw_json text not null default '{}',
      created_at text not null default current_timestamp
    )
  `).run();
  await db.prepare("create index if not exists metric_snapshots_source_date_idx on metric_snapshots (source, snapshot_date desc)").run();

  await seedTable(
    db,
    "sources",
    "select count(*) as total from sources",
    seedStore.sources.map((source, index) => {
      const row = sourceToRow(source, index);
      return db.prepare(`
        insert into sources (name, color, reach, engagement, conversions, trend, connected, imported, position, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(row.name, row.color, row.reach, row.engagement, row.conversions, row.trend, row.connected, row.imported, row.position, row.updated_at);
    })
  );

  await seedTable(
    db,
    "rules",
    "select count(*) as total from rules",
    seedStore.rules.map((rule) => (
      db.prepare("insert into rules (id, title, detail) values (?, ?, ?)").bind(rule.id, rule.title, rule.detail)
    ))
  );

  const settings = await db.prepare("select id from settings where id = 'default'").first();
  if (!settings) {
    await db.prepare(`
      insert into settings (id, company_name, default_kpi, auto_refresh)
      values ('default', ?, ?, ?)
    `).bind(seedStore.settings.companyName, seedStore.settings.defaultKpi, seedStore.settings.autoRefresh ? 1 : 0).run();
  }

  const schedule = await db.prepare("select id from schedule where id = 'default'").first();
  if (!schedule) {
    await db.prepare(`
      insert into schedule (id, frequency, day, recipients)
      values ('default', ?, ?, ?)
    `).bind(seedStore.schedule.frequency, seedStore.schedule.day, seedStore.schedule.recipients).run();
  }
}

async function readStore(db) {
  await ensureD1Store(db);
  const sources = await db.prepare("select * from sources order by position asc, created_at asc").all();
  const rules = await db.prepare("select * from rules order by created_at asc").all();
  const settings = await db.prepare("select * from settings where id = 'default'").first();
  const schedule = await db.prepare("select * from schedule where id = 'default'").first();
  const reports = await db.prepare("select * from reports order by created_at desc limit 20").all();

  return {
    sources: sources.results.map(sourceFromRow),
    rules: rules.results.map((rule) => ({ id: rule.id, title: rule.title, detail: rule.detail })),
    settings: {
      companyName: settings.company_name,
      defaultKpi: settings.default_kpi,
      autoRefresh: Boolean(settings.auto_refresh)
    },
    schedule: {
      frequency: schedule.frequency,
      day: schedule.day,
      recipients: schedule.recipients
    },
    reports: reports.results.map(reportFromRow)
  };
}

async function writeStore(db, store) {
  await ensureD1Store(db);
  const sourceStatements = store.sources.map((source, index) => {
    const row = sourceToRow(source, index);
    return db.prepare(`
      insert into sources (name, color, reach, engagement, conversions, trend, connected, imported, position, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(name) do update set
        color = excluded.color,
        reach = excluded.reach,
        engagement = excluded.engagement,
        conversions = excluded.conversions,
        trend = excluded.trend,
        connected = excluded.connected,
        imported = excluded.imported,
        position = excluded.position,
        updated_at = excluded.updated_at
    `).bind(row.name, row.color, row.reach, row.engagement, row.conversions, row.trend, row.connected, row.imported, row.position, row.updated_at);
  });
  const ruleStatements = store.rules.map((rule) => (
    db.prepare(`
      insert into rules (id, title, detail)
      values (?, ?, ?)
      on conflict(id) do update set title = excluded.title, detail = excluded.detail
    `).bind(rule.id, rule.title, rule.detail)
  ));
  const reportStatements = store.reports.slice(0, 20).map((report) => {
    const row = reportToRow(report);
    return db.prepare(`
      insert into reports (id, title, audience, sections, summary, recommendation, created_at)
      values (?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        title = excluded.title,
        audience = excluded.audience,
        sections = excluded.sections,
        summary = excluded.summary,
        recommendation = excluded.recommendation,
        created_at = excluded.created_at
    `).bind(row.id, row.title, row.audience, row.sections, row.summary, row.recommendation, row.created_at);
  });

  await db.batch([
    db.prepare("delete from sources"),
    db.prepare("delete from rules"),
    db.prepare("delete from reports"),
    ...sourceStatements,
    ...ruleStatements,
    ...reportStatements,
    db.prepare(`
      insert into settings (id, company_name, default_kpi, auto_refresh, updated_at)
      values ('default', ?, ?, ?, ?)
      on conflict(id) do update set
        company_name = excluded.company_name,
        default_kpi = excluded.default_kpi,
        auto_refresh = excluded.auto_refresh,
        updated_at = excluded.updated_at
    `).bind(store.settings.companyName, store.settings.defaultKpi, store.settings.autoRefresh ? 1 : 0, new Date().toISOString()),
    db.prepare(`
      insert into schedule (id, frequency, day, recipients, updated_at)
      values ('default', ?, ?, ?, ?)
      on conflict(id) do update set
        frequency = excluded.frequency,
        day = excluded.day,
        recipients = excluded.recipients,
        updated_at = excluded.updated_at
    `).bind(store.schedule.frequency, store.schedule.day, store.schedule.recipients, new Date().toISOString())
  ]);
}

export async function onRequest(context) {
  try {
    const db = requireDb(context.env);
    const requestUrl = new URL(context.request.url);
    const method = context.request.method || "GET";
    const parts = requestUrl.pathname.split("/").filter(Boolean);

    if (method === "GET" && requestUrl.pathname === "/api/health") {
      await ensureD1Store(db);
      return json({ ok: true, service: "MetricFlow API" });
    }

    const store = await readStore(db);
    const googleConfig = getGoogleConfig(context.env, requestUrl);
    const googleConnection = await readGoogleConnection(db);

    if (method === "GET" && requestUrl.pathname === "/api/state") {
      return json({
        ...store,
        googleAnalytics: googleStatus(googleConfig, googleConnection),
        summary: analyticsSummary(store),
        insights: buildInsights(store)
      });
    }

    if (method === "GET" && requestUrl.pathname === "/api/google/status") {
      return json(googleStatus(googleConfig, googleConnection));
    }

    if (method === "GET" && requestUrl.pathname === "/api/google/connect") {
      return Response.redirect(googleAuthUrl(context.env, requestUrl), 302);
    }

    if (method === "GET" && requestUrl.pathname === "/api/google/callback") {
      try {
        if (requestUrl.searchParams.get("error")) throw new Error(requestUrl.searchParams.get("error"));
        const code = requestUrl.searchParams.get("code");
        if (!code) throw new Error("Missing Google authorization code");
        const token = await exchangeGoogleCode(context.env, requestUrl, code);
        await writeGoogleConnection(db, {
          propertyId: googleConfig.propertyId,
          accessToken: token.access_token,
          refreshToken: token.refresh_token || googleConnection?.refreshToken,
          expiresAt: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(),
          connectedAt: new Date().toISOString()
        });
        return Response.redirect(`${requestUrl.origin}/?ga=connected`, 302);
      } catch (error) {
        return Response.redirect(`${requestUrl.origin}/?ga=error&message=${encodeURIComponent(error.message)}`, 302);
      }
    }

    if (method === "POST" && requestUrl.pathname === "/api/sources/google-analytics/sync") {
      const result = await syncGoogleAnalytics(context.env, requestUrl, db, store);
      await writeStore(db, store);
      return json({
        snapshot: result.snapshot,
        sources: store.sources,
        googleAnalytics: googleStatus(googleConfig, result.connection),
        summary: analyticsSummary(store)
      });
    }

    if (method === "GET" && requestUrl.pathname === "/api/export.csv") {
      return new Response(csvForSources(store), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": "attachment; filename=\"metricflow-report.csv\""
        }
      });
    }

    if (method === "PATCH" && parts[1] === "sources" && parts[2]) {
      const body = await readBody(context.request);
      const sourceName = decodeURIComponent(parts.slice(2).join("/"));
      const source = store.sources.find((item) => item.name === sourceName);
      if (!source) return json({ message: "Source not found" }, 404);
      source.connected = Boolean(body.connected);
      await writeStore(db, store);
      return json({ source, summary: analyticsSummary(store) });
    }

    if (method === "POST" && requestUrl.pathname === "/api/import-csv") {
      const body = await readBody(context.request);
      const imports = parseCsv(body.csv);
      store.sources = store.sources.filter((source) => !source.imported).concat(imports);
      await writeStore(db, store);
      return json({ imported: imports.length, sources: store.sources, summary: analyticsSummary(store) }, 201);
    }

    if (method === "PUT" && requestUrl.pathname === "/api/settings") {
      const body = await readBody(context.request);
      store.settings = {
        companyName: body.companyName || store.settings.companyName,
        defaultKpi: body.defaultKpi || store.settings.defaultKpi,
        autoRefresh: Boolean(body.autoRefresh)
      };
      await writeStore(db, store);
      return json({ settings: store.settings });
    }

    if (method === "PUT" && requestUrl.pathname === "/api/schedule") {
      const body = await readBody(context.request);
      store.schedule = {
        frequency: body.frequency || store.schedule.frequency,
        day: body.day || store.schedule.day,
        recipients: body.recipients || store.schedule.recipients
      };
      await writeStore(db, store);
      return json({ schedule: store.schedule });
    }

    if (method === "POST" && requestUrl.pathname === "/api/rules") {
      const body = await readBody(context.request);
      const rule = {
        id: `rule-${Date.now()}`,
        title: body.title || "Audience shift",
        detail: body.detail || "Notify the team when a channel's audience growth outpaces its engagement growth."
      };
      store.rules.push(rule);
      await writeStore(db, store);
      return json({ rule, rules: store.rules }, 201);
    }

    if (method === "DELETE" && parts[1] === "rules" && parts[2]) {
      const id = decodeURIComponent(parts[2]);
      store.rules = store.rules.filter((rule) => rule.id !== id);
      await writeStore(db, store);
      return json({ rules: store.rules });
    }

    if (method === "GET" && requestUrl.pathname === "/api/reports") {
      return json({ reports: store.reports });
    }

    if (method === "POST" && requestUrl.pathname === "/api/reports") {
      const body = await readBody(context.request);
      const report = createReport(store, body);
      store.reports.unshift(report);
      store.reports = store.reports.slice(0, 20);
      await writeStore(db, store);
      return json({ report, reports: store.reports }, 201);
    }

    return json({ message: "API route not found" }, 404);
  } catch (error) {
    return json({ message: error.message || "Server error" }, 500);
  }
}
