import redis from "@hakwa/redis";

export type SafetyTeamEventType =
  | "safety.sos_triggered"
  | "safety.check_in_escalated"
  | "safety.critical_incident";

export interface SafetyTeamEventPayload {
  event: SafetyTeamEventType;
  incidentId: string;
  tripId?: string;
  checkInId?: string;
  reporterId?: string;
  category?: string;
  referenceCode?: string;
  at: string;
}

const SAFETY_TEAM_CHANNEL = "safety:team";

export async function publishSafetyTeamEvent(
  payload: Omit<SafetyTeamEventPayload, "at"> & { at?: string },
): Promise<void> {
  const eventPayload: SafetyTeamEventPayload = {
    ...payload,
    at: payload.at ?? new Date().toISOString(),
  };

  await redis.publish(SAFETY_TEAM_CHANNEL, JSON.stringify(eventPayload));
}

export async function publishSosTriggeredEvent(input: {
  incidentId: string;
  tripId: string;
  reporterId: string;
  referenceCode?: string;
}): Promise<void> {
  const payload: Omit<SafetyTeamEventPayload, "at"> = {
    event: "safety.sos_triggered",
    incidentId: input.incidentId,
    tripId: input.tripId,
    reporterId: input.reporterId,
  };

  if (input.referenceCode) {
    payload.referenceCode = input.referenceCode;
  }

  await publishSafetyTeamEvent({
    ...payload,
  });
}

export async function publishCheckInEscalatedEvent(input: {
  incidentId: string;
  checkInId: string;
  tripId: string;
  reporterId?: string;
  referenceCode?: string;
}): Promise<void> {
  const payload: Omit<SafetyTeamEventPayload, "at"> = {
    event: "safety.check_in_escalated",
    incidentId: input.incidentId,
    checkInId: input.checkInId,
    tripId: input.tripId,
  };

  if (input.reporterId) {
    payload.reporterId = input.reporterId;
  }

  if (input.referenceCode) {
    payload.referenceCode = input.referenceCode;
  }

  await publishSafetyTeamEvent({
    ...payload,
  });
}

export async function publishCriticalIncidentEvent(input: {
  incidentId: string;
  tripId?: string;
  reporterId?: string;
  category: string;
  referenceCode?: string;
}): Promise<void> {
  const payload: Omit<SafetyTeamEventPayload, "at"> = {
    event: "safety.critical_incident",
    incidentId: input.incidentId,
    category: input.category,
  };

  if (input.tripId) {
    payload.tripId = input.tripId;
  }

  if (input.reporterId) {
    payload.reporterId = input.reporterId;
  }

  if (input.referenceCode) {
    payload.referenceCode = input.referenceCode;
  }

  await publishSafetyTeamEvent({
    ...payload,
  });
}
