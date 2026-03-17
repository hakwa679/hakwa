# Runbook: Gamified Review & Rating

## Seed prerequisites

1. Run database push:
   - npm run db-push
2. Start API:
   - npm run api-dev
3. Verify review tag seed logs:
   - [seed] review tags inserted

## Key endpoints

- GET /api/v1/reviews/tags
- POST /api/v1/reviews
- GET /api/v1/reviews/trip/:tripId
- GET /api/v1/reviews/me
- GET /api/v1/reviews/user/:userId
- GET /api/v1/reviews/me/dashboard

## Background jobs

- Review reminder cron: hourly, 6h before window close.
- Weekly review mission reset cron: Monday 00:00 Fiji time.

## Observability

- Review telemetry hash per day:
  - review:metrics:YYYY-MM-DD
  - fields: submissions, submitLatencyMsTotal
- Reveal pub/sub channel:
  - review:revealed:{userId}

## Common checks

1. Duplicate review prevention:
   - verify unique (trip_id, direction)
2. Ledger idempotency:
   - verify unique (account_id, source_action, reference_id)
3. Reveal behavior:
   - counterpart submit OR counterpart window expiry
