const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const STORE_FILE = process.env.STORE_FILE || path.join(DATA_DIR, "store.json");

const defaultState = {
  sources: {
    linkedin: { connected: false },
    instagram: { connected: false },
    youtube: { connected: false },
    ga4: { connected: false }
  },
  posts: [],
  history: {
    daily: [],
    weekly: [],
    monthly: []
  },
  rules: [
    { id: "rule-spike", title: "Spike detection", detail: "Flag posts whose engagement grows more than 35% versus their prior observation." }
  ],
  settings: {
    companyName: "Northstar Studio",
    defaultKpi: "Engagement rate",
    autoRefresh: true
  },
  schedule: {
    frequency: "Weekly",
    day: "Monday",
    recipients: "team@example.com",
    autoIngest: false,
    sources: ["linkedin"],
    lastRunAt: null
  },
  reports: []
};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function migrateLegacyState(raw = {}) {
  const state = {
    ...defaultState,
    ...raw,
    sources: normalizeSources(raw),
    posts: normalizeLegacyPosts(raw.posts || []),
    history: {
      ...defaultState.history,
      ...(raw.history || {})
    },
    rules: raw.rules || defaultState.rules,
    settings: raw.settings || defaultState.settings,
    schedule: { ...defaultState.schedule, ...(raw.schedule || {}) },
    reports: raw.reports || []
  };
  return state;
}

function normalizeSources(raw = {}) {
  const sources = { ...defaultState.sources, ...(raw.sources && !Array.isArray(raw.sources) ? raw.sources : {}) };

  if (Array.isArray(raw.connectors)) {
    for (const connector of raw.connectors) {
      sources[connector.id] = {
        ...(sources[connector.id] || {}),
        connected: Boolean(connector.connected),
        lastSyncAt: connector.lastSyncAt || sources[connector.id]?.lastSyncAt
      };
    }
  }

  if (raw.connections) {
    for (const [source, connection] of Object.entries(raw.connections)) {
      sources[source] = {
        ...(sources[source] || {}),
        ...connection,
        connected: Boolean(connection.accessToken || connection.mode === "demo" || sources[source]?.connected)
      };
    }
  }

  return sources;
}

function normalizeLegacyPosts(posts) {
  return posts.map((post) => {
    if (post.post_id) return post;
    const metrics = post.metrics || {};
    return {
      source: post.source || post.connector || "linkedin",
      post_id: String(post.externalId || post.id || ""),
      author_id: post.author || null,
      published_at: post.publishedAt || post.published_at || new Date().toISOString(),
      url: post.canonicalUrl || post.url || "",
      text: post.caption || post.title || post.text || "",
      media_type: normalizeMediaType(post.mediaType || post.media_type),
      reach: numberOrNull(metrics.reach ?? post.reach),
      impressions: numberOrNull(metrics.impressions ?? post.impressions),
      engagements: numberOrNull(metrics.engagements ?? post.engagements),
      likes: numberOrNull(metrics.likes ?? metrics.reactions ?? post.likes),
      comments: numberOrNull(metrics.comments ?? post.comments),
      shares: numberOrNull(metrics.shares ?? post.shares),
      saves: numberOrNull(metrics.saves ?? post.saves),
      clicks: numberOrNull(metrics.clicks ?? post.clicks),
      conversions: numberOrNull(metrics.conversions ?? post.conversions),
      platform_raw: post.platform_raw || post.raw || post
    };
  }).filter((post) => post.post_id);
}

function normalizeMediaType(value) {
  if (["image", "video", "carousel", "text"].includes(value)) return value;
  if (value === "reel") return "video";
  if (value === "document") return "carousel";
  return "text";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function loadState() {
  await ensureDataDir();
  try {
    const content = await fs.readFile(STORE_FILE, "utf8");
    return migrateLegacyState(JSON.parse(content));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await saveState(defaultState);
    return structuredClone(defaultState);
  }
}

async function saveState(state) {
  await ensureDataDir();
  await fs.writeFile(STORE_FILE, `${JSON.stringify(migrateLegacyState(state), null, 2)}\n`, "utf8");
}

function mergePosts(existing = [], newOnes = []) {
  const byKey = new Map();
  for (const post of existing) byKey.set(`${post.source}:${post.post_id}`, post);
  for (const post of newOnes) {
    const key = `${post.source}:${post.post_id}`;
    byKey.set(key, { ...(byKey.get(key) || {}), ...post });
  }
  return [...byKey.values()].sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
}

async function savePosts(source, posts) {
  const state = await loadState();
  state.posts = mergePosts(state.posts || [], posts.map((post) => ({ ...post, source })));
  state.sources[source] = {
    ...(state.sources[source] || {}),
    connected: true,
    lastIngestedAt: new Date().toISOString()
  };
  await saveState(state);
  return state.posts.filter((post) => post.source === source);
}

module.exports = {
  STORE_FILE,
  defaultState,
  loadState,
  saveState,
  savePosts,
  mergePosts
};
