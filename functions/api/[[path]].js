const connectors = [
  { id: "instagram", name: "Instagram", color: "#c13584", kind: "social", connected: true, status: "ready", authUrl: "https://api.instagram.com/oauth/authorize", tokenUrl: "https://api.instagram.com/oauth/access_token", scopes: ["instagram_basic", "instagram_manage_insights"], lastSyncAt: "2026-05-18T09:15:00.000Z" },
  { id: "linkedin", name: "LinkedIn", color: "#0a66c2", kind: "social", connected: true, status: "ready", authUrl: "https://www.linkedin.com/oauth/v2/authorization", tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken", scopes: ["r_liteprofile", "r_organization_social"], lastSyncAt: "2026-05-17T09:15:00.000Z" },
  { id: "youtube", name: "YouTube", color: "#ff0033", kind: "social", connected: true, status: "ready", authUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", scopes: ["https://www.googleapis.com/auth/youtube.readonly"], lastSyncAt: "2026-05-16T09:15:00.000Z" },
  { id: "ga4", name: "GA4", color: "#f9ab00", kind: "web", connected: true, status: "ready", authUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", scopes: ["https://www.googleapis.com/auth/analytics.readonly"], lastSyncAt: "2026-05-15T09:15:00.000Z" }
];

const seed = {
  connectors,
  connections: {
    instagram: { mode: "demo" },
    linkedin: { mode: "demo" },
    youtube: { mode: "demo" },
    ga4: { mode: "demo", propertyId: "demo-property" }
  },
  posts: [
    post("linkedin", "li-001", "Webinar recap: five retention signals", "document", "Lifecycle", "education", "2026-05-12T10:30:00Z"),
    post("instagram", "ig-001", "Carousel: before and after onboarding audit", "carousel", "Product Education", "proof", "2026-05-14T15:10:00Z"),
    post("youtube", "yt-001", "How to read content ROI in 12 minutes", "video", "Content Strategy", "education", "2026-05-11T18:00:00Z"),
    post("ga4", "ga4-landing-content-roi", "Landing page: content ROI guide", "landing_page", "Demand Gen", "conversion", "2026-05-09T00:00:00Z")
  ],
  metrics: [
    metric("linkedin", "li-001", "2026-05-12", 11200, 780, 23),
    metric("linkedin", "li-001", "2026-05-18", 16400, 1420, 39),
    metric("instagram", "ig-001", "2026-05-14", 18800, 1960, 41),
    metric("instagram", "ig-001", "2026-05-18", 30500, 4120, 63),
    metric("youtube", "yt-001", "2026-05-11", 9200, 610, 18),
    metric("youtube", "yt-001", "2026-05-18", 14800, 1180, 34),
    metric("ga4", "ga4-landing-content-roi", "2026-05-09", 8200, 520, 86),
    metric("ga4", "ga4-landing-content-roi", "2026-05-18", 17100, 980, 194)
  ],
  rules: [
    { id: "rule-spike", title: "Spike detection", detail: "Flag posts whose engagement grows more than 35% versus their prior observation." },
    { id: "rule-pattern", title: "Pattern detection", detail: "Surface content pillars and formats that repeatedly outperform the post median." }
  ],
  settings: { companyName: "Northstar Studio", defaultKpi: "Engagement rate", autoRefresh: true },
  schedule: { frequency: "Weekly", day: "Monday", recipients: "team@example.com" },
  reports: []
};

function post(connector, externalId, title, mediaType, campaign, contentPillar, publishedAt) {
  return {
    id: `${connector}-${externalId}`,
    connector,
    externalId,
    canonicalUrl: connector === "ga4" ? `/content/${externalId}` : `https://example.com/${connector}/${externalId}`,
    title,
    caption: title,
    author: "Northstar Studio",
    mediaType,
    campaign,
    contentPillar,
    tags: [connector, mediaType],
    publishedAt,
    ingestedAt: "2026-05-19T08:00:00.000Z"
  };
}

function metric(connector, externalPostId, date, reach, engagements, conversions) {
  return {
    id: `${connector}-${externalPostId}-${date}`,
    connector,
    externalPostId,
    postId: `${connector}-${externalPostId}`,
    period: "daily",
    capturedAt: `${date}T23:59:00.000Z`,
    date,
    reach,
    impressions: Math.round(reach * 1.32),
    engagements,
    reactions: Math.round(engagements * 0.6),
    comments: Math.round(engagements * 0.07),
    shares: Math.round(engagements * 0.045),
    saves: Math.round(engagements * 0.035),
    clicks: Math.round(engagements * 0.19),
    videoViews: connector === "youtube" ? Math.round(reach * 0.42) : 0,
    watchSeconds: connector === "youtube" ? reach * 11 : 0,
    conversions,
    revenue: conversions * 47
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function pct(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return current ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function latestMetric(store, postId) {
  return [...store.metrics].filter((item) => item.postId === postId).sort((a, b) => b.date.localeCompare(a.date))[0] || {};
}

function previousMetric(store, postId, date) {
  return [...store.metrics].filter((item) => item.postId === postId && item.date < date).sort((a, b) => b.date.localeCompare(a.date))[0] || {};
}

function postRows(store) {
  return store.posts.map((item) => {
    const metrics = latestMetric(store, item.id);
    const previousMetrics = previousMetric(store, item.id, metrics.date || "9999-99-99");
    return {
      ...item,
      metrics,
      previousMetrics,
      engagementRate: metrics.reach ? (metrics.engagements / metrics.reach) * 100 : 0,
      reachChange: pct(metrics.reach || 0, previousMetrics.reach || 0),
      engagementChange: pct(metrics.engagements || 0, previousMetrics.engagements || 0),
      conversionChange: pct(metrics.conversions || 0, previousMetrics.conversions || 0)
    };
  });
}

function rankPosts(store) {
  return postRows(store).map((item) => ({
    ...item,
    score: Number(((item.metrics.engagements || 0) * 0.42 + (item.metrics.conversions || 0) * 18 + (item.engagementChange || 0) * 9).toFixed(1))
  })).sort((a, b) => b.score - a.score);
}

function summary(store) {
  const rows = postRows(store);
  const current = rows.reduce((sum, item) => {
    sum.reach += Number(item.metrics.reach || 0);
    sum.engagements += Number(item.metrics.engagements || 0);
    sum.conversions += Number(item.metrics.conversions || 0);
    sum.revenue += Number(item.metrics.revenue || 0);
    return sum;
  }, { reach: 0, engagements: 0, conversions: 0, revenue: 0 });
  const previous = rows.reduce((sum, item) => {
    sum.reach += Number(item.previousMetrics.reach || 0);
    sum.engagements += Number(item.previousMetrics.engagements || 0);
    sum.conversions += Number(item.previousMetrics.conversions || 0);
    return sum;
  }, { reach: 0, engagements: 0, conversions: 0 });
  return {
    totalReach: current.reach,
    totalEngagement: current.engagements,
    totalConversions: current.conversions,
    attributedRevenue: current.revenue,
    engagementRate: current.reach ? (current.engagements / current.reach) * 100 : 0,
    connectedSources: store.connectors.filter((item) => item.connected).length,
    totalSources: store.connectors.length,
    trackedPosts: rows.length,
    deltas: { reach: pct(current.reach, previous.reach), engagement: pct(current.engagements, previous.engagements), conversions: pct(current.conversions, previous.conversions) },
    timeSavedHours: Number((store.connectors.length * 1.4 + rows.length * 0.18).toFixed(1))
  };
}

function patterns(store) {
  const groups = new Map();
  for (const item of postRows(store)) {
    const key = `${item.contentPillar} / ${item.mediaType}`;
    const group = groups.get(key) || { key, posts: 0, reach: 0, engagements: 0, conversions: 0 };
    group.posts += 1;
    group.reach += Number(item.metrics.reach || 0);
    group.engagements += Number(item.metrics.engagements || 0);
    group.conversions += Number(item.metrics.conversions || 0);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    engagementRate: group.reach ? (group.engagements / group.reach) * 100 : 0,
    conversionRate: group.reach ? (group.conversions / group.reach) * 100 : 0
  })).sort((a, b) => b.engagementRate - a.engagementRate);
}

function statePayload(requestUrl) {
  const store = structuredClone(seed);
  const ranked = rankPosts(store);
  const grouped = patterns(store);
  return {
    ...store,
    connectors: store.connectors.map((connector) => ({ ...connector, configured: true, callbackUrl: `${requestUrl.origin}/api/connectors/${connector.id}/callback` })),
    summary: summary(store),
    insights: [
      { type: "spike", title: `${ranked[0]?.title || "Top post"} leads the ranking`, detail: "The comparison engine ranks posts by current-vs-previous movement, engagement, and conversions." },
      { type: "pattern", title: `${grouped[0]?.key || "Content pattern"} is strongest`, detail: `This pattern averages ${Number(grouped[0]?.engagementRate || 0).toFixed(1)}% engagement rate.` },
      { type: "history", title: "Daily snapshots are stored per post", detail: "The schema supports daily, weekly, and monthly rollups through period and date fields." }
    ],
    postRankings: ranked,
    patterns: grouped,
    contentIntelligence: {
      winningFormats: grouped,
      recommendations: [
        `Expand ${grouped[0]?.key || "the top pattern"} with one controlled variation.`,
        "Compare each new post against its prior observation before adding narrative recommendations.",
        "Keep connector-specific API data out of reports until it is normalized into the internal schema."
      ],
      nextBrief: {
        contentPillar: grouped[0]?.key.split(" / ")[0] || "education",
        format: grouped[0]?.key.split(" / ")[1] || "post",
        angle: "Turn the strongest comparison insight into a reusable tactical checklist."
      }
    },
    normalizedSchema: {
      post: ["id", "connector", "externalId", "canonicalUrl", "title", "caption", "author", "mediaType", "campaign", "contentPillar", "tags", "publishedAt", "ingestedAt"],
      metric: ["id", "postId", "connector", "period", "date", "reach", "impressions", "engagements", "clicks", "videoViews", "watchSeconds", "conversions", "revenue"]
    }
  };
}

async function readBody(request) {
  const raw = await request.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const method = context.request.method || "GET";
  const parts = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/api/health") return json({ ok: true, service: "MetricFlow API" });
  if (method === "GET" && url.pathname === "/api/state") return json(statePayload(url));
  if (method === "GET" && url.pathname === "/api/connectors") return json({ connectors: statePayload(url).connectors, schema: statePayload(url).normalizedSchema });
  if (method === "GET" && parts[1] === "connectors" && parts[3] === "connect") return Response.redirect(`${url.origin}/?connector=connected`, 302);
  if (method === "POST" && parts[1] === "connectors" && parts[3] === "sync") return json({ posts: [], metrics: [], state: statePayload(url) });
  if (method === "POST" && url.pathname === "/api/ingest/run") return json({ results: [], state: statePayload(url) });
  if (method === "PATCH" && parts[1] === "connectors" && parts[2]) {
    const body = await readBody(context.request);
    const connector = { ...(connectors.find((item) => item.id === parts[2]) || connectors[0]), connected: Boolean(body.connected) };
    return json({ connector, summary: summary(seed) });
  }
  if (method === "POST" && url.pathname === "/api/reports") {
    const body = await readBody(context.request);
    const report = { id: `report-${Date.now()}`, title: body.title || "Post intelligence report", audience: body.audience || "Leadership team", sections: body.sections || [], createdAt: new Date().toISOString(), summary: summary(seed), recommendation: "Expand the highest-ranked pattern with one controlled variation." };
    return json({ report, reports: [report] }, 201);
  }
  if (method === "GET" && url.pathname === "/api/reports") return json({ reports: [] });
  if (method === "PUT" && url.pathname === "/api/settings") return json({ settings: await readBody(context.request) });
  if (method === "PUT" && url.pathname === "/api/schedule") return json({ schedule: await readBody(context.request) });
  if (method === "POST" && url.pathname === "/api/rules") {
    const rule = { id: `rule-${Date.now()}`, title: "Pattern watch", detail: "Notify the team when a content format beats its historical median twice in a row." };
    return json({ rule, rules: [...seed.rules, rule] }, 201);
  }
  if (method === "DELETE" && parts[1] === "rules") return json({ rules: [] });
  if (method === "GET" && url.pathname === "/api/export.csv") {
    return new Response("connector,post_id,title,reach,engagements,conversions\n", {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=\"metricflow-posts.csv\"" }
    });
  }
  return json({ message: "API route not found" }, 404);
}
