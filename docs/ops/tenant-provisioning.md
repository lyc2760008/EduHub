<!-- Purpose: guide operators through safe tenant provisioning for pilot go-live. -->
# Tenant Provisioning (Pilot Go-Live)

This runbook uses the provisioning script to create a **new tenant** and **initial Owner user**. It does **not** create a default center or seed catalog data.

## Preconditions
- `DATABASE_URL` is set and reachable.
- Migrations are applied (`pnpm prisma migrate deploy`).
- You have access to create tenants and users.

## Command Examples

**Staging**

```bash
pnpm provision:tenant \
  --tenantSlug pilot-staging \
  --tenantName "Pilot Staging" \
  --ownerEmail owner@pilot-staging.example.com \
  --ownerName "Pilot Owner" \
  --timeZone America/Edmonton \
  --supportEmail support@pilot-staging.example.com \
  --supportPhone "+1 555 123 4567"
```

**Production**

```bash
pnpm provision:tenant \
  --tenantSlug pilot \
  --tenantName "Pilot" \
  --ownerEmail owner@pilot.example.com \
  --ownerName "Pilot Owner" \
  --timeZone America/Edmonton \
  --supportEmail support@pilot.example.com \
  --supportPhone "+1 555 123 4567"
```

**Dry Run**

```bash
pnpm provision:tenant --tenantSlug pilot --tenantName "Pilot" --ownerEmail owner@pilot.example.com --dryRun
```

## Parameters
- `--tenantSlug` (required): lowercase slug used for routing (subdomain or `/t/:slug`).
- `--tenantName` (required): display name for the tenant.
- `--ownerEmail` (required): login email for the initial Owner.
- `--ownerName` (optional): display name for the Owner.
- `--timeZone` (optional): IANA timezone stored on the tenant (used in portal time hints when no center exists).
- `--supportEmail` (optional): support email shown in portal help/account.
- `--supportPhone` (optional): support phone shown in portal help/account.
- `--allowExistingUser` (optional): link an existing user to this tenant via membership.
- `--dryRun` (optional): validates inputs and prints actions without writing.

## Behavior Notes
- **Default**: the script fails if the tenant slug already exists.
- **Default**: the script fails if the owner email already exists.
- Use `--allowExistingUser` only when you intentionally want a single user to belong to multiple tenants (membership table).
- If a new user is created, a **one-time password** is generated and printed once.

## Post-Provision Steps
1. Log in as the Owner using the printed one-time password.
2. Create centers, levels, programs, and groups as needed using the Admin UI.
3. Create a student + parent and link them to verify portal access.
4. Confirm help/account pages display support contact info.

## Troubleshooting
- **Slug already exists**: choose a new slug or delete the existing tenant (if safe).
- **Owner email already exists**:
  - Default: provisioning fails.
  - If intentional multi-tenant user, re-run with `--allowExistingUser`.
- **Support contact missing**: portal will show a generic “contact your center” message.
