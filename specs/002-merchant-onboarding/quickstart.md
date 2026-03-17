# Quickstart: Merchant Onboarding

_Phase 1 output for `002-merchant-onboarding`_

---

## Prerequisites

1. Spec 001 (User Registration & Auth) must be deployed — merchants sign in with
   `role = 'merchant'`.
2. PostgreSQL running; `DATABASE_URL` set.
3. Redis running; `REDIS_URL` set (notification dispatch).
4. `@hakwa/notifications` package available (for submit-for-review alert).

---

## Step 1 — Extend the Schema

Add `userId`, `licenseType`, `status`, `nationalId`, `phone` to `merchant`;
create the `vehicle` table.

In `pkg/db/schema/merchant.ts`:

```ts
export type MerchantStatus =
  | "draft"
  | "under_review"
  | "approved"
  | "rejected"
  | "suspended_pending_review";

export type LicenseType = "licensed" | "unlicensed";

export const merchant = pgTable("merchant", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  licenseType: text("license_type").notNull().$type<LicenseType>(),
  status: text("status").notNull().default("draft").$type<MerchantStatus>(),
  tin: varchar("tin", { length: 50 }),
  businessRegistrationNumber: varchar("business_registration_number", {
    length: 50,
  }),
  nationalId: varchar("national_id", { length: 50 }),
  phone: varchar("phone", { length: 30 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const vehicle = pgTable(
  "vehicle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchant.id, { onDelete: "cascade" }),
    make: varchar("make", { length: 80 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    year: smallint("year").notNull(),
    registrationPlate: varchar("registration_plate", { length: 20 })
      .notNull()
      .unique(),
    seatingCapacity: smallint("seating_capacity").notNull(),
    color: varchar("color", { length: 40 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("vehicle_merchant_idx").on(t.merchantId)],
);
```

Apply:

```bash
npm run db-push
```

---

## Step 2 — Create the Merchant Service

`api/src/services/merchantService.ts` handles all business logic:

```ts
import { db } from "@hakwa/db";
import { merchant, vehicle } from "@hakwa/db/schema/merchant";
import { bankAccount } from "@hakwa/db/schema/wallet";
import { triggerNotification } from "@hakwa/notifications";
import { eq, and } from "drizzle-orm";

export async function checkOnboardingCompletion(merchantId: string) {
  const [m, bank, vehicles] = await Promise.all([
    db.select().from(merchant).where(eq(merchant.id, merchantId)).limit(1),
    db
      .select()
      .from(bankAccount)
      .where(
        and(
          eq(bankAccount.holderType, "merchant"),
          eq(bankAccount.holderId, merchantId),
        ),
      )
      .limit(1),
    db
      .select()
      .from(vehicle)
      .where(eq(vehicle.merchantId, merchantId))
      .limit(1),
  ]);
  const record = m[0];
  const businessComplete =
    record.licenseType === "licensed"
      ? !!(record.tin && record.businessRegistrationNumber)
      : !!record.nationalId;
  return {
    businessDetails: businessComplete,
    bankAccount: bank.length > 0,
    vehicle: vehicles.length > 0,
  };
}

export async function submitForReview(merchantId: string) {
  const steps = await checkOnboardingCompletion(merchantId);
  if (!steps.businessDetails || !steps.bankAccount || !steps.vehicle) {
    throw new ValidationError(
      "INCOMPLETE_ONBOARDING",
      "Complete all onboarding steps first.",
    );
  }
  await db
    .update(merchant)
    .set({ status: "under_review", updatedAt: new Date() })
    .where(eq(merchant.id, merchantId));
  // Post-commit notification dispatch (async, non-blocking)
  setImmediate(() =>
    triggerNotification({
      type: "merchant_submitted_for_review",
      referenceId: merchantId,
      targetRole: "admin",
    }),
  );
}
```

---

## Step 3 — Register API Routes

`api/src/routes/merchants.ts`:

```ts
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.ts";
import * as merchantService from "../services/merchantService.ts";

const router = Router();
router.use(requireAuth, requireRole("merchant"));

router.get("/me", async (req, res, next) => {
  /* ... */
});
router.patch("/me", async (req, res, next) => {
  /* ... */
});
router.post("/me/submit", async (req, res, next) => {
  /* ... */
});
router.put("/me/bank-account", async (req, res, next) => {
  /* ... */
});
router.get("/me/vehicles", async (req, res, next) => {
  /* ... */
});
router.post("/me/vehicles", async (req, res, next) => {
  /* ... */
});
router.patch("/me/vehicles/:vehicleId", async (req, res, next) => {
  /* ... */
});
router.delete("/me/vehicles/:vehicleId", async (req, res, next) => {
  /* ... */
});

export default router;
```

Mount in `api/src/index.ts`:

```ts
import merchantRoutes from "./routes/merchants.ts";
app.use("/api/merchants", merchantRoutes);
```

---

## Step 4 — Merchant App Wizard Flow

In `apps/mobile/merchant/src/screens/onboarding/`:

1. `LicenseTypeScreen` — collect `licenseType` (licensed / unlicensed).
2. `BusinessDetailsScreen` — TIN + LTA number (licensed) OR national ID
   (unlicensed).
3. `BankAccountScreen` — bank details form.
4. `VehicleScreen` — add first vehicle.
5. `ReviewScreen` — summary + "Submit for review" CTA.

Each screen calls the relevant API endpoint on submit. Wizard state is derived
from `GET /api/merchants/me` -> `onboardingSteps`.

---

## Step 5 — Verify

1. Register a merchant account (`role = 'merchant'`).
2. `GET /api/merchants/me` → `status: 'draft'`, all steps incomplete.
3. Fill business details, bank account, vehicle.
4. `POST /api/merchants/me/submit` → `status: 'under_review'`.
5. Attempt re-submit → `409 ALREADY_SUBMITTED`.
6. As `under_review` merchant, edit bank account → `200 OK`.
