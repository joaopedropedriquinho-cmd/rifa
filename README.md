# Plataforma de posições

Responsive React/Vite interface and Express API for selecting 100 numbered positions and making temporary reservations. This project is a technical starting point, not a payment, lottery, raffle, or legal-compliance service.

## Current architecture

- `client/`: React 19 and Vite; position availability and account data come from `/api`.
- `server/`: Express 5 API, Prisma ORM, PostgreSQL persistence, PostgreSQL-backed sessions, and bcrypt password hashes.
- `server/prisma/schema.prisma`: users, positions, operations, payments/webhook records for future approved integrations, and audit logs.
- `server/prisma/seed.js`: initializes exactly 100 position rows without resetting existing data.

## Local setup (Windows / PowerShell)

1. Install Node.js 24.3+ and PostgreSQL separately; create an empty database and least-privilege application user.
2. Copy `server\.env.example` to `server\.env`. Set `DATABASE_URL`, `APP_ORIGIN`, and a unique random `SESSION_SECRET` of at least 32 characters. Do not commit `.env`.
3. Install the server packages and prepare the database:

   ```powershell
   Set-Location D:\rifa\server
   npm install --cache D:\Caches\npm
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

4. In another terminal, install and run the client:

   ```powershell
   Set-Location D:\rifa\client
   npm install --cache D:\Caches\npm
   npm run dev
   ```

5. Open the local URL printed by Vite. The development proxy sends `/api` requests to `http://127.0.0.1:3000`.

The same-origin proxy is intentional: in production, serve the client and API behind one HTTPS origin or configure a deliberate reverse proxy. The API rejects state-changing requests from other origins.

## Environment

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Use `production` for deployment. |
| `PORT` | API listen port (default `3000`). |
| `DATABASE_URL` | PostgreSQL connection string. |
| `SESSION_SECRET` | Session signing secret; at least 32 characters. |
| `APP_ORIGIN` | Exact browser origin allowed to make changes. |
| `RESERVATION_TTL_MINUTES` | Server-side expiry, from 1 to 1440 minutes (default 15). |

## Build, tests, and production

```powershell
Set-Location D:\rifa\server
npm test
npm run db:generate
npm run db:migrate
npm start

Set-Location D:\rifa\client
npm test
npm run lint
npm run build
```

Run database migrations as a deployment step, then run `npm start` for the API and serve the generated `client\dist` directory through an HTTPS reverse proxy. `/api/health` checks database connectivity. Configure backups, log retention, a restrictive database role, trusted proxy headers, and TLS at the host.

## Safety and incomplete production work

- Reservations are persisted and use serializable database transactions. Expired reservations are released by server-side API cleanup; they are not trusted to browser timers.
- Registration and login are implemented, but email verification, account recovery, user self-service profile editing, and admin authorization/workflows are not yet implemented.
- Payment, Pix, webhooks, reconciliation, refunds, CSV exports, and financial reporting are deliberately not active. Schema placeholders are not a payment integration. No provider API, credentials, approval, legal review, or commercial terms were supplied.
- No paid chance, drawing, prize allocation, or manual payment confirmation is implemented.
- The responsible operator must supply real terms, privacy/cancellation policies, contact details, and the lawful purpose before launch. The example contact address is intentionally non-operational.
- Review session duration, retention, backup/restore, monitoring, and operational policies before production. Never use the example credentials or commit a real `.env`.
