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

The Express backend exposes an OAuth and ingestion contract per platform:

- `GET /oauth/:source/authorize`
- `GET /oauth/:source/callback`
- `POST /api/ingest/:source`
- `GET /api/posts?source=linkedin&from=YYYY-MM-DD&to=YYYY-MM-DD`

LinkedIn is the complete reference implementation in `connectors/linkedin.js`. It includes OAuth code exchange, UGC post fetch, Social Actions metrics, organization share analytics, and normalization. Instagram, YouTube, and GA4 are scaffolded in `connectors/` and intentionally return clear "not implemented" errors until their API mapping is filled in.

OAuth tokens are stored in `data/store.json` under:

```json
{
  "sources": {
    "linkedin": {
      "connected": true,
      "accessToken": "..."
    }
  }
}
```

Set `LINKEDIN_DEMO_MODE=true` to exercise LinkedIn ingestion without calling LinkedIn APIs.

## Normalized Post Schema

All platform adapters must return this shape:

```js
{
  source: "linkedin",
  post_id: String,
  author_id: String,
  published_at: String,
  url: String,
  text: String,
  media_type: "image" | "video" | "carousel" | "text",
  reach: Number | null,
  impressions: Number | null,
  engagements: Number | null,
  likes: Number | null,
  comments: Number | null,
  shares: Number | null,
  saves: Number | null,
  clicks: Number | null,
  conversions: Number | null,
  platform_raw: Object
}
```

## API

- `GET /api/health`
- `GET /api/state`
- `GET /oauth/:source/authorize`
- `GET /oauth/:source/callback`
- `POST /api/ingest/:source`
- `GET /api/posts`
- `GET /api/connectors`
- `GET /api/connectors/:id/connect`
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

This repo includes `.github/workflows/cloudflare-pages.yml`. Every push to `main` deploys the Worker API first, then builds the static app and deploys `dist` to the Cloudflare Pages project named `metricflow-analytics`.

Add these GitHub repository secrets before the first workflow run:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The API token needs Cloudflare Pages edit permissions for the account. You can also run the workflow manually from the GitHub Actions tab with `workflow_dispatch`.

## Worker Backend

The cloud backend lives in `workers/metricflow-api.js` and deploys as the Cloudflare Worker named `metricflow-api`.

Create a KV namespace once:

```powershell
wrangler kv namespace create USER_STATE
```

Copy the generated namespace id into `wrangler.worker.toml`:

```toml
kv_namespaces = [
  { binding = "USER_STATE", id = "your_user_state_namespace_id" }
]
```

Set Worker secrets for OAuth:

```powershell
wrangler secret put LINKEDIN_CLIENT_ID --config wrangler.worker.toml
wrangler secret put LINKEDIN_CLIENT_SECRET --config wrangler.worker.toml
```

Password reset links and signup welcome emails are generated by the Worker and must be delivered by an email provider. The preferred production path is Resend:

```powershell
wrangler secret put RESEND_API_KEY --config wrangler.worker.toml
wrangler secret put EMAIL_FROM --config wrangler.worker.toml
wrangler secret put EMAIL_REPLY_TO --config wrangler.worker.toml
```

Use a verified sender such as `Metrillix <hello@metrillix.com>` for `EMAIL_FROM`. `EMAIL_REPLY_TO` is optional.

The Worker can also call existing webhook automations if you do not want direct Resend delivery:

```powershell
wrangler secret put PASSWORD_RESET_WEBHOOK_URL --config wrangler.worker.toml
wrangler secret put PASSWORD_RESET_WEBHOOK_SECRET --config wrangler.worker.toml
wrangler secret put SIGNUP_WELCOME_WEBHOOK_URL --config wrangler.worker.toml
wrangler secret put SIGNUP_WELCOME_WEBHOOK_SECRET --config wrangler.worker.toml
```

The Worker posts `{ type, to, name, resetUrl, subject }` for password resets and `{ type, to, name, appUrl, subject }` for welcome emails. For local/debug-only testing, set `PASSWORD_RESET_DEBUG_LINK=true` to include the reset URL in the API response; do not enable that in production.

MetricFlow production storage is multi-tenant and account-scoped in `USER_STATE`. The Worker no longer reads or writes the old global `metricflow:state` analytics document.

Current KV layout:

```text
session:{token}
oauth:state:{token}
auth:account:{email}
auth:id:{accountId}
user:{accountId}:linkedin:profile
user:{accountId}:linkedin:token
user:{accountId}:linkedin:organizations
user:{accountId}:linkedin:organization
user:{accountId}:linkedin:posts
user:{accountId}:linkedin:analytics
user:{accountId}:linkedin:sync
user:{accountId}:settings
user:{accountId}:schedule
user:{accountId}:rules
user:{accountId}:reports
```

LinkedIn organization URNs are discovered per account after OAuth through `organizationAcls` and stored under `user:{accountId}:linkedin:*`; they are no longer Worker-level or global app state.

Migration note: old prototype analytics may still exist under `METRICFLOW_STORE` / `metricflow:state`. Leave it untouched for backup or delete that key/namespace after confirming the new user-scoped dashboard data is correct.

LinkedIn OAuth now requests read-only advertising scopes in addition to organization analytics scopes:

- `r_ads`
- `r_ads_reporting`

After adding the LinkedIn Advertising API product to the Developer app, reconnect LinkedIn in MetricFlow so the stored user token includes these scopes.

For GitHub Actions, add matching repository secrets if you want the workflow environment to carry the same values:

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `LINKEDIN_REDIRECT_URI`

## Production Domain

The production dashboard is configured for:

- App: `https://metrillix.com`
- API: `https://api.metrillix.com`
- LinkedIn OAuth callback: `https://api.metrillix.com/oauth/linkedin/callback`

Cloudflare should host `metrillix.com` as an active zone, with Cloudflare Pages attached to the apex domain and the Worker API attached to `api.metrillix.com`. In GitHub repository secrets, set `LINKEDIN_REDIRECT_URI` to the callback URL above before deploying. In the LinkedIn Developer app, add the same callback URL to the authorized redirect URLs.

Pages can call the Worker in two ways:

- Same-origin during local development: leave `config.js` as `""`.
- Separate Worker URL in production: set `window.METRICFLOW_API_BASE_URL` in `config.js` to your Worker URL, or bind a custom route/domain so `/api/*` reaches the Worker.

To generate D1 seed SQL from local `data/store.json`:

```powershell
npm run migrate:d1
```

## Files

- `index.html` - post intelligence UI structure.
- `styles.css` - responsive product UI.
- `app.js` - frontend API client, ranking views, content intelligence, and report preview.
- `server.js` - Express backend, OAuth routes, ingestion routes, scheduler loop, and API compatibility routes.
- `storage.js` - JSON state helpers: `loadState`, `saveState`, `savePosts`, and `mergePosts`.
- `rollups.js` - daily, weekly, and monthly rollup generation.
- `scheduler.js` - automatic ingestion loop driven by `state.schedule`.
- `connectors/linkedin.js` - complete LinkedIn connector implementation.
- `connectors/instagram.js`, `connectors/youtube.js`, `connectors/ga4.js` - API scaffolds.
- `functions/api/[[path]].js` - Cloudflare Pages Functions API adapter with the post-level contract.
- `schema.sql` - normalized connector, post, and historical metric table definitions.
- `.env.example` - connector OAuth environment variables.
- `scripts/migrate-to-d1.js` - generates one-time seed SQL from `data/store.json`.
- `scripts/build-cloudflare.js` - copies static frontend files into `dist` for Cloudflare Pages.
