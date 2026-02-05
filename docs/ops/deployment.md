<!-- Purpose: define a repeatable staging/production deployment path for EduHub. -->
# Deployment (Staging + Production)

EduHub currently has **no existing deployment workflow** in the repo, so this document standardizes a minimal **Docker Compose** approach for repeatable pilot deployments.
The Dockerfile runs `next build` + `next start` (no standalone output configured yet).

## Staging vs Production Strategy
- **Separate databases** for staging and production.
- **Separate domains** (example): `staging.eduhub.example.com` vs `eduhub.example.com`.
- Separate env files (`.env.staging`, `.env.production`) stored in secret managers or on the host.

## Prerequisites
- Docker Engine + Docker Compose v2.
- `.env.staging` and `.env.production` created locally (not committed).
- Postgres available (external for production; optional local for staging).

## Build and Run (Staging)

**Bash**
```bash
docker compose -f compose.staging.yaml up -d --build
```

**PowerShell**
```powershell
docker compose -f compose.staging.yaml up -d --build
```

**Notes**
- `compose.staging.yaml` includes a local Postgres service for convenience.
- If you use an external database instead, remove the `postgres` service and supply `DATABASE_URL` in `.env.staging`.

## Build and Run (Production)

**Bash**
```bash
docker compose -f compose.prod.yaml up -d --build
```

**PowerShell**
```powershell
docker compose -f compose.prod.yaml up -d --build
```

**Notes**
- `compose.prod.yaml` expects an external Postgres via `DATABASE_URL`.
- The app container listens on port `3000` by default.

## Migrations

Run migrations **before** first traffic, and whenever schema changes ship.

**Bash**
```bash
docker compose -f compose.staging.yaml run --rm app pnpm prisma migrate deploy
```

**PowerShell**
```powershell
docker compose -f compose.staging.yaml run --rm app pnpm prisma migrate deploy
```

Repeat the same command with `compose.prod.yaml` for production.

## Health Check

The app exposes `GET /api/health`:
- `200` with `{ "status": "ok" }` when DB is reachable.
- `503` with `{ "status": "degraded" }` when DB ping fails.

## Rollback

1. Deploy the previous image tag or build artifact.
2. If a migration caused issues, restore the database from the last known-good backup.

## Deploy Checklist (Minimal)
- Verify `.env.staging` or `.env.production` exists and is correct.
- Run `pnpm prisma migrate deploy`.
- Confirm `/api/health` returns `ok`.
- Smoke test: login and open dashboard.
