import * as SecureStore from "expo-secure-store";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync("hakwa_token");
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface OnboardingSteps {
  businessDetails: boolean;
  bankAccount: boolean;
  vehicle: boolean;
}

export interface MerchantProfile {
  id: string;
  userId: string;
  name: string;
  licenseType: "licensed" | "unlicensed";
  status:
    | "draft"
    | "under_review"
    | "approved"
    | "rejected"
    | "suspended_pending_review";
  tin: string | null;
  businessRegistrationNumber: string | null;
  nationalId: string | null;
  phone: string | null;
  onboardingSteps: OnboardingSteps;
}

export interface BankAccountData {
  id: string;
  accountNumber: string;
  accountHolderName: string;
  bankName: string;
  bankCode: string;
  swiftCode: string;
}

export interface VehicleData {
  id: string;
  merchantId: string;
  make: string;
  model: string;
  year: number;
  registrationPlate: string;
  seatingCapacity: number;
  color: string | null;
  isActive: boolean;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface MerchantPayoutListItem {
  id: string;
  weekStart: string;
  weekEnd: string;
  weekPeriod: string;
  amount: string;
  serviceFee: string;
  netAmount: string;
  status: "pending" | "processing" | "succeeded" | "failed";
  processedAt: string | null;
  completedAt: string | null;
  bankAccount: {
    bankName: string;
    accountNumberLast4: string;
  };
}

export interface MerchantPayoutHistoryResponse {
  items: MerchantPayoutListItem[];
  nextCursor: string | null;
  nextPayoutDate: string;
}

export interface MerchantPayoutDetail {
  id: string;
  weekStart: string;
  weekEnd: string;
  amount: string;
  serviceFee: string;
  netAmount: string;
  status: "pending" | "processing" | "succeeded" | "failed";
  failureReason: string | null;
  processedAt: string | null;
  completedAt: string | null;
  bankAccount: {
    bankName: string;
    accountNumberLast4: string;
  };
  note: string | null;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export async function fetchMerchantProfile(): Promise<MerchantProfile> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/merchants/me`, { headers });
  if (!res.ok) {
    const err = (await res.json()) as ApiError;
    throw new Error(err.message ?? "Failed to load profile");
  }
  return res.json() as Promise<MerchantProfile>;
}

export async function updateMerchantProfile(
  data: Partial<{
    name: string;
    tin: string;
    businessRegistrationNumber: string;
    nationalId: string;
    phone: string;
  }>,
): Promise<MerchantProfile> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/merchants/me`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok)
    throw new Error((json["message"] as string) ?? "Failed to update profile");
  return json as unknown as MerchantProfile;
}

export async function submitForReview(): Promise<{ status: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/merchants/me/submit`, {
    method: "POST",
    headers,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok)
    throw new Error((json["message"] as string) ?? "Failed to submit");
  return json as { status: string };
}

export async function fetchBankAccount(): Promise<BankAccountData | null> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/merchants/me/bank-account`, {
    headers,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as BankAccountData | null;
  return json;
}

export async function upsertBankAccount(data: {
  accountNumber: string;
  accountHolderName: string;
  bankName: string;
  bankCode: string;
  swiftCode: string;
}): Promise<BankAccountData> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/merchants/me/bank-account`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok)
    throw new Error(
      (json["message"] as string) ?? "Failed to save bank account",
    );
  return json as unknown as BankAccountData;
}

export async function fetchVehicles(): Promise<VehicleData[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/merchants/me/vehicles`, { headers });
  const json = (await res.json()) as { vehicles: VehicleData[] };
  if (!res.ok) return [];
  return json.vehicles ?? [];
}

export async function addVehicle(data: {
  make: string;
  model: string;
  year: number;
  registrationPlate: string;
  seatingCapacity: number;
  color?: string;
}): Promise<VehicleData> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/merchants/me/vehicles`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok)
    throw new Error((json["message"] as string) ?? "Failed to add vehicle");
  return json as unknown as VehicleData;
}

export async function fetchPayoutHistory(
  cursor?: string,
): Promise<MerchantPayoutHistoryResponse> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) {
    params.set("cursor", cursor);
  }

  const res = await fetch(
    `${API_URL}/api/merchant/payouts?${params.toString()}`,
    {
      headers,
    },
  );
  const json = (await res.json()) as MerchantPayoutHistoryResponse | ApiError;
  if (!res.ok) {
    throw new Error((json as ApiError).message ?? "Failed to load payouts");
  }

  return json as MerchantPayoutHistoryResponse;
}

export async function fetchPayoutDetail(
  payoutId: string,
): Promise<MerchantPayoutDetail> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/merchant/payouts/${payoutId}`, {
    headers,
  });
  const json = (await res.json()) as MerchantPayoutDetail | ApiError;
  if (!res.ok) {
    throw new Error(
      (json as ApiError).message ?? "Failed to load payout detail",
    );
  }

  return json as MerchantPayoutDetail;
}

export const merchantQueryKeys = {
  profile: ["merchant", "profile"] as const,
  bankAccount: ["merchant", "bank-account"] as const,
  vehicles: ["merchant", "vehicles"] as const,
  payouts: ["merchant", "payouts"] as const,
  payoutDetail: (payoutId: string) =>
    ["merchant", "payouts", payoutId] as const,
};

export function useMerchantProfileQuery() {
  return useQuery({
    queryKey: merchantQueryKeys.profile,
    queryFn: fetchMerchantProfile,
  });
}

export function useUpdateMerchantProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMerchantProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(merchantQueryKeys.profile, profile);
    },
  });
}

export function useSubmitForReviewMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitForReview,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.profile,
      });
    },
  });
}

export function useBankAccountQuery() {
  return useQuery({
    queryKey: merchantQueryKeys.bankAccount,
    queryFn: fetchBankAccount,
  });
}

export function useUpsertBankAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertBankAccount,
    onSuccess: (bankAccount) => {
      queryClient.setQueryData(merchantQueryKeys.bankAccount, bankAccount);
    },
  });
}

export function useVehiclesQuery() {
  return useQuery({
    queryKey: merchantQueryKeys.vehicles,
    queryFn: fetchVehicles,
  });
}

export function useAddVehicleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addVehicle,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.vehicles,
      });
    },
  });
}

export function usePayoutHistoryInfiniteQuery() {
  return useInfiniteQuery({
    queryKey: merchantQueryKeys.payouts,
    queryFn: async ({ pageParam }) =>
      fetchPayoutHistory(typeof pageParam === "string" ? pageParam : undefined),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function usePayoutDetailQuery(payoutId: string) {
  return useQuery({
    queryKey: merchantQueryKeys.payoutDetail(payoutId),
    queryFn: () => fetchPayoutDetail(payoutId),
    enabled: payoutId.length > 0,
  });
}
