import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useSilentSOS } from "../../hooks/useSilentSOS";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const COUNTDOWN_SECONDS = 5;

interface SafetyPanelProps {
  tripId?: string;
}

export default function SafetyPanel({ tripId }: SafetyPanelProps) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { triggerSilentSOS, isSubmitting } = useSilentSOS(tripId);

  const emergencyLine = useMemo(
    () => "Police 917 | Ambulance 911 | Fire 910",
    [],
  );

  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      void triggerSos(false);
      return;
    }

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return prev;
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [countdown]);

  async function triggerSos(silent: boolean) {
    setCountdown(null);
    setIsSending(true);

    try {
      const token = await SecureStore.getItemAsync("hakwa_token");
      const res = await fetch(`${API_URL}/api/v1/safety/sos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          silent,
          ...(tripId ? { tripId } : {}),
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message ?? "SOS request failed.");
      }

      const data = (await res.json().catch(() => null)) as {
        referenceCode?: string;
      } | null;

      Alert.alert(
        "SOS sent",
        data?.referenceCode
          ? `Reference: ${data.referenceCode}`
          : "Your SOS alert has been sent.",
      );
    } catch (error) {
      Alert.alert(
        "SOS failed",
        error instanceof Error ? error.message : "Could not send SOS.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Safety</Text>
      <Text style={styles.helpText}>
        Hold SOS for 2 seconds to start alert countdown.
      </Text>

      {countdown !== null && countdown > 0 && (
        <View style={styles.countdownCard}>
          <Text style={styles.countdownText}>Sending SOS in {countdown}s</Text>
          <Pressable
            style={styles.cancelButton}
            onPress={() => setCountdown(null)}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.actionsRow}>
        <Pressable
          onLongPress={() => setCountdown(COUNTDOWN_SECONDS)}
          delayLongPress={2000}
          style={styles.sosButton}
          disabled={isSending || isSubmitting}
        >
          <Text style={styles.sosButtonText}>
            {isSending ? "Sending..." : "Hold for SOS"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            triggerSilentSOS().catch(() => {
              Alert.alert("Silent SOS failed", "Please try again.");
            });
          }}
          style={styles.silentButton}
          disabled={isSending || isSubmitting}
        >
          <Text style={styles.silentButtonText}>
            {isSubmitting ? "Sending..." : "Silent SOS"}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.emergencyText}>{emergencyLine}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    backgroundColor: "#fff8f8",
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#7b1b1b",
  },
  helpText: {
    fontSize: 12,
    color: "#6a6a6a",
  },
  countdownCard: {
    backgroundColor: "#fff0f0",
    borderColor: "#f0c8c8",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  countdownText: {
    fontWeight: "700",
    color: "#9f1c1c",
  },
  cancelButton: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#b55656",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cancelText: {
    color: "#9f1c1c",
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  sosButton: {
    flex: 1,
    backgroundColor: "#b42318",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  sosButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  silentButton: {
    flex: 1,
    borderColor: "#7b1b1b",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  silentButtonText: {
    color: "#7b1b1b",
    fontWeight: "700",
  },
  emergencyText: {
    marginTop: 4,
    fontSize: 12,
    color: "#555",
  },
});
