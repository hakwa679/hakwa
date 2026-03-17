# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See
`.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from
research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS
CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app
or NEEDS CLARIFICATION]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps
or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory,
offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS
CLARIFICATION]

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [ ] **I. Package-First** — New shared logic placed in `pkg/<name>` workspace
      package, not inlined in `api/` or `apps/`.
- [ ] **II. Type Safety** — No `any` without justification; DB types derived
      from Drizzle `$inferSelect`/`$inferInsert`; external inputs validated at
      boundary.
- [ ] **III. Security** — WebSocket endpoints require session auth; secrets from
      env only; input sanitized before use.
- [ ] **IV. Schema Contract** — New entities defined in `pkg/db/schema/` first;
      `db-push` run before consuming code is written.
- [ ] **V. Real-Time** — User-facing state changes published to Redis and
      delivered to clients via WebSocket; no direct DB polling for real-time
      events; heartbeat kept active; connection lifecycle events logged.
- [ ] **VI. Redis Package** — Redis client sourced from `@hakwa/redis` package;
      `REDIS_URL` env var configured; no bespoke Redis setup in app code.
- [ ] **VIII. Concurrency Safety** — Wallet/points mutations use
      `SELECT … FOR     UPDATE`; trip transitions use conditional updates with
      `AND status =     <expected>`; payout batches rely on unique constraint +
      no-op on conflict; multi-step Redis operations use Lua or `MULTI/EXEC`;
      external-trigger operations are idempotent.
- [ ] **IX. Webhook-First** — Inbound webhooks verify signature before
      processing, return `2xx` immediately and process async; handlers are
      idempotent; internal post-commit side effects dispatched via Redis
      Streams, not inlined in transactions; outbound dispatches from worker with
      exponential back-off; all webhook helpers sourced from `@hakwa/webhooks`.
- [ ] **X. Worker-Thread Concurrency** — CPU-bound work (fare calculation,
      payout batch, gamification scans, report generation, crypto ops) offloaded
      to `@hakwa/workers` pool; no direct `new Worker()` calls in app code;
      worker message schemas typed and validated; workers do not import Express,
      WebSocket, or Redis singletons; unhandled worker errors caught and logged.
- [ ] **XI. Unified Error Handling** — All errors thrown as `AppError` subclass
      from `@hakwa/errors`; single Express error middleware writes all HTTP
      error responses; WebSocket errors use `{ type: "error", code, message }`
      envelope; worker errors serialised and propagated as `AppError`; no stack
      traces or internals in response payloads; every boundary error logged with
      `requestId`, `code`, `httpStatus`, and `stack`.
- [ ] **XII. Frontend Architecture** — API/WS types defined in `@hakwa/types`;
      all HTTP calls via `@hakwa/api-client` Axios instance; TanStack Query
      hooks sourced from `@hakwa/api-client`; no hardcoded URLs; mobile uses
      `EXPO_PUBLIC_*` env vars; web uses `VITE_*` env vars; shared components in
      `@hakwa/ui-native` / `@hakwa/ui-web`; no duplicate type definitions across
      the frontend/backend boundary.
- [ ] **XIII. Shared-First Reuse** — No logic duplicated across apps; new
      cross-platform utilities in `@hakwa/core`; UI primitives in
      `@hakwa/ui-native` / `@hakwa/ui-web`; multi-use hooks extracted to the
      appropriate shared package; service logic in `api/src/services/`, not
      inlined in route handlers; PR includes justification for any intentional
      duplication.
- [ ] **XIV. Notification System** — All notifications persisted before
      dispatch; dispatch via Redis Stream → worker (never inline/blocking); push
      tokens stored in `device` table; user preferences respected (except
      `system_alert`); engagement triggers (gamification, trip lifecycle,
      financial, re-engagement) implemented; all senders via
      `@hakwa/notifications`; failed deliveries retried with back-off.
- [ ] **XV. UI Design System** — All colours from `@hakwa/tokens` slate palette;
      no raw colour/spacing/radius values in components; typography uses defined
      scale and weights only; single icon library; loading states shown for all
      async ops > 200 ms; motion uses token durations and respects
      `prefers-reduced-motion`; contrast ≥ 4.5:1 body / 3:1 UI; touch targets ≥
      44 × 44 pt; dark mode as primary target.
- [ ] **XVI. UX Principles** — Optimistic UI on predictable state changes;
      skeleton screens on navigation; three states designed per async op
      (loading / success / error); contextual empty states with CTA; single
      primary action per screen in thumb zone; two-step confirmation for
      destructive actions; fare shown before booking; offline banner + cached
      data on no connectivity; button labels verb-first; error messages include
      recovery action; feature tested on low-end Android at 3G before shipping.
- [ ] **XVII. Mapping** — Map UI sourced exclusively from `@hakwa/map` (no
      direct `react-native-maps`, `leaflet`, or commercial map SDK imports in
      app code); OSM tile URL from `EXPO_PUBLIC_MAP_TILE_URL` /
      `VITE_MAP_TILE_URL` env vars; geocoding via `@hakwa/map` `geocode()`
      (Nominatim); routing via `@hakwa/map` `getRoute()` (OSRM/Valhalla);
      attribution rendered on every map view; no Google Maps or Mapbox
      references anywhere in this feature's code.
- [ ] **XVIII. Official Documentation First** — every third-party package,
      framework, service, or CLI used in this feature has had its official
      online documentation consulted before any installation command,
      scaffolding, API call, or configuration was written; version selection is
      based on the current official release notes, not prior memory; any
      conflict between official docs and this constitution is documented in the
      violations section below.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |
