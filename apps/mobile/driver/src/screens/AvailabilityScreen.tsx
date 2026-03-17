import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Switch,
  Text,
  View,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from "react-native";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "hakwa_token";
const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3000";

type AvailabilityStatus = "offline" | "available" | "on_trip";

interface Props {
  /**
   * Called when the driver's availability status changes so parent
   * screens can react (e.g. start/stop location polling).
   */
  onStatusChange?: (status: AvailabilityStatus) => void;
}

/**
 * AvailabilityScreen — driver online/offline toggle.
 *
 * Shows the current status and a switch that calls
 * `PATCH /api/driver/availability`.
 */
export default function AvailabilityScreen({ onStatusChange }: Props) {
  const [status, setStatus] = useState<AvailabilityStatus>("offline");
  const [loading, setLoading] = useState(false);

  // Request location permission when going online (Android)
  async function requestLocationPermission(): Promise<boolean> {
    if (Platform.OS !== "android") return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: "Location permission",
          message:
            "Hakwa Driver needs your location to show you to nearby passengers.",
          buttonNeutral: "Ask Me Later",
          buttonNegative: "Cancel",
          buttonPositive: "Allow",
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }

  const toggle = useCallback(
    async (goOnline: boolean) => {
      if (status === "on_trip" && !goOnline) {
        Alert.alert(
          "Cannot go offline",
          "You cannot go offline while you are on a trip.",
        );
        return;
      }

      if (goOnline) {
        const permitted = await requestLocationPermission();
        if (!permitted) {
          Alert.alert(
            "Location required",
            "Location permission is required to go online.",
          );
          return;
        }
      }

      setLoading(true);

      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        const res = await fetch(`${API_URL}/api/driver/availability`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ status: goOnline ? "available" : "offline" }),
        });

        if (res.status === 204) {
          const newStatus: AvailabilityStatus = goOnline
            ? "available"
            : "offline";
          setStatus(newStatus);
          onStatusChange?.(newStatus);
        } else if (res.status === 409) {
          Alert.alert("Cannot go offline", "You are currently on a trip.");
        } else {
          Alert.alert(
            "Error",
            "Failed to update availability. Please try again.",
          );
        }
      } catch {
        Alert.alert("Error", "Network error. Please check your connection.");
      } finally {
        setLoading(false);
      }
    },
    [status, onStatusChange],
  );

  const statusColor =
    status === "available"
      ? "#22c55e"
      : status === "on_trip"
        ? "#f97316"
        : "#94a3b8";

  const statusLabel =
    status === "available"
      ? "Online"
      : status === "on_trip"
        ? "On Trip"
        : "Offline";

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>
          {statusLabel}
        </Text>

        {status === "on_trip" ? (
          <Text style={styles.onTripNote}>
            Complete your current trip before going offline.
          </Text>
        ) : (
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>
              {status === "available" ? "Go Offline" : "Go Online"}
            </Text>
            {loading ? (
              <ActivityIndicator
                size="small"
                color="#6366f1"
              />
            ) : (
              <Switch
                value={status === "available"}
                onValueChange={toggle}
                trackColor={{ false: "#e2e8f0", true: "#6366f1" }}
                thumbColor="#ffffff"
                disabled={false}
              />
            )}
          </View>
        )}
      </View>

      {status === "available" && (
        <Text style={styles.waitingText}>Waiting for a booking request…</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    padding: 24,
  },
  card: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statusDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 20,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toggleLabel: {
    fontSize: 16,
    color: "#475569",
  },
  onTripNote: {
    fontSize: 14,
    color: "#f97316",
    textAlign: "center",
  },
  waitingText: {
    marginTop: 24,
    fontSize: 14,
    color: "#94a3b8",
  },
});
