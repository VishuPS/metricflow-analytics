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

function insertSource(source, index) {
  return `insert or replace into sources (name, color, reach, engagement, conversions, trend, connected, imported, position, updated_at)
values (${sqlString(source.name)}, ${sqlString(source.color)}, ${sqlNumber(source.reach)}, ${sqlNumber(source.engagement)}, ${sqlNumber(source.conversions)}, ${sqlNumber(source.trend)}, ${sqlBoolean(source.connected)}, ${sqlBoolean(source.imported)}, ${index}, ${sqlString(new Date().toISOString())});`;
}

function insertRule(rule) {
  return `insert or replace into rules (id, title, detail)
values (${sqlString(rule.id)}, ${sqlString(rule.title)}, ${sqlString(rule.detail)});`;
}

function insertReport(report) {
  return `insert or replace into reports (id, title, audience, sections, summary, recommendation, created_at)
values (${sqlString(report.id)}, ${sqlString(report.title)}, ${sqlString(report.audience)}, ${sqlString(JSON.stringify(report.sections || []))}, ${sqlString(JSON.stringify(report.summary || {}))}, ${sqlString(report.recommendation)}, ${sqlString(report.createdAt || new Date().toISOString())});`;
}

async function main() {
  const content = await fs.readFile(STORE_FILE, "utf8");
  const store = JSON.parse(content);
  const updatedAt = new Date().toISOString();
  const statements = [
    "delete from sources;",
    "delete from rules;",
    "delete from reports;",
    ...(store.sources || []).map(insertSource),
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
