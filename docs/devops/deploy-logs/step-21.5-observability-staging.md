<!-- Deploy log template for Step 21.5 Observability (staging). -->
# Step 21.5 Observability — Staging Deploy Log

## Release Metadata
- Release name:
- Date:
- Commit SHA:
- Vercel deploy link:

## Env Vars Added/Changed (Names Only)
- `SENTRY_DSN`
- `APP_ENV`
- `SENTRY_AUTH_TOKEN` (optional, source maps)
- `SENTRY_ORG` (optional, source maps)
- `SENTRY_PROJECT` (optional, source maps)
- `SENTRY_TRACES_SAMPLE_RATE` (optional)

## System Env Vars Exposed
- [ ] Yes
- [ ] No

## Verification Checklist
- [ ] Test error captured in Sentry
- [ ] Environment tag is `staging`
- [ ] Release tag matches deploy SHA
- [ ] PII/secret spot-check passed
- [ ] QA `pnpm e2e:full` passed

## Rollback Notes
- Trigger:
- Action taken:
- Result:
