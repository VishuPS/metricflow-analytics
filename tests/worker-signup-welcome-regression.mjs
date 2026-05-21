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

const originalFetch = globalThis.fetch;
const calls = [];
const env = {
  USER_STATE: createKv(),
  PAGES_URL: "https://metrillix.com",
  SIGNUP_WELCOME_WEBHOOK_URL: "https://email.example.test/welcome",
  SIGNUP_WELCOME_WEBHOOK_SECRET: "welcome-secret"
};

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  return new Response(JSON.stringify({ ok: true }), {
    status: 202,
    headers: { "content-type": "application/json" }
  });
};

try {
  const response = await worker.fetch(new Request("https://api.example.test/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Welcome Test",
      email: "welcome@example.test",
      password: "correct horse battery staple"
    })
  }), env);
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.emailSent, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, env.SIGNUP_WELCOME_WEBHOOK_URL);
  assert.equal(calls[0].options.headers.authorization, "Bearer welcome-secret");
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.type, "signup_welcome");
  assert.equal(payload.to, "welcome@example.test");
  assert.equal(payload.name, "Welcome Test");
  assert.equal(payload.subject, "Welcome to Metrillix");
  assert.equal(payload.appUrl, "https://metrillix.com/dashboard/onboarding");
  console.log("PASS worker signup welcome email webhook");
} finally {
  globalThis.fetch = originalFetch;
}
