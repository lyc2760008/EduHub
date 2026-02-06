<!-- Purpose: staging go-live gate report template for Step 21.0C QA. -->
# Step 21.0 — Go-Live Gate Report (Template)

**Environment:** {{staging|production}}
**Date/Time (UTC):** {{YYYY-MM-DD HH:MM}}
**Commit SHA:** {{commit}}
**Staging URL:** {{https://staging.example.com}}
**Operator:** {{name}}

## 1) Deployment Sanity
**Result:** {{Pass|Fail}}
**Notes:**
- Refer to `docs/ops/deployment.md` for staging/prod deployment steps.
- {{notes}}
**Evidence:**
- {{links to logs/screenshots}}

## 2) DB Migration + Rollback Drill
**Result:** {{Pass|Fail}}
**Notes:**
- Refer to `docs/ops/db-runbook.md` for migration/rollback procedure.
- {{notes}}
**Evidence:**
- {{backup proof / migration output}}

## 3) Tenant Provisioning Drill
**Result:** {{Pass|Fail}}
**Notes:**
- Refer to `docs/ops/tenant-provisioning.md` for provisioning steps.
- {{notes}}
**Evidence:**
- {{tenant slug, admin email, screenshots}}

## 4) Security & Audit Sanity
**Result:** {{Pass|Fail}}
**Notes:**
- Admin audit log loads, filters respond, and no secrets are exposed.
- Parent cannot access admin routes.
- {{notes}}
**Evidence:**
- {{screenshots / logs}}

## 5) Regression Smoke (Playwright)
**Result:** {{Pass|Fail}}
**Notes:**
- Step 20.9 golden paths
- Step 21.0 go-live smoke pack
- {{notes}}
**Evidence:**
- {{link to Playwright report}}

## Commands Used

**Staging base URL**
```bash
export E2E_BASE_URL="https://staging.example.com"
export E2E_SKIP_SEED=1
```

**Step 20.9 golden paths (staging)**
```bash
pnpm e2e:golden:staging
```

**Step 21.0 go-live smoke pack (staging)**
```bash
pnpm e2e:golive:staging
```

**Optional prod-safe smoke (production)**
```bash
export E2E_BASE_URL="https://prod.example.com"
export E2E_SKIP_SEED=1
pnpm e2e:golive:prod-safe
```

## Playwright Results Summary
- **Total:** {{count}}
- **Passed:** {{count}}
- **Failed:** {{count}}
- **Skipped:** {{count}}
- **HTML report:** {{path or URL}}

## Blockers (P0/P1/P2)

**P0**
- {{issue + repro steps + evidence}}

**P1**
- {{issue + repro steps + evidence}}

**P2**
- {{issue + repro steps + evidence}}

## Production Go-Live Decision
**Decision:** {{GO|NO-GO}}
**Rationale:**
- {{summary of risks and mitigations}}
