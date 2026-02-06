# Step 21.1 QA Notes — Parent Onboarding + Invite Flow
<!-- Template-only QA notes for Step 21.1C (no manual results recorded). -->

## Manual Checklist
- [ ] Admin: Student detail ? Parents ? Copy invite message modal renders portal URL + parent email (no access code shown).
- [ ] Admin: Copy invite message shows success feedback and logs audit event (no secrets in metadata).
- [ ] Admin: Reset access code modal still shows code only in modal output.
- [ ] Parent: First login shows welcome card; dismiss hides it and persists after refresh/re-login.
- [ ] Parent: Welcome card links go to Students, Sessions, Attendance, Help (portal routes only).
- [ ] RBAC: Parent cannot access admin onboarding routes or audit log.
- [ ] i18n: EN/zh-CN render for invite template and welcome card; no raw keys.

## Screenshot Placeholders
- [ ] Admin invite modal (EN) — paste screenshot path here
- [ ] Admin invite modal (zh-CN) — paste screenshot path here
- [ ] Parent welcome card (EN) — paste screenshot path here
- [ ] Parent welcome card (zh-CN) — paste screenshot path here
- [ ] Audit log entry for invite copied — paste screenshot path here

## Playwright Coverage Mapping
- `tests/e2e/portal/onboarding/parent-onboarding.spec.ts`:
  - Admin invite copy + audit event + i18n toggle
  - Parent welcome first-login + dismiss persistence + i18n toggle
  - Parent RBAC blocks admin onboarding endpoints/pages

## Test Commands
- Fast run (onboarding only): `pnpm e2e:onboarding`
- Full suite: `pnpm e2e:full`