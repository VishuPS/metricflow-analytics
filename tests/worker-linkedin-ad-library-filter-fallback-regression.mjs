import assert from "node:assert/strict";
import worker from "../workers/metricflow-api.js";

function createKv(initial = {}) {
  const writes = [];
  const store = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    writes,
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      writes.push({ key, value });
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    }
  };
}

const accountId = "acct_ad_library_fallback_test";
const sessionToken = "session_ad_library_fallback_test";
const kv = createKv({
  [`session:${sessionToken}`]: {
    accountId,
    name: "Ad Library Fallback Test",
    email: "ad-library-fallback@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`user:${accountId}:linkedin:token`]: {
    accessToken: "linkedin-ad-library-token"
  }
});
const env = { USER_STATE: kv, LINKEDIN_VERSION: "202605" };
const originalFetch = globalThis.fetch;
const adLibraryUrls = [];

globalThis.fetch = async (url) => {
  adLibraryUrls.push(String(url));
  if (adLibraryUrls.length === 1) {
    return jsonResponse({
      message: "Multiple errors occurred during param validation. Please see errorDetails for more information."
    }, 400);
  }
  return jsonResponse({
    paging: { start: 0, count: 6, total: 0 },
    elements: []
  });
};

try {
  const response = await worker.fetch(new Request("https://api.example.test/api/linkedin/ad-library?keyword=marketing&countries=GB,US&count=6", {
    headers: { authorization: `Bearer ${sessionToken}` }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(adLibraryUrls.length, 2);
  assert.ok(adLibraryUrls[0].includes("countries=List(GB,US)"));
  assert.ok(!adLibraryUrls[1].includes("countries="));
  assert.deepEqual(body.ads, []);
  assert.deepEqual(body.countries, ["GB", "US"]);
  assert.equal(kv.writes.length, 0, "ad library fallback responses are not persisted");
  console.log("PASS worker LinkedIn Ad Library filter fallback");
} finally {
  globalThis.fetch = originalFetch;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
