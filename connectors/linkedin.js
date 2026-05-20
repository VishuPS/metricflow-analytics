const { getFetch } = require("../lib/fetch");

const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";
const LINKEDIN_SOCIAL_ACTIONS_URL = "https://api.linkedin.com/v2/socialActions";
const LINKEDIN_ANALYTICS_URL = "https://api.linkedin.com/v2/organizationalEntityShareStatistics";

async function exchangeCodeForToken(code, redirectUri, clientId, clientSecret) {
  const fetch = await getFetch();
  const response = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "LinkedIn token exchange failed");
  }
  return payload;
}

async function fetchPosts(accessToken, organizationUrn, options = {}) {
  if (typeof organizationUrn === "object") {
    options = organizationUrn;
    organizationUrn = options.organizationUrn;
  }
  if (process.env.LINKEDIN_DEMO_MODE === "true") return demoPosts(organizationUrn);

  const fetch = await getFetch();
  if (!organizationUrn) throw new Error("LinkedIn organization selection required before post ingestion");

  const url = new URL(LINKEDIN_UGC_POSTS_URL);
  url.searchParams.set("q", "authors");
  url.searchParams.set("authors", `List(${organizationUrn})`);
  url.searchParams.set("sortBy", "LAST_MODIFIED");
  url.searchParams.set("count", String(options.count || 25));

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-restli-protocol-version": "2.0.0"
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "LinkedIn UGC Posts API request failed");
  return payload.elements || [];
}

async function fetchMetrics(accessToken, organizationUrn, postIds) {
  if (Array.isArray(organizationUrn)) {
    postIds = organizationUrn;
    organizationUrn = null;
  }
  if (process.env.LINKEDIN_DEMO_MODE === "true") {
    return Object.fromEntries(postIds.map((id, index) => [id, demoMetric(index)]));
  }
  if (!organizationUrn) throw new Error("LinkedIn organization selection required before metric ingestion");

  const fetch = await getFetch();
  const metrics = {};

  for (const postId of postIds) {
    const [socialActions, analytics] = await Promise.all([
      fetchSocialActions(fetch, accessToken, postId),
      fetchOrganizationAnalytics(accessToken, organizationUrn, postId, fetch)
    ]);
    metrics[postId] = {
      ...analytics,
      likes: socialActions.likesSummary?.totalLikes ?? null,
      comments: socialActions.commentsSummary?.totalFirstLevelComments ?? null,
      platform_raw: { socialActions, analytics }
    };
  }

  return metrics;
}

async function fetchSocialActions(fetch, accessToken, postId) {
  const url = `${LINKEDIN_SOCIAL_ACTIONS_URL}/${encodeURIComponent(postId)}`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-restli-protocol-version": "2.0.0"
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `LinkedIn Social Actions API failed for ${postId}`);
  return payload;
}

async function fetchOrganizationAnalytics(accessToken, organizationUrn, postId, fetchImpl) {
  if (!organizationUrn) throw new Error("LinkedIn organization selection required before analytics ingestion");
  const fetch = fetchImpl || await getFetch();
  const url = new URL(LINKEDIN_ANALYTICS_URL);
  url.searchParams.set("q", "organizationalEntity");
  url.searchParams.set("organizationalEntity", organizationUrn);
  url.searchParams.set("shares", `List(${postId})`);

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-restli-protocol-version": "2.0.0"
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || `LinkedIn Analytics API failed for ${postId}`);
  const element = payload.elements?.[0] || {};
  return {
    reach: numberOrNull(element.uniqueImpressionsCount),
    impressions: numberOrNull(element.impressionCount),
    engagements: numberOrNull(element.engagement),
    shares: numberOrNull(element.shareCount),
    clicks: numberOrNull(element.clickCount)
  };
}

function normalizePosts(rawPosts, rawMetrics = {}) {
  return rawPosts.map((post) => {
    const postId = post.id || post.urn || post.activity || "";
    const metrics = rawMetrics[postId] || {};
    const text = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || post.text || "";
    return {
      source: "linkedin",
      post_id: String(postId),
      author_id: String(post.author || post.author_id || ""),
      published_at: linkedInDate(post.created?.time || post.published_at),
      url: post.permalink || post.url || `https://www.linkedin.com/feed/update/${postId}`,
      text,
      media_type: inferMediaType(post),
      reach: numberOrNull(metrics.reach),
      impressions: numberOrNull(metrics.impressions),
      engagements: numberOrNull(metrics.engagements),
      likes: numberOrNull(metrics.likes),
      comments: numberOrNull(metrics.comments),
      shares: numberOrNull(metrics.shares),
      saves: null,
      clicks: numberOrNull(metrics.clicks),
      conversions: numberOrNull(metrics.conversions),
      platform_raw: { post, metrics }
    };
  });
}

function inferMediaType(post) {
  const media = post.specificContent?.["com.linkedin.ugc.ShareContent"]?.media || [];
  if (!media.length) return "text";
  if (media.length > 1) return "carousel";
  const category = String(media[0].media || media[0].status || media[0].type || "").toLowerCase();
  if (category.includes("video")) return "video";
  return "image";
}

function linkedInDate(value) {
  if (!value) return new Date().toISOString();
  if (Number.isFinite(Number(value))) return new Date(Number(value)).toISOString();
  return new Date(value).toISOString();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function demoPosts(organizationUrn = "urn:li:organization:demo") {
  return [
    {
      id: "urn:li:share:demo-001",
      author: organizationUrn,
      created: { time: Date.now() - 86400000 },
      text: "Demo LinkedIn post for Metricflow connector ingestion.",
      url: "https://www.linkedin.com/feed/update/urn:li:share:demo-001"
    }
  ];
}

function demoMetric(index) {
  return {
    reach: 12000 + index * 1000,
    impressions: 16400 + index * 1200,
    engagements: 920 + index * 80,
    likes: 640 + index * 35,
    comments: 48 + index * 4,
    shares: 31 + index * 3,
    clicks: 174 + index * 9,
    conversions: 12 + index
  };
}

module.exports = {
  exchangeCodeForToken,
  fetchPosts,
  fetchMetrics,
  fetchOrganizationAnalytics,
  normalizePosts
};
