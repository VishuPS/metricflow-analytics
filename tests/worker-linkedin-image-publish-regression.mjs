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

const accountId = "acct_image_publish_test";
const sessionToken = "session_image_publish_test";
const organizationUrn = "urn:li:organization:321";
const draftId = "draft-image-publish-test";
const kv = createKv({
  [`session:${sessionToken}`]: {
    accountId,
    name: "Image Publish Test",
    email: "image-publish@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`user:${accountId}:linkedin:token`]: {
    accessToken: "linkedin-image-publish-token"
  },
  [`user:${accountId}:linkedin:organization`]: organizationUrn,
  [`user:${accountId}:drafts`]: [{
    id: draftId,
    title: "Image publish",
    topic: "Publishing",
    body: "This image draft should publish.",
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
const calls = [];
let publishPayload = null;

globalThis.fetch = async (url, options = {}) => {
  calls.push(String(url));
  if (String(url) === "https://api.linkedin.com/rest/images?action=initializeUpload") {
    assert.equal(options.method, "POST");
    assert.equal(options.headers.authorization, "Bearer linkedin-image-publish-token");
    assert.equal(options.headers["linkedin-version"], "202605");
    assert.deepEqual(JSON.parse(options.body), {
      initializeUploadRequest: { owner: organizationUrn }
    });
    return Response.json({
      value: {
        uploadUrl: "https://uploads.linkedin.example/image",
        image: "urn:li:image:test-image"
      }
    });
  }
  if (String(url) === "https://uploads.linkedin.example/image") {
    assert.equal(options.method, "PUT");
    assert.equal(options.headers["content-type"], "image/png");
    assert.ok(options.body instanceof Uint8Array);
    return new Response("", { status: 201 });
  }
  if (String(url) === "https://api.linkedin.com/rest/posts") {
    assert.equal(options.method, "POST");
    assert.equal(options.headers.authorization, "Bearer linkedin-image-publish-token");
    publishPayload = JSON.parse(options.body);
    return new Response("", {
      status: 201,
      headers: { "x-restli-id": "urn:li:share:888" }
    });
  }
  throw new Error(`Unexpected fetch: ${url}`);
};

try {
  const response = await worker.fetch(new Request(`https://api.example.test/api/drafts/${draftId}/publish`, {
    method: "POST",
    headers: { authorization: `Bearer ${sessionToken}` }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    "https://api.linkedin.com/rest/images?action=initializeUpload",
    "https://uploads.linkedin.example/image",
    "https://api.linkedin.com/rest/posts"
  ]);
  assert.equal(publishPayload.author, organizationUrn);
  assert.equal(publishPayload.commentary, "This image draft should publish.");
  assert.deepEqual(publishPayload.content.media, {
    id: "urn:li:image:test-image",
    title: "chart.png"
  });
  assert.equal(body.draft.status, "published");
  assert.equal(body.draft.linkedinPostUrn, "urn:li:share:888");

  const savedDrafts = JSON.parse(await kv.get(`user:${accountId}:drafts`));
  assert.equal(savedDrafts[0].status, "published");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("PASS worker LinkedIn image publish");
