# EduHub Dev Standards (MVP Speed + Low Regression)

This document defines the repeatable engineering guardrails for EduHub (MMC Education SaaS).  
It is optimized for **shipping MVP quickly** while minimizing costly regressions in **tenant isolation, RBAC, and scheduling**.

## How to use this document
- **Prefer referencing this doc** and explicitly confirming it was read; only paste the 8-line header block when requested.
- Every implementation step must end with the **Definition of Done** checklist.
- If a step touches **tenant/RBAC/scheduling**, apply the **Regression Guards** section.
- Prefer **small, diff-friendly changes**: one coherent objective per step.

---

## Codex preamble snippet (copy/paste)
Use this at the top of a prompt when you want a lightweight reminder:

```
Codex: I have read docs/dev-standards.md and will follow it (tenant isolation, RBAC, validation, transactions, i18n, seed safety, reuse, lint/verify).
I have also reviewed skills/SKILL.md. I will ONLY apply its “distinctive/polished UI” guidance when building the Parent Portal (Phase 2) or when the prompt explicitly asks for design polish.
For MVP Admin Console work, I will keep the UI utilitarian and consistent with existing Tailwind/shadcn patterns (dense tables, minimal motion, no new font system), prioritizing clarity and speed.
I will preserve existing API response shapes and UI props contracts, and use existing Role enum values only.
```

---

## 8-line Codex header block (paste into every Codex prompt)

Codex MUST follow:
1) Tenant isolation: every tenant-scoped query/mutation touched must include tenantId (or verify membership + tenantId).
2) Server-side RBAC: enforce requireRole/requirePageRole on every touched route/mutation/admin page.
3) Validation: all POST/PATCH touched must validate with zod; PATCH must reject "no fields provided".
4) Multi-write safety: any handler writing 2+ tables must use prisma.$transaction.
5) i18n: no hardcoded user-facing strings; update both en.json + zh-CN.json in the same step.
6) Seed safety: seeds must be idempotent; no hardcoded secrets (use env).
7) Reuse: extract 1-2 reusable helpers/components when duplication exists; do not build a CRUD framework.
8) Quality gate: pnpm lint must pass + include a short manual verify checklist for tenant/RBAC/i18n as relevant.

---

## Non-negotiables (must apply in every step)

### 1) Tenant isolation
- All tenant-scoped reads/writes must be scoped by `tenantId`.
- Domain data helpers must accept `tenantId` explicitly (no hidden global tenant context).
- When fetching by id, prefer `where: { id, tenantId }`. If not possible, do a tenant membership pre-check and then update safely.

### 2) Server-side RBAC
- Every admin route/page/mutation must enforce RBAC server-side (not UI-only hiding).
- Always gate early (before any data fetching/mutations).
- Prefer existing patterns: `requireRole([...])` for API routes, `requirePageRole([...])` for server pages.
- Do not rename or introduce roles; use existing `Role` enum values defined in the repo.

### 3) Input validation (zod)
- All POST/PATCH endpoints must validate payloads with zod.
- PATCH must reject empty updates (no fields provided).
- Validation failures return 400 with the standard error shape (below).

### 4) Transactions for multi-write operations
- If a request writes to 2+ tables, wrap writes in `prisma.$transaction`.
- Keep transactions small and deterministic (do not run long computations inside transactions).

### 5) i18n-first UI
- No hardcoded user-facing strings.
- Add/update translation keys in **both** locales in the same step:
  - `messages/en.json`
  - `messages/zh-CN.json`
- Prefer consistent key namespaces:
  - `admin.<module>.*`
  - `common.*`

### 6) Seed strategy
- Seeds must be idempotent: use upserts or deterministic unique keys.
- Never hardcode secrets (passwords/tokens); read from environment variables.
- Seeds should create a stable demo tenant + minimal demo data used by QA.

### 7) Reusable components/utilities (bounded)
- Prefer reuse to reduce per-file code length and improve consistency.
- Limit to **1-2 new primitives per step**.
- Avoid building a generic "CRUD framework".

### 8) Contract stability
- Preserve existing API response shapes and UI props contracts unless explicitly approved.

### 9) Frontend style policy (Admin vs Portal)
- **Admin console (MVP):** prioritize operational clarity and speed. Keep UI **utilitarian + dense** (tables/forms), reuse existing Tailwind/shadcn patterns, keep motion minimal, and avoid introducing new font systems or heavy visual effects unless explicitly requested by PO/Designer.
- **Parent portal (Phase 2) / polish tasks:** this is where `skills/SKILL.md` applies—feel free to be more distinctive with typography, color, layout, and tasteful motion, as long as it remains production-grade and consistent with product trust.

---

## Regression guards (lightweight but standard)

### 1) Standard API error shape
For any endpoint you touch, errors must be consistent:

```json
{
  "error": {
    "code": "ValidationError | Unauthorized | Forbidden | NotFound | Conflict | InternalError",
    "message": "Human-readable message",
    "details": {}
  }
}
```

Rules:
- 400: validation errors (include details)
- 401: unauthenticated
- 403: authenticated but forbidden
- 404: not found (avoid leaking cross-tenant existence if needed)
- 409: conflict (e.g., duplicates)
- 500: internal (log server-side with context)

### 2) Logging (minimal)
Log server-side errors (500) with context:
- tenantId, userId (if available), route name, stack trace

Never log secrets (passwords, tokens).

### 3) Verification gates (every step)
Every step must include:
- pnpm lint (must be runnable and pass)
- A short manual verification checklist (what success looks like)

### 4) When to add tests (policy)
Simple CRUD (Centers/Programs/Levels):
- No new tests unless the step changes shared tenant/RBAC helpers.

Medium complexity (Users + assignments):
- Add/update at least one Playwright smoke test if tenant/RBAC logic was modified.

High complexity (Recurring session generator, attendance workflows, reporting):
- Add tests as part of the slice:
  - core logic unit test (generator)
  - 1 e2e smoke test
  - regressions as needed

---

## Definition of Done (must pass for every step)
- [ ] Tenant-safe queries/mutations for touched areas
- [ ] Server-side RBAC enforced for touched routes/pages
- [ ] Zod validation for touched POST/PATCH (PATCH rejects empty updates)
- [ ] Transaction used if multiple writes occur
- [ ] i18n keys only; en + zh-CN updated
- [ ] Seed remains idempotent if modified; no hardcoded secrets
- [ ] Reuse applied where appropriate (1-2 primitives max), no over-engineering
- [ ] pnpm lint passes
- [ ] Manual verify checklist completed (and minimal test added if policy requires)

---

## Notes on lint/CI (recommended, not mandatory in every step)
Prefer pnpm lint that covers the whole repo (use `eslint .`) so new directories are not skipped.

Add CI later to run pnpm lint + pnpm build + minimal tests on PRs.
