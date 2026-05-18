const assert = require("node:assert/strict");
const { chromium, devices, request } = require("playwright");

const baseURL = process.env.METRICFLOW_URL || "https://metricflow-analytics.pages.dev";
const headed = process.argv.includes("--headed");
const defaultWindowsEdge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (process.platform === "win32" ? defaultWindowsEdge : undefined);
const mutatingApiPattern = /\/api\/(sources\/.+|import-csv|reports|schedule|settings|rules(?:\/.+)?)$/;

function absoluteUrl(path) {
  return new URL(path, baseURL).toString();
}

async function expectText(locator, expected, label) {
  const deadline = Date.now() + 10_000;
  let text = "";
  while (Date.now() < deadline) {
    text = (await locator.textContent({ timeout: 1_000 }).catch(() => "")) || "";
    if (expected.test(text)) return;
    await locator.page().waitForTimeout(100);
  }
  assert.match(text, expected, label);
}

async function mockProductionWrites(page) {
  await page.route(mutatingApiPattern, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === "PATCH" && url.pathname.startsWith("/api/sources/")) {
      const payload = request.postDataJSON();
      const sourceName = decodeURIComponent(url.pathname.split("/").pop());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: { name: sourceName, connected: Boolean(payload.connected) },
          summary: {
            totalReach: 314100,
            totalEngagement: 22990,
            totalConversions: 926,
            engagementRate: 7.3,
            connectedSources: payload.connected ? 6 : 4,
            totalSources: 6,
            timeSavedHours: 6.4
          }
        })
      });
    }

    if (method === "POST" && url.pathname === "/api/reports") {
      const payload = request.postDataJSON();
      const report = {
        id: "test-report",
        title: payload.title || "Weekly performance report",
        audience: payload.audience || "Leadership team",
        sections: payload.sections || [],
        createdAt: new Date("2026-05-18T12:00:00.000Z").toISOString(),
        summary: {
          totalReach: 314100,
          totalEngagement: 22990,
          totalConversions: 926,
          connectedSources: 5
        },
        recommendation: "TikTok is the current engagement leader. Shift one additional campaign test into that channel next period and watch conversion efficiency."
      };
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ report, reports: [report] })
      });
    }

    if (method === "POST" && url.pathname === "/api/import-csv") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          imported: 1,
          sources: [
            { name: "LinkedIn", color: "#0a66c2", reach: 48200, engagement: 2840, conversions: 126, trend: 12.4, connected: true },
            { name: "Newsletter", color: "#3d6b52", reach: 18500, engagement: 940, conversions: 86, trend: 3, connected: true, imported: true }
          ],
          summary: {
            totalReach: 66700,
            totalEngagement: 3780,
            totalConversions: 212,
            engagementRate: 5.7,
            connectedSources: 2,
            totalSources: 2,
            timeSavedHours: 3.1
          }
        })
      });
    }

    if (method === "POST" && url.pathname === "/api/rules") {
      const rule = {
        id: "test-rule-audience-shift",
        title: "Audience shift",
        detail: "Notify the team when a channel's audience growth outpaces its engagement growth."
      };
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ rule, rules: [rule] })
      });
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/rules/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rules: [] })
      });
    }

    if (method === "PUT" && url.pathname === "/api/schedule") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ schedule: request.postDataJSON() })
      });
    }

    if (method === "PUT" && url.pathname === "/api/settings") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ settings: request.postDataJSON() })
      });
    }

    return route.continue();
  });
}

async function bootApp(page) {
  const consoleProblems = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await mockProductionWrites(page);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  assert.equal(await page.title(), "MetricFlow Analytics", "page title");
  await expectText(page.locator("#syncStatus"), /Backend connected/, "backend status");
  await expectText(page.locator("#kpiGrid"), /Total reach/, "KPI grid renders");
  assert.equal(await page.locator("#platformRows tr").count(), 5, "platform row count");

  return { consoleProblems, pageErrors };
}

