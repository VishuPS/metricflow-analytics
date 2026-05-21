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

const accountId = "acct_sync_failure_test";
const sessionToken = "session_sync_failure_test";
const organizationUrn = "urn:li:organization:123";
const kv = createKv({
  [`session:${sessionToken}`]: {
    accountId,
    name: "Sync Failure Test",
    email: "failure@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`user:${accountId}:linkedin:token`]: {
    accessToken: "test-linkedin-token"
  },
  [`user:${accountId}:linkedin:organization`]: organizationUrn
});
const env = { USER_STATE: kv, LINKEDIN_DEMO_MODE: "false" };
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url) => {
  const href = String(url);
  if (href.startsWith("https://api.linkedin.com/v2/ugcPosts")) {
    return new Response(JSON.stringify({ message: "LinkedIn permission denied" }), {
      status: 403,
      headers: { "content-type": "application/json" }
    });
  }
  throw new Error(`Unexpected request: ${href}`);
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
  assert.equal(response.status, 403);
  assert.equal(body.error, true);
  assert.equal(body.message, "LinkedIn permission denied");
  assert.equal(body.state.linkedin.sync.status, "failed");
  assert.equal(body.state.linkedin.sync.lastError, "LinkedIn permission denied");
  assert.ok(body.state.linkedin.sync.lastAttemptedAt);
  assert.equal(body.state.summary.trackedPosts, 0);
  console.log("PASS worker LinkedIn sync failure health state");
} finally {
  globalThis.fetch = originalFetch;
}
