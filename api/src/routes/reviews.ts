import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { getSessionFromRequest } from "@hakwa/auth";
import { isReviewErrorCode, REVIEW_ERROR_HTTP_STATUS } from "@hakwa/errors";
import type { ReviewDirection, SubmitReviewRequest } from "@hakwa/types";
import {
  getMyDriverDashboard,
  getDriverSignal,
  getPassengerSignal,
  getReviewTags,
  getTripReviews,
  getUserReputation,
  submitReview,
} from "../services/reviewService.ts";

export const reviewsRouter = Router();

async function requireAuth(
  req: Request,
  res: Response,
): Promise<{ id: string; role?: string } | null> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    res
      .status(401)
      .json({ code: "UNAUTHORIZED", message: "Authentication required." });
    return null;
  }

  const roleValue = (session.user as Record<string, unknown>)["role"];
  return typeof roleValue === "string"
    ? { id: session.user.id, role: roleValue }
    : { id: session.user.id };
}

function readPathParam(
  value: string | string[] | undefined,
  name: string,
): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error(`Missing required path param: ${name}`);
}

function maybeReviewErrorCode(
  error: unknown,
): keyof typeof REVIEW_ERROR_HTTP_STATUS | null {
  if (typeof error !== "object" || error === null) return null;
  const maybeCode = (error as { code?: string }).code;
  if (!maybeCode) return null;
  return isReviewErrorCode(maybeCode)
    ? (maybeCode as keyof typeof REVIEW_ERROR_HTTP_STATUS)
    : null;
}

reviewsRouter.get(
  "/tags",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = await requireAuth(req, res);
      if (!actor) return;

      const directionParam = req.query["direction"];
      const direction =
        directionParam === "passenger_to_driver" ||
        directionParam === "driver_to_passenger"
          ? (directionParam as ReviewDirection)
          : undefined;

      const includeNegative =
        req.query["includeNegative"] === "true" ||
        req.query["includeNegative"] === "1";

      const tags = await getReviewTags(
        direction ? { direction, includeNegative } : { includeNegative },
      );
      res.status(200).json({ tags });
    } catch (error) {
      next(error);
    }
  },
);

reviewsRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = await requireAuth(req, res);
      if (!actor) return;

      const body = req.body as SubmitReviewRequest;

      const response = await submitReview({
        reviewerUserId: actor.id,
        tripId: body.tripId,
        rating: body.rating,
        ...(body.tagKeys ? { tagKeys: body.tagKeys } : {}),
        ...(typeof body.comment === "string" ? { comment: body.comment } : {}),
      });

      res.status(201).json(response);
    } catch (error) {
      const code = maybeReviewErrorCode(error);
      if (error instanceof Error && code) {
        res
          .status(REVIEW_ERROR_HTTP_STATUS[code])
          .json({ code, message: error.message });
        return;
      }
      next(error);
    }
  },
);

reviewsRouter.get(
  "/trip/:tripId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = await requireAuth(req, res);
      if (!actor) return;

      const payload = await getTripReviews({
        tripId: readPathParam(req.params.tripId, "tripId"),
        viewerUserId: actor.id,
      });

      res.status(200).json(payload);
    } catch (error) {
      const code = maybeReviewErrorCode(error);
      if (error instanceof Error && code) {
        res
          .status(REVIEW_ERROR_HTTP_STATUS[code])
          .json({ code, message: error.message });
        return;
      }
      next(error);
    }
  },
);

reviewsRouter.get(
  "/me",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = await requireAuth(req, res);
      if (!actor) return;

      const payload = await getUserReputation({
        userId: actor.id,
        viewerUserId: actor.id,
        includeReviewerStats: true,
      });

      res.status(200).json(payload);
    } catch (error) {
      const code = maybeReviewErrorCode(error);
      if (error instanceof Error && code) {
        res
          .status(REVIEW_ERROR_HTTP_STATUS[code])
          .json({ code, message: error.message });
        return;
      }
      next(error);
    }
  },
);

reviewsRouter.get(
  "/user/:userId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = await requireAuth(req, res);
      if (!actor) return;

      const payload = await getUserReputation({
        userId: readPathParam(req.params.userId, "userId"),
        viewerUserId: actor.id,
        includeReviewerStats: false,
      });

      res.status(200).json(payload);
    } catch (error) {
      const code = maybeReviewErrorCode(error);
      if (error instanceof Error && code) {
        res
          .status(REVIEW_ERROR_HTTP_STATUS[code])
          .json({ code, message: error.message });
        return;
      }
      next(error);
    }
  },
);

reviewsRouter.get(
  "/passenger-signal/:userId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = await requireAuth(req, res);
      if (!actor) return;

      const payload = await getPassengerSignal(
        readPathParam(req.params.userId, "userId"),
      );
      res.status(200).json(payload);
    } catch (error) {
      const code = maybeReviewErrorCode(error);
      if (error instanceof Error && code) {
        res
          .status(REVIEW_ERROR_HTTP_STATUS[code])
          .json({ code, message: error.message });
        return;
      }
      next(error);
    }
  },
);

reviewsRouter.get(
  "/me/dashboard",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = await requireAuth(req, res);
      if (!actor) return;

      if (actor.role !== "driver" && actor.role !== "operator") {
        res.status(403).json({
          code: "FORBIDDEN",
          message: "Driver role required for dashboard.",
        });
        return;
      }

      const payload = await getMyDriverDashboard(actor.id);
      res.status(200).json(payload);
    } catch (error) {
      const code = maybeReviewErrorCode(error);
      if (error instanceof Error && code) {
        res
          .status(REVIEW_ERROR_HTTP_STATUS[code])
          .json({ code, message: error.message });
        return;
      }
      next(error);
    }
  },
);

reviewsRouter.get(
  "/driver-signal/:userId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = await requireAuth(req, res);
      if (!actor) return;

      const payload = await getDriverSignal(
        readPathParam(req.params.userId, "userId"),
      );
      res.status(200).json(payload);
    } catch (error) {
      const code = maybeReviewErrorCode(error);
      if (error instanceof Error && code) {
        res
          .status(REVIEW_ERROR_HTTP_STATUS[code])
          .json({ code, message: error.message });
        return;
      }
      next(error);
    }
  },
);
