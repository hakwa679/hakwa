<!--
SYNC IMPACT REPORT
==================
Version change: 1.14.1 → 1.15.0
Modified principles: XVII. Mapping — tile strategy narrowed to self-hosted
  Fiji-extract tiles only; public OSM tile CDN forbidden in production;
  tile extract tooling (tilemaker / Planetiler) and bounding-box constraint
  documented
Added sections: XVIII. Official Documentation First — implementers must consult
  official online docs before any installation, scaffolding, API usage,
  version selection, migration, or configuration step
Removed sections: N/A
Templates updated:
  ✅ .specify/memory/constitution.md — this file
  ✅ .specify/templates/plan-template.md — XVIII check added to Constitution Check
  ✅ .specify/templates/spec-template.md — no structural changes required
  ✅ .specify/templates/tasks-template.md — no structural changes required
Deferred TODOs: none
-->

# Hakwa Constitution

## Platform Overview

Hakwa is a transport booking platform built for Fiji. The platform connects
passengers with transport operators and merchants across multiple transport
modes. Hakwa acts as the marketplace and payment layer; merchants (fleet and
seat owners) register on the platform and list their services.

The platform explicitly supports two merchant licensing tiers:

- **Licensed merchants** — businesses or individuals holding a valid LTA (Land
  Transport Authority) registration. They provide a TIN and business
  registration number during onboarding.
- **Unlicensed merchants** — informal or individual transport providers (e.g.,
  private taxi drivers without a formal business entity) who operate under a
  lighter onboarding flow. Regulatory obligations for this tier are determined
  by Fiji-specific compliance rules and MUST be codified in the data model as a
  merchant `licenseType` or equivalent field, not hardcoded in logic.

**Current scope (Phase 1)**: Taxi booking — both licensed and unlicensed
merchant variants.

**Planned future scope**: Minibus seat booking, bus seat booking. These modes
share the core merchant/ride/trip primitives but introduce seat-level inventory.
Architecture decisions MUST NOT unnecessarily foreclose these extensions.

## Product Scope

### Transport Modes

| Mode    | Phase       | Booking Unit | Inventory Model              |
| ------- | ----------- | ------------ | ---------------------------- |
| Taxi    | 1 (current) | Full vehicle | Operator availability        |
| Minibus | 2 (future)  | Seat         | Seat inventory per departure |
| Bus     | 2 (future)  | Seat         | Seat inventory per departure |

### Merchant Licensing Model

| Tier       | Onboarding Data                   | Regulatory Obligation      |
| ---------- | --------------------------------- | -------------------------- |
| Licensed   | TIN, business registration number | Full LTA compliance        |
| Unlicensed | Operator identity only            | Fiji informal-sector rules |

Any feature that creates or modifies merchant records MUST handle both licensing
tiers explicitly. Defaulting silently to one tier is not permitted.

### Frontend Applications

| App / Portal          | Type              | Primary Users                                       | Phase       |
| --------------------- | ----------------- | --------------------------------------------------- | ----------- |
| Rider App             | React Native Expo | Passengers                                          | 1 (current) |
| Driver App            | React Native Expo | Operators (drivers, captains, bikers, pilots, etc.) | 1 (current) |
| Merchant App          | React Native Expo | Merchant owners                                     | 1 (current) |
| Web — Rider Portal    | React + Vite      | Passengers (web)                                    | 1 (current) |
| Web — Merchant Portal | React + Vite      | Merchant owners (web)                               | 1 (current) |

All five frontends are first-class citizens of the monorepo and MUST follow the
same conventions. No frontend app may be treated as a prototype or exempted from
type safety, error handling, or data-fetching standards.

## Core Principles

### I. Package-First Monorepo

Every piece of shared functionality MUST live in a dedicated workspace package
under `pkg/` (e.g., `@hakwa/db`, `@hakwa/auth`, `@hakwa/email`). Application
code in `api/` and `apps/` MUST consume packages via their published workspace
import, never via relative paths that cross package boundaries. Packages MUST
export a clear public surface through their `index.ts` and `package.json`
`exports` / `types` fields. Packages MUST be self-contained: a package that
cannot be used in isolation is not a valid package.

**Rationale**: Prevents coupling between application layers, makes functionality
independently testable, and removes duplication across apps.

### II. Type Safety (NON-NEGOTIABLE)

All code MUST be written in TypeScript with strict mode enabled. The use of
`any` is forbidden without an inline justification comment and explicit team
acknowledgement. Database entity types MUST be derived from Drizzle-inferred
types (`$inferSelect` / `$inferInsert`) — hand-written duplicates are not
permitted. External API payloads and WebSocket messages MUST be validated at the
boundary (runtime schema check) before being used as typed values.

**Rationale**: Hakwa handles financial transactions and real-time mobility
operations; type errors in these domains have direct user impact.

### III. Security by Default

All WebSocket connections MUST authenticate via `getSessionFromRequest` before
processing any messages. The API MUST enforce rate limiting at the application
layer. Email verification MUST remain required for all user accounts. Secrets
(database credentials, auth secrets, API keys) MUST only be read from
environment variables — never hardcoded or committed. Any code path that accepts
external input MUST sanitize / validate that input before use.

**Rationale**: Financial and location data make Hakwa a high-value target;
security cannot be bolted on after the fact.

### IV. Database Schema as Contract

The Drizzle schema files in `@hakwa/db` are the single source of truth for all
data models. Schema changes MUST be applied through the established `db-push`
workflow (`npm run db-push`). Derived types, API contracts, and business logic
MUST follow the schema, not the other way around. A schema change that removes
or renames a column is a breaking change and MUST be coordinated across all
consuming packages before merging.

**Rationale**: Divergence between the schema and application code is the leading
cause of runtime errors in data-intensive systems.

### V. Real-Time by Design

Hakwa is an operational platform; user-facing state changes (taxi dispatch
status, driver location updates, booking confirmations, payment outcomes) MUST
be propagated in real time. **Redis is the real-time engine** — events MUST be
published to Redis channels/streams and consumed by the WebSocket layer for
fan-out to connected clients. Direct database polling for real-time delivery is
forbidden. The `ws` library handles the last-mile WebSocket connections to
clients; Redis handles cross-instance pub/sub. This architecture extends without
change to future transport modes (e.g., seat availability updates for
minibus/bus). Heartbeat / ping-pong health checks MUST remain active on all
WebSocket servers. Structured logging (`console.error`, `console.warn`,
`console.log` with context objects) MUST be used for all connection and Redis
subscription lifecycle events. Stale or unauthenticated connections MUST be
terminated promptly.

**Rationale**: Redis pub/sub decouples event producers from WebSocket servers,
enabling horizontal scaling and sub-millisecond delivery without polling.

### VI. Financial Model

The platform charges a **7 % commission on every completed trip**. The fare
split MUST be computed and persisted at the moment a trip transitions to
`completed`:

- `platformCommission` = `fare × 0.07` — credited to the Hakwa platform wallet.
- `merchantAmount` = `fare × 0.93` — credited to the merchant wallet.

Both ledger entries (platform credit and merchant credit) MUST be written in the
**same database transaction** as the trip status update. No money movement is
permitted outside a `ledgerEntry` record.

**Payouts are weekly.** A scheduled job creates one `payoutBatch` per week
(identified by `weekStart` / `weekEnd`). For every merchant with a non-zero
wallet balance, a `payout` record is created that sweeps the full balance to the
merchant's registered bank account. A flat **$1.00 service fee** is deducted
from each individual payout — stored as `serviceFee`; the net bank transfer
value is `amount − serviceFee` (`netAmount`). Batch lifecycle:
`scheduled → processing → completed` (or `failed`). Failed individual payouts
MUST be retried within the same batch week before the next batch is created. The
platform (Hakwa) wallet balance is **not** subject to the weekly sweep and is
managed separately.

