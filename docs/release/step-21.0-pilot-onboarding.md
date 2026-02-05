<!-- Purpose: pilot onboarding checklist for operators (Step 21.0B). -->
# Step 21.0 — Pilot Onboarding Checklist

Date: 2026-02-05

## A) Provisioning
- [ ] Run `pnpm provision:tenant ...` and record:
  - tenant slug
  - owner email
  - one-time password (if created)
- [ ] Confirm migrations are applied (`pnpm prisma migrate deploy`).

## B) Verify Core Flows
- [ ] Admin login works for the owner account.
- [ ] Create a center and confirm it appears in admin lists.
- [ ] Create a student and parent, link them, and reset the parent access code.
- [ ] Parent login works with the access code.
- [ ] Portal pages load (Dashboard, Students, Sessions, Requests, Help, Account).
- [ ] Help/Account show the correct support contact line (email/phone or fallback).
- [ ] Language toggle works (EN/zh-CN).
- [ ] Audit Log shows recent actions (login + create events).
- [ ] Tenant isolation sanity: create a second tenant and confirm no cross-tenant data appears.

## C) Operational Checks
- [ ] Env validation passes at startup (no missing required env vars).
- [ ] Backups configured per `docs/ops/db-runbook.md`.
- [ ] Operators know the migration procedure (`docs/ops/deployment.md`).
- [ ] Log access path confirmed (where logs are stored).

## D) Content Pack Reference
- [ ] Review `docs/release/step-21.0-launch-content-pack.md` for support copy and FAQ.
