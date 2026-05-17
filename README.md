# MetricFlow Analytics

A local MVP for automated social media analytics collection and reporting.

## What It Does

- Connect or disconnect analytics sources such as LinkedIn, Instagram, TikTok, YouTube, Facebook, and Google Analytics.
- View a normalized KPI dashboard for reach, engagement, conversions, source count, trends, and generated insights.
- Import unsupported sources with simple CSV data.
- Generate a client-ready report preview from selected sections.
- Export the current platform scorecard as CSV.
- Configure scheduled reporting and automation rules.
- Save workspace settings, connected sources, imported CSV data, rules, reports, and schedules through the local backend.

## Open It

Install dependencies:

```powershell
npm install
```

For local development without Supabase, run the backend server as-is. It will log a warning and fall back to `data/store.json`:

```powershell
node server.js
```

Then open:

```text
http://localhost:4173
```

The dashboard still has a browser-only fallback if you open `index.html` directly, but backend mode is the main path.

To use Supabase locally, copy `.env.example` to `.env` and set:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Deploy

The backend stores runtime data in Supabase Postgres when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. No persistent disk is required.

1. Create a Supabase project.
2. In the Supabase SQL editor, run `schema.sql`.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your hosting provider.
4. If you have local data to preserve, run `npm run migrate:supabase` after setting the env vars locally.
5. Deploy with `npm start`, then confirm `/api/health` returns `{ "ok": true }`.

## API

- `GET /api/health`
- `GET /api/state`
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
- `server.js` - HTTP server, API routes, static serving, Supabase persistence, and JSON fallback.
- `schema.sql` - Supabase Postgres table definitions.
- `scripts/migrate-to-supabase.js` - one-time migration from `data/store.json` to Supabase.
- `data/store.json` - local fallback data store created automatically and ignored by Git.
