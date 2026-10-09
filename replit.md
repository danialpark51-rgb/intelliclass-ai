# IntelliClass on Replit

## Run the project

- Click **Run** to start the `Start application` workflow.
- The workflow runs `bun run dev` and serves the existing React/TanStack Start app on `0.0.0.0:5000`.
- Open Replit's Preview to use the application.
- Dependencies are managed with Bun and the existing `bun.lock`. To reinstall them, run `bun install --frozen-lockfile`.

## Checks

- `bun run test` runs the existing route tests.
- `bunx --bun tsc --noEmit` checks TypeScript.
- `bun run build` creates the production build using the existing Lovable/Nitro configuration.

## Scope

Keep the imported structure and stack. IntelliClass is currently frontend-only: authentication, database persistence, AI services, real-time sessions, and device controls are not connected. No additional secrets or external services are needed to run the current UI.

This repository remains connected to Lovable. Do not rewrite published Git history.
