import { useMutation } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export function useSilentSOS(tripId?: string) {
  const mutation = useMutation({
    mutationFn: async () => {
      const token = await SecureStore.getItemAsync("hakwa_token");
      const res = await fetch(`${API_URL}/api/v1/safety/sos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          silent: true,
          ...(tripId ? { tripId } : {}),
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message ?? "Silent SOS failed.");
      }

      await res.json().catch(() => null);
    },
  });

  return {
    triggerSilentSOS: mutation.mutateAsync,
    isSubmitting: mutation.isPending,
    lastError: mutation.error instanceof Error ? mutation.error.message : null,
  };
}
