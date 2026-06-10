import assert from "node:assert/strict";
import worker from "../workers/metricflow-api.js";

function createKv(initial = {}) {
  const store = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    }
  };
}

const accountId = "acct_dashboard_analytics";
const sessionToken = "session_dashboard_analytics";
const organization = "urn:li:organization:555";
const kv = createKv({
  [`auth:id:${accountId}`]: { email: "analytics@example.test" },
  "auth:account:analytics@example.test": {
    id: accountId,
    name: "Analytics Test",
    email: "analytics@example.test",
    plan: "pro",
    createdAt: "2026-05-01T00:00:00.000Z"
  },
  [`session:${sessionToken}`]: {
    accountId,
    name: "Analytics Test",
    email: "analytics@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`user:${accountId}:linkedin:token`]: {
    accessToken: "linkedin-dashboard-token"
  },
  [`user:${accountId}:linkedin:organizations`]: [organization],
  [`user:${accountId}:linkedin:organizationLabels`]: {
    [organization]: "Dashboard Page"
  },
  [`user:${accountId}:linkedin:organization`]: organization,
  [`user:${accountId}:linkedin:posts`]: [
    post("urn:li:share:one", "Carousel growth question? #growth", "carousel", "2026-05-20T09:00:00.000Z", 1000, 100, 8),
    post("urn:li:share:two", "Text update #growth #saas", "text", "2026-05-21T10:00:00.000Z", 500, 25, 2),
    post("urn:li:share:three", "Video launch #launch", "video", "2026-05-22T11:00:00.000Z", 800, 60, 12)
  ]
});
const env = { USER_STATE: kv };
const auth = { authorization: `Bearer ${sessionToken}` };

const summary = await get("/dashboard/summary?range=30");
assert.equal(summary.selectedOrganizationName, "Dashboard Page");
assert.equal(summary.totals.posts, 3);
assert.equal(summary.totals.impressions, 2300);
assert.equal(summary.totals.engagement, 185);
assert.equal(summary.totals.clicks, 22);
assert.equal(summary.plan.label, "Pro");
assert.equal(summary.bestPost.postId, "urn:li:share:one");

const timeseries = await get("/dashboard/timeseries?range=30");
assert.equal(timeseries.timeseries.length, 3);
assert.equal(timeseries.timeseries[0].date, "2026-05-20");

const topPosts = await get("/dashboard/top-posts?range=30");
assert.equal(topPosts.byImpressions[0].postId, "urn:li:share:one");
assert.equal(topPosts.byEngagementRate[0].postId, "urn:li:share:one");

const media = await get("/dashboard/media-performance?range=30");
assert.equal(media.mediaPerformance[0].mediaType, "carousel");
assert.ok(media.postingDays.length);
assert.ok(media.postingHours.length);

const hashtags = await get("/dashboard/hashtag-performance?range=30");
assert.equal(hashtags.hashtagPerformance[0].hashtag, "#growth");

const insights = await get("/dashboard/insights?range=30");
assert.ok(insights.insights.length);

console.log("PASS worker dashboard analytics aggregation");

async function get(path) {
  const response = await worker.fetch(new Request(`https://api.example.test${path}`, { headers: auth }), env);
  assert.equal(response.status, 200);
  return response.json();
}

function post(postId, text, mediaType, publishedAt, impressions, engagement, clicks) {
  return {
    source: "linkedin",
    post_id: postId,
    author_id: organization,
    organization_urn: organization,
    published_at: publishedAt,
    url: `https://www.linkedin.com/feed/update/${postId}`,
    text,
    media_type: mediaType,
    impressions,
    engagements: engagement,
    likes: Math.floor(engagement * 0.7),
    comments: Math.floor(engagement * 0.2),
    shares: Math.floor(engagement * 0.1),
    clicks,
    platform_raw: { post: { author: organization }, metrics: {} }
  };
}
