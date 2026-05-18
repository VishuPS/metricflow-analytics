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

    if (method === "GET" && requestUrl.pathname === "/api/state") {
      return json({
        ...store,
        summary: analyticsSummary(store),
        insights: buildInsights(store)
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
