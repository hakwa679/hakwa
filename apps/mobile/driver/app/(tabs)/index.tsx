import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import AvailabilityScreen from "../../src/screens/AvailabilityScreen";
import OfferScreen from "../../src/screens/OfferScreen";
import NavigationScreen from "../../src/screens/NavigationScreen";
import { useDriverOfferWebSocket } from "../../src/hooks/useDriverOfferWebSocket";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// Active trip state — set after the driver accepts an offer
// ---------------------------------------------------------------------------

interface ActiveTrip {
  tripId: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  dropoffLat?: number;
  dropoffLng?: number;
  dropoffAddress?: string;
}

// ---------------------------------------------------------------------------
// HomeScreen — orchestrates the full driver trip lifecycle:
//
//   AvailabilityScreen (offline/available toggle)
//     ↓ WebSocket delivers BookingOffer
//   OfferScreen (30 s countdown — accept or decline)
//     ↓ accept
//   NavigationScreen (arrive → start → complete with GPS loop)
//     ↓ complete
//   AvailabilityScreen (driver set back to "available" by API)
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const router = useRouter();
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);

  const { currentOffer, clearOffer } = useDriverOfferWebSocket();

  // -------------------------------------------------------------------------
  // Sign-out
  // -------------------------------------------------------------------------

  async function handleSignOut() {
    try {
      const token = await SecureStore.getItemAsync("hakwa_token");
      await fetch(`${API_URL}/auth/sign-out`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // best-effort
    } finally {
      await SecureStore.deleteItemAsync("hakwa_token");
      router.replace("/auth/sign-in");
    }
  }

  function confirmSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: handleSignOut },
    ]);
  }

  // -------------------------------------------------------------------------
  // Offer accepted → transition to navigation
  // -------------------------------------------------------------------------

  function handleOfferAccepted(
    tripId: string,
    pickupLat: number,
    pickupLng: number,
    pickupAddress: string,
  ) {
    clearOffer();
    setActiveTrip({ tripId, pickupLat, pickupLng, pickupAddress });
  }

  // -------------------------------------------------------------------------
  // Trip complete → return to availability screen
  // -------------------------------------------------------------------------

  function handleTripComplete(_actualFare: string, _driverEarnings: string) {
    setActiveTrip(null);
  }

  // -------------------------------------------------------------------------
  // Render layers
  // -------------------------------------------------------------------------

  // Layer 3: Active navigation (overrides everything while on trip)
  if (activeTrip) {
    return (
      <NavigationScreen
        tripId={activeTrip.tripId}
        pickupLat={activeTrip.pickupLat}
        pickupLng={activeTrip.pickupLng}
        pickupAddress={activeTrip.pickupAddress}
        dropoffLat={activeTrip.dropoffLat}
        dropoffLng={activeTrip.dropoffLng}
        dropoffAddress={activeTrip.dropoffAddress}
        onTripComplete={handleTripComplete}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Layer 1: Availability toggle */}
      <View style={styles.availabilityWrapper}>
        <AvailabilityScreen />
      </View>

      {/* Layer 2: Offer overlay — shown when a dispatch offer arrives */}
      {currentOffer && (
        <View style={styles.offerOverlay}>
          <OfferScreen
            offer={currentOffer}
            onAccepted={handleOfferAccepted}
            onDeclined={clearOffer}
          />
        </View>
      )}

      {/* Sign-out link at the bottom */}
      <View style={styles.footer}>
        <Pressable onPress={confirmSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  availabilityWrapper: {
    flex: 1,
  },
  offerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  footer: {
    alignItems: "center",
    paddingVertical: 16,
    backgroundColor: "#f5f5f5",
  },
  signOutText: {
    fontSize: 14,
    color: "#d9534f",
    fontWeight: "600",
  },
});
