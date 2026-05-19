async function exchangeCodeForToken() {
  throw new Error("GA4 OAuth token exchange is scaffolded but not implemented yet");
}

async function fetchPosts() {
  throw new Error("GA4 landing-page ingestion is scaffolded but not implemented yet");
}

async function fetchMetrics() {
  throw new Error("GA4 Data API metrics ingestion is scaffolded but not implemented yet");
}

function normalizePosts() {
  return [];
}

module.exports = {
  exchangeCodeForToken,
  fetchPosts,
  fetchMetrics,
  normalizePosts
};
