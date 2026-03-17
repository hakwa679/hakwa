export const REVIEW_ERROR_CODES = {
  REVIEW_ALREADY_SUBMITTED: "REVIEW_ALREADY_SUBMITTED",
  REVIEW_TRIP_NOT_FOUND: "REVIEW_TRIP_NOT_FOUND",
  REVIEW_WINDOW_CLOSED: "REVIEW_WINDOW_CLOSED",
  REVIEW_TRIP_NOT_COMPLETED: "REVIEW_TRIP_NOT_COMPLETED",
  REVIEW_INVALID_RATING: "REVIEW_INVALID_RATING",
  REVIEW_INVALID_TAG: "REVIEW_INVALID_TAG",
  REVIEW_COMMENT_TOO_LONG: "REVIEW_COMMENT_TOO_LONG",
  REVIEW_NOT_PARTICIPANT: "REVIEW_NOT_PARTICIPANT",
  REVIEW_USER_NOT_FOUND: "REVIEW_USER_NOT_FOUND",
} as const;

export type ReviewErrorCode =
  (typeof REVIEW_ERROR_CODES)[keyof typeof REVIEW_ERROR_CODES];

export const REVIEW_ERROR_HTTP_STATUS: Record<ReviewErrorCode, number> = {
  REVIEW_ALREADY_SUBMITTED: 409,
  REVIEW_TRIP_NOT_FOUND: 404,
  REVIEW_WINDOW_CLOSED: 410,
  REVIEW_TRIP_NOT_COMPLETED: 422,
  REVIEW_INVALID_RATING: 422,
  REVIEW_INVALID_TAG: 422,
  REVIEW_COMMENT_TOO_LONG: 422,
  REVIEW_NOT_PARTICIPANT: 403,
  REVIEW_USER_NOT_FOUND: 404,
};

export class ReviewAppError extends Error {
  constructor(
    public readonly code: ReviewErrorCode,
    message: string,
    public readonly statusCode: number = REVIEW_ERROR_HTTP_STATUS[code],
  ) {
    super(message);
    this.name = "ReviewAppError";
  }
}

export function isReviewErrorCode(code: string): code is ReviewErrorCode {
  return Object.values(REVIEW_ERROR_CODES).includes(code as ReviewErrorCode);
}
