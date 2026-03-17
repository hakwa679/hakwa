import { useCallback, useState } from "react";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export function useSilentSOS(tripId?: string) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const triggerSilentSOS = useCallback(async () => {
    setIsSubmitting(true);
    setLastError(null);

    try {
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
    } catch (error) {
      setLastError(
        error instanceof Error ? error.message : "Silent SOS failed.",
      );
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [tripId]);

  return {
    triggerSilentSOS,
    isSubmitting,
    lastError,
  };
}
