const platforms = [
  { name: "LinkedIn", color: "#0a66c2", reach: 48200, engagement: 2840, conversions: 126, trend: 12.4 },
  { name: "Instagram", color: "#c13584", reach: 75600, engagement: 6120, conversions: 218, trend: 8.7 },
  { name: "Facebook", color: "#1877f2", reach: 38900, engagement: 1930, conversions: 81, trend: -2.8 },
  { name: "TikTok", color: "#111111", reach: 92400, engagement: 8480, conversions: 174, trend: 18.9 },
  { name: "YouTube", color: "#ff0000", reach: 44100, engagement: 2360, conversions: 96, trend: 6.2 },
  { name: "Google Analytics", color: "#f9ab00", reach: 53800, engagement: 3190, conversions: 312, trend: 4.1 }
];

const defaultRules = [
  { title: "Engagement spike", detail: "Alert when any platform grows engagement by more than 15% week over week." },
  { title: "Report ready", detail: "Generate a summary every Monday at 9:00 and stage it for review." },
  { title: "Conversion dip", detail: "Flag channels where conversions fall by more than 8%." }
];

const state = {
  connected: JSON.parse(localStorage.getItem("metricflow.connected") || "null") || {
    LinkedIn: true,
    Instagram: true,
    Facebook: false,
    TikTok: true,
    YouTube: true,
    "Google Analytics": true
  },
  customPlatforms: JSON.parse(localStorage.getItem("metricflow.customPlatforms") || "[]"),
  rules: JSON.parse(localStorage.getItem("metricflow.rules") || "null") || defaultRules,
  settings: JSON.parse(localStorage.getItem("metricflow.settings") || "null") || {
    companyName: "Northstar Studio",
    defaultKpi: "Engagement rate",
    autoRefresh: true
  },
  schedule: JSON.parse(localStorage.getItem("metricflow.schedule") || "null") || {
    frequency: "Weekly",
    day: "Monday",
    recipients: "team@example.com"
  }
};

const currencyFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function allPlatforms() {
  return [...platforms, ...state.customPlatforms];
}

function activePlatforms() {
  return allPlatforms().filter((platform) => state.connected[platform.name] !== false);
}

