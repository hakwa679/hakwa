import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import DriverSafetyPanel from "./ActiveTrip/SafetyPanel";

const TOKEN_KEY = "hakwa_token";
const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TripPhase = "accepted" | "driver_arrived" | "in_progress" | "completed";

interface CompletionResult {
  actualFare: string;
  driverEarnings: string;
  platformFee: string;
  completedAt: string;
}

export interface NavigationScreenProps {
  tripId: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  dropoffLat?: number;
  dropoffLng?: number;
  dropoffAddress?: string;
  onTripComplete: (actualFare: string, driverEarnings: string) => void;
}

// ---------------------------------------------------------------------------
// Haversine distance helper
// ---------------------------------------------------------------------------

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * NavigationScreen — drives the trip lifecycle:
 *
 *   accepted → [I've Arrived] → driver_arrived
 *   driver_arrived → [Start Trip] → in_progress
 *   in_progress → [Complete Trip] → completed
 *
 * While `in_progress`, watches GPS (T019) to:
 *   - POST /api/driver/location every position update (~5 s)
 *   - Accumulate trip distance via Haversine
 *
 * On completion, shows an earnings summary card (T023) then calls
 * `onTripComplete` when the driver taps "Done".
 */
export default function NavigationScreen({
  tripId,
  pickupAddress,
  dropoffAddress,
  onTripComplete,
}: NavigationScreenProps) {
  const [phase, setPhase] = useState<TripPhase>("accepted");
  const [loading, setLoading] = useState(false);
  const [completionResult, setCompletionResult] =
    useState<CompletionResult | null>(null);
  const [accumulatedKm, setAccumulatedKm] = useState(0);

  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // -------------------------------------------------------------------------
  // Auth helper
  // -------------------------------------------------------------------------

  async function getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
  }

  const postLocationMutation = useMutation({
    mutationFn: async ({
      lat,
      lng,
      heading,
    }: {
      lat: number;
      lng: number;
      heading: number;
    }) => {
      const token = await getToken();
      if (!token) return;

      await fetch(`${API_URL}/api/driver/location`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lat, lng, heading }),
      });
    },
  });

  const arriveMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Missing auth token");
      const res = await fetch(`${API_URL}/api/driver/trips/${tripId}/arrive`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? "Failed to mark arrived.");
      }
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Missing auth token");
      const res = await fetch(`${API_URL}/api/driver/trips/${tripId}/start`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? "Failed to start trip.");
      }
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (actualDistanceKm: number) => {
      const token = await getToken();
      if (!token) throw new Error("Missing auth token");
      const res = await fetch(
        `${API_URL}/api/driver/trips/${tripId}/complete`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ actualDistanceKm }),
        },
      );

      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? "Failed to complete trip.");
      }

      return (await res.json()) as CompletionResult;
    },
  });

  // -------------------------------------------------------------------------
  // GPS helpers (T019)
  // -------------------------------------------------------------------------

  const postLocation = useCallback(
    async (lat: number, lng: number, heading: number) => {
      try {
        await postLocationMutation.mutateAsync({ lat, lng, heading });
      } catch {
        // Tolerate network hiccups during active trip
      }
    },
    [postLocationMutation],
  );

  // Start/stop GPS watch when entering or leaving `in_progress`
  useEffect(() => {
    if (phase !== "in_progress") return;

    if (!navigator.geolocation) {
      // Geolocation unavailable — still allow manual complete
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const heading = (position.coords as { heading?: number }).heading ?? 0;

        // Accumulate distance, ignore noise < 10 m
        if (lastPosRef.current) {
          const delta = haversineKm(
            lastPosRef.current.lat,
            lastPosRef.current.lng,
            latitude,
            longitude,
          );
          if (delta > 0.01) {
            setAccumulatedKm((prev) => prev + delta);
            lastPosRef.current = { lat: latitude, lng: longitude };
          }
        } else {
          lastPosRef.current = { lat: latitude, lng: longitude };
        }

        void postLocation(latitude, longitude, heading);
      },
      (err) => {
        console.warn("[NavigationScreen] GPS error:", err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [phase, postLocation]);

  // -------------------------------------------------------------------------
  // Trip phase transitions
  // -------------------------------------------------------------------------

  async function handleArrive() {
    setLoading(true);
    try {
      await arriveMutation.mutateAsync();
      setPhase("driver_arrived");
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Network error. Please retry.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    setLoading(true);
    try {
      await startMutation.mutateAsync();
      // Reset distance accumulator at trip start
      lastPosRef.current = null;
      setAccumulatedKm(0);
      setPhase("in_progress");
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Network error. Please retry.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    setLoading(true);

    // Stop GPS before completing
    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    try {
      const data = await completeMutation.mutateAsync(
        parseFloat(accumulatedKm.toFixed(2)),
      );
      setCompletionResult(data);
      setPhase("completed");
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Network error. Please retry.",
      );
      setPhase("in_progress");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render — earnings summary (T023)
  // -------------------------------------------------------------------------

  if (phase === "completed" && completionResult) {
    return (
      <View style={styles.container}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Trip Complete! 🎉</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gross Fare</Text>
            <Text style={styles.summaryValue}>
              FJD {completionResult.actualFare}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Platform Fee (7%)</Text>
            <Text style={[styles.summaryValue, styles.deducted]}>
              − FJD {completionResult.platformFee}
            </Text>
          </View>

          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Your Earnings</Text>
            <Text style={styles.totalValue}>
              FJD {completionResult.driverEarnings}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.doneButton}
          onPress={() =>
            onTripComplete(
              completionResult.actualFare,
              completionResult.driverEarnings,
            )
          }
        >
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // -------------------------------------------------------------------------
  // Render — active trip navigation (T018, T022)
  // -------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      {/* Destination info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>PICKUP</Text>
        <Text style={styles.infoAddress}>{pickupAddress}</Text>

        {dropoffAddress ? (
          <>
            <Text style={[styles.infoLabel, { marginTop: 14 }]}>DROPOFF</Text>
            <Text style={styles.infoAddress}>{dropoffAddress}</Text>
          </>
        ) : null}

        {phase === "in_progress" ? (
          <Text style={styles.distanceText}>
            Distance: {accumulatedKm.toFixed(2)} km
          </Text>
        ) : null}
      </View>

      {/* Status badge */}
      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>
          {phase === "accepted" && "Heading to pickup"}
          {phase === "driver_arrived" && "Waiting for passenger"}
          {phase === "in_progress" && "Trip in progress"}
        </Text>
      </View>

      {/* Phase action button */}
      {phase === "accepted" && (
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.arriveButton,
            loading && styles.disabledButton,
          ]}
          onPress={handleArrive}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionText}>I've Arrived</Text>
          )}
        </TouchableOpacity>
      )}

      {phase === "driver_arrived" && (
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.startButton,
            loading && styles.disabledButton,
          ]}
          onPress={handleStart}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionText}>Start Trip</Text>
          )}
        </TouchableOpacity>
      )}

      {phase === "in_progress" && (
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.completeButton,
            loading && styles.disabledButton,
          ]}
          onPress={handleComplete}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionText}>Complete Trip</Text>
          )}
        </TouchableOpacity>
      )}

      <DriverSafetyPanel tripId={tripId} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 20,
    justifyContent: "flex-end",
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    marginBottom: 14,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  infoAddress: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  distanceText: {
    marginTop: 12,
    fontSize: 14,
    color: "#555",
    fontWeight: "600",
  },
  statusBadge: {
    alignSelf: "center",
    backgroundColor: "#EBF8FF",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2B6CB0",
  },
  actionButton: {
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  arriveButton: {
    backgroundColor: "#3182CE",
  },
  startButton: {
    backgroundColor: "#38A169",
  },
  completeButton: {
    backgroundColor: "#DD6B20",
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  // Earnings summary
  summaryCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    marginBottom: 24,
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1a1a1a",
    marginBottom: 20,
    textAlign: "center",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 15,
    color: "#555",
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  deducted: {
    color: "#E53E3E",
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 14,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  totalValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#38A169",
  },
  doneButton: {
    height: 56,
    backgroundColor: "#38A169",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
});