The commission rate (7 %), payout service fee ($1.00), and payout cadence
(weekly) MUST be stored as named constants — never as magic numbers inline in
business logic.

**Rationale**: Commission and payout terms are contractual obligations to
merchants. Encoding them as first-class schema and constants prevents accidental
drift and makes auditing straightforward.

### VII. Gamification

Hakwa embeds a gamification layer to drive **user acquisition** (referrals),
**retention** (streaks, levels), and **marketing distribution** (shareability of
achievements). The system applies to **passengers** and **operators** (vehicle
operators: drivers, captains, bikers, pilots, etc.) separately — the two
populations earn points through different actions and progress through their own
level tracks.

#### Points

Every eligible action awards a defined number of **points** to the actor's
`pointsAccount`. Point-earning events MUST be recorded individually in
`pointsLedger` (amount, source action, reference ID) so the balance is always
audit-reproducible. No points mutation is permitted outside a `pointsLedger`
record. Source action types are a closed enum (e.g., `trip_completed`,
`referral_signup`, `referral_trip`, `streak_bonus`, `badge_awarded`,
`review_submitted`) — new action types MUST be added to the enum in the schema,
not inlined as free strings.

#### Levels

Levels are cumulative-points milestones defined in a `level` lookup table
(`levelNumber`, `name`, `pointsRequired`,
`applicableTo: "passenger" | "operator"`). The current level is derived from the
`pointsAccount.totalPoints` against this table — it is **never stored
redundantly**; it MUST be computed at read time. Level definitions MUST be
data-driven (rows in the table), not hardcoded in application logic, so they can
be adjusted without a code deploy.

#### Badges

Badges are one-time achievements (e.g., "First Trip", "10 Trips", "Top
Referrer"). They are defined in a `badge` lookup table (`key`, `name`,
`description`, `iconUrl`, `applicableTo`). When a badge criterion is met, a
`userBadge` record is created — badge grants MUST be idempotent (unique
constraint on `userId + badgeKey`). Badge criteria evaluation is event-driven:
the API MUST check eligibility after every relevant `pointsLedger` write.

#### Referrals

Every user is assigned a unique `referralCode` at account creation (stored on
the `pointsAccount`). A new user who signs up using a referral code creates a
`referral` record linking `referrerId → refereeId`. The referrer earns
`referral_signup` points when the referee completes registration, and
`referral_trip` points when the referee completes their first trip. Referral
bonuses MUST be capped to prevent abuse — the cap value is a named constant.

#### Streaks

A streak is a consecutive-day count of the user meeting a minimum activity
threshold (e.g., at least one completed trip per day). Streak state is stored in
`pointsAccount` as `currentStreak` and `longestStreak`. A `streakCheckpoint`
timestamp records the last day the streak was extended. Missing a day resets
`currentStreak` to 0. Milestone streaks (e.g., 7-day, 30-day) award a
`streak_bonus` points ledger entry and are checked after every streak extension.

#### Design constraints

- All gamification schema lives in `pkg/db/schema/gamification.ts` and is
  exported through `@hakwa/db`.
- Gamification reads (leaderboard, level, badge queries) MUST NOT block the trip
  or payment critical paths. Run badge/level checks asynchronously after the
  primary transaction commits.
- Points and badges are **non-financial** — they MUST NOT be convertible to cash
  or wallet credit in the current scope.
- Leaderboard queries MUST be served from a Redis sorted set, not a direct
  database `ORDER BY` scan, to remain performant at scale.

**Rationale**: A points/levels/badges/referral/streak system creates organic
word-of-mouth growth and daily-use habits — critical for a marketplace in a
small geography where network effects take time to compound.

### VIII. Concurrency Safety

Race conditions are a first-class risk on Hakwa wherever concurrent requests can
mutate shared state: wallet balances, trip status transitions, payout batch
creation, points accounts, and (in future phases) seat-level inventory.

#### Wallet and points mutations

Any operation that reads a balance and then writes an updated value MUST acquire
a row-level lock before reading:

```sql
SELECT * FROM wallet WHERE id = $id FOR UPDATE;
```

The lock MUST be held inside the enclosing database transaction until both the
balance update and the associated ledger record are committed atomically. No
read-modify-write on `wallet` or `pointsAccount` rows is permitted without this
lock. The same pattern applies to `pointsAccount` mutations (see Principle VII).

#### Trip status transitions

Status changes MUST be driven by a conditional update that names the expected
prior state:

```sql
UPDATE trip SET status = 'accepted' WHERE id = $id AND status = 'pending'
RETURNING *;
```

A zero-row result MUST return a `409 Conflict` to the caller — silent overwrite
of the current state is forbidden. This prevents double-acceptance and
out-of-order status regressions.

#### Payout batch creation

Only one `payoutBatch` may exist for a given `weekStart`. The uniqueness
constraint on `(weekStart)` in the schema is the enforcement mechanism; the
scheduler MUST catch the unique-violation error and treat it as a no-op (the
batch already exists), never as an unhandled exception.

#### Redis-atomic operations

Redis state mutated concurrently (leaderboard scores, counters) MUST use
inherently-atomic Redis commands (`ZADD`, `INCR`, `SETNX`). Multi-step Redis
operations that must execute atomically MUST be wrapped in a Lua script or a
`MULTI/EXEC` block — never issued as separate round-trips.

#### Optimistic concurrency (alternative path)

For low-contention paths, optimistic concurrency control (checking an
`updatedAt` timestamp or a version integer before committing) MAY replace
row-level locking. The caller MUST handle the resulting conflict and retry —
optimistic concurrency without a retry path is not acceptable.

#### Idempotency keys

External-trigger operations (webhook callbacks, scheduler firings) MUST be
idempotent by design. Where the underlying record cannot carry a natural unique
constraint, an explicit `idempotencyKey` column MUST be added and enforced at
the database level.

**Rationale**: Financial and gamification state is highly contended during peak
demand. A single unsynchronized read-modify-write cycle on a popular wallet or
points account is sufficient to create an unrecoverable balance discrepancy.
Database-level enforcement is required; application-level "check before write"
patterns alone are not safe under concurrent load.

### IX. Webhook-First Integrations

Wherever an external service or internal subsystem can push state changes,
webhooks MUST be preferred over polling. This applies to all integration
boundaries — payment provider confirmations, payout status callbacks, and
post-commit side effects (gamification, notifications, audit events).

#### Inbound webhooks (external → Hakwa)

- Every inbound webhook endpoint MUST verify the provider's signature before
  doing any processing. Signature verification MUST happen before the payload is
  parsed or acted upon — an unsigned or incorrectly signed request MUST be
  rejected with `400 Bad Request`.
- The handler MUST return a `2xx` response immediately after verifying the
  signature; all business logic MUST be executed asynchronously (via an internal
  event, queue, or Redis stream) to avoid gateway timeouts.
- Inbound webhook handlers MUST be idempotent — duplicate deliveries of the same
  event MUST produce the same outcome as a single delivery (see Principle VIII
  idempotency rules).
- Webhook endpoint URLs MUST be versioned (e.g., `/webhooks/v1/payments`) so
  provider callbacks can continue to work across breaking API changes.

#### Internal post-commit hooks

Side effects that are triggered by a primary transaction (e.g., badge evaluation
after a trip completes, sending a confirmation email after a booking) MUST be
modelled as internal events dispatched to a handler after the primary commit —
not inlined synchronously in the same database transaction. Redis Streams are
the preferred transport for these internal hooks within the Hakwa stack.

#### Outbound webhooks (Hakwa → third-party)

