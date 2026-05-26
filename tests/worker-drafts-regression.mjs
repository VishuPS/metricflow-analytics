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

const accountId = "acct_drafts_test";
const sessionToken = "session_drafts_test";
const organizationUrn = "urn:li:organization:987";
const kv = createKv({
  [`session:${sessionToken}`]: {
    accountId,
    name: "Draft Test",
    email: "drafts@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`user:${accountId}:linkedin:organization`]: organizationUrn,
  [`user:${accountId}:linkedin:organizationLabels`]: {
    [organizationUrn]: "Client Page"
  }
});
const env = { USER_STATE: kv };
const authHeaders = {
  authorization: `Bearer ${sessionToken}`,
  "content-type": "application/json"
};

const createResponse = await worker.fetch(new Request("https://api.example.test/api/drafts", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({
    title: "Launch post",
    topic: "New product launch",
    body: "Draft copy for launch.",
    figure: {
      name: "chart.png",
      type: "image/png",
      size: 68,
      dataUrl: "data:image/png;base64,aGVsbG8="
    }
  })
}), env);
const createBody = await createResponse.json();
assert.equal(createResponse.status, 201);
assert.equal(createBody.draft.title, "Launch post");
assert.equal(createBody.draft.organizationUrn, organizationUrn);
assert.equal(createBody.draft.organizationName, "Client Page");
assert.equal(createBody.draft.figure.name, "chart.png");

const listResponse = await worker.fetch(new Request("https://api.example.test/api/drafts", {
  headers: { authorization: `Bearer ${sessionToken}` }
}), env);
const listBody = await listResponse.json();
assert.equal(listResponse.status, 200);
assert.equal(listBody.drafts.length, 1);
assert.equal(listBody.drafts[0].id, createBody.draft.id);

const updateResponse = await worker.fetch(new Request(`https://api.example.test/api/drafts/${createBody.draft.id}`, {
  method: "PUT",
  headers: authHeaders,
  body: JSON.stringify({
    title: "Updated launch post",
    topic: "New product launch",
    body: "Updated draft copy.",
    figure: null
  })
}), env);
const updateBody = await updateResponse.json();
assert.equal(updateResponse.status, 200);
assert.equal(updateBody.draft.title, "Updated launch post");
assert.equal(updateBody.draft.figure, null);

const deleteResponse = await worker.fetch(new Request(`https://api.example.test/api/drafts/${createBody.draft.id}`, {
  method: "DELETE",
  headers: { authorization: `Bearer ${sessionToken}` }
}), env);
const deleteBody = await deleteResponse.json();
assert.equal(deleteResponse.status, 200);
assert.deepEqual(deleteBody.drafts, []);

console.log("PASS worker draft storage");
