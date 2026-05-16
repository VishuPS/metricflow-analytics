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

Run the backend server:

```powershell
node server.js
```

Then open:

```text
http://localhost:4173
```

The dashboard still has a browser-only fallback if you open `index.html` directly, but backend mode is the main path.

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
- `server.js` - local HTTP server, API routes, static serving, and JSON persistence.
- `data/store.json` - runtime data store created automatically and ignored by Git.
