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
- `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — MSSQL connection
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — must be changed before production
- Access tokens expire in 15 min (`JWT_EXPIRES_IN`); refresh tokens in 7 days (`JWT_REFRESH_EXPIRES_IN`)

The server verifies the DB connection on startup and exits if it can't connect.

## Architecture

**Stack:** Express + MSSQL (`mssql` package). No ORM — all queries are raw parameterized SQL.

**Layer structure** (strict separation):
- `src/routes/` — route definitions + OpenAPI JSDoc annotations + inline `validate()` middleware
- `src/controllers/` — thin HTTP layer: extract params, call service, return `{ success, data }` JSON
- `src/services/` — all business logic and SQL queries; imported `getPool()` for each operation

**Two route files:**
- `src/routes/auth.js` — public auth endpoints (`/api/auth/...`)
- `src/routes/index.js` — all protected business routes (`/api/...`)

**Auth:** JWT Bearer tokens. Three roles with hierarchical access: `admin > manager > viewer`. Middleware guards are exported as arrays: `requireViewer`, `requireManager`, `requireAdmin` — spread into route definitions (e.g. `...requireManager`).

**Inventory is always kept in sync transactionally.** Any service that creates, updates, or deletes a Sale or Purchase must wrap the SQL in a `new sql.Transaction(pool)` and reconcile `Inventory.quantity` in the same transaction. Rollback on failure. See `salesService.js` for the pattern.

**Soft deletes everywhere.** Records are never hard-deleted. Set `deletedAt = GETDATE()` and `deletedBy = @userId`. All queries filter with `WHERE deletedAt IS NULL`.

**Debtors** are computed dynamically: balance = total sales − total payments. Accounts are flagged overdue after 30 days.

**Customer statements** use a stored procedure: `dbo.usp_CustomerStatement`.

## API Docs

Swagger UI is available at `/api-docs` when the server is running. The raw OpenAPI spec is at `/api-docs.json`.

## Key Conventions

- All responses follow `{ success: boolean, data: ... }` or `{ success: false, message: string }`.
- The `validate()` middleware in `src/middleware/index.js` handles request body validation inline in route files.
- Errors thrown from services use `err.statusCode` to control HTTP status; the global `errorHandler` in `src/middleware/index.js` reads this.
- `eggSize` values are constrained to `['small', 'medium', 'large']` — validated at the route layer.
- Role IDs in the database: `1=admin`, `2=manager`, `3=viewer`.
