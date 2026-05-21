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
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Metrillix <hello@metrillix.com>",
  EMAIL_REPLY_TO: "support@metrillix.com"
};

globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  return new Response(JSON.stringify({ id: "email_123" }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};

try {
  const response = await worker.fetch(new Request("https://api.example.test/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Resend User",
      email: "resend@example.test",
      password: "correct horse battery staple"
    })
  }), env);
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.emailSent, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].options.headers.authorization, "Bearer re_test_key");
  assert.equal(calls[0].options.headers["idempotency-key"], `signup-welcome:${body.userId}`);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.from, env.EMAIL_FROM);
  assert.deepEqual(payload.to, ["resend@example.test"]);
  assert.equal(payload.subject, "Welcome to Metrillix");
  assert.equal(payload.reply_to, env.EMAIL_REPLY_TO);
  assert.match(payload.html, /Connect LinkedIn/);
  assert.match(payload.text, /https:\/\/metrillix.com\/dashboard\/onboarding/);
  console.log("PASS worker Resend welcome email");
} finally {
  globalThis.fetch = originalFetch;
}
