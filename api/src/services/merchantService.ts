import { and, eq, ne } from "drizzle-orm";
import db from "@hakwa/db";
import {
  merchant,
  vehicle,
  bankAccount,
  user as userTable,
  HolderType,
} from "@hakwa/db/schema";
import { sendNotification } from "@hakwa/notifications";
import type { MerchantStatus } from "../types/merchant.ts";

// ---------------------------------------------------------------------------
// Error classes — used across merchant routes
// ---------------------------------------------------------------------------

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(code: string, message: string) {
    super(422, code, message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
    this.name = "ConflictError";
  }
}

export class ForbiddenError extends AppError {
  constructor(code: string, message: string) {
    super(403, code, message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, "NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Onboarding step computation
// ---------------------------------------------------------------------------

export interface OnboardingSteps {
  businessDetails: boolean;
  bankAccount: boolean;
  vehicle: boolean;
}

export function computeOnboardingSteps(
  m: typeof merchant.$inferSelect,
  hasBankAccount: boolean,
  vehicleCount: number,
): OnboardingSteps {
  const isLicensed = m.licenseType === "licensed";

  const businessDetails = isLicensed
    ? !!(m.name && m.tin && m.businessRegistrationNumber)
    : !!(m.name && m.nationalId);

  return {
    businessDetails,
    bankAccount: hasBankAccount,
    vehicle: vehicleCount > 0,
  };
}

// ---------------------------------------------------------------------------
// getMerchantByUserId
// ---------------------------------------------------------------------------

/** Returns the merchant + onboarding step flags for the given userId. */
export async function getMerchantByUserId(userId: string): Promise<{
  merchant: typeof merchant.$inferSelect;
  onboardingSteps: OnboardingSteps;
}> {
  const row = await db
    .select()
    .from(merchant)
    .where(eq(merchant.userId, userId))
    .limit(1);

  if (row.length === 0) {
    throw new NotFoundError("Merchant record not found for this user.");
  }

  const m = row[0]!;

  const bankRows = await db
    .select({ id: bankAccount.id })
    .from(bankAccount)
    .where(
      and(
        eq(bankAccount.holderType, HolderType.MERCHANT),
        eq(bankAccount.holderId, m.id),
      ),
    )
    .limit(1);

  const vehicleRows = await db
    .select({ id: vehicle.id })
    .from(vehicle)
    .where(and(eq(vehicle.merchantId, m.id), eq(vehicle.isActive, true)))
    .limit(1);

  const onboardingSteps = computeOnboardingSteps(
    m,
    bankRows.length > 0,
    vehicleRows.length,
  );

  return { merchant: m, onboardingSteps };
}

// ---------------------------------------------------------------------------
// updateMerchantProfile
// ---------------------------------------------------------------------------

export type MerchantProfileUpdate = Partial<{
  name: string;
  tin: string;
  businessRegistrationNumber: string;
  nationalId: string;
  phone: string;
}>;

/** Update allowed business-detail fields. Only permitted in draft / under_review. */
export async function updateMerchantProfile(
  merchantId: string,
  data: MerchantProfileUpdate,
): Promise<typeof merchant.$inferSelect> {
  const existing = await db
    .select()
    .from(merchant)
    .where(eq(merchant.id, merchantId))
    .limit(1);

  if (existing.length === 0) {
    throw new NotFoundError("Merchant not found.");
  }

  const m = existing[0]!;

  if (m.status === "approved") {
    throw new ForbiddenError(
      "NOT_EDITABLE",
      "Merchant profile is approved and cannot be edited.",
    );
  }

  const updated = await db
    .update(merchant)
    .set(data)
    .where(eq(merchant.id, merchantId))
    .returning();

  return updated[0]!;
}

// ---------------------------------------------------------------------------
// checkOnboardingCompletion
// ---------------------------------------------------------------------------

/** Returns true when all three onboarding sections are filled. */
export async function checkOnboardingCompletion(
  merchantId: string,
): Promise<boolean> {
  const row = await db
    .select()
    .from(merchant)
    .where(eq(merchant.id, merchantId))
    .limit(1);

  if (row.length === 0) return false;

  const m = row[0]!;

  const bankRows = await db
    .select({ id: bankAccount.id })
    .from(bankAccount)
    .where(
      and(
        eq(bankAccount.holderType, HolderType.MERCHANT),
        eq(bankAccount.holderId, merchantId),
      ),
    )
    .limit(1);

  const vehicleRows = await db
    .select({ id: vehicle.id })
    .from(vehicle)
    .where(and(eq(vehicle.merchantId, merchantId), eq(vehicle.isActive, true)))
    .limit(1);

  const steps = computeOnboardingSteps(
    m,
    bankRows.length > 0,
    vehicleRows.length,
  );
  return steps.businessDetails && steps.bankAccount && steps.vehicle;
}

// ---------------------------------------------------------------------------
// submitForReview — T012 + T033
// ---------------------------------------------------------------------------

/** Validate completion, transition to under_review, and notify admins. */
export async function submitForReview(
  merchantId: string,
): Promise<{ status: MerchantStatus }> {
  const row = await db
    .select()
    .from(merchant)
    .where(eq(merchant.id, merchantId))
    .limit(1);

  if (row.length === 0) {
    throw new NotFoundError("Merchant not found.");
  }

  const m = row[0]!;

  const alreadySubmitted: MerchantStatus[] = [
    "under_review",
    "approved",
    "rejected",
    "suspended_pending_review",
  ];
  if (alreadySubmitted.includes(m.status)) {
    throw new ConflictError(
      "ALREADY_SUBMITTED",
      "Merchant has already been submitted for review.",
    );
  }

  const complete = await checkOnboardingCompletion(merchantId);
  if (!complete) {
    throw new ValidationError(
      "INCOMPLETE_ONBOARDING",
      "All onboarding sections (business details, bank account, and vehicle) must be completed before submitting.",
    );
  }

  // Transition status
  await db
    .update(merchant)
    .set({ status: "under_review" })
    .where(eq(merchant.id, merchantId));

  // Dispatch admin notification post-commit (non-blocking) — T033
  notifyAdminsOfNewSubmission(merchantId, m.name).catch((err: unknown) => {
    console.error("[merchantService] admin notification failed", {
      merchantId,
      err,
    });
  });

  return { status: "under_review" };
}

/** Send in-app + push system_alert to all admin users. */
async function notifyAdminsOfNewSubmission(
  merchantId: string,
  merchantName: string,
): Promise<void> {
  const admins = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.role, "admin"));

  await Promise.all(
    admins.map((admin) =>
      sendNotification(
        admin.id,
        "system_alert",
        {
          channel: "in_app",
          title: "New merchant submitted for review",
          body: `${merchantName} has submitted their onboarding for review.`,
          data: { screen: "AdminMerchantReview", merchantId },
        },
        `merchant_submitted:${merchantId}:${admin.id}`,
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// checkDuplicateTin — T022
// ---------------------------------------------------------------------------

/** Throws ConflictError if TIN is already registered to a different merchant. */
export async function checkDuplicateTin(
  tin: string,
  excludeMerchantId: string,
): Promise<void> {
  const rows = await db
    .select({ id: merchant.id })
    .from(merchant)
    .where(and(eq(merchant.tin, tin), ne(merchant.id, excludeMerchantId)))
    .limit(1);

  if (rows.length > 0) {
    throw new ConflictError(
      "TIN_ALREADY_REGISTERED",
      "This TIN is already registered to another merchant.",
    );
  }
}
