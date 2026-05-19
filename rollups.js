function generateDailyRollups(posts = [], date = new Date().toISOString().slice(0, 10)) {
  return summarizePosts(posts, "daily", date, (post) => String(post.published_at || "").slice(0, 10) === date);
}

function generateWeeklyRollups(posts = [], date = new Date()) {
  const week = weekKey(date);
  return summarizePosts(posts, "weekly", week, (post) => weekKey(new Date(post.published_at)) === week);
}

function generateMonthlyRollups(posts = [], date = new Date()) {
  const month = date.toISOString().slice(0, 7);
  return summarizePosts(posts, "monthly", month, (post) => String(post.published_at || "").slice(0, 7) === month);
}

function summarizePosts(posts, period, periodKey, predicate) {
  const bySource = new Map();
  for (const post of posts.filter(predicate)) {
    const row = bySource.get(post.source) || {
      id: `${period}:${post.source}:${periodKey}`,
      source: post.source,
      period,
      periodKey,
      postCount: 0,
      reach: 0,
      impressions: 0,
      engagements: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      clicks: 0,
      conversions: 0,
      generatedAt: new Date().toISOString()
    };
    row.postCount += 1;
    addMetric(row, "reach", post.reach);
    addMetric(row, "impressions", post.impressions);
    addMetric(row, "engagements", post.engagements);
    addMetric(row, "likes", post.likes);
    addMetric(row, "comments", post.comments);
    addMetric(row, "shares", post.shares);
    addMetric(row, "saves", post.saves);
    addMetric(row, "clicks", post.clicks);
    addMetric(row, "conversions", post.conversions);
    bySource.set(post.source, row);
  }
  return [...bySource.values()];
}

function addMetric(row, key, value) {
  if (value === null || value === undefined) return;
  row[key] += Number(value || 0);
}

function weekKey(date) {
  const current = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  current.setUTCDate(current.getUTCDate() + 4 - (current.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((current - yearStart) / 86400000) + 1) / 7);
  return `${current.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function upsertRollups(existing = [], newRollups = []) {
  const byId = new Map(existing.map((rollup) => [rollup.id, rollup]));
  for (const rollup of newRollups) byId.set(rollup.id, rollup);
  return [...byId.values()];
}

module.exports = {
  generateDailyRollups,
  generateWeeklyRollups,
  generateMonthlyRollups,
  upsertRollups
};
