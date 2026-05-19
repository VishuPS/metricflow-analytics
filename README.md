# MetricFlow Analytics

A local MVP for post-level social and web analytics intelligence.

## What It Does

- Connects Instagram, LinkedIn, YouTube, and GA4 as separate connector definitions instead of hardcoded aggregate sources.
- Runs an ingestion path shaped as OAuth > fetch posts > fetch metrics > normalize > store.
- Stores one internal normalized post schema and separate historical metric snapshots.
- Supports daily metric history now, with schema fields for weekly and monthly rollups through `period` and `date`.
- Replaces static insight templates with comparison engines for previous-vs-current movement, spikes, drops, post rankings, and content patterns.
- Adds a content intelligence layer for winning formats, recommendations, and next-brief guidance.
- Presents a post intelligence dashboard instead of a generic platform scorecard.

## Open It

Run the local backend server:

```powershell
node server.js
```

Then open:

```text
http://localhost:4173
```

Local development uses `data/store.json`. If an older source-level store exists, the backend migrates runtime state to the new seeded post model.

## Data Model

The app now centers on these structures:

- `connectors`: Instagram, LinkedIn, YouTube, and GA4 connector metadata, OAuth URLs, scopes, status, and last sync time.
- `connections`: per-connector OAuth/demo connection state.
- `posts`: normalized internal post records with `id`, `connector`, `externalId`, `canonicalUrl`, `title`, `caption`, `author`, `mediaType`, `campaign`, `contentPillar`, `tags`, `publishedAt`, and `ingestedAt`.
- `metrics`: historical post metric snapshots with `postId`, `connector`, `period`, `date`, `reach`, `impressions`, `engagements`, `clicks`, `videoViews`, `watchSeconds`, `conversions`, and `revenue`.

The database version of this model lives in `schema.sql`.

## Connector Flow

Connector routes follow the same contract for each platform:

- `GET /api/connectors`
- `GET /api/connectors/:id/connect`
- `GET /api/connectors/:id/callback`
- `PATCH /api/connectors/:id`
- `POST /api/connectors/:id/sync`
- `POST /api/ingest/run`

Demo mode produces normalized sample posts and metrics. OAuth token exchange is wired for each connector, and the platform-specific fetch adapters are isolated behind `fetchConnectorPosts` / `normalizeRawPost` / `normalizeRawMetric` in `server.js`.

## API

- `GET /api/health`
- `GET /api/state`
- `GET /api/connectors`
- `GET /api/connectors/:id/connect`
- `GET /api/connectors/:id/callback`
- `PATCH /api/connectors/:id`
- `POST /api/connectors/:id/sync`
- `POST /api/ingest/run`
- `POST /api/reports`
- `GET /api/reports`
- `GET /api/export.csv`
- `PUT /api/schedule`
- `PUT /api/settings`
- `POST /api/rules`
- `DELETE /api/rules/:id`

## Deploy

Cloudflare Pages hosts the static dashboard from `dist`, Cloudflare Pages Functions run `/api/*`, and Cloudflare D1 can use the normalized schema in `schema.sql`.

1. Create or migrate a D1 database.
2. Run `schema.sql`.
3. Set the build command to `npm run build:cloudflare`.
4. Set the build output directory to `dist`.
5. Add connector OAuth variables from `.env.example`.
6. Deploy and confirm `/api/health` returns `{ "ok": true }`.

## Auto-Deploy

This repo includes `.github/workflows/cloudflare-pages.yml`. Every push to `main` builds the app and deploys `dist` to the Cloudflare Pages project named `metricflow-analytics`.

Add these GitHub repository secrets before the first workflow run:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The API token needs Cloudflare Pages edit permissions for the account. You can also run the workflow manually from the GitHub Actions tab with `workflow_dispatch`.

To generate D1 seed SQL from local `data/store.json`:

```powershell
npm run migrate:d1
```

## Files

- `index.html` - post intelligence UI structure.
- `styles.css` - responsive product UI.
- `app.js` - frontend API client, ranking views, content intelligence, and report preview.
- `server.js` - local HTTP server, connector architecture, ingestion pipeline, comparison engines, and JSON persistence.
- `functions/api/[[path]].js` - Cloudflare Pages Functions API adapter with the post-level contract.
- `schema.sql` - normalized connector, post, and historical metric table definitions.
- `.env.example` - connector OAuth environment variables.
- `scripts/migrate-to-d1.js` - generates one-time seed SQL from `data/store.json`.
- `scripts/build-cloudflare.js` - copies static frontend files into `dist` for Cloudflare Pages.
