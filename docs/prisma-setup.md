# Prisma setup and sanity checks

These commands assume you are in `edu-saas/` and have `pnpm` installed. Do not commit secrets.

## Typical commands

- Install tools (if needed):
  - `pnpm add -D prisma dotenv`
  - `pnpm add @prisma/client @prisma/adapter-pg pg`
- Initialize (already done here): `pnpm dlx prisma init --datasource-provider postgresql`

## Env

```
# .env (example – do NOT hardcode secrets)
DATABASE_URL="postgres://<REDACTED>@db.prisma.io:5432/postgres?sslmode=require"
# In this project the real value is already set and working (Tenant table visible in Studio).
```

## Migration & generate

- `pnpm dlx prisma migrate dev --name init_tenant` (applies migrations; creates DB schema)
- `pnpm dlx prisma generate` (regenerates client into `src/generated/prisma`)

## Quick sanity checks

1. `pnpm dlx prisma generate`
2. `pnpm dlx prisma studio` and confirm `Tenant` table/rows.
3. In a temporary server function:

```ts
import { prisma } from "@/lib/db/prisma";

async function testTenantQuery() {
  const tenants = await prisma.tenant.findMany();
  console.log(tenants);
}
```

Use this pattern later in API routes or server components; remove temporary code after testing.
