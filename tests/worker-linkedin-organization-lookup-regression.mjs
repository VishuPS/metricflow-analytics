import assert from "node:assert/strict";
import worker from "../workers/metricflow-api.js";

function createKv() {
  const store = new Map();
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

function jsonRequest(url, body) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const kv = createKv();
const env = {
  USER_STATE: kv,
  PAGES_URL: "https://metrillix.com",
  LINKEDIN_CLIENT_ID: "linkedin-client-id",
  LINKEDIN_CLIENT_SECRET: "linkedin-client-secret",
  LINKEDIN_REDIRECT_URI: "https://api.example.test/oauth/linkedin/callback",
  LINKEDIN_VERSION: "202605"
};
const organizationUrn = "urn:li:organization:123";
const calls = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url) => {
  const href = String(url);
  calls.push(href);
  if (href === "https://www.linkedin.com/oauth/v2/accessToken") {
    return jsonResponse({
      access_token: "linkedin-access-token",
      expires_in: 3600,
      token_type: "Bearer"
    });
  }
  if (href === "https://api.linkedin.com/v2/userinfo") {
    return jsonResponse({ sub: "linkedin-member-id", name: "LinkedIn Member" });
  }
  if (href.startsWith("https://api.linkedin.com/v2/organizationAcls")) {
    return jsonResponse({ elements: [{ organization: organizationUrn }] });
  }
  if (href === "https://api.linkedin.com/rest/organizations/123") {
    return jsonResponse({ localizedName: "Metrillix Company Page" });
  }
  throw new Error(`Unexpected LinkedIn request: ${href}`);
};

try {
  const signupResponse = await worker.fetch(jsonRequest("https://api.example.test/api/signup", {
    name: "Org Lookup Test",
    email: "org-lookup@example.test",
    password: "correct horse battery staple"
  }), env);
  const signupBody = await signupResponse.json();
  assert.equal(signupResponse.status, 201);

  const authorizeResponse = await worker.fetch(new Request(
    `https://api.example.test/oauth/linkedin/authorize?session=${encodeURIComponent(signupBody.token)}`,
    { redirect: "manual" }
  ), env);
  const authorizeLocation = new URL(authorizeResponse.headers.get("location"));
  const state = authorizeLocation.searchParams.get("state");

  const callbackResponse = await worker.fetch(new Request(
    `https://api.example.test/oauth/linkedin/callback?code=fake-code&state=${encodeURIComponent(state)}`,
    { redirect: "manual" }
  ), env);
  assert.equal(callbackResponse.status, 302);
  assert.equal(callbackResponse.headers.get("location"), "https://metrillix.com/?connector=connected");
  assert.ok(calls.includes("https://api.linkedin.com/rest/organizations/123"));

  const labels = JSON.parse(await kv.get(`user:${signupBody.userId}:linkedin:organizationLabels`));
  assert.equal(labels[organizationUrn], "Metrillix Company Page");

  const organizationsResponse = await worker.fetch(new Request("https://api.example.test/api/linkedin/organizations", {
    headers: { authorization: `Bearer ${signupBody.token}` }
  }), env);
  const organizationsBody = await organizationsResponse.json();
  assert.equal(organizationsResponse.status, 200);
  assert.equal(organizationsBody.organizations[0], "Metrillix Company Page");
  assert.equal(organizationsBody.organizationOptions[0].name, "Metrillix Company Page");

  console.log("PASS worker LinkedIn organization lookup names");
} finally {
  globalThis.fetch = originalFetch;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
