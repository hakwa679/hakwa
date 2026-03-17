## Implementation Plan: Hakwa Maps - Crowdsourced Data Collection

**Branch**: `009-hakwa-maps-crowdsourcing` | **Date**: 2026-03-17 | **Spec**:
`specs/009-hakwa-maps-crowdsourcing/spec.md`  
**Input**: Feature specification from
`specs/009-hakwa-maps-crowdsourcing/spec.md`

## Summary

Deliver a production-safe crowdsourced mapping loop for Fiji that lets
authenticated riders and drivers submit map features, verify community
submissions, and earn map-specific gamification rewards while preserving data
quality through moderation and trust controls. The implementation uses additive
Drizzle schema changes in `@hakwa/db`, strict typed API contracts in
`@hakwa/types`, Redis for leaderboard/cache/invalidations, worker offloading for
asynchronous processing, and shared geometry/validation utilities in
`@hakwa/core`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 20+ and Expo/React app
clients  
**Primary Dependencies**: Express, Drizzle ORM, Redis, ws, TanStack Query,
Axios, Expo AsyncStorage, React Native NetInfo  
**Storage**: PostgreSQL (primary), Redis (sorted sets, cache, stream/pub-sub),
AsyncStorage (mobile offline queue)  
**Testing**: Vitest/Jest style unit tests, API integration tests, concurrency
tests for lock-sensitive flows, contract tests for map endpoints  
**Target Platform**: Backend Linux containers and web/mobile clients (React Vite

- React Native Expo)  
  **Project Type**: Monorepo platform feature spanning backend service, worker,
  shared packages, and client apps  
  **Performance Goals**: Submit endpoint <= 200 ms P99; content screening <= 50
  ms P99 overhead; pending bbox query <= 500 ms for 1k features; active layer
  served from Redis cache with 60 s TTL  
  **Constraints**: Fiji bbox validation (including antimeridian handling),
  offline-capable mobile enqueue/drain, strict anti-abuse rate limits and ban
  checks, no direct DB polling for realtime updates  
  **Scale/Scope**: Fiji-wide mapping dataset, top-50 monthly leaderboard, 20/day
  contribution cap and 200/day verification cap per user, feature scope includes
  contributor flow + moderation + missions + zone progression

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **I. Package-First** — New shared logic placed in `pkg/<name>` workspace
      package, not inlined in `api/` or `apps/`.
- [x] **II. Type Safety** — No `any` without justification; DB types derived
      from Drizzle `$inferSelect`/`$inferInsert`; external inputs validated at
      boundary.
- [x] **III. Security** — WebSocket endpoints require session auth; secrets from
      env only; input sanitized before use.
- [x] **IV. Schema Contract** — New entities defined in `pkg/db/schema/` first;
      `db-push` run before consuming code is written.
- [x] **V. Real-Time** — User-facing state changes published to Redis and
      delivered to clients via WebSocket; no direct DB polling for real-time
      events; heartbeat kept active; connection lifecycle events logged.
- [x] **VI. Redis Package** — Redis client sourced from `@hakwa/redis` package;
      `REDIS_URL` env var configured; no bespoke Redis setup in app code.
- [x] **VIII. Concurrency Safety** — Wallet/points mutations use
      `SELECT … FOR     UPDATE`; trip transitions use conditional updates with
      `AND status =     <expected>`; payout batches rely on unique constraint +
      no-op on conflict; multi-step Redis operations use Lua or `MULTI/EXEC`;
      external-trigger operations are idempotent.
- [x] **IX. Webhook-First** — Inbound webhooks verify signature before
      processing, return `2xx` immediately and process async; handlers are
      idempotent; internal post-commit side effects dispatched via Redis
      Streams, not inlined in transactions; outbound dispatches from worker with
      exponential back-off; all webhook helpers sourced from `@hakwa/webhooks`.
- [x] **X. Worker-Thread Concurrency** — CPU-bound work (fare calculation,
      payout batch, gamification scans, report generation, crypto ops) offloaded
      to `@hakwa/workers` pool; no direct `new Worker()` calls in app code;
      worker message schemas typed and validated; workers do not import Express,
      WebSocket, or Redis singletons; unhandled worker errors caught and logged.
- [x] **XI. Unified Error Handling** — All errors thrown as `AppError` subclass
      from `@hakwa/errors`; single Express error middleware writes all HTTP
      error responses; WebSocket errors use `{ type: "error", code, message }`
      envelope; worker errors serialised and propagated as `AppError`; no stack
      traces or internals in response payloads; every boundary error logged with
      `requestId`, `code`, `httpStatus`, and `stack`.
