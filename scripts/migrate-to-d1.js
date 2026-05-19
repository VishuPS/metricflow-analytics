const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const STORE_FILE = process.env.STORE_FILE || path.join(ROOT, "data", "store.json");
const OUTPUT_FILE = process.env.OUTPUT_FILE || path.join(ROOT, "dist", "d1-seed.sql");

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  return Number(value || 0);
}

function sqlBoolean(value) {
  return value ? 1 : 0;
}

function insertConnector(connector) {
  return `insert or replace into connectors (id, name, color, kind, connected, status, auth_url, token_url, scopes_json, last_sync_at, updated_at)
values (${sqlString(connector.id)}, ${sqlString(connector.name)}, ${sqlString(connector.color)}, ${sqlString(connector.kind)}, ${sqlBoolean(connector.connected)}, ${sqlString(connector.status || "needs_setup")}, ${sqlString(connector.authUrl)}, ${sqlString(connector.tokenUrl)}, ${sqlString(JSON.stringify(connector.scopes || []))}, ${sqlString(connector.lastSyncAt)}, ${sqlString(new Date().toISOString())});`;
}

function insertConnection(connectorId, connection) {
  return `insert or replace into connector_connections (connector_id, mode, access_token, refresh_token, expires_at, property_id, raw_json, connected_at, updated_at)
values (${sqlString(connectorId)}, ${sqlString(connection.mode || "oauth")}, ${sqlString(connection.accessToken)}, ${sqlString(connection.refreshToken)}, ${sqlString(connection.expiresAt)}, ${sqlString(connection.propertyId)}, ${sqlString(JSON.stringify(connection.raw || {}))}, ${sqlString(connection.connectedAt || new Date().toISOString())}, ${sqlString(new Date().toISOString())});`;
}

function insertPost(post) {
  return `insert or replace into posts (id, connector_id, external_id, canonical_url, title, caption, author, media_type, campaign, content_pillar, tags_json, published_at, ingested_at, raw_json)
values (${sqlString(post.id)}, ${sqlString(post.connector)}, ${sqlString(post.externalId)}, ${sqlString(post.canonicalUrl)}, ${sqlString(post.title)}, ${sqlString(post.caption)}, ${sqlString(post.author)}, ${sqlString(post.mediaType)}, ${sqlString(post.campaign)}, ${sqlString(post.contentPillar)}, ${sqlString(JSON.stringify(post.tags || []))}, ${sqlString(post.publishedAt)}, ${sqlString(post.ingestedAt || new Date().toISOString())}, ${sqlString(JSON.stringify(post.raw || {}))});`;
}

function insertMetric(metric) {
  return `insert or replace into post_metric_snapshots (id, post_id, connector_id, external_post_id, period, date, reach, impressions, engagements, reactions, comments, shares, saves, clicks, video_views, watch_seconds, conversions, revenue, raw_json, captured_at)
values (${sqlString(metric.id)}, ${sqlString(metric.postId)}, ${sqlString(metric.connector)}, ${sqlString(metric.externalPostId)}, ${sqlString(metric.period || "daily")}, ${sqlString(metric.date)}, ${sqlNumber(metric.reach)}, ${sqlNumber(metric.impressions)}, ${sqlNumber(metric.engagements)}, ${sqlNumber(metric.reactions)}, ${sqlNumber(metric.comments)}, ${sqlNumber(metric.shares)}, ${sqlNumber(metric.saves)}, ${sqlNumber(metric.clicks)}, ${sqlNumber(metric.videoViews)}, ${sqlNumber(metric.watchSeconds)}, ${sqlNumber(metric.conversions)}, ${sqlNumber(metric.revenue)}, ${sqlString(JSON.stringify(metric.raw || {}))}, ${sqlString(metric.capturedAt || new Date().toISOString())});`;
}

function insertRule(rule) {
  return `insert or replace into rules (id, title, detail)
values (${sqlString(rule.id)}, ${sqlString(rule.title)}, ${sqlString(rule.detail)});`;
}

function insertReport(report) {
  return `insert or replace into reports (id, title, audience, sections, summary, recommendation, top_post, created_at)
values (${sqlString(report.id)}, ${sqlString(report.title)}, ${sqlString(report.audience)}, ${sqlString(JSON.stringify(report.sections || []))}, ${sqlString(JSON.stringify(report.summary || {}))}, ${sqlString(report.recommendation)}, ${sqlString(report.topPost)}, ${sqlString(report.createdAt || new Date().toISOString())});`;
}

async function main() {
  const content = await fs.readFile(STORE_FILE, "utf8");
  const store = JSON.parse(content);
  const updatedAt = new Date().toISOString();
  const statements = [
    "delete from post_metric_snapshots;",
    "delete from posts;",
    "delete from connector_connections;",
    "delete from connectors;",
    "delete from rules;",
    "delete from reports;",
    ...(store.connectors || []).map(insertConnector),
    ...Object.entries(store.connections || {}).map(([connectorId, connection]) => insertConnection(connectorId, connection)),
    ...(store.posts || []).map(insertPost),
    ...(store.metrics || []).map(insertMetric),
    ...(store.rules || []).map(insertRule),
    `insert or replace into settings (id, company_name, default_kpi, auto_refresh, updated_at)
values ('default', ${sqlString(store.settings?.companyName || "Northstar Studio")}, ${sqlString(store.settings?.defaultKpi || "Engagement rate")}, ${sqlBoolean(store.settings?.autoRefresh)}, ${sqlString(updatedAt)});`,
    `insert or replace into schedule (id, frequency, day, recipients, updated_at)
values ('default', ${sqlString(store.schedule?.frequency || "Weekly")}, ${sqlString(store.schedule?.day || "Monday")}, ${sqlString(store.schedule?.recipients || "team@example.com")}, ${sqlString(updatedAt)});`,
    ...(store.reports || []).slice(0, 20).map(insertReport)
  ];

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${statements.join("\n\n")}\n`, "utf8");
  console.log(`D1 seed SQL written to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
