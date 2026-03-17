export class MapAppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MapAppError";
  }
}

export class MapValidationError extends MapAppError {
  constructor(code: string, message: string) {
    super(422, code, message);
    this.name = "MapValidationError";
  }
}

export class MapConflictError extends MapAppError {
  constructor(code: string, message: string) {
    super(409, code, message);
    this.name = "MapConflictError";
  }
}

export class MapForbiddenError extends MapAppError {
  constructor(code: string, message: string) {
    super(403, code, message);
    this.name = "MapForbiddenError";
  }
}

export class MapNotFoundError extends MapAppError {
  constructor(code: string, message: string) {
    super(404, code, message);
    this.name = "MapNotFoundError";
  }
}

export const MAP_ERROR_CODES = {
  MAP_OUT_OF_BOUNDS: "MAP_OUT_OF_BOUNDS",
  MAP_DAILY_LIMIT_REACHED: "MAP_DAILY_LIMIT_REACHED",
  MAP_ALREADY_VOTED: "MAP_ALREADY_VOTED",
  MAP_VOTING_CLOSED: "MAP_VOTING_CLOSED",
  MAP_PHOTO_TOO_LARGE: "MAP_PHOTO_TOO_LARGE",
  MAP_TRACE_OPT_IN_REQUIRED: "MAP_TRACE_OPT_IN_REQUIRED",
  MAP_CONTENT_VIOLATION: "MAP_CONTENT_VIOLATION",
  MAP_USER_MAP_BANNED: "MAP_USER_MAP_BANNED",
  MAP_ALREADY_REPORTED: "MAP_ALREADY_REPORTED",
  MAP_CANNOT_REPORT_OWN: "MAP_CANNOT_REPORT_OWN",
} as const;

export type MapErrorCode =
  (typeof MAP_ERROR_CODES)[keyof typeof MAP_ERROR_CODES];
