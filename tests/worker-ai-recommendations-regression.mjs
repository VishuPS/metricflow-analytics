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

const accountId = "acct_ai_recommendations";
const sessionToken = "session_ai_recommendations";
const organization = "urn:li:organization:ai";
const kv = createKv({
  [`auth:id:${accountId}`]: { email: "ai@example.test" },
  "auth:account:ai@example.test": {
    id: accountId,
    name: "AI Test",
    email: "ai@example.test",
    plan: "pro",
    createdAt: "2026-05-01T00:00:00.000Z"
  },
  [`session:${sessionToken}`]: {
    accountId,
    name: "AI Test",
    email: "ai@example.test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  },
  [`user:${accountId}:linkedin:token`]: {
    accessToken: "linkedin-token-must-not-be-sent"
  },
  [`user:${accountId}:linkedin:organizations`]: [organization],
  [`user:${accountId}:linkedin:organizationLabels`]: {
    [organization]: "AI Page"
  },
  [`user:${accountId}:linkedin:organization`]: organization,
  [`user:${accountId}:linkedin:posts`]: [
    post("urn:li:share:ai-one", "Carousel lessons for founders? #growth", "carousel", "2026-05-20T09:00:00.000Z", 1000, 100, 8),
    post("urn:li:share:ai-two", "Text update #growth #saas", "text", "2026-05-21T10:00:00.000Z", 500, 25, 2),
    post("urn:li:share:ai-three", "Video launch #launch", "video", "2026-05-22T11:00:00.000Z", 800, 60, 12),
    post("urn:li:share:ai-four", "What would you test next? #growth", "carousel", "2026-05-23T09:00:00.000Z", 1100, 120, 9)
  ]
});
const env = { USER_STATE: kv, OPENAI_API_KEY: "test-openai-key", OPENAI_MODEL: "test-model" };
const auth = { authorization: `Bearer ${sessionToken}` };
const originalFetch = globalThis.fetch;
const openAiRequests = [];

globalThis.fetch = async (url, options = {}) => {
  openAiRequests.push({ url: String(url), body: JSON.parse(options.body || "{}"), headers: options.headers || {} });
  assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
  assert.equal(options.headers.authorization, "Bearer test-openai-key");
  assert.equal(options.headers["content-type"], "application/json");
  assert.equal(JSON.stringify(options.body).includes("linkedin-token-must-not-be-sent"), false);
  const userPayload = JSON.parse(JSON.parse(options.body).messages[1].content);
  if (userPayload.task.includes("Score")) {
    return jsonResponse({
      choices: [{
        message: {
          content: JSON.stringify({
            score: 82,
            verdict: "Strong draft with a clearer CTA needed.",
            strengths: ["Specific angle"],
            improvements: ["Add a question CTA"],
            suggested_revision: "Try a sharper opening.",
            recommended_timing: "Saturday 09:00-10:00",
            confidence: "early"
          })
        }
      }]
    });
  }
  return jsonResponse({
    choices: [{
      message: {
        content: JSON.stringify({
          headline: "Use carousel lessons next",
          recommendation: "Publish a carousel with a direct founder lesson.",
          why: ["Carousel posts lead engagement", "Growth hashtags are recurring"],
          next_post_brief: {
            format: "carousel",
            topic_angle: "founder lesson",
            hook: "Here is the mistake we stopped repeating",
            cta: "Ask what others would test next",
            hashtags: ["#growth"],
            timing: "Saturday 09:00-10:00"
          },
          risks: ["Only a small history is available"],
          confidence: "early"
        })
      }
    }]
  });
};

try {
  const strategyResponse = await worker.fetch(new Request("https://api.example.test/dashboard/ai-recommendations?range=90", {
    method: "POST",
    headers: auth
  }), env);
  const strategyBody = await strategyResponse.json();
  assert.equal(strategyResponse.status, 200);
  assert.equal(strategyBody.strategy.headline, "Use carousel lessons next");
  assert.ok(strategyBody.decisionId);

  const scoreResponse = await worker.fetch(new Request("https://api.example.test/api/drafts/score", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ topic: "Founder lesson", body: "We learned this the hard way." })
  }), env);
  const scoreBody = await scoreResponse.json();
  assert.equal(scoreResponse.status, 200);
  assert.equal(scoreBody.score.score, 82);
  assert.ok(scoreBody.decisionId);
  assert.equal(openAiRequests.length, 2);

  const decisions = JSON.parse(await kv.get(`user:${accountId}:aiDecisions`));
  assert.equal(decisions.length, 2);
  assert.equal(decisions[0].type, "draft_score");
  assert.equal(decisions[1].type, "workspace_strategy");

  const missingKeyResponse = await worker.fetch(new Request("https://api.example.test/dashboard/ai-recommendations", {
    method: "POST",
    headers: auth
  }), { USER_STATE: kv });
  const missingKeyBody = await missingKeyResponse.json();
  assert.equal(missingKeyResponse.status, 503);
  assert.equal(missingKeyBody.message, "AI recommendations are not configured yet.");

  console.log("PASS worker AI recommendations");
} finally {
  globalThis.fetch = originalFetch;
}

function post(postId, text, mediaType, publishedAt, impressions, engagement, clicks) {
  return {
    source: "linkedin",
    post_id: postId,
    author_id: organization,
    organization_urn: organization,
    published_at: publishedAt,
    url: `https://www.linkedin.com/feed/update/${postId}`,
    text,
    media_type: mediaType,
    impressions,
    engagements: engagement,
    likes: Math.floor(engagement * 0.7),
    comments: Math.floor(engagement * 0.2),
    shares: Math.floor(engagement * 0.1),
    clicks,
    platform_raw: { post: { author: organization }, metrics: {} }
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}
