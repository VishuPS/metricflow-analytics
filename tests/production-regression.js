const assert = require("node:assert/strict");
const { chromium, devices, request } = require("playwright");

const baseURL = process.env.METRICFLOW_URL || "https://metricflow-analytics.pages.dev";
const headed = process.argv.includes("--headed");
const defaultWindowsEdge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (process.platform === "win32" ? defaultWindowsEdge : undefined);
const mutatingApiPattern = /\/api\/(connectors\/.+|ingest\/run|reports|schedule|settings|rules(?:\/.+)?)$/;

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

function mockState() {
  const state = {
    connectors: [
      { id: "instagram", name: "Instagram", kind: "social", connected: true, configured: true, lastSyncAt: "2026-05-18T09:15:00.000Z" },
      { id: "linkedin", name: "LinkedIn", kind: "social", connected: true, configured: true, lastSyncAt: "2026-05-17T09:15:00.000Z" },
      { id: "youtube", name: "YouTube", kind: "social", connected: true, configured: true, lastSyncAt: "2026-05-16T09:15:00.000Z" },
      { id: "ga4", name: "GA4", kind: "web", connected: true, configured: true, propertyId: "demo", lastSyncAt: "2026-05-15T09:15:00.000Z" }
    ],
    postRankings: [
      {
        title: "Carousel: before and after onboarding audit",
        connector: "instagram",
        mediaType: "carousel",
        contentPillar: "proof",
        metrics: { reach: 30500, engagements: 4120, conversions: 63 },
        engagementChange: 110.2
      },
      {
        title: "Landing page: content ROI guide",
        connector: "ga4",
        mediaType: "landing_page",
        contentPillar: "conversion",
        metrics: { reach: 17100, engagements: 980, conversions: 194 },
        engagementChange: 88.5
      }
    ],
    insights: [
      { type: "spike", title: "Carousel spiked 110.2%", detail: "Reuse its carousel format and proof angle." },
      { type: "ranking", title: "Landing page leads conversions", detail: "It ranks highest on conversion weight." },
      { type: "pattern", title: "proof / carousel is strongest", detail: "This pattern averages 13.5% engagement rate." }
    ],
    patterns: [
      { key: "proof / carousel", posts: 1, engagementRate: 13.5, conversionRate: 0.2 },
      { key: "conversion / landing_page", posts: 1, engagementRate: 5.7, conversionRate: 1.1 }
    ],
    contentIntelligence: {
      recommendations: [
        "Expand proof with another carousel; it is carrying the highest post score.",
        "Create one controlled test per connector."
      ],
      nextBrief: { contentPillar: "proof", format: "carousel", angle: "Turn the strongest insight into a tactical checklist." }
    },
    normalizedSchema: {
      post: ["id", "connector", "externalId", "title", "mediaType", "contentPillar", "publishedAt"],
      metric: ["id", "postId", "date", "reach", "engagements", "conversions"]
    },
    rules: [
      { id: "rule-spike", title: "Spike detection", detail: "Flag posts whose engagement grows more than 35%." }
    ],
    settings: { companyName: "Northstar Studio", defaultKpi: "Engagement rate", autoRefresh: true },
    schedule: { frequency: "Weekly", day: "Monday", recipients: "team@example.com" },
    reports: [],
    summary: {
      trackedPosts: 2,
      totalReach: 47600,
      totalEngagement: 5100,
      totalConversions: 257,
      attributedRevenue: 12079,
      engagementRate: 10.7,
      connectedSources: 4,
      totalSources: 4,
      deltas: { reach: 44.1, engagement: 93.5, conversions: 86.2 },
      timeSavedHours: 6.2
    }
  };
  return state;
}

