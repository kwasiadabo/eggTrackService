# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

No test runner or linter is configured.

## Environment Setup

Copy `.env.example` to `.env` and configure:
- `PORT` — defaults to `5000`
- `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — MSSQL connection (used by `src/config/prisma.js` to build the `@prisma/adapter-mssql` adapter)
- `DATABASE_URL` — SQL Server connection string, used only by the `prisma` CLI (`db pull`/`generate`) — derive it from the same `DB_*` values
- `DB_ENCRYPT`, `DB_TRUST_CERT` — TLS options (default `false`/`true` for local MSSQL)
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — must be changed before production
- Access tokens expire in 15 min (`JWT_EXPIRES_IN`); refresh tokens in 7 days (`JWT_REFRESH_EXPIRES_IN`)
- `RESEND_API_KEY` — Resend API key for automated reports (raw SMTP to Gmail is blocked/unreliable from Render, so email is sent via Resend's HTTP API)
- `EMAIL_FROM` — sender address, e.g. `"EggTrack Reports <onboarding@resend.dev>"`. The shared `onboarding@resend.dev` sender only delivers to the Resend account's own email — verify a domain at resend.com/domains to email other recipients
- `REPORT_HOUR`, `REPORT_MINUTE` — time for the daily debtors report (default `07:15`, Africa/Accra timezone)

The server verifies the DB connection on startup and exits if it can't connect.

## Architecture

**Stack:** Express + MSSQL via Prisma ORM (`@prisma/client` + `@prisma/adapter-mssql`, which wraps the `mssql` driver). Most queries go through the generated Prisma client; a couple of Inventory operations remain raw SQL via `$executeRaw` (see "Database & Prisma" below).

**Layer structure** (strict separation):
- `src/routes/` — route definitions + OpenAPI JSDoc annotations + inline `validate()` middleware
- `src/controllers/` — thin HTTP layer: extract params, call service, return `{ success, data }` JSON
- `src/services/` — all business logic and queries; call the shared `prisma` client from `src/config/prisma.js` for each operation
- `src/jobs/` — cron jobs (currently only `debtorsMailer.js`)
- `src/config/` — `prisma.js` (Prisma client + `@prisma/adapter-mssql` adapter), `prismaSoftDelete.js` (soft-delete `$extends` query extension), `mailer.js` (Resend HTTP API client, exports `sendMail({ to, subject, html })`), `swagger.js`

**Two route files:**
- `src/routes/auth.js` — public auth endpoints (`/api/auth/...`)
- `src/routes/index.js` — all protected business routes (`/api/...`)

**Auth:** JWT Bearer tokens. Three roles with hierarchical access: `admin > manager > viewer`. Middleware guards are exported as arrays: `requireViewer`, `requireManager`, `requireAdmin` — spread into route definitions (e.g. `...requireManager`).

**Inventory is always kept in sync transactionally.** Any service that creates, updates, or deletes a Sale or Purchase must wrap the writes in `prisma.$transaction(async (tx) => {...})` and reconcile `Inventory.quantity` in the same transaction. The soft-delete query extension (see below) propagates into `tx` automatically. Rollback on failure (thrown errors abort the transaction). See `salesService.js` for the pattern. Inventory increments/decrements use `tx.inventory.updateMany({ where: { eggSize }, data: { quantity: { increment/decrement: n }, updatedAt: new Date() } })` rather than `update()` — `updateMany` silently no-ops if no Inventory row exists for that `eggSize`, matching the original raw-SQL `UPDATE ... WHERE eggSize=@eggSize` behavior (Prisma's `update()` would throw `P2025` instead). `inventoryService.reconcileInventory()` exists as an admin-only escape hatch that recomputes all quantities from scratch.

**Soft deletes everywhere.** Records are never hard-deleted. Set `deletedAt = new Date()` and `deletedBy = @userId`. The `prisma.$extends` query extension in `src/config/prismaSoftDelete.js` auto-injects `deletedAt: null` into `where` for `findMany`/`findFirst`/`count`/`aggregate`/`update` on these 7 models: `sales`, `customers`, `eggsPurchases`, `farms`, `payments`, `expenses`, `reportRecipients` (`users` is excluded — it has no `deletedAt` column; deactivation uses `isActive`). The extension does **not** cover `groupBy`, `$queryRaw`/`$executeRaw`, `findUnique`, `create`, or `delete`/`deleteMany` — services using `groupBy` on a soft-deletable model add `deletedAt: null` to `where` manually. It does propagate into `tx` inside `prisma.$transaction(async (tx) => {...})`.

**Debtors** are computed dynamically: balance = total sales − total payments. Accounts are flagged overdue after 30 days.

**Customer statements** are computed in app code (`customersService.getCustomerStatement()`) via `aggregate`/`findMany` queries, not a stored procedure — `dbo.usp_CustomerStatement` is not called anywhere in this codebase.

**Purchases batch create** (`POST /api/purchases/batch`) lets a manager record multiple egg sizes from one farm in a single transaction. The body takes `{ farmName, purchaseDate, notes, items: [{ eggSize, quantity, costPerTray }] }`. Each item gets its own `EggsPurchases` row and the inventory is updated atomically for all items.

**Farms** are a managed lookup table (`Farms`). `GET /api/farms/active` returns the picker list for the purchase form. The `farmName` field on `EggsPurchases` is still a free-text string — it is not a foreign key.

**Daily debtors email** (`src/jobs/debtorsMailer.js`) runs via `node-cron` at the time set by `REPORT_HOUR`/`REPORT_MINUTE`. The schedule can be changed at runtime without a restart via `PUT /api/email-schedule` (admin only), which writes the new time back to `.env` and calls `rescheduleDebtorsJob()`. Every send attempt (success or failure) is written to the `EmailLogs` table.

**Report recipients** (`ReportRecipients` table) control who receives the daily email. Active recipients (`isActive = 1`) are pulled at send time. Managed via `/api/report-recipients` (viewer: GET; manager: POST/PUT; admin: DELETE).

## Database & Prisma

- `prisma/schema.prisma` is the schema reference, introspected from the dev DB via `npx prisma db pull` and then manually annotated with named relations for the two dual-FK-to-Users tables: `EggsPurchases.initiatedBy`/`approvedBy` (`PurchaseInitiator`/`PurchaseApprover`) and `BankTransactions.initiatedBy`/`approvedBy` (`BankTxInitiator`/`BankTxApprover`).
- The database is the source of truth (introspection-based workflow, not `prisma migrate`). After a schema change in the DB, re-run `npx prisma db pull` and re-apply the named-relation annotations, then `npx prisma generate`.
- **CHECK constraints are not introspected** — e.g. `eggSize` columns (`Inventory`, `Sales`, `EggsPurchases`) are restricted at the DB level to `'small'/'medium'/'large'`, but `schema.prisma` shows them as plain `NVarChar`. A violation surfaces as Prisma error `P2003` (mismapped from the underlying SQL Server CHECK constraint, not an actual foreign key).
- Two operations remain raw SQL via `$executeRaw` (both inside `prisma.$transaction` where applicable, parameterized via tagged templates — no injection risk):
  - `purchasesService.applyInventory()` — `MERGE Inventory WITH (HOLDLOCK) ...` upsert, used by `approvePurchase()`. The `HOLDLOCK` prevents two concurrent approvals for a brand-new `eggSize` from both inserting.
  - `inventoryService.reconcileInventory()` — single correlated-subquery `UPDATE` recomputing every `Inventory.quantity` from `SUM(EggsPurchases.quantity) - SUM(Sales.quantity)`. Pre-existing quirk preserved: this does **not** filter `EggsPurchases` by `status='approved'` (counts pending/rejected purchases too).
  - Both write `updatedAt = GETUTCDATE()` (true UTC), per the timezone policy below.
- `bankService.getAccountBalance(bankAccountId)` — shared helper (`groupBy` deposits/withdrawals for `status='approved'`) used by both `listAccounts()` and `createWithdrawal()`'s insufficient-balance guard.

## API Docs

Swagger UI is available at `/api-docs` when the server is running. The raw OpenAPI spec is at `/api-docs.json`.

## Route Summary

| Prefix | Min role | Notes |
|---|---|---|
| `GET /api/dashboard` | viewer | Aggregated stats |
| `GET /api/inventory` | viewer | Current stock levels |
| `POST /api/inventory/reconcile` | admin | Recomputes from purchases/sales |
| `GET/POST /api/purchases` | viewer / manager | |
| `POST /api/purchases/batch` | manager | Multi-size from one farm |
| `GET/PUT/DELETE /api/purchases/:id` | viewer / manager / admin | |
| `GET/POST /api/sales` | viewer / manager | |
| `GET /api/sales/:id/invoice` | viewer | PDF-style invoice |
| `GET/POST/PUT/DELETE /api/customers` | viewer / manager / admin | |
| `GET/POST/PUT/DELETE /api/payments` | viewer / manager / admin | |
| `GET /api/debtors` | viewer | Dynamic balance computation |
| `GET /api/customers/:id/statement` | viewer | Computed in app code (aggregate + findMany) |
| `GET/POST/PUT/DELETE /api/expenses` | viewer / manager / admin | |
| `GET /api/expenses/summary` | viewer | Grouped by category |
| `GET /api/farms/active` | viewer | Picker list |
| `GET/POST/PUT/DELETE /api/farms` | admin | Full farm management |
| `GET/POST/PUT/DELETE /api/report-recipients` | viewer / manager / admin | |
| `GET /api/email-logs` | viewer | Cron job audit log |
| `GET/PUT /api/email-schedule` | admin | Live reschedule without restart |

## Key Conventions

- All responses follow `{ success: boolean, data: ... }` or `{ success: false, message: string }`.
- The `validate()` middleware in `src/middleware/index.js` handles request body validation inline in route files.
- Errors thrown from services use `err.statusCode` to control HTTP status; the global `errorHandler` in `src/middleware/index.js` reads this.
- `eggSize` values are constrained to `['small', 'medium', 'large']` — validated at the route layer.
- Role IDs in the database: `1=admin`, `2=manager`, `3=viewer`.
- Currency is GHS (Ghanaian Cedi). Amounts are stored as `DECIMAL(10,2)`.

## Known Data Quirk: `createdAt`/`updatedAt`/timestamp drift

The DB host's SQL Server `GETDATE()` returns a value ~7 hours behind `GETUTCDATE()` (true UTC).
Historical rows (created via the original raw-SQL code, which used `GETDATE()`-based column
defaults and explicit `GETDATE()` updates for `lastLoginAt`/`revokedAt`/`deletedAt`/etc.) have
`createdAt`/`updatedAt`/`lastLoginAt`/etc. stored as "server-local time labeled as UTC" — i.e.
~7h behind their real creation instant. As of the Prisma migration, new/updated rows use
true UTC (via Prisma's `now()` default and `new Date()` in service code), which is correct
for this app's Africa/Accra (UTC+0) timezone. This means historical timestamps will appear
~7h earlier than equivalent new ones for the same wall-clock moment. This is a pre-existing
bug being fixed going forward, not a regression — no backfill of historical data has been
performed.
