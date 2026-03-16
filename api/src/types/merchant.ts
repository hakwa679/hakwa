// Re-export the shared union types from the schema so API code imports from
// a single, stable location within the API package.
export type { LicenseType, MerchantStatus } from "@hakwa/db/schema";
