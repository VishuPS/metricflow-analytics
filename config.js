window.METRICFLOW_CLOUDFLARE_APP_URL = "https://metricflow-analytics.pages.dev";
window.METRICFLOW_API_BASE_URL = "https://metricflow-api.vsooriarachchi.workers.dev";

if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
  window.location.replace(window.METRICFLOW_CLOUDFLARE_APP_URL);
}
