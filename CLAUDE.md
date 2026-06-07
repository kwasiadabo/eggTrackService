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
- `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — MSSQL connection
- `DB_ENCRYPT`, `DB_TRUST_CERT` — TLS options (default `false`/`true` for local MSSQL)
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — must be changed before production
- Access tokens expire in 15 min (`JWT_EXPIRES_IN`); refresh tokens in 7 days (`JWT_REFRESH_EXPIRES_IN`)
- `EMAIL_USER`, `EMAIL_PASS` — Gmail address + App Password for automated reports
- `REPORT_HOUR`, `REPORT_MINUTE` — time for the daily debtors report (default `07:15`, Africa/Accra timezone)

The server verifies the DB connection on startup and exits if it can't connect.

## Architecture

**Stack:** Express + MSSQL (`mssql` package). No ORM — all queries are raw parameterized SQL.

**Layer structure** (strict separation):
- `src/routes/` — route definitions + OpenAPI JSDoc annotations + inline `validate()` middleware
- `src/controllers/` — thin HTTP layer: extract params, call service, return `{ success, data }` JSON
- `src/services/` — all business logic and SQL queries; call `getPool()` for each operation
- `src/jobs/` — cron jobs (currently only `debtorsMailer.js`)
- `src/config/` — `database.js`, `mailer.js` (nodemailer transporter), `swagger.js`

**Two route files:**
- `src/routes/auth.js` — public auth endpoints (`/api/auth/...`)
- `src/routes/index.js` — all protected business routes (`/api/...`)

**Auth:** JWT Bearer tokens. Three roles with hierarchical access: `admin > manager > viewer`. Middleware guards are exported as arrays: `requireViewer`, `requireManager`, `requireAdmin` — spread into route definitions (e.g. `...requireManager`).

**Inventory is always kept in sync transactionally.** Any service that creates, updates, or deletes a Sale or Purchase must wrap the SQL in a `new sql.Transaction(pool)` and reconcile `Inventory.quantity` in the same transaction. Rollback on failure. See `salesService.js` for the pattern. `inventoryService.reconcileInventory()` exists as an admin-only escape hatch that recomputes all quantities from scratch.

**Soft deletes everywhere.** Records are never hard-deleted. Set `deletedAt = GETDATE()` and `deletedBy = @userId`. All queries filter with `WHERE deletedAt IS NULL`.

**Debtors** are computed dynamically: balance = total sales − total payments. Accounts are flagged overdue after 30 days.

**Customer statements** use a stored procedure: `dbo.usp_CustomerStatement`.

**Purchases batch create** (`POST /api/purchases/batch`) lets a manager record multiple egg sizes from one farm in a single transaction. The body takes `{ farmName, purchaseDate, notes, items: [{ eggSize, quantity, costPerTray }] }`. Each item gets its own `EggsPurchases` row and the inventory is updated atomically for all items.

**Farms** are a managed lookup table (`Farms`). `GET /api/farms/active` returns the picker list for the purchase form. The `farmName` field on `EggsPurchases` is still a free-text string — it is not a foreign key.

**Daily debtors email** (`src/jobs/debtorsMailer.js`) runs via `node-cron` at the time set by `REPORT_HOUR`/`REPORT_MINUTE`. The schedule can be changed at runtime without a restart via `PUT /api/email-schedule` (admin only), which writes the new time back to `.env` and calls `rescheduleDebtorsJob()`. Every send attempt (success or failure) is written to the `EmailLogs` table.

**Report recipients** (`ReportRecipients` table) control who receives the daily email. Active recipients (`isActive = 1`) are pulled at send time. Managed via `/api/report-recipients` (viewer: GET; manager: POST/PUT; admin: DELETE).

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
| `GET /api/customers/:id/statement` | viewer | Uses `dbo.usp_CustomerStatement` |
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
