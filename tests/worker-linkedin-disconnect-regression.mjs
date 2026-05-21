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

const accountId = "acct_disconnect_test";
const sessionToken = "session_disconnect_test";
const prefix = `user:${accountId}:linkedin`;
const kv = createKv({
  [`session:${sessionToken}`]: {
    accountId,
    name: "Disconnect Test",
    email: "disconnect@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`${prefix}:token`]: { accessToken: "token" },
  [`${prefix}:profile`]: { id: "linkedin-user" },
  [`${prefix}:organizations`]: ["urn:li:organization:123"],
  [`${prefix}:organization`]: "urn:li:organization:123",
  [`${prefix}:posts`]: [{ source: "linkedin", post_id: "urn:li:share:111", reach: 100 }],
  [`${prefix}:analytics`]: { updatedAt: new Date().toISOString() },
  [`${prefix}:sync`]: { lastIngestedAt: new Date().toISOString() }
});
const env = { USER_STATE: kv };

const response = await worker.fetch(new Request("https://api.example.test/api/connectors/linkedin/disconnect", {
  method: "POST",
  headers: {
    authorization: `Bearer ${sessionToken}`,
    "content-type": "application/json"
  }
}), env);
const body = await response.json();

assert.equal(response.status, 200);
assert.equal(body.source, "linkedin");
assert.equal(body.connected, false);
assert.equal(body.state.linkedin.connected, false);
assert.equal(body.state.linkedin.organizations.length, 0);
assert.equal(body.state.linkedin.selectedOrganization, null);
assert.equal(body.state.summary.trackedPosts, 0);

for (const key of ["token", "profile", "organizations", "organization", "posts", "analytics", "sync"]) {
  assert.equal(await kv.get(`${prefix}:${key}`), null, `${key} is cleared`);
}

console.log("PASS worker LinkedIn disconnect clears account state");
