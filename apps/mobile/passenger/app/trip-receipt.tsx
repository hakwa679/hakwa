import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  status?: string;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  totalFare: string | null;
  baseFare: string | null;
  ratePerKm: string | null;
  actualDistanceKm: string | null;
  currency: string;
  completedAt: string | null;
  driverName?: string | null;
}

export default function TripReceiptScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [trip, setTrip] = useState<TripDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailing, setEmailing] = useState(false);

  useEffect(() => {
    if (!tripId) return;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("hakwa_token");
        const res = await fetch(`${API_URL}/api/trips/${tripId}/receipt`, {
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

  const distanceKm = trip.actualDistanceKm;
  const distanceNum = distanceKm ? parseFloat(distanceKm) : null;
  const fareNum = trip.totalFare ? parseFloat(trip.totalFare) : null;

  const baseFare = parseFloat(trip.baseFare ?? "2.50");
  const distanceFare =
    distanceNum != null ? Math.max(0, fareNum! - baseFare) : 0;

  const endedAt = trip.completedAt;
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

  const onEmailReceipt = async () => {
    if (!tripId || emailing) return;
    setEmailing(true);
    try {
      const token = await SecureStore.getItemAsync("hakwa_token");
      const res = await fetch(`${API_URL}/api/trips/${tripId}/receipt/email`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        Alert.alert(
          "Receipt",
          "Could not queue receipt email. Please try again.",
        );
        return;
      }
      Alert.alert("Receipt", "Your receipt email has been queued.");
    } catch {
      Alert.alert(
        "Receipt",
        "Could not queue receipt email. Please try again.",
      );
    } finally {
      setEmailing(false);
    }
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
            (trip.status ?? "completed") === "completed"
              ? styles.statusCompleted
              : styles.statusCancelled,
          ]}
        >
          <Text style={styles.statusChipText}>
            {(trip.status ?? "completed").toUpperCase()}
          </Text>
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
            {trip.dropoffAddress ?? "Destination"}
          </Text>
        </View>
        {distanceNum != null && (
          <Text style={styles.distanceText}>
            Distance: {distanceNum.toFixed(2)} km
          </Text>
        )}
      </View>

      {/* Driver */}
      {trip.driverName && (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Driver</Text>
          <Text style={styles.driverName}>{trip.driverName}</Text>
        </View>
      )}

      {/* Fare */}
      {fareNum != null && (
        <FareBreakdownCard
          estimatedFare={fareNum.toFixed(2)}
          baseFare={baseFare.toFixed(2)}
          distanceFare={distanceFare.toFixed(2)}
          distanceKm={(distanceNum ?? 0).toFixed(2)}
          currency={trip.currency}
        />
      )}

      <Pressable
        style={[styles.emailBtn, emailing && styles.emailBtnDisabled]}
        onPress={() => {
          void onEmailReceipt();
        }}
        disabled={emailing}
      >
        <Text style={styles.emailBtnText}>
          {emailing ? "Queueing..." : "Email receipt"}
        </Text>
      </Pressable>

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
  emailBtn: {
    borderWidth: 1,
    borderColor: "#6C63FF",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  emailBtnDisabled: { opacity: 0.6 },
  emailBtnText: { color: "#6C63FF", fontWeight: "700", fontSize: 15 },
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
