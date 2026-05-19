const seedState = {
  connectors: [],
  posts: [],
  metrics: [],
  postRankings: [],
  insights: [],
  patterns: [],
  contentIntelligence: { recommendations: [], winningFormats: [], nextBrief: {} },
  rules: [
    { id: "rule-spike", title: "Spike detection", detail: "Flag posts whose engagement grows more than 35% versus their prior observation." }
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
  summary: {
    totalReach: 0,
    totalEngagement: 0,
    totalConversions: 0,
    attributedRevenue: 0,
    engagementRate: 0,
    connectedSources: 0,
    totalSources: 4,
    trackedPosts: 0,
    deltas: { reach: 0, engagement: 0, conversions: 0 },
    timeSavedHours: 0
  }
};

let state = loadFallbackState();
let backendOnline = false;

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function loadFallbackState() {
  return JSON.parse(localStorage.getItem("metricflow.state.v2") || "null") || structuredClone(seedState);
}

function saveFallbackState() {
  localStorage.setItem("metricflow.state.v2", JSON.stringify(state));
}

async function api(path, options = {}) {
  const baseUrl = window.METRICFLOW_API_BASE_URL || "";
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || "Request failed");
  }
  const type = response.headers.get("content-type") || "";
  return type.includes("application/json") ? response.json() : response.text();
}

async function loadBackendState() {
  try {
    state = await api("/api/state");
    backendOnline = true;
    document.querySelector("#syncStatus").textContent = "Backend connected";
  } catch {
    backendOnline = false;
    document.querySelector("#syncStatus").textContent = "Browser-only mode";
  }
}

function formatNumber(value) {
  return numberFormatter.format(Math.round(Number(value || 0)));
}

function formatDelta(value) {
  const number = Number(value || 0);
  return `${number >= 0 ? "+" : ""}${percentFormatter.format(number)}%`;
}

