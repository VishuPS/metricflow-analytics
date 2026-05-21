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

const env = {
  USER_STATE: createKv(),
  CORS_ORIGIN: "https://metrillix.com",
  PAGES_URL: "https://metrillix.com"
};

const signupResponse = await worker.fetch(jsonRequest("https://api.metrillix.com/api/signup", {
  name: "Cookie Test",
  email: "cookie@example.test",
  password: "correct horse battery staple"
}), env);
const signupBody = await signupResponse.json();
assert.equal(signupResponse.status, 201);
assert.ok(signupBody.token);

const setCookie = signupResponse.headers.get("set-cookie") || "";
assert.match(setCookie, /^metrillix_session=session_/);
assert.match(setCookie, /Path=\//);
assert.match(setCookie, /Max-Age=1209600/);
assert.match(setCookie, /HttpOnly/);
assert.match(setCookie, /Secure/);
assert.match(setCookie, /SameSite=Lax/);
assert.match(setCookie, /Domain=.metrillix.com/);

const cookiePair = setCookie.split(";")[0];
const stateResponse = await worker.fetch(new Request("https://api.metrillix.com/api/state", {
  headers: { cookie: cookiePair }
}), env);
assert.equal(stateResponse.status, 200);
const stateBody = await stateResponse.json();
assert.equal(typeof stateBody.summary.trackedPosts, "number");
assert.equal(stateBody.linkedin.connected, false);

const logoutResponse = await worker.fetch(new Request("https://api.metrillix.com/api/logout", {
  method: "POST",
  headers: { cookie: cookiePair }
}), env);
assert.equal(logoutResponse.status, 200);
const clearCookie = logoutResponse.headers.get("set-cookie") || "";
assert.match(clearCookie, /^metrillix_session=/);
assert.match(clearCookie, /Max-Age=0/);
assert.match(clearCookie, /HttpOnly/);

console.log("PASS worker cookie session auth");
