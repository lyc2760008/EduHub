# EduHub – Education SaaS for after-school tutoring

## Stack
- Next.js 16 (App Router, `src/` directory, TypeScript)
- React 19
- Tailwind CSS 4
- pnpm

## Scripts
- `pnpm dev` – start the local dev server
- `pnpm build` – create a production build
- `pnpm start` – run the production server (after `pnpm build`)
- `pnpm lint` – run ESLint

## Development
1. Install dependencies: `pnpm install`
2. Start the dev server: `pnpm dev`
3. Open http://localhost:3000 and confirm you see “EduHub – App is running”.

## Tenant resolution (multi-tenant)
- Subdomain (prod): `<tenant>.${TENANT_BASE_DOMAIN}` (e.g., demo.eduhub.com)
- Subdomain (dev): `<tenant>.${TENANT_DEV_BASE_DOMAIN}:3000` (e.g., demo.lvh.me:3000)
- Path fallback: `/t/<tenant>/...`
- Header fallback (deprecated): `x-tenant-id`; header for testing: `x-tenant-slug`
- Env: `TENANT_BASE_DOMAIN=eduhub.com`, `TENANT_DEV_BASE_DOMAIN=lvh.me`
