import assert from "node:assert/strict";
import worker from "../workers/metricflow-api.js";

function createKv(initial = {}) {
  const store = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    store,
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

const accountId = "acct_org_post_scope";
const sessionToken = "session_org_post_scope";
const firstOrg = "urn:li:organization:111";
const secondOrg = "urn:li:organization:222";
const kv = createKv({
  [`session:${sessionToken}`]: {
    accountId,
    name: "Scope Test",
    email: "scope@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`user:${accountId}:linkedin:token`]: {
    accessToken: "linkedin-scope-token"
  },
  [`user:${accountId}:linkedin:organizations`]: [firstOrg, secondOrg],
  [`user:${accountId}:linkedin:organizationLabels`]: {
    [firstOrg]: "First Page",
    [secondOrg]: "Second Page"
  },
  [`user:${accountId}:linkedin:organization`]: firstOrg,
  [`user:${accountId}:linkedin:posts`]: [
    linkedInPost("urn:li:share:first", firstOrg, "First page post", 10),
    linkedInPost("urn:li:share:second", secondOrg, "Second page post", 20)
  ]
});
const env = { USER_STATE: kv, LINKEDIN_DEMO_MODE: "false" };
const auth = { authorization: `Bearer ${sessionToken}` };

const firstStateResponse = await worker.fetch(new Request("https://api.example.test/api/state", {
  headers: auth
}), env);
const firstState = await firstStateResponse.json();
assert.equal(firstStateResponse.status, 200);
assert.deepEqual(firstState.posts.map((post) => post.post_id), ["urn:li:share:first"]);
assert.deepEqual(firstState.postRankings.map((post) => post.post_id), ["urn:li:share:first"]);
assert.equal(firstState.summary.trackedPosts, 1);
assert.equal(firstState.summary.totalReach, 10);

const firstPostsResponse = await worker.fetch(new Request("https://api.example.test/api/posts", {
  headers: auth
}), env);
const firstPosts = await firstPostsResponse.json();
assert.deepEqual(firstPosts.posts.map((post) => post.post_id), ["urn:li:share:first"]);

await worker.fetch(new Request("https://api.example.test/api/linkedin/select-organization", {
  method: "POST",
  headers: {
    ...auth,
    "content-type": "application/json"
  },
  body: JSON.stringify({ organizationUrn: secondOrg })
}), env);

const secondStateResponse = await worker.fetch(new Request("https://api.example.test/api/state", {
  headers: auth
}), env);
const secondState = await secondStateResponse.json();
assert.equal(secondStateResponse.status, 200);
assert.deepEqual(secondState.posts.map((post) => post.post_id), ["urn:li:share:second"]);
assert.deepEqual(secondState.postRankings.map((post) => post.post_id), ["urn:li:share:second"]);
assert.equal(secondState.summary.trackedPosts, 1);
assert.equal(secondState.summary.totalReach, 20);

console.log("PASS worker LinkedIn organization post scoping");

function linkedInPost(postId, organizationUrn, text, reach) {
  return {
    source: "linkedin",
    post_id: postId,
    author_id: organizationUrn,
    organization_urn: organizationUrn,
    published_at: "2026-05-20T10:00:00.000Z",
    url: `https://www.linkedin.com/feed/update/${postId}`,
    text,
    media_type: "text",
    thumbnail_url: "",
    reach,
    impressions: reach,
    engagements: 1,
    likes: 1,
    comments: 0,
    shares: 0,
    saves: null,
    clicks: 0,
    conversions: 0,
    platform_raw: { post: { author: organizationUrn }, metrics: {} }
  };
}
