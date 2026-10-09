# IntelliClass on Replit

## Run the project

- Click **Run** to start the `Start application` workflow.
- The workflow runs `bun run dev`: the existing React/TanStack Start app serves on `0.0.0.0:5000`, and the Express API listens on port `3001`.
- Vite proxies `/api/*` and `/healthz` to the local API process. The API docs are available at `/api/v1/docs`.
- Open Replit's Preview to use the application.
- Dependencies are managed with Bun and the existing `bun.lock`. To reinstall them, run `bun install --frozen-lockfile`.

## Backend setup

- The API uses Replit's PostgreSQL `DATABASE_URL` and the existing `SESSION_SECRET`. Do not print or commit either value.
- Run `bun run db:generate` and `bun run db:migrate` to generate the Prisma client and apply development migrations.
- No default account is created. Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in Replit Secrets, run `bun run bootstrap:admin`, then remove those bootstrap secrets.
- Password-reset delivery is unavailable until an email provider is configured.
- Production CORS requires an explicit `FRONTEND_ORIGIN`; use secure cookies and HTTPS for deployed services. Vite's `/api` proxy is development-only.

## Checks

- `bun run test` runs the existing route tests.
- `bunx --bun tsc --noEmit` checks TypeScript.
- `bun run build` creates the production build using the existing Lovable/Nitro configuration.

## Scope

Keep the imported structure and stack. IntelliClass is currently frontend-only: authentication, database persistence, AI services, real-time sessions, and device controls are not connected. No additional secrets or external services are needed to run the current UI.

This repository remains connected to Lovable. Do not rewrite published Git history.