function connectorName(id) {
  return state.connectors.find((connector) => connector.id === id)?.name || id;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function renderKpis() {
  const summary = state.summary || seedState.summary;
  const kpis = [
    ["Tracked posts", formatNumber(summary.trackedPosts), `${summary.connectedSources}/${summary.totalSources} connectors`],
    ["Post reach", formatNumber(summary.totalReach), formatDelta(summary.deltas?.reach)],
    ["Engagement rate", `${percentFormatter.format(summary.engagementRate)}%`, formatDelta(summary.deltas?.engagement)],
    ["Attributed revenue", currencyFormatter.format(summary.attributedRevenue), formatDelta(summary.deltas?.conversions)]
  ];

  document.querySelector("#kpiGrid").innerHTML = kpis.map(([label, value, change]) => `
    <article class="kpi-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <div class="metric-change ${String(change).startsWith("-") ? "down" : ""}">${change}</div>
    </article>
  `).join("");
}

function renderPostRows() {
  const rows = state.postRankings || [];
  document.querySelector("#platformRows").innerHTML = rows.map((post, index) => `
    <tr>
      <td>
        <div class="platform-name">
          <span class="rank-badge">${index + 1}</span>
          <div>
            <strong>${post.title}</strong>
            <small>${connectorName(post.connector)} / ${post.mediaType} / ${post.contentPillar}</small>
          </div>
        </div>
      </td>
      <td>${formatNumber(post.metrics?.reach)}</td>
      <td>${formatNumber(post.metrics?.engagements)}</td>
      <td>${formatNumber(post.metrics?.conversions)}</td>
      <td class="${Number(post.engagementChange || 0) >= 0 ? "trend-up" : "trend-down"}">${formatDelta(post.engagementChange)}</td>
    </tr>
  `).join("");
}

function renderInsights() {
  document.querySelector("#insightList").innerHTML = (state.insights || []).map((insight) => `
    <article class="insight">
      <span>${insight.type || "insight"}</span>
      <strong>${insight.title}</strong>
      <p>${insight.detail}</p>
    </article>
  `).join("");
}

function renderConnectors() {
  const apiBaseUrl = window.METRICFLOW_API_BASE_URL || "";
  document.querySelector("#sourceGrid").innerHTML = (state.connectors || []).map((connector) => `
    <article class="source-card">
      <header>
        <div>
          <strong>${connector.name}</strong>
          <span>${connector.kind === "web" ? "Web analytics" : "Social posts"} connector</span>
        </div>
        <span class="connection-pill ${connector.connected ? "" : "off"}">${connector.connected ? "Connected" : "Paused"}</span>
      </header>
      <dl>
        <div><dt>Status</dt><dd>${connector.configured ? "OAuth ready" : "Needs env"}</dd></div>
        <div><dt>Last sync</dt><dd>${connector.lastSyncAt ? new Date(connector.lastSyncAt).toLocaleDateString() : "Never"}</dd></div>
      </dl>
      <div class="button-row">
        <button class="secondary-button" data-connector="${connector.id}" type="button">${connector.connected ? "Pause" : "Enable"}</button>
        <button class="primary-button" data-sync-connector="${connector.id}" type="button">Sync</button>
      </div>
      <a class="connector-link" href="${apiBaseUrl}/api/connectors/${connector.id}/connect">OAuth setup</a>
    </article>
  `).join("");
}

function renderPatterns() {
  document.querySelector("#patternList").innerHTML = (state.patterns || []).map((pattern) => `
    <article class="pattern-row">
      <strong>${pattern.key}</strong>
      <span>${pattern.posts} posts</span>
      <span>${percentFormatter.format(pattern.engagementRate)}% ER</span>
      <span>${percentFormatter.format(pattern.conversionRate)}% CVR</span>
    </article>
  `).join("");
}

function renderContentIntelligence() {
  const intelligence = state.contentIntelligence || seedState.contentIntelligence;
  document.querySelector("#recommendationList").innerHTML = (intelligence.recommendations || []).map((item) => `
    <li>${item}</li>
  `).join("");
  const brief = intelligence.nextBrief || {};
  document.querySelector("#nextBrief").innerHTML = `
    <div><span>Pillar</span><strong>${brief.contentPillar || "Product Education"}</strong></div>
    <div><span>Format</span><strong>${brief.format || "carousel"}</strong></div>
    <p>${brief.angle || "Run a controlled test after the next ingestion cycle."}</p>
  `;
}

function renderRules() {
  document.querySelector("#ruleList").innerHTML = (state.rules || []).map((rule) => `
    <article class="rule">
      <strong>${rule.title}</strong>
      <p>${rule.detail}</p>
      <button class="secondary-button" data-remove-rule="${rule.id}" type="button">Remove</button>
    </article>
  `).join("");
}

function renderReport(report) {
  const summary = report?.summary || state.summary || seedState.summary;
  const title = report?.title || document.querySelector("#reportName").value.trim() || "Post intelligence report";
  const audience = report?.audience || document.querySelector("#reportAudience").value;
  const sections = report?.sections || [...document.querySelectorAll("fieldset input:checked")].map((input) => input.value);
  const recommendation = report?.recommendation || state.contentIntelligence?.recommendations?.[0] || "Run ingestion before generating recommendations.";

  document.querySelector("#previewTitle").textContent = title;
  document.querySelector("#previewAudience").textContent = audience;
  document.querySelector("#previewDate").textContent = new Date(report?.createdAt || Date.now()).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  document.querySelector("#previewContent").innerHTML = `
    <h2>Executive Summary</h2>
    <p>${state.settings.companyName} tracked ${formatNumber(summary.trackedPosts)} normalized posts across ${summary.connectedSources} connectors, producing ${formatNumber(summary.totalEngagement)} engagements and ${formatNumber(summary.totalConversions)} conversions.</p>
    <h2>Included Sections</h2>
    <ul>${sections.map((section) => `<li>${section}</li>`).join("")}</ul>
    <h2>Top Recommendation</h2>
    <p>${recommendation}</p>
  `;
}

async function generateReport() {
  const payload = {
    title: document.querySelector("#reportName").value.trim() || "Post intelligence report",
    audience: document.querySelector("#reportAudience").value,
    sections: [...document.querySelectorAll("fieldset input:checked")].map((input) => input.value)
  };

  if (backendOnline) {
    const result = await api("/api/reports", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.reports = result.reports;
    renderReport(result.report);
  } else {
    renderReport(payload);
    saveFallbackState();
  }
  showToast("Report preview generated");
}

function exportCsv() {
  if (backendOnline) {
    window.location.href = "/api/export.csv";
    showToast("Post CSV export requested");
    return;
  }
  showToast("Backend required for post export");
}

async function toggleConnector(id) {
  const connector = state.connectors.find((item) => item.id === id);
  if (!connector) return;
  const connected = !connector.connected;

  if (backendOnline) {
    const result = await api(`/api/connectors/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ connected })
    });
    connector.connected = result.connector.connected;
    connector.status = result.connector.status;
    state.summary = result.summary;
  } else {
    connector.connected = connected;
    saveFallbackState();
  }
  renderAll();
  showToast(`${connector.name} ${connector.connected ? "enabled" : "paused"}`);
}

async function syncConnector(id) {
  if (!backendOnline) {
    showToast("Backend required for ingestion");
    return;
  }
  const result = await api(`/api/connectors/${encodeURIComponent(id)}/sync`, { method: "POST" });
  state = result.state;
  renderAll();
  showToast(`${connectorName(id)} ingestion completed`);
}

async function runIngestion() {
  if (!backendOnline) {
    showToast("Backend required for ingestion");
    return;
  }
  const result = await api("/api/ingest/run", { method: "POST" });
  state = result.state;
  renderAll();
  renderReport();
  showToast("OAuth to posts to metrics pipeline completed");
}

function hydrateControls() {
  document.querySelector("#companyName").value = state.settings.companyName;
  document.querySelector("#defaultKpi").value = state.settings.defaultKpi;
  document.querySelector("#autoRefresh").checked = state.settings.autoRefresh;
  document.querySelector("#scheduleFrequency").value = state.schedule.frequency;
  document.querySelector("#scheduleDay").value = state.schedule.day;
  document.querySelector("#recipients").value = state.schedule.recipients;
}

function renderAll() {
  renderKpis();
  renderPostRows();
  renderInsights();
  renderConnectors();
  renderPatterns();
  renderContentIntelligence();
  renderRules();
  document.querySelector("#timeSaved").textContent = `${state.summary?.timeSavedHours || 0} hours`;
  document.querySelector("#schemaFields").textContent = state.normalizedSchema?.post?.join(" / ") || "Waiting for backend schema";
}

function wireEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      document.querySelector(`#${button.dataset.view}`).classList.add("active");
      document.querySelector("#viewTitle").textContent = button.dataset.title || button.textContent.trim();
    });
  });

  document.querySelector("#sourceGrid").addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-connector]");
    const sync = event.target.closest("[data-sync-connector]");
    if (toggle) toggleConnector(toggle.dataset.connector).catch((error) => showToast(error.message));
    if (sync) syncConnector(sync.dataset.syncConnector).catch((error) => showToast(error.message));
  });

  document.querySelector("#ruleList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove-rule]");
    if (!button) return;
    if (backendOnline) {
      const result = await api(`/api/rules/${encodeURIComponent(button.dataset.removeRule)}`, { method: "DELETE" });
      state.rules = result.rules;
    } else {
      state.rules = state.rules.filter((rule) => rule.id !== button.dataset.removeRule);
      saveFallbackState();
    }
    renderRules();
    showToast("Rule removed");
  });

  document.querySelector("#addRule").addEventListener("click", async () => {
    const payload = {
      title: "Pattern watch",
      detail: "Notify the team when a content format beats its historical median twice in a row."
    };
    if (backendOnline) {
      const result = await api("/api/rules", { method: "POST", body: JSON.stringify(payload) });
      state.rules = result.rules;
    } else {
      state.rules.push({ id: `rule-${Date.now()}`, ...payload });
      saveFallbackState();
    }
    renderRules();
    showToast("Rule added");
  });

  document.querySelector("#saveSchedule").addEventListener("click", async () => {
    state.schedule = {
      frequency: document.querySelector("#scheduleFrequency").value,
      day: document.querySelector("#scheduleDay").value,
      recipients: document.querySelector("#recipients").value
    };
    if (backendOnline) await api("/api/schedule", { method: "PUT", body: JSON.stringify(state.schedule) });
    saveFallbackState();
    showToast("Schedule saved");
  });

  document.querySelector("#saveSettings").addEventListener("click", async () => {
    state.settings = {
      companyName: document.querySelector("#companyName").value || "Your company",
      defaultKpi: document.querySelector("#defaultKpi").value,
      autoRefresh: document.querySelector("#autoRefresh").checked
    };
    if (backendOnline) await api("/api/settings", { method: "PUT", body: JSON.stringify(state.settings) });
    saveFallbackState();
    renderReport();
    showToast("Settings saved");
  });

  document.querySelector("#generateReport").addEventListener("click", () => generateReport().catch((error) => showToast(error.message)));
  document.querySelector("#exportCsv").addEventListener("click", exportCsv);
  document.querySelector("#runIngestion").addEventListener("click", () => runIngestion().catch((error) => showToast(error.message)));
  document.querySelector("#newReport").addEventListener("click", () => {
    document.querySelector('[data-view="reports"]').click();
    document.querySelector("#reportName").focus();
  });
  document.querySelector("#refreshData").addEventListener("click", async () => {
    await loadBackendState();
    hydrateControls();
    renderAll();
    renderReport();
    showToast(backendOnline ? "Metrics refreshed from backend" : "Using browser-only state");
  });
}

async function boot() {
  wireEvents();
  await loadBackendState();
  hydrateControls();
  renderAll();
  renderReport();
  const params = new URLSearchParams(window.location.search);
  if (params.get("connector") === "connected") showToast("Connector OAuth completed");
  if (params.get("connector") === "error") showToast(params.get("message") || "Connector connection failed");
}

boot();
