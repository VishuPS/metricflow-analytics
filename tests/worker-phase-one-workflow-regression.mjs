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

const accountId = "acct_phase_one_test";
const sessionToken = "session_phase_one_test";
const organizationUrn = "urn:li:organization:321";
const now = Date.now();
const kv = createKv({
  [`session:${sessionToken}`]: {
    accountId,
    name: "Phase One Test",
    email: "phase-one@example.test",
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString()
  },
  [`auth:id:${accountId}`]: { email: "phase-one@example.test" },
  "auth:account:phase-one@example.test": {
    id: accountId,
    name: "Phase One Test",
    email: "phase-one@example.test",
    passwordHash: "test",
    createdAt: new Date(now - 20 * 86400000).toISOString()
  },
  [`user:${accountId}:linkedin:organization`]: organizationUrn,
  [`user:${accountId}:linkedin:posts`]: [
    post("post-1", now - 2 * 86400000, "Launch notes", 1800, 140, 22),
    post("post-2", now - 5 * 86400000, "Customer proof?", 1200, 96, 14),
    post("post-3", now - 10 * 86400000, "Older post", 900, 40, 5)
  ],
  [`user:${accountId}:drafts`]: [{
    id: "draft-manual-test",
    title: "Manual publish",
    body: "This was published manually.",
    organizationUrn,
    status: "draft",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString()
  }]
});
const env = { USER_STATE: kv, PAGES_URL: "https://metrillix.example.test" };

const headers = { authorization: `Bearer ${sessionToken}` };

const loginResponse = await worker.fetch(new Request("https://api.example.test/api/login", {
  method: "POST",
  body: JSON.stringify({ email: "phase-one@example.test", password: "wrong-password" })
}), env);
const loginBody = await loginResponse.json();
assert.equal(loginResponse.status, 401);
assert.equal(loginBody.message, "Invalid email or password.");

const emailStatusResponse = await worker.fetch(new Request("https://api.example.test/api/email-status", { headers }), env);
const emailStatusBody = await emailStatusResponse.json();
assert.equal(emailStatusResponse.status, 200);
assert.equal(emailStatusBody.configured, false);
assert.deepEqual(emailStatusBody.missing, ["RESEND_API_KEY", "EMAIL_FROM"]);

const manualResponse = await worker.fetch(new Request("https://api.example.test/api/drafts/draft-manual-test/manual-publish", {
  method: "POST",
  headers
}), env);
const manualBody = await manualResponse.json();
assert.equal(manualResponse.status, 200);
assert.equal(manualBody.draft.status, "published");
assert.equal(manualBody.draft.publishedMethod, "manual");

const snapshotResponse = await worker.fetch(new Request("https://api.example.test/api/weekly-snapshot", { headers }), env);
const snapshotBody = await snapshotResponse.json();
assert.equal(snapshotResponse.status, 200);
assert.equal(snapshotBody.snapshot.metrics.posts, 2);
assert.equal(snapshotBody.snapshot.metrics.impressions, 3000);
assert.match(snapshotBody.snapshot.summary, /2 posts generated/);

const shareResponse = await worker.fetch(new Request("https://api.example.test/api/reports/share", {
  method: "POST",
  headers,
  body: JSON.stringify({})
}), env);
const shareBody = await shareResponse.json();
assert.equal(shareResponse.status, 201);
assert.match(shareBody.shareUrl, /^https:\/\/metrillix\.example\.test\/share\/report\//);

const token = shareBody.report.token;
const publicResponse = await worker.fetch(new Request(`https://api.example.test/api/shared-reports/${token}`), env);
const publicBody = await publicResponse.json();
assert.equal(publicResponse.status, 200);
assert.equal(publicBody.report.token, token);
assert.equal(publicBody.report.snapshot.metrics.posts, 2);

console.log("PASS worker phase one workflow");

function post(id, time, text, impressions, engagement, clicks) {
  return {
    id,
    post_id: id,
    organization_urn: organizationUrn,
    published_at: new Date(time).toISOString(),
    text,
    media_type: "image",
    impressions,
    reach: impressions,
    engagements: engagement,
    likes: Math.max(0, engagement - 10),
    comments: 6,
    shares: 4,
    clicks
  };
}
