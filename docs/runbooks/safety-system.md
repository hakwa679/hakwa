# Safety System Runbook

## Core Jobs and Workers

- `startSafetySmsSender` consumes `safety:sms:outbox` and dispatches SMS.
- `startSafetyCheckInEscalationWorker` escalates stale pending check-ins.
- `registerTripShareExpiryCron` expires stale active share tokens.

## Redis Keys

- `safety:sos_dedup:{tripId}`: 60-second SOS dedup key.
- `safety:anomaly_cooldown:{tripId}:{type}`: 20-minute check-in cooldown.
- `safety:checkin:{checkInId}:expiry`: escalation timer key.
- `safety:sms:outbox`: Redis stream for SMS fan-out.

## Operational Alerts

- Alert when SMS worker crash loop is detected.
- Alert when escalated check-ins exceed baseline.
- Alert when `SAFETY_EVIDENCE_INVALID_TYPE` spikes.

## Incident Triage Workflow

1. Safety team lists queue with `GET /api/v1/admin/safety/incidents`.
2. Acknowledge/resolve through `PATCH /api/v1/admin/safety/incidents/:id`.
3. Confirm reporter-visible status updates in history endpoint.

## Emergency Numbers

- Police: 917
- Ambulance: 911
- Fire: 910
