import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { FareBreakdownCard } from "../components/FareBreakdownCard";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

interface TripDetails {
  tripId: string;
  status: string;
  pickupAddress: string | null;
  destinationAddress: string | null;
  estimatedFare: string | null;
  estimatedDistanceKm: string | null;
  actualDistanceKm: string | null;
  cancellationReason: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string | null;
  driver?: {
    id?: string;
    name?: string;
  } | null;
}

export default function TripReceiptScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [trip, setTrip] = useState<TripDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId) return;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("session_token");
        const res = await fetch(`${API_URL}/api/bookings/${tripId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Could not load receipt");
        const data = await res.json();
        setTrip(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, [tripId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#6C63FF"
        />
        <Text style={styles.loadingText}>Loading receipt…</Text>
      </View>
    );
  }

  if (error || !trip) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? "Receipt not found"}</Text>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const distanceKm = trip.actualDistanceKm ?? trip.estimatedDistanceKm;
  const distanceNum = distanceKm ? parseFloat(distanceKm) : null;
  const fareNum = trip.estimatedFare ? parseFloat(trip.estimatedFare) : null;

  const baseFare = 2.5;
  const distanceFare =
    distanceNum != null ? Math.max(0, fareNum! - baseFare) : 0;

  const endedAt = trip.completedAt ?? trip.cancelledAt ?? trip.createdAt;
  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Trip receipt</Text>
        <Text style={styles.date}>{formatDate(endedAt)}</Text>
        <View
          style={[
            styles.statusChip,
            trip.status === "completed"
              ? styles.statusCompleted
              : styles.statusCancelled,
          ]}
        >
          <Text style={styles.statusChipText}>{trip.status.toUpperCase()}</Text>
        </View>
      </View>

      {/* Route */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Route</Text>
        <View style={styles.routeRow}>
          <View style={styles.dotGreen} />
          <Text
            style={styles.addressText}
            numberOfLines={2}
          >
            {trip.pickupAddress ?? "Pickup location"}
          </Text>
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routeRow}>
          <View style={styles.dotRed} />
          <Text
            style={styles.addressText}
            numberOfLines={2}
          >
            {trip.destinationAddress ?? "Destination"}
          </Text>
        </View>
        {distanceNum != null && (
          <Text style={styles.distanceText}>
            Distance:{" "}
            {trip.actualDistanceKm
              ? parseFloat(trip.actualDistanceKm).toFixed(2)
              : parseFloat(trip.estimatedDistanceKm!).toFixed(2)}{" "}
            km
          </Text>
        )}
      </View>

      {/* Driver */}
      {trip.driver?.name && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Driver</Text>
          <Text style={styles.driverName}>{trip.driver.name}</Text>
        </View>
      )}

      {/* Fare */}
      {fareNum != null && (
        <FareBreakdownCard
          estimatedFare={fareNum.toFixed(2)}
          baseFare={baseFare.toFixed(2)}
          distanceFare={distanceFare.toFixed(2)}
          distanceKm={(distanceNum ?? 0).toFixed(2)}
          currency="FJD"
        />
      )}

      {/* Cancellation reason */}
      {trip.status === "cancelled" && trip.cancellationReason && (
        <View style={[styles.card, styles.cancelCard]}>
          <Text style={styles.sectionLabel}>Cancellation reason</Text>
          <Text style={styles.cancelReason}>{trip.cancellationReason}</Text>
        </View>
      )}

      <Pressable
        style={styles.doneBtn}
        onPress={() => router.push("/")}
      >
        <Text style={styles.doneBtnText}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  header: { alignItems: "center", marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "700", color: "#1A1A2E" },
  date: { fontSize: 13, color: "#888", marginTop: 4 },
  statusChip: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusCompleted: { backgroundColor: "#E8F5E9" },
  statusCancelled: { backgroundColor: "#FFEBEE" },
  statusChipText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: "#333",
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
  },
  cancelCard: { borderLeftWidth: 3, borderLeftColor: "#EF5350" },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  routeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: "#DDD",
    marginLeft: 7,
    marginVertical: 2,
  },
  dotGreen: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#4CAF50",
    marginTop: 2,
  },
  dotRed: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#F44336",
    marginTop: 2,
  },
  addressText: { flex: 1, fontSize: 14, color: "#1A1A2E" },
  distanceText: {
    fontSize: 13,
    color: "#888",
    marginTop: 10,
    textAlign: "right",
  },
  driverName: { fontSize: 16, fontWeight: "600", color: "#1A1A2E" },
  cancelReason: { fontSize: 14, color: "#C62828" },
  loadingText: { color: "#888", marginTop: 8 },
  errorText: { fontSize: 15, color: "#C62828", textAlign: "center" },
  backBtn: {
    backgroundColor: "#6C63FF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backBtnText: { color: "#FFF", fontWeight: "600" },
  doneBtn: {
    backgroundColor: "#6C63FF",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  doneBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
});
