const seedState = {
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

let state = loadFallbackState();
let backendOnline = false;
let googleAnalytics = { connected: false, propertyId: "" };

const numberFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function loadFallbackState() {
  return JSON.parse(localStorage.getItem("metricflow.state") || "null") || structuredClone(seedState);
}

function saveFallbackState() {
  localStorage.setItem("metricflow.state", JSON.stringify(state));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
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
    const data = await api("/api/state");
    state = data;
    googleAnalytics = data.googleAnalytics || { connected: false, propertyId: "" };
    backendOnline = true;
    document.querySelector("#syncStatus").textContent = "Backend connected";
  } catch {
    backendOnline = false;
    document.querySelector("#syncStatus").textContent = "Browser-only mode";
  }
}

function connectedSources() {
  return state.sources.filter((source) => source.connected);
}

function getSummary() {
  if (state.summary) return state.summary;
  const active = connectedSources();
  const totalReach = active.reduce((sum, source) => sum + Number(source.reach || 0), 0);
  const totalEngagement = active.reduce((sum, source) => sum + Number(source.engagement || 0), 0);
  const totalConversions = active.reduce((sum, source) => sum + Number(source.conversions || 0), 0);
  return {
    totalReach,
    totalEngagement,
    totalConversions,
    engagementRate: totalReach ? (totalEngagement / totalReach) * 100 : 0,
    connectedSources: active.length,
    totalSources: state.sources.length,
    timeSavedHours: Number((active.length * 1.1 + 0.9).toFixed(1))
  };
}

function getInsights() {
  if (state.insights) return state.insights;
  const active = connectedSources();
  const bestReach = [...active].sort((a, b) => b.reach - a.reach)[0];
  const bestConversion = [...active].sort((a, b) => b.conversions - a.conversions)[0];
  const needsAttention = active.find((source) => source.trend < 0);

  return [
    {
      title: `${bestReach?.name || "Top channel"} is driving reach`,
      detail: `Prioritize the content format that lifted ${bestReach?.name || "your leading platform"} over the last reporting period.`
    },
    {
      title: `${bestConversion?.name || "Conversion channel"} is closest to revenue`,
      detail: "Use this channel as the benchmark for landing-page and campaign attribution."
    },
    {
      title: needsAttention ? `${needsAttention.name} needs attention` : "No channel is declining",
      detail: needsAttention ? "Engagement is softening. Queue a content audit before next week's report." : "Current connected sources show positive movement across the board."
    }
  ];
}

