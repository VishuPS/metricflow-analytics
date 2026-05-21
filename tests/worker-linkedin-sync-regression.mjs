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

const accountId = "acct_sync_test";
const sessionToken = "session_sync_test";
const organizationUrn = "urn:li:organization:123";
const kv = createKv({
  [`session:${sessionToken}`]: {
    accountId,
    name: "Sync Test",
    email: "sync@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`user:${accountId}:linkedin:token`]: {
    accessToken: "test-linkedin-token"
  },
  [`user:${accountId}:linkedin:organization`]: organizationUrn
});
const env = { USER_STATE: kv, LINKEDIN_DEMO_MODE: "false" };
const originalFetch = globalThis.fetch;
const calls = [];

globalThis.fetch = async (url) => {
  const href = String(url);
  calls.push(href);
  if (href.startsWith("https://api.linkedin.com/v2/ugcPosts")) {
    return jsonResponse({
      elements: [{
        id: "urn:li:share:111",
        author: organizationUrn,
        created: { time: 1716000000000 },
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: "Documented LinkedIn metrics shape" },
            media: []
          }
        }
      }]
    });
  }
  if (href.startsWith("https://api.linkedin.com/v2/socialActions/")) {
    return jsonResponse({
      likesSummary: { totalLikes: 7 },
      commentsSummary: { totalFirstLevelComments: 3 }
    });
  }
  if (href.startsWith("https://api.linkedin.com/v2/organizationalEntityShareStatistics")) {
    return jsonResponse({
      elements: [{
        totalShareStatistics: {
          uniqueImpressionsCount: 100,
          impressionCount: 150,
          engagement: 12,
          shareCount: 2,
          clickCount: 9
        }
      }]
    });
  }
  throw new Error(`Unexpected LinkedIn request: ${href}`);
};

try {
  const response = await worker.fetch(new Request("https://api.example.test/api/connectors/linkedin/sync", {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json"
    }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.fetched, 1);
  assert.equal(body.saved, 1);
  assert.equal(body.posts[0].reach, 100);
  assert.equal(body.posts[0].impressions, 150);
  assert.equal(body.posts[0].engagements, 12);
  assert.equal(body.posts[0].shares, 2);
  assert.equal(body.posts[0].clicks, 9);
  assert.equal(body.posts[0].likes, 7);
  assert.equal(body.posts[0].comments, 3);
  assert.equal(body.state.summary.totalReach, 100);
  assert.equal(body.state.summary.totalEngagement, 12);
  assert.equal(body.diagnostics.postsWithReach, 1);
  assert.equal(body.diagnostics.postsWithEngagements, 1);
  assert.equal(body.state.linkedin.sync.diagnostics.postsWithClicks, 1);
  assert.ok(calls.some((href) => href.includes("organizationalEntityShareStatistics")));
  console.log("PASS worker LinkedIn sync metrics parsing");
} finally {
  globalThis.fetch = originalFetch;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
