window.METRICFLOW_CLOUDFLARE_APP_URL = "https://metrillix.com";
window.METRICFLOW_API_BASE_URL = "https://api.metrillix.com";
window.STRIPE_PUBLISHABLE_KEY = "pk_live_51U1W0RBiKMV1u56GGcXdlZb8hXGwY1iW9r8mYifktUfRNkk9qAGmOJodpR4iaUYrMLAFoFMPiSJs0JSuh617sRsh00r8zEYALM";
window.STRIPE_PAYMENT_LINK_GROWTH = "https://buy.stripe.com/aFa8wOfCc9gReHJbOzbQY01";
window.STRIPE_PAYMENT_LINK_ENTERPRISE = "https://buy.stripe.com/cNi4gy2Pqdx72Z13i3bQY00";

if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
  window.location.replace(window.METRICFLOW_CLOUDFLARE_APP_URL);
}
