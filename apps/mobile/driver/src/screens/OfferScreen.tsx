import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import type { BookingOffer } from "../hooks/useDriverOfferWebSocket";

const TOKEN_KEY = "hakwa_token";
const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3000";

interface Props {
  offer: BookingOffer;
  onAccepted: (
    tripId: string,
    pickupLat: number,
    pickupLng: number,
    pickupAddress: string,
  ) => void;
  onDeclined: () => void;
}

/**
 * OfferScreen — displays a single booking offer with:
 * - pickup address
 * - estimated distance to pickup
 * - fare estimate
 * - 30-second countdown timer (auto-dismisses on expiry)
 *
 * Props:
 * - `offer` — the BookingOffer from the WebSocket hook
 * - `onAccepted` — called with trip details after a successful accept
 * - `onDeclined` — called after decline or timer expiry
 */
export default function OfferScreen({ offer, onAccepted, onDeclined }: Props) {
  const [timeLeft, setTimeLeft] = useState(offer.timeoutSeconds);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer — auto-dismiss when reaches 0 (T025)
  useEffect(() => {
    setTimeLeft(offer.timeoutSeconds);
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          // Auto-decline on expiry
          handleDecline(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [offer.tripId]);

  const handleAccept = useCallback(async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setLoading(true);

    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const res = await fetch(
        `${API_URL}/api/driver/bookings/${offer.tripId}/accept`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );

      if (res.ok) {
        onAccepted(
          offer.tripId,
          offer.pickupLat,
          offer.pickupLng,
          offer.pickupAddress,
        );
      } else if (res.status === 409) {
        Alert.alert(
          "Already taken",
          "This booking was accepted by another driver.",
        );
        onDeclined();
      } else if (res.status === 410) {
        Alert.alert("Expired", "This offer has already expired.");
        onDeclined();
      } else {
        Alert.alert("Error", "Could not accept the booking. Please try again.");
        setLoading(false);
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
      setLoading(false);
    }
  }, [offer, onAccepted, onDeclined]);

  const handleDecline = useCallback(
    async (isAutoDecline = false) => {
      if (intervalRef.current) clearInterval(intervalRef.current);

      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        await fetch(`${API_URL}/api/driver/bookings/${offer.tripId}/decline`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch {
        // Best-effort — decline is fire-and-forget
      }

      if (isAutoDecline) {
        Alert.alert("Request expired", "The booking request has expired.", [
          { text: "OK", onPress: onDeclined },
        ]);
      } else {
        onDeclined();
      }
    },
    [offer.tripId, onDeclined],
  );

  const timerColor =
    timeLeft > 15 ? "#22c55e" : timeLeft > 7 ? "#f97316" : "#ef4444";

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        {/* Timer */}
        <View style={[styles.timerBadge, { borderColor: timerColor }]}>
          <Text style={[styles.timerText, { color: timerColor }]}>
            {timeLeft}s
          </Text>
        </View>

        <Text style={styles.heading}>New Booking Request</Text>

        {/* Pickup */}
        <View style={styles.row}>
          <Text style={styles.label}>Pickup</Text>
          <Text
            style={styles.value}
            numberOfLines={2}
          >
            {offer.pickupAddress || "Pickup location"}
          </Text>
        </View>

        {/* Distance to pickup */}
        <View style={styles.row}>
          <Text style={styles.label}>Distance to pickup</Text>
          <Text style={styles.value}>
            {offer.distanceToPickupKm.toFixed(1)} km
          </Text>
        </View>

        {/* Fare estimate */}
        <View style={styles.row}>
          <Text style={styles.label}>Estimated fare</Text>
          <Text style={styles.fareText}>FJD {offer.estimatedFare}</Text>
        </View>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.declineBtn}
            onPress={() => handleDecline(false)}
            disabled={loading}
          >
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.acceptBtn, loading && styles.disabledBtn]}
            onPress={handleAccept}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.acceptBtnText}>Accept</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    padding: 16,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  timerBadge: {
    alignSelf: "flex-end",
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  timerText: {
    fontSize: 16,
    fontWeight: "700",
  },
  heading: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  label: {
    fontSize: 14,
    color: "#64748b",
    flex: 1,
  },
  value: {
    fontSize: 14,
    color: "#1e293b",
    fontWeight: "500",
    flex: 2,
    textAlign: "right",
  },
  fareText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#6366f1",
    flex: 2,
    textAlign: "right",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  declineBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
  },
  declineBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#475569",
  },
  acceptBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#6366f1",
    alignItems: "center",
  },
  acceptBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  disabledBtn: {
    opacity: 0.6,
  },
});
