import { useEffect } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import {
  useBookingWebSocket,
  type TripStatus,
} from "../hooks/useBookingWebSocket";
import SafetyPanel from "../src/screens/ActiveTrip/SafetyPanel";
import TripShareCard from "../src/screens/ActiveTrip/TripShareCard";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

function statusBannerText(
  status: TripStatus | null,
  destination?: string,
): string {
  switch (status) {
    case "accepted":
      return "Driver en route";
    case "driver_arrived":
      return "Your driver has arrived";
    case "in_progress":
      return `On the way to ${destination ?? "your destination"}`;
    case "completed":
      return "Trip completed";
    case "cancelled":
      return "Trip cancelled";
    default:
      return "Waiting…";
  }
}

function statusBannerColor(status: TripStatus | null): string {
  switch (status) {
    case "accepted":
      return "#0a7ea4";
    case "driver_arrived":
      return "#2e7d32";
    case "in_progress":
      return "#1565c0";
    case "completed":
      return "#2e7d32";
    case "cancelled":
      return "#c62828";
    default:
      return "#687076";
  }
}

/**
 * ActiveTripScreen — passenger sees driver location map placeholder + status
 * banners, and a cancel button (hidden during in_progress). T017 + T018 + T025.
 */
export default function ActiveTripScreen() {
  const router = useRouter();
  const { tripId, destinationAddress } = useLocalSearchParams<{
    tripId: string;
    destinationAddress?: string;
  }>();

  const { status, driverLocation, driverInfo } = useBookingWebSocket({
    tripId: tripId ?? null,
    enabled: !!tripId,
  });

  // T018 — status banner transitions
  useEffect(() => {
    if (status === "driver_arrived") {
      Vibration.vibrate(400);
    }
    if (status === "completed") {
      router.replace({
        pathname: "/trip-summary",
        params: { tripId },
      });
    }
    if (status === "cancelled") {
      Alert.alert("Trip cancelled", "Your trip has been cancelled.", [
        { text: "OK", onPress: () => router.replace("/booking") },
      ]);
    }
  }, [status, tripId, router]);

  async function handleCancel() {
    Alert.alert("Cancel booking", "Cancel before the trip starts?", [
      { text: "Keep ride", style: "cancel" },
      {
        text: "Yes, cancel",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await SecureStore.getItemAsync("hakwa_token");
            const res = await fetch(`${API_URL}/api/bookings/${tripId ?? ""}`, {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            });
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
    ]);
  }

  const bannerText = statusBannerText(status, destinationAddress);
  const bannerColor = statusBannerColor(status);
  const canCancel = status === "accepted"; // T025 — hide during in_progress

  return (
    <View style={styles.container}>
      {/* Status banner */}
      <View style={[styles.banner, { backgroundColor: bannerColor }]}>
        <Text style={styles.bannerText}>{bannerText}</Text>
        {driverInfo?.name && (
          <Text style={styles.bannerSub}>Driver: {driverInfo.name}</Text>
        )}
      </View>

      {/* Map placeholder — @hakwa/map integration goes here */}
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapPlaceholderText}>Map view</Text>
        {driverLocation && (
          <Text style={styles.coordText}>
            Driver: {driverLocation.lat.toFixed(5)},{" "}
            {driverLocation.lng.toFixed(5)}
          </Text>
        )}
      </View>

      {/* Driver info card */}
      {driverInfo?.name && (
        <View style={styles.driverCard}>
          <Text style={styles.driverName}>{driverInfo.name}</Text>
          {driverInfo.vehicle && (
            <Text style={styles.vehicleInfo}>
              {[
                driverInfo.vehicle.color,
                driverInfo.vehicle.make,
                driverInfo.vehicle.model,
                driverInfo.vehicle.plate && `· ${driverInfo.vehicle.plate}`,
              ]
                .filter(Boolean)
                .join(" ")}
            </Text>
          )}
          {driverInfo.estimatedArrivalMinutes != null && (
            <Text style={styles.eta}>
              ETA: ~{driverInfo.estimatedArrivalMinutes} min
            </Text>
          )}
        </View>
      )}

      {canCancel && (
        <Pressable
          style={styles.cancelBtn}
          onPress={handleCancel}
        >
          <Text style={styles.cancelText}>Cancel ride</Text>
        </Pressable>
      )}

      <TripShareCard tripId={tripId ?? undefined} />
      <SafetyPanel tripId={tripId ?? undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  banner: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  bannerText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  bannerSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    marginTop: 4,
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: "#eaf3f8",
    alignItems: "center",
    justifyContent: "center",
  },
  mapPlaceholderText: {
    fontSize: 18,
    color: "#9BA1A6",
    fontWeight: "500",
  },
  coordText: {
    fontSize: 12,
    color: "#687076",
    marginTop: 8,
  },
  driverCard: {
    backgroundColor: "#fff",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  driverName: { fontSize: 17, fontWeight: "700", marginBottom: 4 },
  vehicleInfo: { fontSize: 14, color: "#687076", marginBottom: 4 },
  eta: { fontSize: 14, color: "#0a7ea4", fontWeight: "600" },
  cancelBtn: {
    marginHorizontal: 24,
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: "#d9534f",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelText: { color: "#d9534f", fontWeight: "700", fontSize: 16 },
});