async function openView(page, viewName) {
  await page.getByRole("button", { name: new RegExp(viewName) }).click();
  await expectText(page.locator("#viewTitle"), new RegExp(viewName), `${viewName} title`);
  const className = await page.locator(`#${viewName.toLowerCase()}`).getAttribute("class");
  assert.match(className || "", /active/, `${viewName} view is active`);
}

async function runUiRegression(browser, projectName, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const diagnostics = await bootApp(page);

  await expectText(page.locator("#timeSaved"), /hours/, "time saved renders");
  await expectText(page.locator("#platformRows"), /TikTok/, "platform table renders");
  await expectText(page.locator("#insightList"), /driving reach/, "insights render");

  for (const view of ["Sources", "Reports", "Automation", "Settings", "Overview"]) {
    await openView(page, view);
  }

  await page.getByRole("button", { name: "Refresh data" }).click();
  await expectText(page.locator("#toast"), /Metrics refreshed from backend/, "refresh toast");

  await page.getByRole("button", { name: "New report" }).click();
  await expectText(page.locator("#viewTitle"), /Reports/, "new report opens reports");
  await page.locator("#reportName").fill("Automated smoke report");
  await page.getByRole("button", { name: "Generate preview" }).click();
  await expectText(page.locator("#previewTitle"), /Automated smoke report/, "report preview title");
  await expectText(page.locator("#toast"), /Report preview generated/, "report toast");

  await openView(page, "Sources");
  await page.locator("#csvInput").fill("platform,reach,engagement,conversions\nNewsletter,18500,940,86");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await expectText(page.locator("#sourceGrid"), /Newsletter/, "CSV import render");

  await openView(page, "Automation");
  await page.locator("#recipients").fill("team@example.com");
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expectText(page.locator("#toast"), /Schedule saved/, "schedule toast");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expectText(page.locator("#ruleList"), /Audience shift/, "rule added");
  await page.getByRole("button", { name: "Remove" }).first().click();
  await expectText(page.locator("#toast"), /Rule removed/, "rule removed toast");

  await openView(page, "Settings");
  await page.locator("#companyName").fill("Northstar Studio");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expectText(page.locator("#toast"), /Settings saved/, "settings toast");

  if (projectName === "mobile") {
    await openView(page, "Reports");
    await page.locator("#reportName").waitFor({ state: "visible" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `mobile horizontal overflow is ${overflow}px`);
  }

  assert.deepEqual(diagnostics.consoleProblems, [], `${projectName} console warnings/errors`);
  assert.deepEqual(diagnostics.pageErrors, [], `${projectName} page errors`);
  await context.close();
}

async function runApiRegression() {
  const api = await request.newContext({ baseURL });

  const health = await api.get("/api/health");
  assert.equal(health.ok(), true, "health endpoint ok");
  assert.deepEqual(await health.json(), { ok: true, service: "MetricFlow API" }, "health payload");

  const state = await api.get("/api/state");
  assert.equal(state.ok(), true, "state endpoint ok");
  const payload = await state.json();
  assert.ok(payload.sources.length >= 5, "state has sources");
  assert.ok(payload.summary.totalReach > 0, "state has positive reach");
  assert.ok(payload.insights.length >= 1, "state has insights");

  const csv = await api.get("/api/export.csv");
  assert.equal(csv.ok(), true, "CSV export endpoint ok");
  assert.match(csv.headers()["content-type"] || "", /text\/csv/, "CSV content type");
  assert.match(await csv.text(), /platform,reach,engagement,conversions,trend/, "CSV header");

  await api.dispose();
}

async function main() {
  console.log(`Smoke target: ${baseURL}`);
  const browser = await chromium.launch({ headless: !headed, executablePath });

  try {
    await runUiRegression(browser, "desktop", { viewport: { width: 1280, height: 720 } });
    console.log("PASS desktop UI regression");

    await runUiRegression(browser, "mobile", { ...devices["Pixel 7"] });
    console.log("PASS mobile UI regression");

    await runApiRegression();
    console.log("PASS read-only API regression");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
