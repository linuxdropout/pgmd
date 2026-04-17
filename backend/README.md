# Wugbooks Backend

Fastify + WebSocket + PostgreSQL backend scaffold for document-native analytics runtime.

## Run

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. From repo root: `npm install`
3. Start backend: `npm run dev:backend`

## Endpoints

- `GET /api/v1/health`
- `POST /api/v1/sql/parse`
- `POST /api/v1/documents/plan`
- `WS /ws`
