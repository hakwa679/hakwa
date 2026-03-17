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

interface ReceiptDetails {
  tripId: string;
  pickupAddress: string | null;
  dropoffAddress: string | null;
  actualDistanceKm: string | null;
  baseFare: string;
  ratePerKm: string;
  totalFare: string | null;
  currency: string;
  completedAt: string | null;
  driverName: string | null;
}

/**
 * TripSummaryScreen — displays final fare, driver name, and a rating prompt.
 * T019.
 */
export default function TripSummaryScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [receipt, setReceipt] = useState<ReceiptDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tripId) return;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync("hakwa_token");
        const res = await fetch(`${API_URL}/api/trips/${tripId}/receipt`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = (await res.json()) as ReceiptDetails;
          setReceipt(data);
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

  const totalFare = receipt?.totalFare ?? "–";
  const baseFare = receipt?.baseFare ?? "2.50";
  const distanceKm = receipt?.actualDistanceKm ?? "0";
  const distanceFare = Math.max(
    0,
    parseFloat(totalFare) - parseFloat(baseFare),
  ).toFixed(2);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Trip complete</Text>
      <Text style={styles.subtitle}>Thanks for riding with Hakwa!</Text>

      {receipt && (
        <>
          <FareBreakdownCard
            estimatedFare={totalFare}
            baseFare={baseFare}
            distanceFare={distanceFare}
            distanceKm={parseFloat(distanceKm).toFixed(2)}
            currency={receipt.currency}
          />

          {receipt.driverName && (
            <Text style={styles.driverLine}>Driver: {receipt.driverName}</Text>
          )}
          {receipt.pickupAddress && (
            <Text style={styles.addrLine}>From: {receipt.pickupAddress}</Text>
          )}
          {receipt.dropoffAddress && (
            <Text style={styles.addrLine}>To: {receipt.dropoffAddress}</Text>
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
