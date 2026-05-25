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

const accountId = "acct_ad_library_test";
const sessionToken = "session_ad_library_test";
const kv = createKv({
  [`session:${sessionToken}`]: {
    accountId,
    name: "Ad Library Test",
    email: "ad-library@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`user:${accountId}:linkedin:token`]: {
    accessToken: "linkedin-ad-library-token"
  }
});
const env = { USER_STATE: kv, LINKEDIN_VERSION: "202605" };
const originalFetch = globalThis.fetch;
let adLibraryUrl = "";

globalThis.fetch = async (url, options = {}) => {
  adLibraryUrl = String(url);
  assert.equal(options.headers.authorization, "Bearer linkedin-ad-library-token");
  assert.equal(options.headers["x-restli-protocol-version"], "2.0.0");
  assert.equal(options.headers["linkedin-version"], "202605");
  return jsonResponse({
    paging: { start: 0, count: 6, total: 1 },
    elements: [{
      adUrl: "https://www.linkedin.com/ad-library/detail/123",
      details: {
        advertiser: { localizedName: "Example Advertiser" },
        adType: "SPONSORED_UPDATE",
        statistics: {
          firstImpressionDate: 1704067200000,
          latestImpressionDate: 1706745600000,
          impressionsFrom: 1000,
          impressionsTo: 5000
        }
      },
      isRestricted: false
    }]
  });
};

try {
  const response = await worker.fetch(new Request("https://api.example.test/api/linkedin/ad-library?keyword=marketing%20automation&countries=GB,US&count=6", {
    headers: { authorization: `Bearer ${sessionToken}` }
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(adLibraryUrl.startsWith("https://api.linkedin.com/rest/adLibrary"));
  assert.ok(adLibraryUrl.includes("q=criteria"));
  assert.ok(adLibraryUrl.includes("keyword=marketing+automation") || adLibraryUrl.includes("keyword=marketing%20automation"));
  assert.ok(adLibraryUrl.includes("countries%5B0%5D=GB"));
  assert.ok(adLibraryUrl.includes("countries%5B1%5D=US"));
  assert.equal(body.ads.length, 1);
  assert.deepEqual(body.ads[0], {
    adUrl: "https://www.linkedin.com/ad-library/detail/123",
    adType: "SPONSORED_UPDATE",
    advertiserName: "Example Advertiser",
    impressionsFrom: 1000,
    impressionsTo: 5000,
    firstImpressionDate: "2024-01-01T00:00:00.000Z",
    latestImpressionDate: "2024-02-01T00:00:00.000Z",
    isRestricted: false
  });
  assert.equal(kv.writes.length, 0, "ad library responses are not persisted");
  console.log("PASS worker LinkedIn Ad Library inspiration");
} finally {
  globalThis.fetch = originalFetch;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
