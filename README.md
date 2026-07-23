# Notification Service

A backend service that acts as a central hub for outbound notifications. It accepts a single request (user, title, body, target channels), checks that user's channel preferences, dispatches through mock Email/SMS/Push/In-App providers, and logs every attempt — success, skip, or failure — to an audit table.

Built as a backend engineering assignment (Indigold), with an emphasis on clean layering, testable business logic, and honest documentation of the trade-offs involved.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Local Setup](#local-setup)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Troubleshooting / Known Local-Dev Quirks](#troubleshooting--known-local-dev-quirks)
- [Class Diagram](#class-diagram)
- [ER Diagram](#er-diagram)

## Features

- **Unified API** — one `POST /api/notifications` endpoint accepts a user id, title, body, and a list of target channels, with request validation up front.
- **Multi-channel dispatch** — four independent mock providers (Email, SMS, Push, In-App) behind a shared interface.
- **Preference enforcement** — every user has a preferences record; a channel the user has opted out of is never dispatched to, even if the request asked for it.
- **Notification history** — every dispatch attempt (sent, skipped, or failed) is written to an audit log and retrievable via `GET /api/notifications/:userId/history`.
- **Realistic failure simulation** — providers fail at random ~10% of the time in normal operation (disabled during automated tests) so the failure-path logging is actually exercised, not just theoretical.

## Architecture

```mermaid
flowchart LR
    Client -->|POST /api/notifications| Router[Express Router]
    Router --> Validate[Zod Validation Middleware]
    Validate --> Controller[Notification Controller]
    Controller --> Service[Notification Service]
    Controller -->|GET /:userId/history| NotifRepo[Notification Repository]
    Service --> UserRepo[User Repository]
    Service --> Registry[Channel Provider Registry]
    Service --> NotifRepo
    Registry --> Email[Email Provider]
    Registry --> SMS[SMS Provider]
    Registry --> Push[Push Provider]
    Registry --> InApp[In-App Provider]
    UserRepo --> DB[(PostgreSQL)]
    NotifRepo --> DB
```

The core rule: **`NotificationService` never talks to Express or Prisma directly.** It receives plain data, applies the preference/routing rules, and delegates I/O to injected repository/provider functions. That's what makes the routing logic fully unit-testable with fakes, no database required — see [`tests/unit/notification.service.test.ts`](tests/unit/notification.service.test.ts).

## Project Structure

```
src/
  config/env.ts                  # env var loading + fail-fast validation
  db/prisma.ts                   # Prisma client singleton (driver adapter wired in)
  middlewares/
    validate.ts                  # generic Zod validation middleware
    error-handler.ts             # centralized error handling
    not-found.ts                 # 404 catch-all
  utils/app-error.ts             # typed application error (statusCode + message)
  channels/
    channel.types.ts             # ChannelProvider interface + shared types
    email.provider.ts
    sms.provider.ts
    push.provider.ts
    in-app.provider.ts
    provider-registry.ts         # Channel -> provider instance lookup
  users/
    user.repository.ts           # user + preferences lookup
  notifications/
    notification.routes.ts
    notification.controller.ts
    notification.service.ts      # the routing/preference "brain"
    notification.schema.ts       # Zod request schema
    notification.repository.ts   # audit log writes + history reads
  app.ts                         # Express app assembly (no listen())
  server.ts                      # entrypoint, calls app.listen()
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/
  unit/                          # no DB — fakes/mocks only
  integration/                   # real Express app + real Postgres
```

## Tech Stack

| Concern | Choice |
|---|---|
| Runtime / Language | Node.js + TypeScript (ESM) |
| HTTP framework | Express 5 |
| ORM / DB | Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`) + PostgreSQL |
| Validation | Zod |
| Security / logging middleware | helmet, cors, morgan |
| Dev tooling | tsx (dev/build-free run), `tsc` (typecheck + production build) |
| Tests | Vitest + Supertest |

## Local Setup

### Prerequisites

- Node.js 20.19+ (developed against Node 22)
- npm

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

You need **two** Postgres connection strings — see why in the [Troubleshooting](#troubleshooting--known-local-dev-quirks) section below:

- `DATABASE_URL` — used by the Prisma CLI (migrate/generate/studio)
- `DIRECT_DATABASE_URL` — used by the running app itself, via `@prisma/adapter-pg`

**Fastest option — local Prisma Postgres (no external install):**

```bash
npx prisma dev
```

This prints both connection strings directly — copy the `DATABASE_URL` (the `prisma+postgres://...` one) and the plain `postgres://...` TCP URL into `.env` as `DATABASE_URL` and `DIRECT_DATABASE_URL` respectively. Leave this command running in its own terminal.

> On some Node versions this needs `NODE_OPTIONS=--experimental-sqlite npx prisma dev` — see Troubleshooting.

**Alternative — any Postgres you already have** (Docker, a native install, etc.): just set both `DATABASE_URL` and `DIRECT_DATABASE_URL` to the same standard `postgres://user:password@host:5432/dbname` connection string. There's no proxy/direct distinction with a real Postgres server.

### 3. Apply the database schema

The migration is already committed, so just apply it:

```bash
npx prisma migrate deploy
npx prisma generate
```

### 4. Seed sample data

```bash
npm run seed
```

This creates three users with deliberately different preferences (one fully opted in, one with SMS opted out, one opted into only in-app) and prints each user's `id` — copy one for the API examples below. Safe to re-run; it upserts by email.

### 5. Run the server

```bash
npm run dev      # tsx watch — auto-restarts on file changes
```

```bash
npm run build && npm start   # production-style: tsc build, then run compiled output
```

The server listens on `http://localhost:3000` by default (`PORT` in `.env` to change it). Check it's up:

```bash
curl http://localhost:3000/health
```

## API Reference

All examples assume `<USER_ID>` is a real id from your seed output (step 4 above).

### `POST /api/notifications`

Dispatches a notification across the requested channels, respecting the user's preferences.

**Successful dispatch:**

```bash
curl -X POST http://localhost:3000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<USER_ID>",
    "title": "Order Shipped",
    "body": "Your order is on its way",
    "channels": ["EMAIL", "SMS", "PUSH", "IN_APP"]
  }'
```

```json
{
  "userId": "<USER_ID>",
  "results": [
    { "channel": "EMAIL", "status": "SUCCESS" },
    { "channel": "SMS", "status": "SUCCESS" },
    { "channel": "PUSH", "status": "SUCCESS" },
    { "channel": "IN_APP", "status": "SUCCESS" }
  ]
}
```

**Opted-out channel** (use the seeded Bob, who has `smsEnabled: false`) — the channel is skipped, not silently dropped:

```json
{
  "userId": "<BOB_USER_ID>",
  "results": [
    { "channel": "EMAIL", "status": "SUCCESS" },
    { "channel": "SMS", "status": "SKIPPED" }
  ]
}
```

**Validation error** (missing required field or an unknown channel value) — `400`:

```bash
curl -X POST http://localhost:3000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{"userId": "<USER_ID>", "channels": ["FAX"]}'
```

```json
{
  "error": "Validation failed",
  "details": [
    { "path": "title", "message": "Invalid input: expected string, received undefined" },
    { "path": "body", "message": "Invalid input: expected string, received undefined" },
    { "path": "channels.0", "message": "Invalid option: expected one of \"EMAIL\"|\"SMS\"|\"PUSH\"|\"IN_APP\"" }
  ]
}
```

**Nonexistent user** — `404`:

```bash
curl -X POST http://localhost:3000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{"userId": "does-not-exist", "title": "Hi", "body": "Test", "channels": ["EMAIL"]}'
```

```json
{ "error": "User not found" }
```

### `GET /api/notifications/:userId/history`

Returns that user's past dispatch attempts, most recent first (capped at 50).

```bash
curl http://localhost:3000/api/notifications/<USER_ID>/history
```

```json
{
  "userId": "<USER_ID>",
  "history": [
    {
      "id": "cmrxg...",
      "channel": "EMAIL",
      "status": "SUCCESS",
      "title": "Order Shipped",
      "body": "Your order is on its way",
      "errorMessage": null,
      "createdAt": "2026-07-23T12:05:34.083Z"
    }
  ]
}
```

### `GET /health`

Basic liveness check — `{ "status": "ok" }`.

## Testing

```bash
npm test          # run once
npm run test:watch
```

Tests are split by what they need:

- **`tests/unit/`** — pure logic, no database. The routing/preference service and the provider registry are tested with injected fakes.
- **`tests/integration/`** — Supertest against the real Express app and the real Postgres database, exercising the full request/response cycle.

DB-touching tests share the local dev database rather than a separate test instance — each test creates and tears down its own fixture user, which gives real isolation without adding another moving part on top of an already-fragile local database (see below). `NODE_ENV=test` is set automatically by the test config, which also turns off the simulated random provider failures so results stay deterministic.

## Troubleshooting / Known Local-Dev Quirks

This project's local database is `prisma dev`'s embedded Prisma Postgres emulator, not a full production-grade Postgres install. It's convenient (zero external services to install) but has a few rough edges worth knowing about up front:

- **`No such built-in module: node:sqlite`** — on some Node versions, `prisma dev` needs the SQLite experimental flag:
  ```bash
  NODE_OPTIONS=--experimental-sqlite npx prisma dev
  ```
- **Two connection strings, not one** — `prisma dev` exposes a `prisma+postgres://...` proxy URL (for the CLI) and a separate plain `postgres://...` TCP URL (for the app's actual driver connection via `@prisma/adapter-pg`). Mixing them up produces a `Connection terminated unexpectedly` error rather than a clear "wrong URL" message.
- **Occasional dropped connections** — under sustained use, this local instance can start failing queries with `Connection terminated unexpectedly`. It's a known issue with the embedded emulator, not the application. Fix: stop and restart it.
  ```bash
  npx prisma dev stop default
  npx prisma dev
  ```
- **`prisma migrate dev` may fail with `P1017`** — this local setup has a reproducible issue with `migrate dev`'s temporary shadow database. Since the migration is already committed, you shouldn't need `migrate dev` for initial setup — use `npx prisma migrate deploy` instead (see [Local Setup](#local-setup)). If you do change `schema.prisma` yourself and need a new migration, and hit this, generate the SQL directly instead:
  ```bash
  npx prisma migrate diff --from-empty --to-schema ./prisma/schema.prisma --script > prisma/migrations/<timestamp>_<name>/migration.sql
  npx prisma migrate deploy
  ```
- **Occasional `FAILED` results while manually testing** — this is intentional, not a bug. Each provider simulates a ~10% random failure rate outside the test environment, so the failure-path logging is actually exercised. It's disabled automatically for `npm test`.

## Class Diagram

```mermaid
classDiagram
    class NotificationController {
        +createNotification(req, res)
        +getNotificationHistory(req, res)
    }
    class NotificationService {
        -getUserWithPreferences
        -getProvider
        -logAttempt
        +dispatch(userId, title, body, channels) DispatchResult
    }
    class ChannelProvider {
        <<interface>>
        +send(notification) DeliveryResult
    }
    class EmailProvider
    class SmsProvider
    class PushProvider
    class InAppProvider
    class ProviderRegistry {
        +getProvider(channel) ChannelProvider
    }
    class UserRepository {
        +getUserWithPreferences(userId) UserWithPreferences
    }
    class NotificationRepository {
        +logAttempt(input) void
        +getHistoryForUser(userId) NotificationLogEntry[]
    }

    NotificationController --> NotificationService
    NotificationController --> UserRepository : existence check for history
    NotificationController --> NotificationRepository : reads history
    NotificationService --> UserRepository
    NotificationService --> ProviderRegistry
    NotificationService --> NotificationRepository : logs every outcome
    ProviderRegistry --> ChannelProvider
    ChannelProvider <|.. EmailProvider
    ChannelProvider <|.. SmsProvider
    ChannelProvider <|.. PushProvider
    ChannelProvider <|.. InAppProvider
```

`ChannelProvider` is the Strategy pattern: four interchangeable implementations behind one interface, selected at runtime by `ProviderRegistry`. Swapping a mock for a real integration (e.g. Twilio for SMS) means implementing the interface and registering it — nothing else in the system changes.

## ER Diagram

```mermaid
erDiagram
    USER ||--o| NOTIFICATION_PREFERENCE : has
    USER ||--o{ NOTIFICATION_LOG : has

    USER {
        string id PK
        string name
        string email UK
        datetime createdAt
        datetime updatedAt
    }
    NOTIFICATION_PREFERENCE {
        string id PK
        string userId FK
        boolean emailEnabled
        boolean smsEnabled
        boolean pushEnabled
        boolean inAppEnabled
        datetime createdAt
        datetime updatedAt
    }
    NOTIFICATION_LOG {
        string id PK
        string userId FK
        string channel
        string status
        string title
        string body
        string errorMessage "nullable"
        datetime createdAt
    }
```

`NotificationPreference` is a 1:1 relation kept as its own table (rather than columns on `User`) so identity and preferences stay separate concerns. `NotificationLog` gets one row per channel per dispatch attempt — including skipped ones — so the audit trail can actually prove preference enforcement is working, not just record successful sends.
