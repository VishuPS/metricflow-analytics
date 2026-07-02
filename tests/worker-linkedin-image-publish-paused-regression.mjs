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

const accountId = "acct_image_publish_paused_test";
const sessionToken = "session_image_publish_paused_test";
const organizationUrn = "urn:li:organization:321";
const draftId = "draft-image-publish-paused-test";
const kv = createKv({
  [`session:${sessionToken}`]: {
    accountId,
    name: "Image Publish Paused Test",
    email: "image-publish-paused@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`user:${accountId}:linkedin:token`]: {
    accessToken: "linkedin-image-publish-paused-token"
  },
  [`user:${accountId}:linkedin:organization`]: organizationUrn,
  [`user:${accountId}:drafts`]: [{
    id: draftId,
    title: "Image publish",
    topic: "Publishing",
    body: "This image draft should not call LinkedIn yet.",
    organizationUrn,
    organizationName: "Client Page",
    figure: {
      name: "chart.png",
      type: "image/png",
      size: 8,
      dataUrl: "data:image/png;base64,aGVsbG8="
    },
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }]
});
const env = { USER_STATE: kv, LINKEDIN_VERSION: "202605" };
const originalFetch = globalThis.fetch;

globalThis.fetch = async () => {
  throw new Error("LinkedIn should not be called while image publishing is paused");
};

try {
  const response = await worker.fetch(new Request(`https://api.example.test/api/drafts/${draftId}/publish`, {
    method: "POST",
    headers: { authorization: `Bearer ${sessionToken}` }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.match(body.message, /Photo publishing is coming soon/);

  const savedDrafts = JSON.parse(await kv.get(`user:${accountId}:drafts`));
  assert.equal(savedDrafts[0].status, "draft");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("PASS worker LinkedIn image publish paused");