When Hakwa must notify an external system of a state change, it MUST do so via
an outbound webhook dispatched from a worker process, never inline in a request
handler. Failed deliveries MUST be retried with exponential back-off. Each
outbound dispatch attempt MUST be logged with the target URL, HTTP status, and
timestamp.

#### Webhook routing package

All webhook registration, signature verification utilities, and retry helpers
MUST live in a dedicated `@hakwa/webhooks` workspace package. Application code
MUST import verification and dispatch helpers from this package — no ad-hoc
signature checks are permitted in `api/` route files.

**Rationale**: Polling creates unnecessary database and network load, inflates
latency, and is harder to reason about than event-driven delivery. Webhooks
reduce coupling, simplify retry visibility, and match how modern payment and
banking rails actually deliver state changes.

### X. Worker-Thread Concurrency

Node.js runs JavaScript on a single event-loop thread. Any operation that is
CPU-bound or has significant synchronous processing time MUST be offloaded to a
**worker thread** (Node.js `worker_threads` module) so the event loop remains
free for I/O, WebSocket messages, and HTTP request handling.

#### What MUST run on worker threads

- **Fare and commission calculations** involving complex routing, surge-pricing
  formulas, or batch aggregations.
- **Payout batch processing** — iterating over merchant wallets, computing net
  amounts, and writing payout records for a full week's batch.
- **Gamification evaluation** — badge eligibility scans, leaderboard recomputes,
  streak validation when run over large user sets.
- **Report generation** — any CSV/PDF export or analytics aggregation query
  whose result set exceeds ~1 000 rows.
- **Cryptographic operations** — signature generation/verification for webhooks
  and any bulk token operations.
- **Data transformation / serialisation** at high throughput (e.g., bulk import
  of operator GPS traces, schema migration data transforms).

#### Worker pool package

All worker-thread management MUST live in a dedicated `@hakwa/workers` workspace
package. This package exposes:

- A **typed worker pool** built on `worker_threads` with configurable
  `minThreads` / `maxThreads` (defaulting to `os.availableParallelism() - 1`
  reserved for the main thread).
- A **task-dispatch API** that accepts a task type and typed payload, submits it
  to the pool, and returns a `Promise` resolved when the worker completes.
- **Worker scripts** for each task category above, living under
  `pkg/workers/src/workers/`.

Application code MUST use the pool API — direct `new Worker(...)` calls outside
`@hakwa/workers` are forbidden.

#### Message-channel contracts

Communication between the main thread and workers MUST use typed message schemas
(validated with the same runtime schema library used elsewhere in the stack).
Workers MUST NOT import Express, WebSocket, or Redis client singletons — they
receive all required data through their initial `workerData` or via
`MessageChannel` messages. Workers communicate results back only through
`parentPort.postMessage()`.

#### Shared memory

`SharedArrayBuffer` MAY be used for high-frequency numeric data (e.g., location
coordinate buffers). When shared memory is used, access MUST be coordinated with
`Atomics` operations — direct uncoordinated reads/writes to a shared buffer are
forbidden.

#### Error handling and observability

A worker that throws an unhandled error MUST NOT crash the API process. The pool
MUST catch the `error` event from the worker, log it with full context (task
type, payload summary, error stack), and reject the calling `Promise` so the
caller can handle the failure gracefully. Worker pool metrics (queue depth,
active threads, task duration p95) MUST be emitted as structured log lines at a
configurable interval.

**Rationale**: Node.js's event loop is not the right place to run CPU-intensive
work. Blocking the loop stalls all in-flight WebSocket messages and HTTP
requests simultaneously, which is unacceptable on an operational transport
platform. Worker threads provide true parallel execution on multi-core hosts
without the overhead of spawning separate processes.

### XI. Unified Error Handling

All error scenarios across every layer of the application — HTTP request
handlers, WebSocket message handlers, worker threads, webhook processors, and
scheduled jobs — MUST be handled through a single, consistent error pipeline.
Ad-hoc `try/catch` blocks that swallow errors or format their own responses are
forbidden.

#### AppError: the canonical error type

All intentional, domain-level errors MUST be represented as instances of
`AppError` (or a subclass), defined and exported from a dedicated
`@hakwa/errors` workspace package. `AppError` carries:

- `code` — a stable machine-readable string identifier (e.g., `TRIP_CONFLICT`,
  `WALLET_INSUFFICIENT_FUNDS`, `WEBHOOK_SIGNATURE_INVALID`).
- `httpStatus` — the correct HTTP status code for this error class.
- `message` — a human-readable description safe to surface to end-users.
- `details` (optional) — structured metadata for debugging, NEVER containing
  secrets, stack traces, or internal system paths.

Subclasses for common categories MUST be provided: `ValidationError` (400),
`AuthError` (401), `ForbiddenError` (403), `NotFoundError` (404),
`ConflictError` (409), `RateLimitError` (429), `InternalError` (500).

#### HTTP layer: centralised Express error middleware

A single Express error-handling middleware (four-argument signature
`(err, req, res, next)`) registered **last** on the Express app MUST be the sole
place that writes error responses. Its responsibilities:

1. If `err` is an `AppError`, respond with `err.httpStatus` and a JSON envelope:
   `{ error: { code, message, details? } }`.
2. If `err` is any other `Error` (unexpected/unclassified), log the full stack
   internally and respond with `500` and a generic `INTERNAL_ERROR` code — the
   raw error message MUST NOT be forwarded to the client.
3. Never expose stack traces, file paths, or internal service names in
   responses.

Route handlers and service functions MUST `throw` (or propagate via `next(err)`
for async Express routes) — they MUST NOT call `res.json()` with error shapes
directly.

#### WebSocket layer

WebSocket error responses MUST use a standardised message envelope:

```json
{ "type": "error", "code": "<APP_ERROR_CODE>", "message": "<safe message>" }
```

The WebSocket message dispatcher MUST wrap every handler in a `try/catch` and
use the above envelope for all error responses. Raw `Error` objects or Node.js
system errors MUST be mapped to `InternalError` before dispatch.

#### Worker-thread errors

Worker threads MUST catch all internal errors, serialise them as
`{ type: 'error', code, message }` objects, and send them back to the main
thread via `parentPort.postMessage()` — they MUST NOT let unhandled rejections
propagate to the worker's uncaught exception handler. The `@hakwa/workers` pool
unwraps worker error messages and rejects the task `Promise` with a
reconstituted `AppError`.

#### Scheduled jobs and webhook processors

Jobs and webhook consumers MUST catch all errors, log them with full structured
context (job name, entity ID, error code, stack), and emit a metric or alert
event. A failed job MUST NOT terminate the scheduler process.

#### Structured error logging

Every caught error that reaches a boundary handler MUST be logged with:

- `level`: `error` for 5xx, `warn` for 4xx client errors.
- `code`: the `AppError` code or `UNCLASSIFIED`.
- `httpStatus` / `wsMessageType` as applicable.
- `requestId` (from request context) where available.
- `stack`: included in log output, NEVER in response payload.

#### @hakwa/errors package

The `@hakwa/errors` package MUST export: `AppError` base class, all subclasses,
a `isAppError(e)` type-guard, and an `toErrorEnvelope(e)` serialiser that
produces the canonical JSON shape. No other package may define its own error
base class.

**Rationale**: Inconsistent error handling is the most common source of
information leakage, confusing client behaviour, and untracked production
failures. A unified pipeline ensures every error is classified, logged once, and
surfaces only safe information to callers — regardless of which layer it
originated in.

### XII. Frontend Architecture

Hakwa's frontend surface consists of five applications living under `apps/` in
the monorepo. They are divided into two platform types.

#### Mobile apps (React Native Expo)

Three React Native Expo applications MUST be maintained under:

```
apps/mobile/rider/       — Rider App
apps/mobile/driver/      — Driver App
apps/mobile/merchant/    — Merchant App
```

