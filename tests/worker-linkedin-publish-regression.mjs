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

const accountId = "acct_publish_test";
const sessionToken = "session_publish_test";
const organizationUrn = "urn:li:organization:321";
const draftId = "draft-publish-test";
const kv = createKv({
  [`session:${sessionToken}`]: {
    accountId,
    name: "Publish Test",
    email: "publish@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`user:${accountId}:linkedin:token`]: {
    accessToken: "linkedin-publish-token"
  },
  [`user:${accountId}:linkedin:organization`]: organizationUrn,
  [`user:${accountId}:drafts`]: [{
    id: draftId,
    title: "Publish me",
    topic: "Publishing",
    body: "This draft should publish.",
    organizationUrn,
    organizationName: "Client Page",
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }]
});
const env = { USER_STATE: kv, LINKEDIN_VERSION: "202605" };
const originalFetch = globalThis.fetch;
let publishPayload = null;

globalThis.fetch = async (url, options = {}) => {
  assert.equal(String(url), "https://api.linkedin.com/rest/posts");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.authorization, "Bearer linkedin-publish-token");
  assert.equal(options.headers["linkedin-version"], "202605");
  publishPayload = JSON.parse(options.body);
  return new Response("", {
    status: 201,
    headers: { "x-restli-id": "urn:li:share:999" }
  });
};

try {
  const response = await worker.fetch(new Request(`https://api.example.test/api/drafts/${draftId}/publish`, {
    method: "POST",
    headers: { authorization: `Bearer ${sessionToken}` }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(publishPayload.author, organizationUrn);
  assert.equal(publishPayload.commentary, "This draft should publish.");
  assert.equal(publishPayload.lifecycleState, "PUBLISHED");
  assert.equal(body.draft.status, "published");
  assert.equal(body.draft.linkedinPostUrn, "urn:li:share:999");
  assert.ok(body.draft.linkedinPostUrl.includes("urn%3Ali%3Ashare%3A999"));

  const savedDrafts = JSON.parse(await kv.get(`user:${accountId}:drafts`));
  assert.equal(savedDrafts[0].status, "published");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("PASS worker LinkedIn draft publish");
