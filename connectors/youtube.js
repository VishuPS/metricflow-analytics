async function exchangeCodeForToken() {
  throw new Error("YouTube OAuth token exchange is scaffolded but not implemented yet");
}

async function fetchPosts() {
  throw new Error("YouTube Data API post ingestion is scaffolded but not implemented yet");
}

async function fetchMetrics() {
  throw new Error("YouTube Analytics metrics ingestion is scaffolded but not implemented yet");
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
