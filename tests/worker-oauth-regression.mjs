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

async function signup(env, email) {
  const response = await worker.fetch(jsonRequest("https://api.example.test/api/signup", {
    name: email.split("@")[0],
    email,
    password: "correct horse battery staple"
  }), env);
  assert.equal(response.status, 201);
  return response.json();
}

async function linkedinConnect(env, sessionToken) {
  const response = await worker.fetch(new Request(
    `https://api.example.test/api/connectors/linkedin/connect?session=${encodeURIComponent(sessionToken)}`,
    { redirect: "manual" }
  ), env);
  assert.equal(response.status, 302);
  const location = response.headers.get("location");
  assert.ok(location, "connect route returns a LinkedIn redirect");
  return new URL(location);
}

async function linkedinAuthorize(env, sessionToken) {
  const response = await worker.fetch(new Request(
    `https://api.example.test/oauth/linkedin/authorize?session=${encodeURIComponent(sessionToken)}`,
    { redirect: "manual" }
  ), env);
  assert.equal(response.status, 302);
  const location = response.headers.get("location");
  assert.ok(location, "authorize route returns a LinkedIn redirect");
  return new URL(location);
}

const kv = createKv();
const env = {
  USER_STATE: kv,
  LINKEDIN_CLIENT_ID: "linkedin-client-id",
  LINKEDIN_CLIENT_SECRET: "linkedin-client-secret",
  LINKEDIN_REDIRECT_URI: "https://api.example.test/oauth/linkedin/callback"
};

const first = await signup(env, "first@example.test");
const second = await signup(env, "second@example.test");

const firstConnectRedirect = await linkedinConnect(env, first.token);
assert.equal(firstConnectRedirect.origin, "https://api.example.test");
assert.equal(firstConnectRedirect.pathname, "/oauth/linkedin/authorize");
assert.equal(firstConnectRedirect.searchParams.get("session"), first.token);

const firstRedirect = await linkedinAuthorize(env, first.token);
const secondRedirect = await linkedinAuthorize(env, second.token);

assert.equal(firstRedirect.origin, "https://www.linkedin.com");
assert.equal(firstRedirect.pathname, "/oauth/v2/authorization");
assert.equal(firstRedirect.searchParams.get("prompt"), "login");
assert.equal(secondRedirect.searchParams.get("prompt"), "login");

const firstState = firstRedirect.searchParams.get("state");
const secondState = secondRedirect.searchParams.get("state");
assert.ok(firstState);
assert.ok(secondState);
assert.notEqual(firstState, secondState);

const firstOAuthState = JSON.parse(await kv.get(`oauth:state:${firstState}`));
const secondOAuthState = JSON.parse(await kv.get(`oauth:state:${secondState}`));

assert.equal(firstOAuthState.accountId, first.userId);
assert.equal(secondOAuthState.accountId, second.userId);
assert.equal(firstOAuthState.source, "linkedin");
assert.equal(secondOAuthState.source, "linkedin");

console.log("PASS worker LinkedIn OAuth account isolation");
