# IntelliClass on Replit

## Run the project

- Click **Run** to start the `Start application` workflow.
- The workflow runs `bun run dev`: the existing React/TanStack Start app serves on `0.0.0.0:5000`, and the Express API listens on port `3001`.
- Vite proxies `/api/*` and `/healthz` to the local API process. The API docs are available at `/api/v1/docs`.
- Open Replit's Preview to use the application.
- Dependencies are managed with Bun and the existing `bun.lock`. To reinstall them, run `bun install --frozen-lockfile`.

## Backend setup

- The API uses Replit's PostgreSQL `DATABASE_URL` and the existing `SESSION_SECRET`. Do not print or commit either value.
- Development allows localhost and the exact HTTPS origin derived from `REPLIT_DEV_DOMAIN`. Production allows the exact domains supplied by Replit in `REPLIT_DOMAINS`, the configured `APP_URL`, and explicitly listed origins in `FRONTEND_ORIGIN` or `ALLOWED_ORIGINS`. `ALLOWED_ORIGINS` accepts comma-separated exact origins and, only when intentionally configured, `https://*.replit.app`. That wildcard trusts every Replit published subdomain; prefer exact origins. Same-origin requests forwarded by the trusted loopback proxy are strictly checked against the browser origin, forwarded host, and scheme, including active `.replit.app` hosts.
- Run `bun run db:generate` and `bun run db:migrate` to generate the Prisma client and apply development migrations.
- No default account is created. Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in Replit Secrets, run `bun run bootstrap:admin`, then remove those bootstrap secrets.
- Public signup is invitation-only. Institution administrators can invite students and teachers; only an existing Super Admin can invite a global Admin.
- Password-reset delivery is unavailable until an email provider is configured.
- In production, the API binds to loopback and the TanStack server forwards same-origin `/api/*` requests to it. In development, Vite's `/api` proxy forwards the incoming host and scheme for the same origin check. Use `ALLOWED_ORIGINS` only for intentionally supported additional frontend origins. Production cookies require HTTPS.

## Checks

- `bun run test` runs the existing route tests.
- `bun run typecheck` checks TypeScript.
- `bun run build` creates the production build using the existing Lovable/Nitro configuration.
- `bun run validate:publish` regenerates Prisma, runs type checks and tests, then builds; this is the configured pre-publish check.

## Scope

Keep the imported structure and stack. The project includes a separate Express API backed by PostgreSQL through Prisma. Authentication, institution/user management, classes, subjects, classroom sessions, and attendance endpoints are implemented. The checked-in migrations are applied to the development database. The API requires the Replit-provided `DATABASE_URL` and `SESSION_SECRET`; password-reset email delivery, assignments, grade management, course-material delivery, AI services, live activity, and device controls are not connected. The current API tests use a mocked Prisma client and do not require a separate test database.

This repository remains connected to Lovable. Do not rewrite published Git history.