function formatNumber(value) {
  return numberFormatter.format(Math.round(value));
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function renderKpis() {
  const summary = getSummary();
  const kpis = [
    ["Total reach", formatNumber(summary.totalReach), "+9.8%"],
    ["Engagement rate", `${percentFormatter.format(summary.engagementRate)}%`, "+3.1%"],
    ["Conversions", formatNumber(summary.totalConversions), "+6.4%"],
    ["Connected sources", `${summary.connectedSources}/${summary.totalSources}`, backendOnline ? "API live" : "Local"]
  ];

  document.querySelector("#kpiGrid").innerHTML = kpis.map(([label, value, change]) => `
    <article class="kpi-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <div class="metric-change">${change}</div>
    </article>
  `).join("");
}

function renderPlatformRows() {
  document.querySelector("#platformRows").innerHTML = connectedSources().map((source) => `
    <tr>
      <td>
        <div class="platform-name">
          <span class="platform-dot" style="background:${source.color}"></span>
          ${source.name}
        </div>
      </td>
      <td>${formatNumber(source.reach)}</td>
      <td>${formatNumber(source.engagement)}</td>
      <td>${formatNumber(source.conversions)}</td>
      <td class="${source.trend >= 0 ? "trend-up" : "trend-down"}">${source.trend >= 0 ? "Up" : "Down"} ${Math.abs(source.trend)}%</td>
    </tr>
  `).join("");
}

function renderInsights() {
  document.querySelector("#insightList").innerHTML = getInsights().map((insight) => `
    <article class="insight">
      <strong>${insight.title}</strong>
      <p>${insight.detail}</p>
    </article>
  `).join("");
}

function renderSources() {
  document.querySelector("#sourceGrid").innerHTML = state.sources.map((source) => `
    <article class="source-card">
      <header>
        <strong>${source.name}</strong>
        <span class="connection-pill ${source.connected ? "" : "off"}">${source.connected ? "Connected" : "Off"}</span>
      </header>
      <span>${formatNumber(source.reach)} reach / ${formatNumber(source.engagement)} engagements</span>
      <button class="${source.connected ? "secondary-button" : "primary-button"}" data-source="${source.name}" type="button">
        ${source.connected ? "Disconnect" : "Connect"}
      </button>
    </article>
  `).join("");
}

function renderGoogleStatus() {
  const status = document.querySelector("#googleStatus");
  if (!status) return;
  if (!backendOnline) {
    status.textContent = "Backend required";
    return;
  }
  if (googleAnalytics.connected) {
    status.textContent = `Connected${googleAnalytics.propertyId ? ` to GA4 property ${googleAnalytics.propertyId}` : ""}`;
    return;
  }
  status.textContent = googleAnalytics.configured ? "Ready to connect" : "Missing Google OAuth configuration";
}

function renderRules() {
  document.querySelector("#ruleList").innerHTML = state.rules.map((rule) => `
    <article class="rule">
      <strong>${rule.title}</strong>
      <p>${rule.detail}</p>
      <button class="secondary-button" data-remove-rule="${rule.id}" type="button">Remove</button>
    </article>
  `).join("");
}

function renderReport(report) {
  const summary = report?.summary || getSummary();
  const title = report?.title || document.querySelector("#reportName").value.trim() || "Performance report";
  const audience = report?.audience || document.querySelector("#reportAudience").value;
  const sections = report?.sections || [...document.querySelectorAll("fieldset input:checked")].map((input) => input.value);
  const recommendation = report?.recommendation || `${connectedSources().sort((a, b) => b.engagement - a.engagement)[0]?.name || "Your strongest channel"} is the current engagement leader. Shift one additional campaign test into that channel next period and watch conversion efficiency.`;

  document.querySelector("#previewTitle").textContent = title;
  document.querySelector("#previewAudience").textContent = audience;
  document.querySelector("#previewDate").textContent = new Date(report?.createdAt || Date.now()).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  document.querySelector("#previewContent").innerHTML = `
    <h2>Executive Summary</h2>
    <p>${state.settings.companyName} reached ${formatNumber(summary.totalReach)} people and generated ${formatNumber(summary.totalEngagement)} engagements across ${summary.connectedSources} active sources.</p>
    <h2>Included Sections</h2>
    <ul>${sections.map((section) => `<li>${section}</li>`).join("")}</ul>
    <h2>Top Opportunity</h2>
    <p>${recommendation}</p>
  `;
}

async function generateReport() {
  const payload = {
    title: document.querySelector("#reportName").value.trim() || "Performance report",
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
    showToast("CSV export requested from backend");
    return;
  }

  const rows = [["platform", "reach", "engagement", "conversions", "trend"], ...connectedSources().map((source) => [
    source.name,
    source.reach,
    source.engagement,
    source.conversions,
    source.trend
  ])];
  const blob = new Blob([rows.map((row) => row.join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "metricflow-report.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV export ready");
}

function importCsvLocally(csv) {
  const [, ...rows] = csv.trim().split(/\r?\n/);
  const imports = rows.map((row, index) => {
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
  state.sources = state.sources.filter((source) => !source.imported).concat(imports);
}

async function importCsv() {
  const csv = document.querySelector("#csvInput").value.trim();
  if (backendOnline) {
    const result = await api("/api/import-csv", {
      method: "POST",
      body: JSON.stringify({ csv })
    });
    state.sources = result.sources;
    state.summary = result.summary;
  } else {
    importCsvLocally(csv);
    saveFallbackState();
  }
  renderAll();
  showToast("CSV sources imported");
}

async function toggleSource(name) {
  const source = state.sources.find((item) => item.name === name);
  if (!source) return;
  const connected = !source.connected;

  if (backendOnline) {
    const result = await api(`/api/sources/${encodeURIComponent(name)}`, {
      method: "PATCH",
      body: JSON.stringify({ connected })
    });
    source.connected = result.source.connected;
    state.summary = result.summary;
  } else {
    source.connected = connected;
    saveFallbackState();
  }
  renderAll();
  showToast(`${name} ${source.connected ? "connected" : "disconnected"}`);
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
  delete state.summary;
  delete state.insights;
  renderKpis();
  renderPlatformRows();
  renderInsights();
  renderSources();
  renderRules();
  renderGoogleStatus();
  document.querySelector("#timeSaved").textContent = `${getSummary().timeSavedHours} hours`;
}

function wireEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      document.querySelector(`#${button.dataset.view}`).classList.add("active");
      document.querySelector("#viewTitle").textContent = button.textContent.trim();
    });
  });

  document.querySelector("#sourceGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-source]");
    if (button) toggleSource(button.dataset.source).catch((error) => showToast(error.message));
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
      title: "Audience shift",
      detail: "Notify the team when a channel's audience growth outpaces its engagement growth."
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
  document.querySelector("#importCsv").addEventListener("click", () => importCsv().catch((error) => showToast(error.message)));
  document.querySelector("#connectGoogle").addEventListener("click", () => {
    if (!backendOnline) {
      showToast("Backend required for Google Analytics");
      return;
    }
    window.location.href = "/api/google/connect";
  });
  document.querySelector("#syncGoogle").addEventListener("click", async () => {
    if (!backendOnline) {
      showToast("Backend required for Google Analytics");
      return;
    }
    try {
      const result = await api("/api/sources/google-analytics/sync", { method: "POST" });
      state.sources = result.sources;
      state.summary = result.summary;
      googleAnalytics = result.googleAnalytics || googleAnalytics;
      renderAll();
      showToast(`Google Analytics synced for ${result.snapshot.snapshotDate}`);
    } catch (error) {
      showToast(error.message);
    }
  });
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
  if (params.get("ga") === "connected") showToast("Google Analytics connected");
  if (params.get("ga") === "error") showToast(params.get("message") || "Google Analytics connection failed");
}

boot();
