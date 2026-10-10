# Architecture

PROVAKIL++ is one Next.js frontend and one Express backend. Both use a single PostgreSQL database through `DATABASE_URL`.

```text
Browser
  → Next.js          (local :3000, later Vercel)
  → Express          (local :4000, later Render)
  → PostgreSQL       (DATABASE_URL: Supabase, Neon, or local)
```

The browser calls `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`). It never opens a database connection.

## Backend modules

| Path | Job |
|---|---|
| `src/server.ts` | HTTP server, CORS, `/health`, cron startup |
| `src/api/` | clients, cases, billing routes |
| `src/ingestion/` | Delhi HC cause lists, live lookup, order PDFs |
| `src/db/` | pool, `schema.sql`, `npm run migrate` |
| `src/notifications/` | optional SMTP hearing reminders |
| `src/ai/invoiceAI.ts` | rule-based invoice draft from existing rows |

There is one process. Ingestion is not a separate service.

## Database

`npm run migrate` applies `backend/src/db/schema.sql`. Tables today: `clients`, `cases`, `parties`, `hearings`, `billing_entries`, `invoices`, `invoice_items`, `case_events`, `orders`.

Money columns are `NUMERIC`. Search on party names uses the `pg_trgm` extension.

## What stays out

Docker is not used. No Redis, queues, microservices, or a second database. Local Postgres is a user-owned cluster on 127.0.0.1:5434 (`%LOCALAPPDATA%\provakil-pg`). Authentication is not in this build. Add it before hosting real client or financial data.

## Deployment shape

- Frontend: Vercel, `NEXT_PUBLIC_API_URL` set to the API origin
- Backend: Render, `PORT`, `DATABASE_URL`, `CORS_ORIGIN`
- Database: managed Postgres

Local cron inside the API is for development. Production ingestion should also be runnable with `npm run ingest-now`.
