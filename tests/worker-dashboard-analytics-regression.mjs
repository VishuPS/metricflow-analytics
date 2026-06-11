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
assert.match(media.postingHours[0].key, /^\d{2}:00-\d{2}:00$/);

const hashtags = await get("/dashboard/hashtag-performance?range=30");
assert.equal(hashtags.hashtagPerformance[0].hashtag, "#growth");

const insights = await get("/dashboard/insights?range=30");
assert.ok(insights.insights.length);

const messyAccountId = "acct_dashboard_messy";
const messySessionToken = "session_dashboard_messy";
const messyOrganization = "urn:li:organization:777";
const otherOrganization = "urn:li:organization:888";
const messyPosts = Array.from({ length: 85 }, (_, index) => messyPost(index, messyOrganization));
const messyKv = createKv({
  [`auth:id:${messyAccountId}`]: { email: "messy-analytics@example.test" },
  "auth:account:messy-analytics@example.test": {
    id: messyAccountId,
    name: "Messy Analytics Test",
    email: "messy-analytics@example.test",
    plan: "agency",
    createdAt: "2026-05-01T00:00:00.000Z"
  },
  [`session:${messySessionToken}`]: {
    accountId: messyAccountId,
    name: "Messy Analytics Test",
    email: "messy-analytics@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`user:${messyAccountId}:linkedin:token`]: {
    accessToken: "linkedin-dashboard-messy-token"
  },
  [`user:${messyAccountId}:linkedin:organizations`]: [messyOrganization, otherOrganization],
  [`user:${messyAccountId}:linkedin:organizationLabels`]: {
    [messyOrganization]: "Messy Page",
    [otherOrganization]: "Other Page"
  },
  [`user:${messyAccountId}:linkedin:organization`]: messyOrganization,
  [`user:${messyAccountId}:linkedin:posts`]: [
    ...messyPosts,
    messyPost(999, otherOrganization)
  ]
});
const messyEnv = { USER_STATE: messyKv };
const messyAuth = { authorization: `Bearer ${messySessionToken}` };

const messySummary = await getWith("/dashboard/summary?range=90", messyEnv, messyAuth);
assert.equal(messySummary.selectedOrganizationName, "Messy Page");
assert.equal(messySummary.totals.posts, 85);
assert.ok(messySummary.totals.impressions > 0);
assert.ok(Number.isFinite(messySummary.totals.engagementRate));
assert.ok(messySummary.bestPost.postId);

const messyTimeseries = await getWith("/dashboard/timeseries?range=90", messyEnv, messyAuth);
assert.ok(messyTimeseries.timeseries.length > 1);
assert.ok(messyTimeseries.timeseries.every((row) => Object.hasOwn(row, "reach")));

const messyMedia = await getWith("/dashboard/media-performance?range=90", messyEnv, messyAuth);
assert.ok(messyMedia.mediaPerformance.length >= 4);
assert.ok(messyMedia.postingHours.every((row) => /^\d{2}:00-\d{2}:00$/.test(row.key)));

const messyTopPosts = await getWith("/dashboard/top-posts?range=90", messyEnv, messyAuth);
assert.ok(messyTopPosts.byImpressions.length <= 10);
assert.ok(messyTopPosts.byEngagementRate.length <= 10);
assert.ok(!messyTopPosts.byImpressions.some((row) => row.postId === "urn:li:share:messy-999"));

console.log("PASS worker dashboard analytics aggregation");

async function get(path) {
  return getWith(path, env, auth);
}

async function getWith(path, testEnv, testAuth) {
  const response = await worker.fetch(new Request(`https://api.example.test${path}`, { headers: testAuth }), testEnv);
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

function messyPost(index, postOrganization) {
  const mediaTypes = ["text", "image", "carousel", "video", "document", "poll"];
  const day = (index % 28) + 1;
  const hour = index % 24;
  const explicitEngagement = index % 7 === 0 ? undefined : 5 + (index % 30);
  const impressions = index % 10 === 0 ? null : 100 + index * 13;
  return {
    source: "linkedin",
    post_id: `urn:li:share:messy-${index}`,
    author_id: postOrganization,
    organization_urn: postOrganization,
    published_at: new Date(Date.UTC(2026, 4, day, hour, 0, 0)).toISOString(),
    url: index % 13 === 0 ? "" : `https://www.linkedin.com/feed/update/urn:li:share:messy-${index}`,
    text: index % 13 === 0 ? "" : index % 3 === 0 ? `Question post ${index}? #growth #market` : `Post ${index} #tag${index % 5}`,
    media_type: mediaTypes[index % mediaTypes.length],
    impressions,
    reach: impressions ? impressions + 20 : 80 + index,
    engagements: explicitEngagement,
    reactions: index % 9,
    likes: index % 11,
    comments: index % 5,
    shares: index % 4,
    clicks: index % 6,
    platform_raw: { post: { author: postOrganization }, metrics: {} }
  };
}
