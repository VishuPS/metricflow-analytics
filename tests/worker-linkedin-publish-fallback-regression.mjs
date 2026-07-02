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

const accountId = "acct_publish_fallback_test";
const sessionToken = "session_publish_fallback_test";
const organizationUrn = "urn:li:organization:654";
const draftId = "draft-publish-fallback-test";
const kv = createKv({
  [`session:${sessionToken}`]: {
    accountId,
    name: "Publish Fallback Test",
    email: "publish-fallback@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`user:${accountId}:linkedin:token`]: {
    accessToken: "linkedin-publish-fallback-token"
  },
  [`user:${accountId}:linkedin:organization`]: organizationUrn,
  [`user:${accountId}:drafts`]: [{
    id: draftId,
    title: "Publish me through fallback",
    topic: "Publishing",
    body: "This draft should publish through the UGC fallback.",
    organizationUrn,
    organizationName: "Client Page",
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }]
});
const env = { USER_STATE: kv, LINKEDIN_VERSION: "202605" };
const originalFetch = globalThis.fetch;
const calls = [];
let fallbackPayload = null;

globalThis.fetch = async (url, options = {}) => {
  calls.push(String(url));
  if (String(url) === "https://api.linkedin.com/rest/posts") {
    return new Response(JSON.stringify({ message: "Not enough permissions to access: POST /posts" }), {
      status: 403,
      headers: { "content-type": "application/json" }
    });
  }
  assert.equal(String(url), "https://api.linkedin.com/v2/ugcPosts");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.authorization, "Bearer linkedin-publish-fallback-token");
  fallbackPayload = JSON.parse(options.body);
  return new Response("", {
    status: 201,
    headers: { "x-restli-id": "urn:li:ugcPost:777" }
  });
};

try {
  const response = await worker.fetch(new Request(`https://api.example.test/api/drafts/${draftId}/publish`, {
    method: "POST",
    headers: { authorization: `Bearer ${sessionToken}` }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["https://api.linkedin.com/rest/posts", "https://api.linkedin.com/v2/ugcPosts"]);
  assert.equal(fallbackPayload.author, organizationUrn);
  assert.equal(fallbackPayload.lifecycleState, "PUBLISHED");
  assert.equal(fallbackPayload.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text, "This draft should publish through the UGC fallback.");
  assert.equal(fallbackPayload.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory, "NONE");
  assert.equal(body.draft.status, "published");
  assert.equal(body.draft.linkedinPostUrn, "urn:li:ugcPost:777");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("PASS worker LinkedIn draft publish UGC fallback");