- [x] **XII. Frontend Architecture** — API/WS types defined in `@hakwa/types`;
      all HTTP calls via `@hakwa/api-client` Axios instance; TanStack Query
      hooks sourced from `@hakwa/api-client`; no hardcoded URLs; mobile uses
      `EXPO_PUBLIC_*` env vars; web uses `VITE_*` env vars; shared components in
      `@hakwa/ui-native` / `@hakwa/ui-web`; no duplicate type definitions across
      the frontend/backend boundary.
- [x] **XIII. Shared-First Reuse** — No logic duplicated across apps; new
      cross-platform utilities in `@hakwa/core`; UI primitives in
      `@hakwa/ui-native` / `@hakwa/ui-web`; multi-use hooks extracted to the
      appropriate shared package; service logic in `api/src/services/`, not
      inlined in route handlers; PR includes justification for any intentional
      duplication.
- [x] **XIV. Notification System** — All notifications persisted before
      dispatch; dispatch via Redis Stream → worker (never inline/blocking); push
      tokens stored in `device` table; user preferences respected (except
      `system_alert`); engagement triggers (gamification, trip lifecycle,
      financial, re-engagement) implemented; all senders via
      `@hakwa/notifications`; failed deliveries retried with back-off.
- [x] **XV. UI Design System** — All colours from `@hakwa/tokens` slate palette;
      no raw colour/spacing/radius values in components; typography uses defined
      scale and weights only; single icon library; loading states shown for all
      async ops > 200 ms; motion uses token durations and respects
      `prefers-reduced-motion`; contrast ≥ 4.5:1 body / 3:1 UI; touch targets ≥
      44 × 44 pt; dark mode as primary target.
- [x] **XVI. UX Principles** — Optimistic UI on predictable state changes;
      skeleton screens on navigation; three states designed per async op
      (loading / success / error); contextual empty states with CTA; single
      primary action per screen in thumb zone; two-step confirmation for
      destructive actions; fare shown before booking; offline banner + cached
      data on no connectivity; button labels verb-first; error messages include
      recovery action; feature tested on low-end Android at 3G before shipping.
- [x] **XVII. Mapping** — Map UI sourced exclusively from `@hakwa/map` (no
      direct `react-native-maps`, `leaflet`, or commercial map SDK imports in
      app code); OSM tile URL from `EXPO_PUBLIC_MAP_TILE_URL` /
      `VITE_MAP_TILE_URL` env vars; geocoding via `@hakwa/map` `geocode()`
      (Nominatim); routing via `@hakwa/map` `getRoute()` (OSRM/Valhalla);
      attribution rendered on every map view; no Google Maps or Mapbox
      references anywhere in this feature's code.
- [x] **XVIII. Official Documentation First** — every third-party package,
      framework, service, or CLI used in this feature has had its official
      online documentation consulted before any installation command,
      scaffolding, API call, or configuration was written; version selection is
      based on the current official release notes, not prior memory; any
      conflict between official docs and this constitution is documented in the
      violations section below.

### Post-Design Re-check

- Phase 0 research resolved all technical ambiguities without introducing
  constitutional violations.
- Phase 1 artifacts (`data-model.md`, `contracts/rest-api.md`, `quickstart.md`)
  remain aligned with package-first and shared-first boundaries.
- No constitution exceptions required.

## Project Structure

### Documentation (this feature)

```text
specs/009-hakwa-maps-crowdsourcing/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── rest-api.md
└── tasks.md
```

### Source Code (repository root)

```text
api/
├── src/
│   ├── routes/
│   ├── services/
│   ├── jobs/
│   └── middleware/

apps/
├── mobile/
│   ├── passenger/
│   └── driver/
└── web/
      └── src/

pkg/
├── core/
├── db/
├── types/
├── api-client/
├── auth/
├── auth-client/
├── redis/
└── notifications/

workers/
└── src/
```

**Structure Decision**: Multi-app monorepo extension. Database schema and
cross-platform utilities are implemented in `pkg/`, request orchestration in
`api/src/services`, async and compute-heavy flows in `workers/src`, and user
flows in `apps/mobile/*` and `apps/web/src` using shared API/client/type
packages.

## Complexity Tracking

No constitution violations identified.