Each app is a standalone Expo managed-workflow project with its own
`package.json` and `app.json`. Shared React Native components and hooks MUST be
extracted into a `pkg/ui-native/` workspace package (`@hakwa/ui-native`) rather
than duplicated across apps.

#### Web app (React + Vite + TanStack Router)

A single React + Vite application lives at `apps/web/` and hosts two portals
routed under the same build:

- `/merchant/*` — Merchant Portal (onboarding, fleet management, earnings,
  payout history, gamification dashboard).
- `/rider/*` — Rider Portal (booking, trip history, wallet, profile,
  gamification).

Routing MUST use **TanStack Router** with file-based or typed-route-tree
configuration. No other client-side router is permitted. Shared web UI
components MUST live in `pkg/ui-web/` (`@hakwa/ui-web`).

#### Universal data-fetching layer

All five frontends (mobile and web) MUST use **TanStack Query** for server-state
management and **Axios** for HTTP transport. No other data-fetching abstraction
(SWR, `fetch` wrappers, Redux-based async patterns) is permitted.

- A single `@hakwa/api-client` workspace package MUST define all Axios instance
  configuration (base URL from env, auth header injection, response interceptors
  that map API error envelopes to `AppError` instances from `@hakwa/errors`).
- TanStack Query `queryKey` factories and query/mutation hooks for each API
  domain (trips, bookings, wallet, auth …) MUST live in `@hakwa/api-client` and
  be imported by both web and mobile apps — not re-implemented per app.
- The Axios instance MUST be configured to attach the session token
  automatically; no app-level code may manually set `Authorization` headers.

#### API type contracts

Request and response shapes shared between the backend and all frontends MUST be
defined in a `pkg/types/` workspace package (`@hakwa/types`). The backend
(`api/`) derives its Express handler types from `@hakwa/types`; frontends import
the same types for Axios response typing and TanStack Query return types. No
hand-duplicated type definitions are permitted across the boundary.

#### WebSocket client

Real-time event subscriptions on the frontend (trip status, dispatch
notifications, location updates) MUST use the native browser / React Native
WebSocket API wrapped in a hook exported from `@hakwa/api-client`. The hook MUST
handle reconnection, auth header negotiation, and error-envelope parsing per
Principle XI.

#### Environment configuration

Each app reads its API base URL and WS URL from environment variables:

- Mobile apps: via Expo `EXPO_PUBLIC_*` variables in `.env`.
- Web app: via Vite `VITE_*` variables in `.env`.

Neither may hardcode production, staging, or development URLs.

**Rationale**: A fragmented frontend — five apps with independent data-fetching
patterns, duplicated API types, and ad-hoc auth logic — is the fastest path to
client-side bugs and inconsistent UX. Centralising the Axios instance, query
hooks, and type contracts in shared packages means a backend contract change
requires one fix, visible everywhere.

### XIII. Shared-First Code Reuse

Code duplication is a first-class defect. Before writing any logic, component,
hook, or utility in an app or route handler, the author MUST ask: “Does this
already exist in a shared package?” If it does, import it. If equivalent logic
exists elsewhere and is not yet shared, extract it into the appropriate package
**before** writing a second copy. The rule is: **extract before duplicate**.

#### Shared package taxonomy

| Package             | Contents                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `@hakwa/types`      | All API request/response types, domain enums, shared value-object types                                             |
| `@hakwa/api-client` | Axios instance, TanStack Query hooks + key factories, WebSocket hook                                                |
| `@hakwa/errors`     | `AppError` hierarchy, type guards, envelope serialiser                                                              |
| `@hakwa/ui-native`  | React Native primitive components, shared mobile hooks, navigation wrappers                                         |
| `@hakwa/ui-web`     | React web component primitives (buttons, inputs, layout), shared web hooks                                          |
| `@hakwa/core`       | Platform-agnostic business logic: fare calculation helpers, date/currency formatters, constants, validation schemas |
| `@hakwa/db`         | Drizzle schema, inferred types, query helpers                                                                       |
| `@hakwa/auth`       | Session helpers, auth middleware                                                                                    |
| `@hakwa/redis`      | Redis client singleton, pub/sub helpers                                                                             |
| `@hakwa/workers`    | Worker-thread pool and task definitions                                                                             |
| `@hakwa/webhooks`   | Signature verification, retry helpers                                                                               |
| `@hakwa/email`      | Transactional email templates and sender                                                                            |

No logic that belongs in a package above MAY be re-implemented in `api/`,
`apps/web/`, or any `apps/mobile/*` directory.

#### Cross-platform business logic (`@hakwa/core`)

Any calculation, formatting, or validation rule that is used by more than one
app or by both the frontend and backend MUST live in `@hakwa/core`. Examples:

- Fare and commission calculation functions.
- Currency formatting (FJD display rules).
- Distance / duration helpers.
- Booking status machine transition validators.
- Referral code generation.
- Input validation schemas (Zod or equivalent) reused across API and frontend
  forms.

`@hakwa/core` MUST have zero runtime dependencies on Node.js built-ins, Express,
or Expo — it MUST be importable in any environment (browser, native, server,
worker).

#### UI components

- A UI primitive (button, text input, card, loading spinner, error banner) MUST
  be implemented once per platform in the appropriate shared UI package and
  imported by all apps on that platform. App-level re-implementations are
  forbidden.
- Cross-platform design tokens (colours, spacing scale, typography) MUST live in
  `@hakwa/core` (or a dedicated `@hakwa/tokens` sub-package) as plain JS
  constants, consumed by both `@hakwa/ui-native` and `@hakwa/ui-web`.

#### Hooks and utilities

- A custom hook used in more than one screen or app MUST be moved to
  `@hakwa/api-client` (if data-fetching), `@hakwa/ui-native` / `@hakwa/ui-web`
  (if UI-state), or `@hakwa/core` (if platform-agnostic).
- Utility functions (date helpers, string formatters, validators) used in more
  than one file across different packages MUST be extracted to `@hakwa/core`
  before a second copy is written.

#### Backend route handlers

- Service-layer functions (business logic called by route handlers) MUST be
  extracted into a `services/` directory within `api/src/` rather than inlined
  in route handlers. If the same service logic is needed by a worker thread or a
  webhook processor, it MUST be further extracted into `@hakwa/core` or a
  dedicated backend-only shared module under `pkg/`.

#### DRY enforcement at review

Every pull request MUST be checked for duplication before merge:

1. Does any new file reproduce logic already in a shared package? → Extract.
2. Does any new component duplicate an existing component in a UI package? →
   Extend or parameterise the existing one.
3. Does any new type duplicate a shape already in `@hakwa/types`? → Import and
   reuse.

A PR that introduces intentional duplication MUST include a written
justification (e.g., the shared version would require a breaking change that is
out of scope). Silent duplication is not permitted.

**Rationale**: Five apps sharing the same domain mean that every piece of
unshared logic is effectively written, tested, and debugged five times. Shared
packages amortise that cost to once. The extract-before-duplicate rule keeps the
codebase from silently accumulating divergent copies of the same behaviour.

### XIV. Notification System

Hakwa MUST maintain a robust, multi-channel notification system that keeps
passengers, drivers, and merchants informed and engaged throughout the trip
lifecycle and beyond. Notifications are a first-class product feature, not an
afterthought.

#### Channels

| Channel       | Transport                             | Primary Use Cases                                  |
| ------------- | ------------------------------------- | -------------------------------------------------- |
| Push (mobile) | Expo Push Notification Service (EPN)  | Trip events, driver arrival, booking confirmation  |
| In-app        | WebSocket real-time message to client | Live status, gamification rewards, system alerts   |
| Email         | `@hakwa/email` (transactional)        | Registration, weekly payout summary, receipts      |
| SMS           | Configurable SMS gateway (env-driven) | Critical alerts when app is not open, OTP fallback |

