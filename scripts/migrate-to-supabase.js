const fs = require("node:fs/promises");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.join(__dirname, "..");
try {
  require("dotenv").config({ path: path.join(ROOT, ".env") });
} catch {
  // Environment variables can also be provided directly by the shell.
}

const STORE_FILE = process.env.STORE_FILE || path.join(ROOT, "data", "store.json");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

function sourceToRow(source, index) {
  return {
    name: source.name,
    color: source.color,
    reach: Number(source.reach || 0),
    engagement: Number(source.engagement || 0),
    conversions: Number(source.conversions || 0),
    trend: Number(source.trend || 0),
    connected: Boolean(source.connected),
    imported: Boolean(source.imported),
    position: index,
    updated_at: new Date().toISOString()
  };
}

function reportToRow(report) {
  return {
    id: report.id,
    title: report.title,
    audience: report.audience,
    sections: Array.isArray(report.sections) ? report.sections : [],
    summary: report.summary || {},
    recommendation: report.recommendation,
    created_at: report.createdAt || new Date().toISOString()
  };
}

async function replaceTable(client, table, rows, requiredColumn) {
  const deleteResult = await client.from(table).delete().neq(requiredColumn, "");
  if (deleteResult.error) throw new Error(`Clear ${table}: ${deleteResult.error.message}`);
  if (!rows.length) return;
  const insertResult = await client.from(table).insert(rows);
  if (insertResult.error) throw new Error(`Insert ${table}: ${insertResult.error.message}`);
}

async function main() {
  const content = await fs.readFile(STORE_FILE, "utf8");
  const store = JSON.parse(content);
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  await replaceTable(client, "sources", (store.sources || []).map(sourceToRow), "name");
  await replaceTable(client, "rules", (store.rules || []).map((rule) => ({
    id: rule.id,
    title: rule.title,
    detail: rule.detail
  })), "id");
  await replaceTable(client, "reports", (store.reports || []).slice(0, 20).map(reportToRow), "id");

  const settingsResult = await client.from("settings").upsert({
    id: "default",
    company_name: store.settings?.companyName || "Northstar Studio",
    default_kpi: store.settings?.defaultKpi || "Engagement rate",
    auto_refresh: Boolean(store.settings?.autoRefresh),
    updated_at: new Date().toISOString()
  });
  if (settingsResult.error) throw new Error(`Save settings: ${settingsResult.error.message}`);

  const scheduleResult = await client.from("schedule").upsert({
    id: "default",
    frequency: store.schedule?.frequency || "Weekly",
    day: store.schedule?.day || "Monday",
    recipients: store.schedule?.recipients || "team@example.com",
    updated_at: new Date().toISOString()
  });
  if (scheduleResult.error) throw new Error(`Save schedule: ${scheduleResult.error.message}`);

  console.log("Migration complete.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
