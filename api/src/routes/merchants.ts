import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { and, eq } from "drizzle-orm";
import db from "@hakwa/db";
import { merchant, vehicle, bankAccount, HolderType } from "@hakwa/db/schema";
import { requireRole } from "../middleware/requireRole.ts";
import { requireOwnMerchant } from "../middleware/requireOwnMerchant.ts";
import {
  getMerchantByUserId,
  updateMerchantProfile,
  submitForReview,
  checkDuplicateTin,
  ValidationError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../services/merchantService.ts";

export const merchantsRouter = Router();

// All merchant routes require an authenticated merchant-role user
merchantsRouter.use(requireRole("merchant"));
merchantsRouter.use(
  requireOwnMerchant as unknown as (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<void>,
);

// Helper: pull the attached merchant record from the request
function getMerchant(req: Request): typeof merchant.$inferSelect {
  const m = (req as Request & { merchantRecord?: typeof merchant.$inferSelect })
    .merchantRecord;
  if (!m)
    throw new Error("merchantRecord not attached — check middleware order");
  return m;
}

// ---------------------------------------------------------------------------
// GET /api/merchants/me — T010
// ---------------------------------------------------------------------------
merchantsRouter.get(
  "/me",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const m = getMerchant(req);
      const { merchant: fullMerchant, onboardingSteps } =
        await getMerchantByUserId(m.userId);

      res.json({
        id: fullMerchant.id,
        userId: fullMerchant.userId,
        name: fullMerchant.name,
        licenseType: fullMerchant.licenseType,
        status: fullMerchant.status,
        tin: fullMerchant.tin,
        businessRegistrationNumber: fullMerchant.businessRegistrationNumber,
        nationalId: fullMerchant.nationalId,
        phone: fullMerchant.phone,
        onboardingSteps,
      });
    } catch (err) {
      res
        .status(500)
        .json({
          code: "INTERNAL_ERROR",
          message: "Failed to retrieve merchant profile.",
        });
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/merchants/me — T011 + T021
// ---------------------------------------------------------------------------
merchantsRouter.patch(
  "/me",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const m = getMerchant(req);
      const body = req.body as Record<string, unknown>;

      const name =
        typeof body["name"] === "string" ? body["name"].trim() : undefined;
      const tin =
        typeof body["tin"] === "string" ? body["tin"].trim() : undefined;
      const businessRegistrationNumber =
        typeof body["businessRegistrationNumber"] === "string"
          ? body["businessRegistrationNumber"].trim()
          : undefined;
      const nationalId =
        typeof body["nationalId"] === "string"
          ? body["nationalId"].trim()
          : undefined;
      const phone =
        typeof body["phone"] === "string" ? body["phone"].trim() : undefined;

      // Tier-based validation (T021)
      if (m.licenseType === "licensed") {
        const resolvedTin = tin ?? m.tin;
        const resolvedBRN =
          businessRegistrationNumber ?? m.businessRegistrationNumber;
        if (!resolvedTin || !resolvedBRN) {
          next(
            new ValidationError(
              "VALIDATION_ERROR",
              "Licensed merchants must provide both TIN and business registration number.",
            ),
          );
          return;
        }
        // Duplicate TIN check (T022)
        if (tin) {
          await checkDuplicateTin(tin, m.id);
        }
      } else {
        // unlicensed
        const resolvedNationalId = nationalId ?? m.nationalId;
        if (!resolvedNationalId) {
          next(
            new ValidationError(
              "VALIDATION_ERROR",
              "Unlicensed merchants must provide a national ID.",
            ),
          );
          return;
        }
      }

      const updated = await updateMerchantProfile(m.id, {
        ...(name !== undefined && { name }),
        ...(tin !== undefined && { tin }),
        ...(businessRegistrationNumber !== undefined && {
          businessRegistrationNumber,
        }),
        ...(nationalId !== undefined && { nationalId }),
        ...(phone !== undefined && { phone }),
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/merchants/me/submit — T012
// ---------------------------------------------------------------------------
merchantsRouter.post(
  "/me/submit",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const m = getMerchant(req);
      const result = await submitForReview(m.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/merchants/me/bank-account — T023 (read side)
// ---------------------------------------------------------------------------
merchantsRouter.get(
  "/me/bank-account",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const m = getMerchant(req);
      const rows = await db
        .select()
        .from(bankAccount)
        .where(
          and(
            eq(bankAccount.holderType, HolderType.MERCHANT),
            eq(bankAccount.holderId, m.id),
          ),
        )
        .limit(1);

      res.json(rows.length > 0 ? rows[0] : null);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /api/merchants/me/bank-account — T023
// ---------------------------------------------------------------------------
merchantsRouter.put(
  "/me/bank-account",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const m = getMerchant(req);

      if (m.status === "approved") {
        next(
          new ForbiddenError(
            "NOT_EDITABLE",
            "Bank account cannot be changed after approval.",
          ),
        );
        return;
      }

      const body = req.body as Record<string, unknown>;
      const accountNumber =
        typeof body["accountNumber"] === "string"
          ? body["accountNumber"].trim()
          : null;
      const accountHolderName =
        typeof body["accountHolderName"] === "string"
          ? body["accountHolderName"].trim()
          : null;
      const bankName =
        typeof body["bankName"] === "string" ? body["bankName"].trim() : null;
      const bankCode =
        typeof body["bankCode"] === "string" ? body["bankCode"].trim() : null;
      const swiftCode =
        typeof body["swiftCode"] === "string" ? body["swiftCode"].trim() : null;

      if (
        !accountNumber ||
        !accountHolderName ||
        !bankName ||
        !bankCode ||
        !swiftCode
      ) {
        next(
          new ValidationError(
            "VALIDATION_ERROR",
            "accountNumber, accountHolderName, bankName, bankCode, and swiftCode are required.",
          ),
        );
        return;
      }

      // Upsert: delete existing and insert fresh (idempotent)
      await db
        .delete(bankAccount)
        .where(
          and(
            eq(bankAccount.holderType, HolderType.MERCHANT),
            eq(bankAccount.holderId, m.id),
          ),
        );

      const inserted = await db
        .insert(bankAccount)
        .values({
          holderType: HolderType.MERCHANT,
          holderId: m.id,
          accountNumber,
          accountHolderName,
          bankName,
          backCode: bankCode,
          swiftCode,
        })
        .returning();

      res.json(inserted[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/merchants/me/vehicles — T026
// ---------------------------------------------------------------------------
merchantsRouter.get(
  "/me/vehicles",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const m = getMerchant(req);
      const vehicles = await db
        .select()
        .from(vehicle)
        .where(eq(vehicle.merchantId, m.id));

      res.json({ vehicles });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/merchants/me/vehicles — T027
// ---------------------------------------------------------------------------
merchantsRouter.post(
  "/me/vehicles",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const m = getMerchant(req);
      const body = req.body as Record<string, unknown>;

      const make =
        typeof body["make"] === "string" ? body["make"].trim() : null;
      const model =
        typeof body["model"] === "string" ? body["model"].trim() : null;
      const year = typeof body["year"] === "number" ? body["year"] : null;
      const registrationPlate =
        typeof body["registrationPlate"] === "string"
          ? body["registrationPlate"].trim().toUpperCase()
          : null;
      const seatingCapacity =
        typeof body["seatingCapacity"] === "number"
          ? body["seatingCapacity"]
          : null;
      const color =
        typeof body["color"] === "string" ? body["color"].trim() : null;

      if (!make || !model || !year || !registrationPlate || !seatingCapacity) {
        next(
          new ValidationError(
            "VALIDATION_ERROR",
            "make, model, year, registrationPlate, and seatingCapacity are required.",
          ),
        );
        return;
      }

      try {
        const inserted = await db
          .insert(vehicle)
          .values({
            merchantId: m.id,
            make,
            model,
            year,
            registrationPlate,
            seatingCapacity,
            color: color ?? null,
          })
          .returning();

        res.status(201).json(inserted[0]);
      } catch (dbErr: unknown) {
        // Unique constraint violation on registrationPlate
        const msg =
          typeof dbErr === "object" && dbErr !== null && "message" in dbErr
            ? String((dbErr as { message: unknown }).message)
            : "";
        if (msg.includes("registration_plate") || msg.includes("unique")) {
          next(
            new ConflictError(
              "PLATE_ALREADY_EXISTS",
              "A vehicle with this registration plate is already registered.",
            ),
          );
          return;
        }
        throw dbErr;
      }
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/merchants/me/vehicles/:vehicleId — T028
// ---------------------------------------------------------------------------
merchantsRouter.patch(
  "/me/vehicles/:vehicleId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const m = getMerchant(req);
      const { vehicleId } = req.params as { vehicleId: string };

      const existing = await db
        .select()
        .from(vehicle)
        .where(and(eq(vehicle.id, vehicleId), eq(vehicle.merchantId, m.id)))
        .limit(1);

      if (existing.length === 0) {
        next(new NotFoundError("Vehicle not found."));
        return;
      }

      const body = req.body as Record<string, unknown>;

      const updates: Partial<typeof vehicle.$inferInsert> = {};
      if (typeof body["make"] === "string") updates.make = body["make"].trim();
      if (typeof body["model"] === "string")
        updates.model = body["model"].trim();
      if (typeof body["year"] === "number") updates.year = body["year"];
      if (typeof body["registrationPlate"] === "string")
        updates.registrationPlate = body["registrationPlate"]
          .trim()
          .toUpperCase();
      if (typeof body["seatingCapacity"] === "number")
        updates.seatingCapacity = body["seatingCapacity"];
      if (typeof body["color"] === "string")
        updates.color = body["color"].trim();
      if (typeof body["isActive"] === "boolean")
        updates.isActive = body["isActive"];

      if (Object.keys(updates).length === 0) {
        res.json(existing[0]);
        return;
      }

      const updated = await db
        .update(vehicle)
        .set(updates)
        .where(and(eq(vehicle.id, vehicleId), eq(vehicle.merchantId, m.id)))
        .returning();

      res.json(updated[0]);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/merchants/me/vehicles/:vehicleId — contract endpoint
// ---------------------------------------------------------------------------
merchantsRouter.delete(
  "/me/vehicles/:vehicleId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const m = getMerchant(req);
      const { vehicleId } = req.params as { vehicleId: string };

      if (m.status !== "draft") {
        next(
          new ForbiddenError(
            "NOT_EDITABLE",
            "Vehicles cannot be removed after submission.",
          ),
        );
        return;
      }

      const existing = await db
        .select()
        .from(vehicle)
        .where(and(eq(vehicle.id, vehicleId), eq(vehicle.merchantId, m.id)))
        .limit(1);

      if (existing.length === 0) {
        next(new NotFoundError("Vehicle not found."));
        return;
      }

      await db
        .delete(vehicle)
        .where(and(eq(vehicle.id, vehicleId), eq(vehicle.merchantId, m.id)));

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