No channel may be hardcoded as the sole delivery mechanism for a critical
notification. Where a notification is time-sensitive (e.g., driver arrival),
both push and in-app channels MUST be attempted.

#### Notification schema

Every notification MUST be persisted as a `notification` record before dispatch:

- `id`, `userId`, `type` (closed enum), `channel` (push | in_app | email | sms),
  `title`, `body`, `data` (JSON payload for deep-linking), `status` (pending →
  sent | failed), `readAt`, `createdAt`.
- `type` is a closed enum in the schema (e.g., `trip_accepted`,
  `driver_arrived`, `trip_completed`, `payout_processed`, `badge_earned`,
  `streak_milestone`, `referral_signup`, `referral_trip`, `wallet_credited`,
  `system_alert`). New types MUST be added to the enum, never inlined as free
  strings.
- Notifications MUST NOT be dispatched without a persisted record — this
  guarantees an audit trail and enables in-app unread counts.

#### Delivery pipeline

Notification dispatch MUST be fully asynchronous:

1. The triggering service writes a `notification` row (status: `pending`) and
   publishes a `notification.dispatch` event to a **Redis Stream**.
2. A **worker thread** (via `@hakwa/workers`) consumes the stream, selects the
   correct channel(s) per user preferences, and calls the appropriate sender.
3. On success the record status is updated to `sent`; on failure to `failed`
   with an error detail column. Failed push/SMS notifications MUST be retried
   with exponential back-off up to a configurable maximum.
4. The triggering request MUST NOT block on notification delivery — responding
   to the client before dispatch completes is the required behaviour.

#### Push notifications (Expo)

- Each mobile app installation MUST register its Expo push token with the API
  (`/devices` endpoint) on first launch and on token refresh.
- Tokens are stored in a `device` table linked to `userId`. A user may have
  multiple active tokens (multiple devices).
- Push payloads MUST include a `data` field with enough context for the app to
  deep-link to the relevant screen without a separate API call.
- Invalid or expired tokens returned by EPN MUST be marked inactive in the
  `device` table immediately — never retried with a dead token.

#### In-app notifications

- In-app notifications are delivered via the existing WebSocket layer (Principle
  V) as a message of type `notification`.
- The frontend MUST maintain an unread notification count derived from the
  `notification` table query (`readAt IS NULL`) via a TanStack Query hook in
  `@hakwa/api-client`.
- Marking a notification as read MUST call a `PATCH /notifications/:id/read`
  endpoint, which sets `readAt` and invalidates the unread-count query.

#### User preference centre

Every user MUST be able to control which notification types they receive on
which channels. Preferences are stored in a `notificationPreference` table
(`userId`, `type`, `channel`, `enabled`). The delivery pipeline MUST check
preferences before dispatching — an opted-out channel for a given type MUST be
skipped, except for `system_alert` notifications which are non-opt-outable.

#### Engagement-driven triggers

The notification system MUST emit the following engagement triggers
automatically (no manual action required):

- **Gamification**: badge earned, level-up, streak milestone, referral
  conversion.
- **Trip lifecycle**: booking confirmed, driver accepted, driver en route,
  driver arrived, trip started, trip completed, receipt generated.
- **Financial**: wallet credited (commission swept), payout processed, payout
  failed.
- **Re-engagement**: configurable inactivity reminder after N days without a
  trip (N is a named constant, default 7).

#### @hakwa/notifications package

All notification logic MUST live in a `@hakwa/notifications` workspace package:

- Sender adapters for each channel (Expo, email, SMS).
- The `dispatchNotification(notification)` orchestrator that reads user
  preferences and fans out to the correct senders.
- Retry and back-off helpers.
- Type-safe notification payload builders per `type` enum value.

Application code MUST call `dispatchNotification()` — no direct calls to Expo
APIs, SMS gateways, or email senders are permitted outside this package.

**Rationale**: Notifications are the primary channel for real-time engagement on
a transport platform. A driver arriving five seconds ago and an unread badge
award both require immediate, reliable delivery. Centralising dispatch, schema,
and preferences prevents notification sprawl — where different features
independently fire messages with no unified delivery guarantees, audit trail, or
user control.

### XV. UI Design System

Every screen across all five Hakwa apps MUST feel like a single cohesive
product. The visual language is **slate, minimal, and seamless**: calm neutral
base tones, deliberate use of whitespace, and transitions that feel effortless
rather than showy. A jarring colour, unexpected animation, or missing loading
state is a bug.

#### Colour palette — Slate theme

The design token system MUST define the following semantic colour roles, all
derived from a slate grey base with a single accent:

| Token                  | Purpose                                    | Baseline value                |
| ---------------------- | ------------------------------------------ | ----------------------------- |
| `color.bg.base`        | Primary page / screen background           | Slate-950                     |
| `color.bg.surface`     | Cards, sheets, modals                      | Slate-900                     |
| `color.bg.elevated`    | Dropdowns, tooltips, popovers              | Slate-800                     |
| `color.bg.subtle`      | Disabled states, secondary input fills     | Slate-800/50                  |
| `color.border.default` | Dividers, input borders                    | Slate-700                     |
| `color.border.muted`   | Subtle separators                          | Slate-800                     |
| `color.text.primary`   | Headings, primary body copy                | Slate-50                      |
| `color.text.secondary` | Supporting text, labels                    | Slate-400                     |
| `color.text.disabled`  | Disabled labels                            | Slate-600                     |
| `color.accent`         | Primary action, links, active states       | Brand-defined (e.g., Sky-500) |
| `color.accent.muted`   | Hover / pressed accent surface             | Accent at 15 % opacity        |
| `color.success`        | Positive states (trip completed, credited) | Emerald-500                   |
| `color.warning`        | Caution states (pending payout)            | Amber-500                     |
| `color.error`          | Error states                               | Rose-500                      |

Token values MUST be stored in `@hakwa/tokens` as plain TypeScript constants and
consumed by `@hakwa/ui-native` (via React Native `StyleSheet`) and
`@hakwa/ui-web` (via CSS custom properties / Tailwind config extension). No
app-level code may define its own colours outside the token system.

#### Typography

**Primary typeface: Inter** (by Rasmus Andersson, SIL Open Font License).

Inter is the mandated typeface across all five Hakwa apps. Selection rationale:

- Designed from the ground up for computer screens and UI — not adapted from
  print. All letterforms are optimised for dark-background legibility.
- **Tabular figures** at every weight: fare amounts (`FJD 12.50`), distances
  (`3.2 km`), and countdown timers never shift width between updates.
- Distinguishable characters at small sizes (0/O, 1/l/I are visually distinct) —
  critical for booking codes and wallet transaction IDs.
- Four required weights (400, 500, 600, 700) are available as a subset, keeping
  bundle size minimal.
- Widely supported: `@expo-google-fonts/inter` for React Native / Expo;
  self-hosted WOFF2 subset for the Vite web app.

**Loading — mobile (React Native / Expo):**

```ts
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
```

Fonts MUST be loaded via `useFonts` at the root layout before any text renders.
The app MUST render a `SplashScreen` (not a blank frame) while fonts load.

**Loading — web (Vite):**

Self-host the Inter WOFF2 subset in `apps/web/public/fonts/`. Import via a
global CSS file loaded in `main.tsx`. Do not use the Google Fonts CDN in
production (privacy, performance, and CSP concerns).

```css
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/inter-variable.woff2") format("woff2");
}
```

Use the **variable font** file (`inter-variable.woff2`) on web to ship all
weights in a single request.

