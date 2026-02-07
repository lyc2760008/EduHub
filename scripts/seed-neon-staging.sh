#!/usr/bin/env bash
# Seed Neon staging with the Prisma seed file (safe, idempotent upserts).
# Usage: bash scripts/seed-neon-staging.sh
# Optional: set DATABASE_URL, DIRECT_URL, SEED_DEFAULT_PASSWORD, SEED_RUN_MIGRATE=1 beforehand.

set -euo pipefail

# Ensure we're running from the repo root so relative paths work.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ -z "${DATABASE_URL:-}" ]]; then
  read -r -p "Enter DATABASE_URL: " DATABASE_URL
  export DATABASE_URL
fi

if [[ -z "${SEED_DEFAULT_PASSWORD:-}" ]]; then
  read -r -s -p "Enter SEED_DEFAULT_PASSWORD: " SEED_DEFAULT_PASSWORD
  echo
  export SEED_DEFAULT_PASSWORD
fi

# Staging tenant defaults (can be overridden by pre-set env vars).
export SEED_DEMO_TENANT_SLUG="${SEED_DEMO_TENANT_SLUG:-pilot-staging}"
export SEED_DEMO_TENANT_NAME="${SEED_DEMO_TENANT_NAME:-Pilot Staging}"
export SEED_SECOND_TENANT_SLUG="${SEED_SECOND_TENANT_SLUG:-acme-staging}"
export SEED_SECOND_TENANT_NAME="${SEED_SECOND_TENANT_NAME:-Acme Staging}"

# Optional: run migrations first if SEED_RUN_MIGRATE is set.
if [[ "${SEED_RUN_MIGRATE:-}" =~ ^(1|true|yes)$ ]]; then
  export DIRECT_URL="${DIRECT_URL:-$DATABASE_URL}"
  pnpm db:migrate:deploy
fi

pnpm db:seed
