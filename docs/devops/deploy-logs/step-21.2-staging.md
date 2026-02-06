<!-- Purpose: deployment log template for Step 21.2 staging (no secrets). -->
# Deploy Log: Step 21.2 Staging

## Metadata
- Timestamp (local): <YYYY-MM-DD HH:MM>
- Timestamp (UTC): <YYYY-MM-DD HH:MM>
- Operator: <name>
- Git commit: <hash>

## Targets
- Vercel project: eduhub-staging
- Vercel deployment URL: <url>
- Neon project: eduhub-staging
- Neon branch (if applicable): <branch>

## Commands Run (PowerShell)
```powershell
pnpm devops:preflight

$env:DIRECT_URL = "<NEON_DIRECT_URL>"
pnpm devops:migrate:deploy

$env:DIRECT_URL = "<NEON_DIRECT_URL>"
pnpm devops:provision:tenant -- --tenantSlug <slug> --tenantName "<name>" --ownerEmail <masked-email>
```

## Migration Results
- Prisma migrate deploy: <success/failure + summary>
- Prisma migrate status: <summary>

## Pilot Tenant Provisioning
- Tenant slug: <slug>
- Tenant name: <name>
- Owner email (masked): <o***@example.com>
- One-time password printed: <yes/no> (do not record the password)
- Notes: <any follow-up actions>