**Monospace role:** For booking reference codes, wallet transaction IDs, and any
alphanumeric identifier displayed to users, use the platform system monospace
stack (`'ui-monospace', 'SFMono-Regular', 'Menlo', monospace` on web;
`Platform.select({ ios: 'Courier New', android: 'monospace' })` on native). No
additional monospace font package is required.

**Type scale** (defined in `@hakwa/tokens`):

| Token  | Font size | Line height | Letter spacing | Typical use                   |
| ------ | --------- | ----------- | -------------- | ----------------------------- |
| `xs`   | 11 px     | 16 px       | +0.2 px        | Captions, timestamps          |
| `sm`   | 13 px     | 18 px       | +0.1 px        | Secondary labels, helper text |
| `base` | 15 px     | 22 px       | 0              | Body copy, list items         |
| `lg`   | 17 px     | 24 px       | -0.1 px        | Subheadings, card titles      |
| `xl`   | 20 px     | 28 px       | -0.2 px        | Screen section titles         |
| `2xl`  | 24 px     | 32 px       | -0.3 px        | Page headings                 |
| `3xl`  | 30 px     | 38 px       | -0.4 px        | Hero figures (fare amount)    |

Font weight usage: `400` (body), `500` (labels, captions), `600` (subheadings,
button labels), `700` (headings, hero figures). No other weights. No custom
typeface substitutions without a constitutional amendment.

#### Spacing, radius, and shadow

- A spacing scale (`space.1` = 4 px baseline unit, through `space.16` = 64 px)
  MUST govern all margins, padding, and gaps. Ad-hoc pixel values are forbidden.
- Border radius: `radius.sm` (4 px), `radius.md` (8 px), `radius.lg` (12 px),
  `radius.xl` (16 px), `radius.full` (9999 px). Components MUST use these tokens
  — no raw values.
- Elevation / shadow: three levels (`shadow.sm`, `shadow.md`, `shadow.lg`)
  defined in tokens. Used sparingly — surfaces float only when they need to
  communicate layering.

#### Minimal aesthetic rules

- **No decorative elements** without functional purpose — no gradients,
  illustrations, or icons used purely for decoration.
- **Whitespace is intentional** — screens MUST breathe; dense layouts require
  explicit justification.
- **Icons**: a single icon library MUST be used across all apps (defined in
  `@hakwa/tokens` as the canonical set). Mixing icon sets is forbidden.
- **Destructive or irreversible actions** (cancel trip, delete account) MUST use
  `color.error` and require a confirmation step — they MUST NOT share the
  primary accent styling.

#### Seamless motion and transitions

- Screen transitions MUST use platform-native navigation animations (Expo Router
  stack/tab transitions on mobile; TanStack Router outlet transitions on web).
  Custom transitions MUST use `@hakwa/tokens` duration values: `duration.fast`
  (100 ms), `duration.base` (200 ms), `duration.slow` (350 ms).
- Loading states MUST be shown for every async operation that takes > 200 ms:
  skeleton screens are preferred over spinners for content areas; a spinner is
  acceptable for action buttons.
- State transitions (e.g., booking status changing from `pending` to `accepted`)
  MUST animate smoothly — abrupt re-renders that cause layout jumps are bugs.
- Micro-interactions (button press, swipe-to-confirm) MUST use `duration.fast`
  and respect the user’s reduced-motion accessibility preference
  (`prefers- reduced-motion` on web; `AccessibilityInfo.isReduceMotionEnabled`
  on native).

#### Dark mode

All apps MUST support dark mode as the **primary** target (the slate token
palette is dark-first). Light-mode equivalents for each token SHOULD be defined
but may be deferred post-Phase 1. When deferred, the app MUST lock to dark mode
rather than rendering an unstyled light fallback.

#### Accessibility baseline

- Minimum contrast ratio: 4.5:1 for body text, 3:1 for large text and UI
  components (WCAG AA).
- All interactive elements MUST have an accessible label (`accessibilityLabel`
  on native, `aria-label` on web).
- Touch targets MUST be ≥ 44 × 44 pt on mobile.

**Rationale**: A consistent, calm visual identity builds trust with passengers
and operators in a market where the platform is new. Minimal slate aesthetics
reduce cognitive load during time-sensitive trip interactions. Defining the
system in shared tokens means a brand update touches one file, not fifty
components across five apps.

### XVI. UX Principles

Every interaction on Hakwa occurs in a real-world context — a passenger on a
street corner, a driver at the wheel (via voice/glance), a merchant checking
earnings between shifts. These principles govern how every screen and flow MUST
behave to serve those moments well.

#### 1. Speed is a feature

The most important UX quality is responsiveness. Every screen MUST be
interactable in under 100 ms of touch/click (perceived, not network). Rules:

- Optimistic UI MUST be applied wherever state can be predicted with high
  confidence (e.g., booking a trip, marking a notification read). The UI updates
  immediately; the network call confirms or rolls back silently.
- Skeleton screens MUST appear within one frame of navigation — a blank white or
  black flash is never acceptable.
- Critical data (current trip status, wallet balance) MUST be cached by TanStack
  Query with a `staleTime` appropriate to its volatility. Stale data MUST be
  visible immediately while a background refresh runs.
- Network-dependent actions MUST show in-progress feedback within 200 ms;
  success or failure feedback MUST resolve within a further 300 ms of the
  network response.

#### 2. Status is always visible

A user MUST never wonder what the app is doing or what state their trip is in.

- Every asynchronous operation MUST have three visually distinct states:
  _loading_, _success_, and _error_ — designed before the happy path is built.
- Trip status (pending, accepted, en route, arrived, in progress, completed)
  MUST be visible on the home screen without requiring navigation.
- Wallet balance and unread notification count MUST be visible in the primary
  navigation at all times when the user is authenticated.
- A persistent connection-status indicator MUST be shown when the WebSocket
  connection is degraded or lost.

#### 3. One primary action per screen

Every screen MUST have a single, unambiguous primary action. Secondary actions
exist but MUST recede visually. The primary action button MUST:

- Occupy the bottom of the viewport on mobile (thumb-reachable zone).
- Be disabled — not absent — when its preconditions are not yet met, with an
  inline explanation of what is missing (e.g., “Add a pickup location to
  continue”).
- Never be two parallel equally-weighted buttons side by side for opposing
  destructive choices (e.g., “Confirm / Cancel” at equal visual weight).

#### 4. Progressive disclosure

Show only what the user needs right now. Complexity MUST be revealed
progressively, not front-loaded:

- Onboarding flows MUST collect the minimum required information first; optional
  profile enrichment (profile photo, preferred payment method) is deferred to
  post-registration.
- Advanced settings, edge-case options, and secondary information MUST live
  behind an expandable section or a secondary screen — never on the primary
  flow.
- Forms MUST show one logical group of fields at a time on mobile wherever a
  multi-step flow is feasible.

#### 5. Forgiveness and reversibility

Mistakes are inevitable; the platform MUST make recovery easy:

- Destructive actions (cancel trip, delete payment method, leave merchant
  account) MUST require a two-step confirmation. The confirmation dialog MUST
  describe the consequence in plain language, not just “Are you sure?”
- Cancelled trips within a grace period (a named constant, default 30 seconds)
  MUST be refundable without manual intervention.
- Form input MUST be preserved on navigating away and restored when the user
  returns within the same session.
- Errors MUST suggest a recovery action — “Something went wrong” with no next
  step is never an acceptable error state.

#### 6. Trust through transparency

Hakwa handles money and personal location. Users MUST always know why the app
needs what it asks for and what will happen next:

- Fare estimates MUST be shown before booking confirmation, broken down clearly
  (base fare, distance component, any surge). No surprise charges.
- Commission deductions MUST be shown on the merchant’s trip receipt view.
- Location permission requests MUST be preceded by an in-app explanation screen
  (not just the OS dialog) that states exactly why location is needed.
