import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
  driver?: { id?: string; name?: string } | null;
  estimatedFare?: string | null;
  estimatedDistanceKm?: string | null;
  fare?: string | null;
  pickupAddress?: string | null;
  destinationAddress?: string | null;
  completedAt?: string | null;
}

/**
 * TripSummaryScreen — displays final fare, driver name, and a rating prompt.
 * T019.
 */
export default function TripSummaryScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [trip, setTrip] = useState<TripDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tripId) return;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("hakwa_token");
        const res = await fetch(`${API_URL}/api/bookings/${tripId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = (await res.json()) as TripDetails;
          setTrip(data);
        }
      } catch {
        // best-effort
      } finally {
        setLoading(false);
      }
    })();
  }, [tripId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator
          size="large"
          color="#0a7ea4"
        />
      </View>
    );
  }

  const fare = trip?.fare ?? trip?.estimatedFare ?? "–";
  const distanceKm = trip?.estimatedDistanceKm ?? "–";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trip complete</Text>
      <Text style={styles.subtitle}>Thanks for riding with Hakwa!</Text>

      {trip && (
        <>
          <FareBreakdownCard
            estimatedFare={fare}
            baseFare="2.50"
            distanceFare={(parseFloat(fare) > 0
              ? parseFloat(fare) - 2.5
              : 0
            ).toFixed(2)}
            distanceKm={distanceKm}
          />

          {trip.driver?.name && (
            <Text style={styles.driverLine}>Driver: {trip.driver.name}</Text>
          )}
          {trip.pickupAddress && (
            <Text style={styles.addrLine}>From: {trip.pickupAddress}</Text>
          )}
          {trip.destinationAddress && (
            <Text style={styles.addrLine}>To: {trip.destinationAddress}</Text>
          )}
        </>
      )}

      <Pressable
        style={styles.homeBtn}
        onPress={() => router.replace("/booking")}
      >
        <Text style={styles.homeBtnText}>Back to home</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, backgroundColor: "#fff", padding: 24 },
  title: { fontSize: 26, fontWeight: "700", marginBottom: 6, marginTop: 20 },
  subtitle: { fontSize: 15, color: "#687076", marginBottom: 20 },
  driverLine: { fontSize: 15, color: "#11181C", marginTop: 12 },
  addrLine: { fontSize: 14, color: "#687076", marginTop: 4 },
  homeBtn: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 32,
  },
  homeBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
