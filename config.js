window.METRICFLOW_CLOUDFLARE_APP_URL = "https://metrillix.com";
window.METRICFLOW_API_BASE_URL = "https://api.metrillix.com";

if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
  window.location.replace(window.METRICFLOW_CLOUDFLARE_APP_URL);
}