- Payout timelines MUST be surfaced on the earnings screen — not buried in
  settings or FAQs.
- Any promotion, bonus, or gamification reward earned MUST trigger an immediate
  in-app acknowledgement — silent credit is not acceptable.

#### 7. Contextual empty states

Every list, feed, or data view MUST have a designed empty state:

- The empty state MUST be contextual: it explains _why_ the list is empty and
  provides the primary action that would populate it (e.g., “No trips yet — Book
  your first ride” with a CTA, not just a generic “Nothing here”).
- Empty states MUST use the same slate visual language — no colourful
  illustrations that break the minimal aesthetic.
- Loading and empty states MUST be distinct — a skeleton and an empty state MUST
  never look the same.

#### 8. Offline and degraded-network grace

Fiji has variable mobile connectivity. The app MUST degrade gracefully:

- Cached data MUST be displayed when the network is unavailable, with a clear
  “You’re offline” banner — not a full error screen.
- Actions requiring connectivity (booking, payment) MUST be disabled with an
  explanation, not silently fail.
- Queued actions (e.g., a review submitted offline) MUST be sent automatically
  when connectivity is restored, with user feedback confirming the resolution.

#### 9. Micro-copy as UX

Every string visible to the user is part of the product. Rules:

- Button labels MUST be verb-first and outcome-oriented: “Book ride”, not
  “Proceed”; “Withdraw earnings”, not “Submit”.
- Error messages MUST be written in plain language with a recovery action. No
  error codes or technical terms exposed to end-users.
- Confirmation dialogs MUST name the specific entity being acted on: “Cancel
  trip to Suva CBD?”, not “Cancel this trip?”
- All monetary values MUST display the currency symbol (`FJD`) and two decimal
  places. Time MUST be shown in 12-hour format with AM/PM for Fijian convention.
- All copy MUST be reviewed for clarity, brevity, and cultural fit with the
  Fijian market before shipping.

#### UX review gate

Every feature MUST pass a UX review before it is considered shippable. The
review checks:

1. All async operations have designed loading, success, and error states.
2. Every list has a designed empty state.
3. The primary action on each screen is unambiguous and thumb-reachable.
4. Destructive actions have two-step confirmation with plain-language
   consequences.
5. All micro-copy follows the verb-first, outcome-oriented, entity-specific
   rules above.
6. The feature is tested on a low-end Android device at simulated 3G speeds.

**Rationale**: Hakwa is a real-time operational tool used in moment-of-need
situations. Poor UX — a missing loading state, an ambiguous button, a cryptic
error — doesn’t just frustrate users; it causes trip cancellations and lost
merchant trust. These principles encode the product quality bar that makes the
difference between an app people tolerate and one they recommend.

### XVII. Mapping

**OpenStreetMap (OSM) is the sole map provider for the entire Hakwa platform.**
No Google Maps, Apple MapKit, or Mapbox tile/API calls are permitted anywhere in
the codebase.

#### Motivation

