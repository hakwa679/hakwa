import { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useBookingWebSocket } from "../hooks/useBookingWebSocket";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

/**
 * SearchingScreen — shown while the dispatch loop finds a driver.
 * Connects to WebSocket for real-time status. Shows a cancel button.
 * T015 + T016 (no-drivers/timed_out) + T025 (cancel).
 */
export default function SearchingScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();

  const { status, driverInfo, connected } = useBookingWebSocket({
    tripId: tripId ?? null,
    enabled: !!tripId,
  });

  // T016 — navigate on terminal states
  useEffect(() => {
    if (!status) return;

    if (status === "accepted") {
      router.replace({
        pathname: "/active-trip",
        params: { tripId },
      });
    } else if (status === "timed_out") {
      Alert.alert(
        "No drivers available",
        "We couldn't find a driver nearby. Please try again shortly.",
        [{ text: "OK", onPress: () => router.replace("/booking") }],
      );
    } else if (status === "cancelled") {
      router.replace("/booking");
    }
  }, [status, tripId, router]);

  async function handleCancel() {
    Alert.alert(
      "Cancel booking",
      "Are you sure you want to cancel this ride request?",
      [
        { text: "Keep waiting", style: "cancel" },
        {
          text: "Cancel ride",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await SecureStore.getItemAsync("hakwa_token");
              const res = await fetch(
                `${API_URL}/api/bookings/${tripId ?? ""}`,
                {
                  method: "DELETE",
                  headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                },
              );
              if (!res.ok) {
                const err = (await res.json()) as { message?: string };
                throw new Error(err.message ?? "Could not cancel");
              }
              router.replace("/booking");
            } catch (err) {
              Alert.alert(
                "Cancel failed",
                err instanceof Error ? err.message : "An error occurred",
              );
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator
        size="large"
        color="#0a7ea4"
        style={styles.spinner}
      />
      <Text style={styles.title}>Searching for a driver…</Text>
      <Text style={styles.subtitle}>
        {connected
          ? "Looking for the nearest available driver."
          : "Connecting…"}
      </Text>

      {driverInfo?.name && (
        <View style={styles.driverCard}>
          <Text style={styles.driverName}>{driverInfo.name} is on the way</Text>
        </View>
      )}

      {/* T030 — subtle skeleton-style status indicator */}
      <View style={styles.skeletonRow}>
        <View
          style={[
            styles.skeletonDot,
            status === "pending" && styles.skeletonDotActive,
          ]}
        />
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonDot]} />
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonDot]} />
      </View>
      <Text style={styles.statusHint}>Finding · Connecting · On the way</Text>

      <Pressable
        style={styles.cancelBtn}
        onPress={handleCancel}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  spinner: { marginBottom: 24 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#687076",
    textAlign: "center",
    marginBottom: 24,
  },
  driverCard: {
    backgroundColor: "#e8f4f8",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 24,
  },
  driverName: { fontSize: 16, fontWeight: "600", color: "#0a7ea4" },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  skeletonDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#d0d0d0",
  },
  skeletonDotActive: { backgroundColor: "#0a7ea4" },
  skeletonLine: {
    width: 48,
    height: 2,
    backgroundColor: "#e0e0e0",
    marginHorizontal: 4,
  },
  statusHint: { fontSize: 11, color: "#aaa", marginBottom: 40 },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: "#d9534f",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 48,
  },
  cancelText: { color: "#d9534f", fontWeight: "700", fontSize: 16 },
});
