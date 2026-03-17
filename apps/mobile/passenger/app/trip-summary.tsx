import { useEffect, useState } from "react";
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
import { FareBreakdownCard } from "../components/FareBreakdownCard";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

interface TripDetails {
  tripId: string;
  pickupAddress?: string | null;
  dropoffAddress?: string | null;
  actualDistanceKm?: string | null;
  baseFare?: string | null;
  ratePerKm?: string | null;
  totalFare?: string | null;
  currency?: string;
  completedAt?: string | null;
  driverName?: string | null;
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
  const [emailing, setEmailing] = useState(false);

  useEffect(() => {
    if (!tripId) return;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("hakwa_token");
        const res = await fetch(`${API_URL}/api/trips/${tripId}/receipt`, {
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

  const fare = trip?.totalFare ?? "0.00";
  const distanceKm = trip?.actualDistanceKm ?? "0.00";

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
    <View style={styles.container}>
      <Text style={styles.title}>Trip complete</Text>
      <Text style={styles.subtitle}>Thanks for riding with Hakwa!</Text>

      {trip && (
        <>
          <FareBreakdownCard
            estimatedFare={fare}
            baseFare={trip?.baseFare ?? "2.50"}
            distanceFare={(parseFloat(fare) > 0
              ? parseFloat(fare) - parseFloat(trip?.baseFare ?? "2.50")
              : 0
            ).toFixed(2)}
            distanceKm={distanceKm}
            currency={trip?.currency ?? "FJD"}
          />

          {trip.driverName && (
            <Text style={styles.driverLine}>Driver: {trip.driverName}</Text>
          )}
          {trip.pickupAddress && (
            <Text style={styles.addrLine}>From: {trip.pickupAddress}</Text>
          )}
          {trip.dropoffAddress && (
            <Text style={styles.addrLine}>To: {trip.dropoffAddress}</Text>
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
  emailBtn: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  emailBtnDisabled: { opacity: 0.6 },
  emailBtnText: { color: "#0a7ea4", fontWeight: "700", fontSize: 14 },
  homeBtn: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 32,
  },
  homeBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