async function mockProductionWrites(page) {
  await page.route("**/api/state", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockState()) }));
  await page.route(mutatingApiPattern, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const state = mockState();

    if (method === "POST" && url.pathname === "/api/ingest/run") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [], state }) });
    }

    if (method === "POST" && url.pathname.includes("/sync")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ posts: [], metrics: [], state }) });
    }

    if (method === "PATCH" && url.pathname.startsWith("/api/connectors/")) {
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ connector: { id, name: id, connected: request.postDataJSON().connected, status: "ready" }, summary: state.summary })
      });
    }

    if (method === "POST" && url.pathname === "/api/reports") {
      const payload = request.postDataJSON();
      const report = {
        id: "test-report",
        title: payload.title || "Post intelligence report",
        audience: payload.audience || "Leadership team",
        sections: payload.sections || [],
        createdAt: new Date("2026-05-18T12:00:00.000Z").toISOString(),
        summary: state.summary,
        recommendation: "Expand proof with another carousel; it is carrying the highest post score."
      };
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ report, reports: [report] }) });
    }

    if (method === "POST" && url.pathname === "/api/rules") {
      const rule = { id: "test-rule-pattern", title: "Pattern watch", detail: "Notify the team when a content format beats its historical median twice in a row." };
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ rule, rules: [rule] }) });
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/rules/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rules: [] }) });
    }

    if (method === "PUT" && url.pathname === "/api/schedule") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schedule: request.postDataJSON() }) });
    }

    if (method === "PUT" && url.pathname === "/api/settings") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ settings: request.postDataJSON() }) });
    }

    return route.continue();
  });
}

async function bootApp(page) {
  const consoleProblems = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await mockProductionWrites(page);
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  assert.equal(await page.title(), "MetricFlow Analytics", "page title");
  await expectText(page.locator("#syncStatus"), /Backend connected/, "backend status");
  await expectText(page.locator("#kpiGrid"), /Tracked posts/, "KPI grid renders");
  assert.equal(await page.locator("#platformRows tr").count(), 2, "post row count");

  return { consoleProblems, pageErrors };
}

async function openView(page, viewName) {
  await page.getByRole("button", { name: viewName }).click();
  await expectText(page.locator("#viewTitle"), viewName === "Overview" ? /Post Intelligence/ : new RegExp(viewName), `${viewName} title`);
}

async function runUiRegression(browser, projectName, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const diagnostics = await bootApp(page);

  await expectText(page.locator("#timeSaved"), /hours/, "time saved renders");
  await expectText(page.locator("#platformRows"), /Carousel/, "post table renders");
  await expectText(page.locator("#insightList"), /spiked|ranking|pattern/i, "insights render");
  await page.getByRole("button", { name: "Run ingestion pipeline" }).click();
  await expectText(page.locator("#toast"), /pipeline completed/, "ingestion toast");

  for (const view of ["Connectors", "Intelligence", "Reports", "Automation", "Settings", "Overview"]) {
    await openView(page, view);
  }

  await openView(page, "Reports");
  await page.locator("#reportName").fill("Automated post report");
  await page.getByRole("button", { name: "Generate preview" }).click();
  await expectText(page.locator("#previewTitle"), /Automated post report/, "report preview title");

  await openView(page, "Connectors");
  await expectText(page.locator("#schemaFields"), /connector|externalId/, "schema renders");
  await page.getByRole("button", { name: "Sync" }).first().click();
  await expectText(page.locator("#toast"), /ingestion completed/, "connector sync toast");

  await openView(page, "Automation");
  await page.locator("#recipients").fill("team@example.com");
  await page.getByRole("button", { name: "Save schedule" }).click();
  await expectText(page.locator("#toast"), /Schedule saved/, "schedule toast");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expectText(page.locator("#ruleList"), /Pattern watch/, "rule added");

  await openView(page, "Settings");
  await page.locator("#companyName").fill("Northstar Studio");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expectText(page.locator("#toast"), /Settings saved/, "settings toast");

  if (projectName === "mobile") {
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

  const state = await api.get("/api/state");
  assert.equal(state.ok(), true, "state endpoint ok");
  const payload = await state.json();
  assert.ok(payload.connectors.length >= 4, "state has connectors");
  assert.ok(payload.postRankings.length >= 1, "state has post rankings");
  assert.ok(payload.normalizedSchema.post.includes("externalId"), "state has normalized schema");

  const csv = await api.get("/api/export.csv");
  assert.equal(csv.ok(), true, "CSV export endpoint ok");
  assert.match(csv.headers()["content-type"] || "", /text\/csv/, "CSV content type");
  assert.match(await csv.text(), /connector,post_id,title/, "CSV header");

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
