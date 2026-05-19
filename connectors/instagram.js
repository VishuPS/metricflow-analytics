async function exchangeCodeForToken() {
  throw new Error("Instagram OAuth token exchange is scaffolded but not implemented yet");
}

async function fetchPosts() {
  throw new Error("Instagram Graph API post ingestion is scaffolded but not implemented yet");
}

async function fetchMetrics() {
  throw new Error("Instagram Graph API metrics ingestion is scaffolded but not implemented yet");
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