function formatNumber(value) {
  return currencyFormatter.format(Math.round(value));
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function saveState() {
  localStorage.setItem("metricflow.connected", JSON.stringify(state.connected));
  localStorage.setItem("metricflow.customPlatforms", JSON.stringify(state.customPlatforms));
  localStorage.setItem("metricflow.rules", JSON.stringify(state.rules));
  localStorage.setItem("metricflow.settings", JSON.stringify(state.settings));
  localStorage.setItem("metricflow.schedule", JSON.stringify(state.schedule));
}

function renderKpis() {
  const active = activePlatforms();
  const reach = active.reduce((sum, platform) => sum + platform.reach, 0);
  const engagement = active.reduce((sum, platform) => sum + platform.engagement, 0);
  const conversions = active.reduce((sum, platform) => sum + platform.conversions, 0);
  const engagementRate = reach ? (engagement / reach) * 100 : 0;
  const kpis = [
    ["Total reach", formatNumber(reach), "+9.8%"],
    ["Engagement rate", `${percentFormatter.format(engagementRate)}%`, "+3.1%"],
    ["Conversions", formatNumber(conversions), "+6.4%"],
    ["Connected sources", `${active.length}/${allPlatforms().length}`, "Live"]
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
  document.querySelector("#platformRows").innerHTML = activePlatforms().map((platform) => `
    <tr>
      <td>
        <div class="platform-name">
          <span class="platform-dot" style="background:${platform.color}"></span>
          ${platform.name}
        </div>
      </td>
      <td>${formatNumber(platform.reach)}</td>
      <td>${formatNumber(platform.engagement)}</td>
      <td>${formatNumber(platform.conversions)}</td>
      <td class="${platform.trend >= 0 ? "trend-up" : "trend-down"}">${platform.trend >= 0 ? "↑" : "↓"} ${Math.abs(platform.trend)}%</td>
    </tr>
  `).join("");
}

function renderInsights() {
  const bestReach = activePlatforms().sort((a, b) => b.reach - a.reach)[0];
  const bestConversion = activePlatforms().sort((a, b) => b.conversions - a.conversions)[0];
  const needsAttention = activePlatforms().find((platform) => platform.trend < 0);
  const insights = [
    {
      title: `${bestReach?.name || "Top channel"} is driving reach`,
      detail: `Prioritize the content format that lifted ${bestReach?.name || "your leading platform"} over the last reporting period.`
    },
    {
      title: `${bestConversion?.name || "Conversion channel"} is closest to revenue`,
      detail: `Use this channel as the benchmark for landing-page and campaign attribution.`
    },
    {
      title: needsAttention ? `${needsAttention.name} needs attention` : "No channel is declining",
      detail: needsAttention ? "Engagement is softening. Queue a content audit before next week's report." : "Current connected sources show positive movement across the board."
    }
  ];

  document.querySelector("#insightList").innerHTML = insights.map((insight) => `
    <article class="insight">
      <strong>${insight.title}</strong>
      <p>${insight.detail}</p>
    </article>
  `).join("");
}

function renderSources() {
  document.querySelector("#sourceGrid").innerHTML = allPlatforms().map((platform) => {
    const connected = state.connected[platform.name] !== false;
    return `
      <article class="source-card">
        <header>
          <strong>${platform.name}</strong>
          <span class="connection-pill ${connected ? "" : "off"}">${connected ? "Connected" : "Off"}</span>
        </header>
        <span>${formatNumber(platform.reach)} reach · ${formatNumber(platform.engagement)} engagements</span>
        <button class="${connected ? "secondary-button" : "primary-button"}" data-source="${platform.name}" type="button">
          ${connected ? "Disconnect" : "Connect"}
        </button>
      </article>
    `;
  }).join("");
}

function renderRules() {
  document.querySelector("#ruleList").innerHTML = state.rules.map((rule, index) => `
    <article class="rule">
      <strong>${rule.title}</strong>
      <p>${rule.detail}</p>
      <button class="secondary-button" data-remove-rule="${index}" type="button">Remove</button>
    </article>
  `).join("");
}

function generateReport() {
  const title = document.querySelector("#reportName").value.trim() || "Performance report";
  const audience = document.querySelector("#reportAudience").value;
  const sections = [...document.querySelectorAll("fieldset input:checked")].map((input) => input.value);
  const active = activePlatforms();
  const totalReach = active.reduce((sum, platform) => sum + platform.reach, 0);
  const totalEngagement = active.reduce((sum, platform) => sum + platform.engagement, 0);
  const top = [...active].sort((a, b) => b.engagement - a.engagement)[0];

  document.querySelector("#previewTitle").textContent = title;
  document.querySelector("#previewAudience").textContent = audience;
  document.querySelector("#previewDate").textContent = new Date().toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  document.querySelector("#previewContent").innerHTML = `
    <h2>Executive Summary</h2>
    <p>${state.settings.companyName} reached ${formatNumber(totalReach)} people and generated ${formatNumber(totalEngagement)} engagements across ${active.length} active sources.</p>
    <h2>Included Sections</h2>
    <ul>${sections.map((section) => `<li>${section}</li>`).join("")}</ul>
    <h2>Top Opportunity</h2>
    <p>${top?.name || "Your strongest channel"} is the current engagement leader. Shift one additional campaign test into that channel next period and watch conversion efficiency.</p>
  `;
  showToast("Report preview generated");
}

function exportCsv() {
  const rows = [["platform", "reach", "engagement", "conversions", "trend"], ...activePlatforms().map((platform) => [
    platform.name,
    platform.reach,
    platform.engagement,
    platform.conversions,
    platform.trend
  ])];
  const csv = rows.map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "metricflow-report.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV export ready");
}

function importCsv() {
  const text = document.querySelector("#csvInput").value.trim();
  const [, ...rows] = text.split(/\r?\n/);
  const imports = rows.map((row, index) => {
    const [name, reach, engagement, conversions] = row.split(",").map((cell) => cell.trim());
    return {
      name: name || `Imported ${index + 1}`,
      color: index % 2 ? "#8f5f2a" : "#3d6b52",
      reach: Number(reach) || 0,
      engagement: Number(engagement) || 0,
      conversions: Number(conversions) || 0,
      trend: 3 + index
    };
  }).filter((platform) => platform.name);

  state.customPlatforms = imports;
  imports.forEach((platform) => {
    state.connected[platform.name] = true;
  });
  saveState();
  renderAll();
  showToast(`${imports.length} CSV sources imported`);
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
    if (!button) return;
    const name = button.dataset.source;
    state.connected[name] = state.connected[name] === false;
    saveState();
    renderAll();
    showToast(`${name} ${state.connected[name] ? "connected" : "disconnected"}`);
  });

  document.querySelector("#ruleList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-rule]");
    if (!button) return;
    state.rules.splice(Number(button.dataset.removeRule), 1);
    saveState();
    renderRules();
    showToast("Rule removed");
  });

  document.querySelector("#addRule").addEventListener("click", () => {
    state.rules.push({
      title: "Audience shift",
      detail: "Notify the team when a channel's audience growth outpaces its engagement growth."
    });
    saveState();
    renderRules();
    showToast("Rule added");
  });

  document.querySelector("#saveSchedule").addEventListener("click", () => {
    state.schedule = {
      frequency: document.querySelector("#scheduleFrequency").value,
      day: document.querySelector("#scheduleDay").value,
      recipients: document.querySelector("#recipients").value
    };
    saveState();
    showToast("Schedule saved");
  });

  document.querySelector("#saveSettings").addEventListener("click", () => {
    state.settings = {
      companyName: document.querySelector("#companyName").value || "Your company",
      defaultKpi: document.querySelector("#defaultKpi").value,
      autoRefresh: document.querySelector("#autoRefresh").checked
    };
    saveState();
    generateReport();
    showToast("Settings saved");
  });

  document.querySelector("#generateReport").addEventListener("click", generateReport);
  document.querySelector("#exportCsv").addEventListener("click", exportCsv);
  document.querySelector("#importCsv").addEventListener("click", importCsv);
  document.querySelector("#newReport").addEventListener("click", () => {
    document.querySelector('[data-view="reports"]').click();
    document.querySelector("#reportName").focus();
  });
  document.querySelector("#refreshData").addEventListener("click", () => {
    document.querySelector("#syncStatus").textContent = "Last sync just now";
    showToast("Metrics refreshed");
  });
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
  renderPlatformRows();
  renderInsights();
  renderSources();
  renderRules();
  document.querySelector("#timeSaved").textContent = `${(activePlatforms().length * 1.1 + 0.9).toFixed(1)} hours`;
}

hydrateControls();
wireEvents();
renderAll();
generateReport();