- **Cost**: Google Maps Platform charges per tile load and per API call; Mapbox
  has comparable billing. OSM tiles are free; a self-hosted Fiji-extract tile
  server covers Hakwa's entire operational area at negligible storage cost
  (Fiji's land area is ~18 000 km² — a full-detail extract fits in under 1 GB).
- **Privacy**: No user location data is ever sent to a third-party analytics
  pipeline embedded in a commercial map SDK.
- **Sovereignty**: Fiji-specific map data can be contributed to and corrected in
  OSM directly — no dependency on a vendor's data quality decisions.
- **Vendor lock-in**: A single abstracted `@hakwa/map` package isolates the
  entire codebase from any future provider migration.

#### Rendering libraries

| Platform     | Library                                                  | Tile source                                                                            |
| ------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| React Native | `react-native-maps` (provider: `null` / custom tile URL) | Self-hosted tile server serving Fiji-extract tiles (see **Tile server** section below) |
| Web (Vite)   | `react-leaflet` + `leaflet`                              | Same self-hosted tile server                                                           |

Both libraries MUST be wrapped behind a `@hakwa/map` workspace package
(`pkg/map/`) that exports:

- `<MapView … />` — universal map component (renders `react-native-maps` on
  mobile, `MapContainer` on web via platform-conditional import).
- `<Marker … />`, `<Polyline … />` — unified marker and route overlay
  primitives.
- `useCurrentLocation()` — hook that calls `expo-location` on mobile and the
  browser Geolocation API on web.
- `geocode(query: string)` — forward geocoding via Nominatim
  (`nominatim.openstreetmap.org` in dev; self-hosted Nominatim in prod).
- `reverseGeocode(lat, lng)` — reverse geocoding via the same Nominatim
  instance.
- `getRoute(origin, destination)` — driving route via OSRM
  (`router.project-osrm.org` in dev; self-hosted OSRM or Valhalla in prod).

Application code MUST import all map functionality from `@hakwa/map` — direct
imports of `react-native-maps`, `leaflet`, or `react-leaflet` in `apps/` are
forbidden.

#### Tile server

Hakwa operates a **self-hosted tile server** that serves only the Fiji island
group extract. This is the ONLY permitted tile source in all environments
(development, staging, and production).

**Extract scope**: The tile server MUST be pre-generated from the Fiji OSM
extract bounded by approximately `(-21.5, 176.5)` to `(-15.0, -179.5)` (covers
Fiji's main islands and the 180° antimeridian split). Tiles outside this
bounding box are not required and SHOULD NOT be generated.

**Tooling**: Tile generation MUST use
[tilemaker](https://github.com/systemed/tilemaker) or
[Planetiler](https://github.com/onthegomap/planetiler) with the Fiji OSM PBF
extract sourced from
[Geofabrik](https://download.geofabrik.de/australia-oceania/fiji.html). The
generated `.mbtiles` file is served by
[tileserver-gl](https://github.com/maptiler/tileserver-gl) or an equivalent
lightweight MBTiles HTTP server.

**Tile URL configuration**: The tile URL template MUST be read from an
environment variable — it is NEVER hardcoded in component or hook code:

- Mobile (Expo): `EXPO_PUBLIC_MAP_TILE_URL` (e.g.,
  `https://tiles.hakwa.com/{z}/{x}/{y}.png`).
- Web (Vite): `VITE_MAP_TILE_URL` (same value).

There is NO fallback to `tile.openstreetmap.org` or any other public CDN in any
environment. If `EXPO_PUBLIC_MAP_TILE_URL` / `VITE_MAP_TILE_URL` is unset, the
`@hakwa/map` `<MapView />` MUST throw a startup error — it MUST NOT silently
fall back to a public tile provider.

For local development, engineers run the tile server locally via Docker:

```bash
docker run -p 8080:80 -v $(pwd)/tiles/fiji.mbtiles:/data/fiji.mbtiles \
  maptiler/tileserver-gl
```

And set
`EXPO_PUBLIC_MAP_TILE_URL=http://localhost:8080/styles/basic-preview/{z}/{x}/{y}.png`
in `.env`.

#### Attribution

OpenStreetMap data is © OpenStreetMap contributors (ODbL). Every rendered map
MUST display the OSM attribution string — it is a licence requirement, not
optional. The `@hakwa/map` `<MapView />` component MUST render attribution by
default; removing or hiding it is not permitted.

#### Geocoding and routing services

- Geocoding MUST use a **self-hosted Nominatim instance** loaded with the Fiji
  OSM extract. The public `nominatim.openstreetmap.org` endpoint MUST NOT be
  used in production (usage policy forbids bulk/app use). In local development,
  a Nominatim Docker container pre-loaded with the Fiji extract is acceptable.
  Requests MUST include a `User-Agent` header identifying the Hakwa application.
- Routing MUST use a **self-hosted OSRM or Valhalla instance** loaded with the
  Fiji OSM extract. The public `router.project-osrm.org` endpoint MUST NOT be
  used beyond initial development/prototyping. The routing base URL MUST be read
  from an environment variable (`EXPO_PUBLIC_ROUTING_URL` / `VITE_ROUTING_URL`).
- Results from Nominatim and the routing engine MUST be cached server-side
  (short TTL — 60 s for geocoding, 5 min for routing) to minimise load on the
  self-hosted instances.

#### No commercial map APIs permitted

The following are explicitly forbidden across the entire repository:

- Any import or usage of `@react-native-google-maps/*`, `@googlemaps/*`,
  `@mapbox/*`, `mapbox-gl`, or Apple MapKit.
- Any environment variable or config referencing a Google Maps API key or Mapbox
  access token.
- Any hardcoded reference to `maps.googleapis.com`, `api.mapbox.com`, or
  `maps.apple.com`.

A PR introducing any of the above MUST be rejected at code review.

**Rationale**: Committing to a single open-source map stack eliminates a
significant ongoing operating cost, removes third-party data-sharing obligations
for sensitive location data, and keeps the platform viable at any scale without
billing surprises.

### XVIII. Official Documentation First

Whenever implementing anything that involves a third-party package, framework,
service, CLI tool, or protocol, the implementer MUST consult that dependency's
**official documentation online** before writing, scaffolding, or configuring
any code. This is non-negotiable.

#### What this requires

- **Installation and scaffolding**: The official "Getting Started" or
  "Installation" page MUST be checked for the current recommended command.
  Memorised `npm install` invocations or scaffolding commands from previous
  projects MUST NOT be used — they may reference renamed packages, deprecated
  CLI flags, or obsolete generators.
- **API surface**: Every function call, configuration key, hook signature, or
  schema option MUST be verified against the documentation for the version
  actually being installed. APIs change between major versions; assumptions
  about past behaviour are not acceptable.
- **Version selection**: The official changelog, release notes, and migration
  guide MUST be consulted before pinning or upgrading a version. "Latest" is the
  default starting point; downgrading MUST be explicitly justified with a
  reference to a known issue documented by the maintainers.
- **Migration paths**: When updating an existing dependency, the official
  migration guide (not community blog posts) is the authoritative source. If no
  official guide exists, the upgrade MUST be flagged as higher risk in the plan.
- **Configuration**: Default config values, recommended environment setups, and
  peer-dependency requirements MUST be sourced from the official docs — not
  inferred from framework defaults or prior project memory.

#### Scope

This principle applies to every agent, developer, or automated tool generating
code or configuration for Hakwa. It applies to:

- New package installations.
- Scaffold commands (`npx create-*`, `expo install`, framework CLIs).
- Any integration with an external service (auth providers, email, SMS, maps,
  push notifications, payment rails).
- Configuration of build tools (Vite, `tsc`, Expo, Drizzle).
- API contracts with services Hakwa calls (Nominatim, OSRM, EPN).

#### When documentation conflicts with this constitution

If the official documentation for a package recommends an approach that
contradicts a principle in this constitution (e.g., the library's scaffolder
writes inline SQL instead of using Drizzle), the **constitution's architectural
intent takes precedence**. The conflict MUST be documented in the plan's
Constitution Check section before proceeding.

**Rationale**: The root cause of most version-related bugs, deprecated API
usage, and security exposure in this codebase is implementation from memory
rather than from current documentation. Package APIs, configuration formats, CLI
flags, and recommended patterns change between major versions — sometimes
dramatically. Building from memory silently creates hidden breaking changes and
forces expensive rework. Checking the official source takes minutes; fixing a
production incident caused by an outdated API takes days.

| Layer              | Technology                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Language           | TypeScript 5.x (strict, NodeNext modules)                                                                       |
| Runtime            | Node.js (LTS)                                                                                                   |
| API Framework      | Express + `http.createServer`                                                                                   |
| WebSocket (client) | `ws` WebSocket library                                                                                          |
| Real-Time Engine   | Redis (pub/sub / Streams)                                                                                       |
| Database           | PostgreSQL via Drizzle ORM                                                                                      |
| Auth               | Better Auth with Drizzle adapter                                                                                |
| Email              | `@hakwa/email` (transactional)                                                                                  |
| Worker Threads     | Node.js `worker_threads` via `@hakwa/workers`                                                                   |
| Error Handling     | `@hakwa/errors` (`AppError` + centralised middleware)                                                           |
| Mobile Apps        | React Native + Expo (managed workflow)                                                                          |
| Web App            | React + Vite + TanStack Router                                                                                  |
| Data Fetching      | TanStack Query + Axios via `@hakwa/api-client`                                                                  |
| Shared Types       | `@hakwa/types` (API request/response contracts)                                                                 |
| Shared Logic       | `@hakwa/core` (platform-agnostic business logic)                                                                |
| Notifications      | `@hakwa/notifications` (Expo push, in-app, email, SMS)                                                          |
| Mapping            | `@hakwa/map` (`react-native-maps` + `react-leaflet` over OSM tiles; Nominatim geocoding; OSRM/Valhalla routing) |
| Design System      | `@hakwa/tokens` (slate palette, type scale, spacing, motion)                                                    |
| Package Manager    | npm workspaces (monorepo)                                                                                       |
| Build / Dev        | tsx (API) / Expo CLI (mobile) / Vite (web)                                                                      |

New dependencies MUST justify their addition against existing stack choices.
Prefer libraries that are actively maintained, have minimal transitive
dependencies, and are compatible with the NodeNext module resolution strategy.

## Development Workflow

- **Monorepo commands** run from the workspace root (`hakwa/`).
  - `npm run api-dev` — start the API in development mode.
  - `npm run db-push` — push schema changes to the database.
  - `npm run web-dev` — start the Vite web app dev server.
  - `npm run rider-dev` — start the Rider App in Expo Go (iOS/Android).
  - `npm run driver-dev` — start the Driver App in Expo Go.
  - `npm run merchant-dev` — start the Merchant App in Expo Go.
- **Redis**: The Redis connection URL MUST be provided via `REDIS_URL`
  environment variable. Redis client instantiation MUST live in a dedicated
  `@hakwa/redis` workspace package and be shared across all consumers; no
  bespoke Redis client setup is permitted in application code.
- **Schema first**: Before adding a new entity, define it in `pkg/db/schema/`
  and run `db-push`. No ad-hoc `CREATE TABLE` queries.
- **Package creation**: New shared functionality starts as a `pkg/<name>`
  workspace package with a `package.json`, `index.ts`, and `tsconfig.json`
  before any consuming code is written.
- **Environment variables**: All services read config via `dotenv/config` at
  startup. A `.env.example` MUST be kept up to date whenever variables are added
  or removed.
- **Feature branches**: Branch off `main`, name branches `###-short-description`
  (e.g., `001-wallet-payout`).

## Governance

This constitution supersedes all other ad-hoc conventions and informal
agreements. Amendments require:

1. A written proposal describing what changes and why.
2. Version increment per semantic versioning rules defined below:
   - **MAJOR** — principle removal, redefinition, or backward-incompatible
     governance change.
   - **MINOR** — new principle, new section, or materially expanded guidance.
   - **PATCH** — clarifications, wording corrections, non-semantic refinements.
3. Update of the `Last Amended` date to the amendment date.
4. Propagation check: verify plan/spec/tasks templates remain consistent.

All feature plans (`plan.md`) MUST include a Constitution Check section that
gates work on compliance with principles I–V before Phase 1 begins.

**Version**: 1.15.0 | **Ratified**: 2026-03-16 | **Last Amended**: 2026-03-17
