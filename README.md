# IntelliClass AI

Build a professional SaaS web application called IntelliClass.

IntelliClass is an AI-powered smart classroom management platform for educational institutions. It helps authorized teachers manage classroom sessions, attendance, application restrictions, student activity, alerts, AI-generated classroom reports, and faculty allocation.

IMPORTANT:

- This is intended to become a real commercial product, not a college demo.
- Build clean, production-quality UI.
- Do NOT create fake backend functionality yet.
- Do NOT invent features outside the requested scope.
- Do NOT remove features later unless explicitly instructed.
- Use realistic empty states and placeholder data only where necessary.
- Make the application responsive for desktop, tablet, and mobile.

Brand

Name: IntelliClass

Style:

- Modern premium education/SaaS product
- Clean, professional, trustworthy
- Minimal but not boring
- Strong visual hierarchy
- Smooth subtle animations
- Accessible typography
- Professional dashboard cards and tables
- Avoid excessive gradients, glassmorphism, or flashy effects

Initial pages

Create these pages and navigation:

PUBLIC:

1. Landing Page
2. Login
3. Forgot Password

ADMIN:
4. Admin Dashboard
5. Students
6. Teachers
7. Classes
8. Subjects
9. Faculty Allocation
10. Analytics
11. Reports
12. Settings

TEACHER:
13. Teacher Dashboard
14. My Classes
15. Start Class
16. Attendance
17. Classroom Control
18. Live Activity
19. Alerts
20. AI Reports
21. My Schedule
22. Profile

STUDENT:
23. Student Dashboard
24. My Classes
25. Current Session
26. Permissions
27. Activity
28. Notifications
29. Profile

Navigation

Create role-based navigation for Admin, Teacher and Student.

Use a professional left sidebar on desktop and a suitable mobile navigation pattern.

Create reusable components for:

- Sidebar
- Top navigation
- User profile menu
- Notifications
- Cards
- Tables
- Status badges
- Modal/dialog
- Buttons
- Forms
- Empty states
- Loading states

Important

For now, concentrate on:

1. Information architecture
2. Navigation
3. Page layouts
4. Visual design
5. Reusable components
6. Responsive behavior

Do NOT implement actual app blocking, Android device control, authentication backend, database, AI API, or real-time functionality yet.

We will connect the backend separately later.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/04181a9b-db59-4ab0-a895-0332cb39c39e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

This repository now includes a separate Express API while keeping the existing
Lovable/TanStack frontend in place. The API uses PostgreSQL through Prisma.

### Run on Replit

1. Keep `DATABASE_URL` in Replit's database-provided environment and `SESSION_SECRET`
   in Replit Secrets. `SESSION_SECRET` must contain at least 32 characters.
2. Install dependencies and generate the Prisma client:

   ```sh
   bun install --frozen-lockfile
   bun run db:generate
   ```

3. Apply the initial migration to the development database:

   ```sh
   bun run db:migrate
   ```

4. Click **Run**. `bun run dev` starts the existing web app on port 5000 and the API
   on port 3001. The Vite development server proxies `/api/*` and `/healthz` to the API.
5. Open `/api/v1/docs` for Swagger UI or `/api/v1/openapi.json` for the API document.

### Initial Super Admin

There is no public registration or default account. Add `SUPER_ADMIN_EMAIL` and a
unique, strong `SUPER_ADMIN_PASSWORD` (12–72 UTF-8 bytes) to Replit Secrets, then run:

```sh
bun run bootstrap:admin
```

The command refuses to promote or overwrite an existing account. Remove both
bootstrap secrets after the account is created.

### API coverage in this milestone

- Institution creation and listing; teacher/student provisioning and directory reads
- Classes, teacher/subject assignments, and student enrollment
- Subject directories
- Scheduled classroom sessions with guarded start/end transitions
- Attendance reads and transactional upserts for enrolled students
- Password-hashed login, short-lived JWT access tokens, rotating HttpOnly refresh
  sessions, logout, account lookup, and single-use password-reset-token handling
- Role checks, tenant-scoped record access, rate limits, request validation, audit
  entries, paginated list endpoints, health checks, and OpenAPI documentation

Password-reset requests return `503 EMAIL_DELIVERY_NOT_CONFIGURED` until an email
provider is connected. They do not create, expose, or log reset tokens. No student
events or device enforcement are fabricated.

### Production deployment notes

The existing frontend and Express API remain separate services. Deploy the API with
`bun run api:start` on its configured port and provide `DATABASE_URL`,
`SESSION_SECRET`, `FRONTEND_ORIGIN`, and secure cookie settings through the deployment
environment. Use a public HTTPS API origin and set the frontend's API base URL to that
origin; the Vite proxy is development-only. Set `COOKIE_SAME_SITE=none` and
`COOKIE_SECURE=true` when the frontend and API are cross-site. Apply the checked-in
Prisma migrations through the development database's migration workflow; do not run
schema changes against production from app startup or deploy hooks.

### Useful commands

```sh
bun run api:start       # Run only the Express API
bun run db:generate     # Regenerate the Prisma client
bun run db:migrate      # Create/apply a development migration
bun run test            # Run frontend and API tests
bun run build           # Build the existing frontend
```
