import assert from "node:assert/strict";
import worker from "../workers/metricflow-api.js";

function createKv(initial = {}) {
  const store = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
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

const accountId = "acct_org_labels_test";
const sessionToken = "session_org_labels_test";
const organizationUrn = "urn:li:organization:123";
const secondOrganizationUrn = "urn:li:organization:456";
const prefix = `user:${accountId}:linkedin`;
const kv = createKv({
  [`session:${sessionToken}`]: {
    accountId,
    name: "Org Label Test",
    email: "org-label@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`${prefix}:token`]: { accessToken: "token" },
  [`${prefix}:organizations`]: [organizationUrn, secondOrganizationUrn],
  [`${prefix}:organizationLabels`]: { [organizationUrn]: "Old Page Name", [secondOrganizationUrn]: "Second Page" }
});
const env = { USER_STATE: kv };

const listResponse = await worker.fetch(new Request("https://api.example.test/api/linkedin/organizations", {
  headers: { authorization: `Bearer ${sessionToken}` }
}), env);
const listBody = await listResponse.json();
assert.equal(listResponse.status, 200);
assert.deepEqual(listBody.organizations, ["Old Page Name", "Second Page"]);
assert.deepEqual(listBody.organizationOptions, [{
  urn: organizationUrn,
  name: "Old Page Name",
  selected: false
}, {
  urn: secondOrganizationUrn,
  name: "Second Page",
  selected: false
}]);

const selectResponse = await worker.fetch(new Request("https://api.example.test/api/linkedin/select-organization", {
  method: "POST",
  headers: {
    authorization: `Bearer ${sessionToken}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    organizationUrn,
    organizationName: "Client A"
  })
}), env);
const selectBody = await selectResponse.json();
assert.equal(selectResponse.status, 200);
assert.equal(selectBody.selectedOrganization, organizationUrn);
assert.equal(selectBody.selectedOrganizationName, "Client A");
assert.equal(selectBody.organizations[0], "Client A");
assert.equal(selectBody.organizationOptions[0].name, "Client A");
assert.equal(selectBody.organizationOptions[0].selected, true);

const labels = JSON.parse(await kv.get(`${prefix}:organizationLabels`));
assert.equal(labels[organizationUrn], "Client A");

const renameResponse = await worker.fetch(new Request("https://api.example.test/api/linkedin/organization-name", {
  method: "POST",
  headers: {
    authorization: `Bearer ${sessionToken}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    organizationUrn: secondOrganizationUrn,
    organizationName: "Client B"
  })
}), env);
const renameBody = await renameResponse.json();
assert.equal(renameResponse.status, 200);
assert.equal(renameBody.selectedOrganization, organizationUrn);
assert.equal(renameBody.organizationOptions[1].name, "Client B");
assert.equal(renameBody.organizationOptions[1].selected, false);

const stateResponse = await worker.fetch(new Request("https://api.example.test/api/state", {
  headers: { authorization: `Bearer ${sessionToken}` }
}), env);
const stateBody = await stateResponse.json();
assert.equal(stateResponse.status, 200);
assert.equal(stateBody.linkedin.selectedOrganizationName, "Client A");
assert.equal(stateBody.linkedin.organizations[0], "Client A");
assert.equal(stateBody.linkedin.organizationOptions[0].name, "Client A");

const legacySelectResponse = await worker.fetch(new Request("https://api.example.test/api/linkedin/select-organization", {
  method: "POST",
  headers: {
    authorization: `Bearer ${sessionToken}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    organizationUrn: "Client A",
    organizationName: "Client A"
  })
}), env);
assert.equal(legacySelectResponse.status, 200);

console.log("PASS worker LinkedIn organization display names");
