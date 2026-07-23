# Notification Service

A backend service that acts as a central hub for outbound notifications. It accepts a single request (user, title, body, target channels), checks that user's channel preferences, dispatches through mock Email/SMS/Push/In-App providers, and logs every attempt — success, skip, or failure — to an audit table.

Built as a backend engineering assignment (Indigold), with an emphasis on clean layering, testable business logic, and honest documentation of the trade-offs involved.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Class Diagram](#class-diagram)
- [ER Diagram](#er-diagram)
- [Scalability & Reliability](#scalability--reliability)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Local Setup](#local-setup)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Troubleshooting / Known Local-Dev Quirks](#troubleshooting--known-local-dev-quirks)

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
    class NotificationQueue {
        +enqueueNotification(data) jobId
    }
    class NotificationWorker {
        +createJobProcessor(service) JobProcessor
    }

    NotificationController --> NotificationService
    NotificationController --> UserRepository : existence check (404 fast-fail)
    NotificationController --> NotificationRepository : reads history
    NotificationController --> NotificationQueue : enqueues, or falls back to direct dispatch
    NotificationWorker --> NotificationService : same dispatch() the sync path uses
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

`NotificationController` and `NotificationWorker` both drive `NotificationService.dispatch()` — the exact same method, whether it's called synchronously on the request path or asynchronously from a queued job. Only the caller differs; the routing/preference/logging logic has no idea which one invoked it. See [Scalability & Reliability](#scalability--reliability) for why both paths exist.

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

## Scalability & Reliability

`POST /api/notifications` doesn't dispatch synchronously by default — it hands the work to a queue (BullMQ, backed by Redis) and a separate worker process picks it up:

```mermaid
flowchart LR
    Client -->|POST| API[API — validates, checks user, enqueues]
    API -->|202 queued| Client
    API -->|job| Redis[(Redis / BullMQ queue)]
    Redis --> Worker1[Worker]
    Redis --> Worker2[Worker N...]
    Worker1 --> Dispatch[NotificationService.dispatch<br/>same code the sync path uses]
    Worker2 --> Dispatch
    Dispatch --> DB[(PostgreSQL — history)]
```

**Why:** the four channel providers are the slowest, least reliable part of this system by design (each simulates real-world latency and a ~10% failure rate). Making the caller wait for all of them, synchronously, on the request path means one slow/failing channel directly hurts the API's response time — and a burst of requests turns into a burst of concurrent outbound calls with no ceiling. Queueing decouples "acknowledge the request" from "do the slow, unreliable part":

- **Faster, more predictable API responses** — `202` comes back as soon as the job is queued, regardless of channel latency.
- **Automatic retries** — each job gets 3 attempts with exponential backoff, so a transient provider failure (the kind Phase 9 already simulates) gets a real second chance instead of being logged as failed and forgotten.
- **Backpressure instead of overload** — a burst of requests queues up and drains at a sustainable rate instead of spawning unbounded concurrent work.
- **Independent horizontal scaling** — `docker-compose.yml`'s `worker` service can be scaled (`docker compose up --scale worker=3`) without touching the API at all, since the queue is the only thing they share.

**Graceful degradation, not a hard dependency:** if `REDIS_URL` isn't set, or Redis is unreachable when a request comes in, the API doesn't error out — it falls back to dispatching synchronously in-process, the exact same way this endpoint worked before the queue existed (see the two response shapes in the [API Reference](#post-apinotifications) below). The producer connection intentionally does **not** keep retrying a dead Redis (see `src/queue/queue-connection.ts`) — that's a deliberate choice to fail fast so one HTTP request never hangs waiting on a Redis reconnect; the trade-off is that if Redis comes back later, that specific running `app` process stays on the synchronous path until it restarts, rather than silently switching back mid-flight. The worker process, by contrast, is configured to keep retrying its Redis connection indefinitely — its whole job is to sit and wait, so giving up isn't the right default there.

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
  queue/
    notification.queue.ts        # job data shape + injectable enqueue function
    queue-connection.ts          # real BullMQ/Redis wiring (used by the API)
    notification.worker.ts       # worker process entrypoint + job processor
  app.ts                         # Express app assembly (no listen())
  server.ts                      # entrypoint, calls app.listen()
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/
  unit/                          # no DB — fakes/mocks only
  integration/                   # real Express app + real Postgres
Dockerfile                       # multi-stage build (deps -> build -> slim runtime)
docker-compose.yml               # app + postgres, one-command local setup
docker-entrypoint.sh             # runs migrate deploy + seed before starting the server
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
| Containerization | Docker + Docker Compose (app + Postgres + Redis + worker, one-command local setup) |
| Async dispatch | BullMQ + Redis (queue + worker), with graceful synchronous fallback |

## Local Setup

### Option A — Docker Compose (recommended)

One command gets you the whole stack — API, database, Redis, and the background worker — no Node, Postgres, Redis, or Prisma CLI needed on your host.

**Prerequisite:** Docker Desktop (or another Docker Compose-compatible engine).

```bash
docker compose up --build
```

This starts four containers: `postgres`, `redis`, `app` (waits for both to be healthy, then applies the committed migration and seeds sample data automatically before the server starts), and `worker` (consumes queued notification jobs in the background). The API is live at `http://localhost:3000`:

```bash
curl http://localhost:3000/health
```

The seeded users' ids are printed in the `app` container's logs (`docker compose logs app`) — copy one for the API examples below. Stop everything with `docker compose down` (add `-v` to also drop the Postgres/Redis volumes and start fresh next time). Scale the worker independently of the API if you want to see that in action: `docker compose up --scale worker=3 -d`.

### Option B — Run natively on the host

Useful for active development (hot reload via `tsx watch`). You still need a Postgres instance — the simplest way is to start just the `postgres` service from Docker Compose and run the app on the host against it (add `redis` too, and uncomment `REDIS_URL` in `.env`, if you also want to exercise the async queue path natively — otherwise notifications just dispatch synchronously, which is perfectly fine for local development):

```bash
docker compose up -d postgres
```

#### 1. Install dependencies

```bash
npm install
```

#### 2. Configure environment variables

```bash
cp .env.example .env
```

The default `.env.example` value already points at the Docker Compose `postgres` service's exposed port (`localhost:5432`, matching credentials), so no editing is needed if you used the command above. If you're pointing at a different Postgres instance, just set `DATABASE_URL` to its standard `postgres://user:password@host:5432/dbname` connection string — one URL is all that's needed.

#### 3. Apply the database schema

The migration is already committed, so just apply it:

```bash
npx prisma migrate deploy
npx prisma generate
```

#### 4. Seed sample data

```bash
npm run seed
```

This creates three users with deliberately different preferences (one fully opted in, one with SMS opted out, one opted into only in-app) and prints each user's `id` — copy one for the API examples below. Safe to re-run; it upserts by email.

#### 5. Run the server

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

If you enabled `REDIS_URL`, also run the worker in a separate terminal so queued jobs actually get processed:

```bash
npm run worker
```

### Prerequisites (Option B only)

- Node.js 20.19+ (developed against Node 22)
- npm

## API Reference

All examples assume `<USER_ID>` is a real id from your seed output (step 4 above). Every example below is a plain `curl` command — each one can also be pasted directly into Postman's "raw" request body / URL fields as-is, so no separate Postman collection is needed to use either tool.

### `POST /api/notifications`

Dispatches a notification across the requested channels, respecting the user's preferences. The user is checked synchronously (a bad id still fails fast with `404`), but the actual dispatch work happens one of two ways — see [Scalability & Reliability](#scalability--reliability):

- **Redis is reachable** (the default when running via `docker compose up`) — the request is handed to a background queue and the API responds immediately:

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
    "status": "queued",
    "jobId": "42"
  }
  ```

  The actual per-channel outcome shows up shortly after in `GET /:userId/history` (usually within milliseconds — a worker is typically already idle and waiting).

- **No Redis configured, or Redis is unreachable** — the exact same request dispatches synchronously instead, and the response carries the per-channel results directly (this is also what you'll see if you run the app natively without ever starting Redis):

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

**Opted-out channel** (use the seeded Bob, who has `smsEnabled: false`) — the channel is skipped, not silently dropped. Shown here in the synchronous response shape; the queued path skips it the same way, just visible in the history endpoint instead of the immediate response:

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

- **`tests/unit/`** — pure logic, no database, no Redis. The routing/preference service, the provider registry, and the queue producer/worker are all tested with injected fakes.
- **`tests/integration/`** — Supertest (and, for the queue, real BullMQ) against the real Express app, the real Postgres database, and — for one dedicated file — a real Redis.

DB-touching tests share one Postgres instance rather than a separate test database — each test creates and tears down its own fixture user, which gives real isolation without adding another moving part. `NODE_ENV=test` is set automatically by the test config, which also turns off the simulated random provider failures so results stay deterministic.

`tests/integration/notification-queue.test.ts` is the one file that needs Redis — it checks connectivity up front and **skips itself (not fails)** if Redis isn't reachable, so a plain `npm test` with no Redis running still passes cleanly (every other test exercises the synchronous fallback path instead, which is the same code path that runs whenever Redis is unavailable in production, too). Start Redis first to actually exercise it:

```bash
docker compose up -d redis
npm test
```

## Troubleshooting / Known Local-Dev Quirks

- **Occasional `FAILED` results while manually testing** — this is intentional, not a bug. Each provider simulates a ~10% random failure rate outside the test environment, so the failure-path logging is actually exercised. It's disabled automatically for `npm test`.
- **Port already in use (`3000` or `5432`)** — something else on your machine is bound to that port. Stop it, or override: `PORT=3001` in `.env` for the app, or change the left-hand side of the `ports:` mapping in `docker-compose.yml` for Postgres.

### Why this project moved off `npx prisma dev`

Earlier iterations of local setup used `npx prisma dev` — Prisma's embedded local Postgres emulator. It's convenient (zero external services to install) but turned out to have real, reproducible rough edges during development: it needed `NODE_OPTIONS=--experimental-sqlite` on some Node versions, exposed two different connection strings for CLI vs. app use (a common source of confusing `Connection terminated unexpectedly` errors), and its background WAL-streaming subsystem would periodically crash-loop under sustained use, degrading an otherwise-working session.

None of this was an application bug — reproduced identically in a completely fresh clone with fresh `node_modules`. The actual fix was to stop working around a dev-only emulator and use a real `postgres:16` container instead (see [Local Setup](#local-setup)), which has none of these failure modes and also let the app collapse back down to a single `DATABASE_URL` (the two-URL split only existed because of `prisma dev`'s proxy). Kept here as a documented lesson rather than deleted, since diagnosing "is this an infra problem or a code problem" was itself a real part of building this.
