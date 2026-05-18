# MetricFlow Analytics

A local MVP for automated social media analytics collection and reporting.

## What It Does

- Connect or disconnect analytics sources such as LinkedIn, Instagram, TikTok, YouTube, Facebook, and Google Analytics.
- View a normalized KPI dashboard for reach, engagement, conversions, source count, trends, and generated insights.
- Import unsupported sources with simple CSV data.
- Generate a client-ready report preview from selected sections.
- Export the current platform scorecard as CSV.
- Configure scheduled reporting and automation rules.
- Connect Google Analytics through OAuth and sync GA4 metrics into the dashboard.
- Save workspace settings, connected sources, imported CSV data, rules, reports, and schedules through the local backend.

## Open It

Run the local backend server:

```powershell
node server.js
```

Then open:

```text
http://localhost:4173
```

The dashboard still has a browser-only fallback if you open `index.html` directly, but backend mode is the main path. Local development uses `data/store.json`; Cloudflare production uses D1.

## Deploy

Cloudflare Pages hosts the static dashboard from `dist`, Cloudflare Pages Functions run `/api/*`, and Cloudflare D1 stores runtime data. No domain is required; Cloudflare gives you a `pages.dev` URL.

1. In Cloudflare, create a D1 database named `metricflow-analytics`.
2. Run `schema.sql` against that D1 database.
3. In Cloudflare Pages, connect `VishuPS/metricflow-analytics`.
4. Set the build command to `npm run build:cloudflare`.
5. Set the build output directory to `dist`.
6. Add a D1 binding in the Pages dashboard named `DB` that points to the `metricflow-analytics` database.
7. Add these Pages environment variables when enabling Google Analytics:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI=https://metricflow-analytics.pages.dev/api/google/callback`
   - `GA4_PROPERTY_ID`
8. Leave the deploy command blank in the Pages build settings. Do not use `npx wrangler deploy`; that command is for Workers, not Pages.
9. Deploy, then confirm `/api/health` returns `{ "ok": true }`.

## Google Analytics

The MVP supports one global GA4 connection before app user accounts exist.

1. In Google Cloud Console, enable the Google Analytics Data API.
2. Create an OAuth 2.0 web client.
3. Add local and production redirect URIs:

```text
http://localhost:4173/api/google/callback
https://metricflow-analytics.pages.dev/api/google/callback
```

4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `GA4_PROPERTY_ID`.
5. Apply the latest `schema.sql` to D1 so `google_connections` and `metric_snapshots` exist.
6. Open Sources, connect Google Analytics, then sync GA4 metrics.

If you deploy manually with Wrangler, use Pages deploy:

```powershell
npm run deploy:pages
```

To preserve local `data/store.json` data, generate a D1 seed file:

```powershell
npm run migrate:d1
```

Then run the generated `dist/d1-seed.sql` against D1 after `schema.sql`.

## API

- `GET /api/health`
- `GET /api/state`
- `GET /api/google/status`
- `GET /api/google/connect`
- `GET /api/google/callback`
- `POST /api/sources/google-analytics/sync`
- `PATCH /api/sources/:name`
- `POST /api/import-csv`
- `POST /api/reports`
- `GET /api/reports`
- `GET /api/export.csv`
- `PUT /api/schedule`
- `PUT /api/settings`
- `POST /api/rules`
- `DELETE /api/rules/:id`

## Files

- `index.html` - application structure and views.
- `styles.css` - responsive product UI.
- `app.js` - frontend API client, report generation, CSV import/export, and UI interactions.
- `server.js` - local HTTP server, API routes, static serving, and JSON persistence.
- `functions/api/[[path]].js` - Cloudflare Pages Functions API adapter backed by D1.
- `schema.sql` - Cloudflare D1 table definitions.
- `.env.example` - local Google Analytics integration variables.
- `scripts/migrate-to-d1.js` - generates one-time seed SQL from `data/store.json`.
- `scripts/build-cloudflare.js` - copies static frontend files into `dist` for Cloudflare Pages.
- `data/store.json` - local fallback data store created automatically and ignored by Git.
