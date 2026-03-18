import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { FareBreakdownCard } from "../components/FareBreakdownCard";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

interface FareEstimate {
  estimatedFare: string;
  estimatedDistanceKm: string;
  currency: string;
  breakdown: { baseFare: string; distanceFare: string };
}

/**
 * BookingScreen — passenger enters pickup + destination, sees fare estimate,
 * and confirms the booking. T014 + T022.
 */
export default function BookingScreen() {
  const router = useRouter();

  const [pickupLat, setPickupLat] = useState("0");
  const [pickupLng, setPickupLng] = useState("0");
  const [pickupAddress, setPickupAddress] = useState("");
  const [destinationLat, setDestinationLat] = useState("");
  const [destinationLng, setDestinationLng] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");

  const [isOffline, setIsOffline] = useState(false);

  // T029 — basic offline detection via failed fetch
  const destinationReady =
    destinationLat.trim() !== "" && destinationLng.trim() !== "";
  const fareEstimateQuery = useQuery({
    queryKey: [
      "passenger-booking",
      "fare-estimate",
      pickupLat,
      pickupLng,
      destinationLat,
      destinationLng,
    ],
    enabled: destinationReady,
    queryFn: async () => {
      const token = await SecureStore.getItemAsync("hakwa_token");
      const res = await fetch(`${API_URL}/api/bookings/fare-estimate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pickupLat: parseFloat(pickupLat),
          pickupLng: parseFloat(pickupLng),
          destinationLat: parseFloat(destinationLat),
          destinationLng: parseFloat(destinationLng),
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message ?? "Failed to get fare estimate");
      }

      return (await res.json()) as FareEstimate;
    },
  });

  const bookingMutation = useMutation({
    mutationFn: async () => {
      const token = await SecureStore.getItemAsync("hakwa_token");
      const res = await fetch(`${API_URL}/api/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pickupLat: parseFloat(pickupLat),
          pickupLng: parseFloat(pickupLng),
          pickupAddress: pickupAddress || undefined,
          destinationLat: parseFloat(destinationLat),
          destinationLng: parseFloat(destinationLng),
          destinationAddress: destinationAddress || undefined,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { code?: string; message?: string };
        throw new Error(err.message ?? "Booking failed");
      }

      return (await res.json()) as { tripId: string };
    },
  });

  const fareEstimate = fareEstimateQuery.data ?? null;
  const estimating = fareEstimateQuery.isFetching;
  const booking = bookingMutation.isPending;

  useEffect(() => {
    if (!fareEstimateQuery.error) {
      setIsOffline(false);
      return;
    }

    const message =
      fareEstimateQuery.error instanceof Error
        ? fareEstimateQuery.error.message
        : "Network error";

    if (
      message.toLowerCase().includes("network") ||
      message.toLowerCase().includes("fetch")
    ) {
      setIsOffline(true);
    } else {
      Alert.alert("Fare estimate", message);
    }
  }, [fareEstimateQuery.error]);

  async function handleBook() {
    if (!fareEstimate || isOffline) return;

    try {
      const data = await bookingMutation.mutateAsync();
      router.replace({
        pathname: "/searching",
        params: { tripId: data.tripId },
      });
    } catch (err) {
      Alert.alert(
        "Booking failed",
        err instanceof Error ? err.message : "An error occurred",
      );
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Book a Ride</Text>

      {/* T029 — offline banner */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            You&apos;re offline — connect to book a ride
          </Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Pickup location</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.coordInput]}
          placeholder="Latitude"
          keyboardType="decimal-pad"
          value={pickupLat}
          onChangeText={setPickupLat}
        />
        <TextInput
          style={[styles.input, styles.coordInput]}
          placeholder="Longitude"
          keyboardType="decimal-pad"
          value={pickupLng}
          onChangeText={setPickupLng}
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder="Pickup address (optional)"
        value={pickupAddress}
        onChangeText={setPickupAddress}
      />

      <Text style={styles.sectionLabel}>Destination</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.coordInput]}
          placeholder="Latitude"
          keyboardType="decimal-pad"
          value={destinationLat}
          onChangeText={setDestinationLat}
        />
        <TextInput
          style={[styles.input, styles.coordInput]}
          placeholder="Longitude"
          keyboardType="decimal-pad"
          value={destinationLng}
          onChangeText={setDestinationLng}
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder="Destination address (optional)"
        value={destinationAddress}
        onChangeText={setDestinationAddress}
      />

      {estimating && (
        <View style={styles.loadingRow}>
          <ActivityIndicator
            size="small"
            color="#0a7ea4"
          />
          <Text style={styles.loadingText}>Calculating fare…</Text>
        </View>
      )}

      {/* T022 — FareBreakdownCard integrated here */}
      {fareEstimate && !estimating && (
        <FareBreakdownCard
          estimatedFare={fareEstimate.estimatedFare}
          baseFare={fareEstimate.breakdown.baseFare}
          distanceFare={fareEstimate.breakdown.distanceFare}
          distanceKm={fareEstimate.estimatedDistanceKm}
          currency={fareEstimate.currency}
        />
      )}

      <Pressable
        style={[
          styles.bookBtn,
          (!fareEstimate || estimating || booking || isOffline) &&
            styles.bookBtnDisabled,
        ]}
        onPress={handleBook}
        disabled={!fareEstimate || estimating || booking || isOffline}
      >
        {booking ? (
          <ActivityIndicator
            color="#fff"
            size="small"
          />
        ) : (
          <Text style={styles.bookBtnText}>Book ride</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: "700", marginBottom: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#687076",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 6,
  },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    marginBottom: 8,
    backgroundColor: "#fafafa",
  },
  coordInput: { flex: 1 },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 12,
  },
  loadingText: { color: "#687076", fontSize: 14 },
  bookBtn: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
  },
  bookBtnDisabled: { backgroundColor: "#b0cdd8" },
  bookBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  offlineBanner: {
    backgroundColor: "#fff3cd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ffc107",
  },
  offlineText: { color: "#856404", fontSize: 14, textAlign: "center" },
});
