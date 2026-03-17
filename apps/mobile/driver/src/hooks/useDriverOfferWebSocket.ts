import { useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "hakwa_token";
const WS_URL = (
  process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3000"
).replace(/^http/, "ws");

export interface BookingOffer {
  tripId: string;
  pickupAddress: string;
  pickupLat: number;
  pickupLng: number;
  distanceToPickupKm: number;
  estimatedFare: string;
  timeoutSeconds: number;
}

/**
 * Opens a WebSocket connection to the API and listens for booking offer events
 * on the `driver:{userId}:offer` Redis channel relayed by the server.
 *
 * Exposes:
 * - `currentOffer` — the latest booking offer (null when no active offer)
 * - `clearOffer()` — dismiss the current offer (called after accept/decline)
 */
export function useDriverOfferWebSocket(): {
  currentOffer: BookingOffer | null;
  clearOffer: () => void;
} {
  const [currentOffer, setCurrentOffer] = useState<BookingOffer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    async function connect() {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token || !active) return;

      const url = `${WS_URL}/ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[ws] driver offer socket connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as Record<
            string,
            unknown
          >;

          if (data["type"] === "booking_offer") {
            setCurrentOffer({
              tripId: data["tripId"] as string,
              pickupAddress: (data["pickupAddress"] as string) ?? "",
              pickupLat: data["pickupLat"] as number,
              pickupLng: data["pickupLng"] as number,
              distanceToPickupKm: (data["distanceToPickupKm"] as number) ?? 0,
              estimatedFare: (data["estimatedFare"] as string) ?? "0.00",
              timeoutSeconds: (data["timeoutSeconds"] as number) ?? 30,
            });
          }

          if (
            data["type"] === "offer_expired" ||
            data["type"] === "offer_cancelled"
          ) {
            const offerId = data["tripId"] as string | undefined;
            setCurrentOffer((prev) => (prev?.tripId === offerId ? null : prev));
          }

          // Also handle legacy ride_offer format from dispatch loop
          if (data["type"] === "ride_offer") {
            setCurrentOffer({
              tripId: data["tripId"] as string,
              pickupAddress:
                (data["pickupAddress"] as string) ?? "Pickup location",
              pickupLat: (data["pickupLat"] as number) ?? 0,
              pickupLng: (data["pickupLng"] as number) ?? 0,
              distanceToPickupKm: (data["distanceToPickupKm"] as number) ?? 0,
              estimatedFare: (data["estimatedFare"] as string) ?? "0.00",
              timeoutSeconds: 30,
            });
          }
        } catch {
          // Ignore unparseable messages
        }
      };

      ws.onerror = () => {
        console.warn("[ws] driver offer socket error");
      };

      ws.onclose = () => {
        if (!active) return;
        // Reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (active) connect();
        }, 5000);
      };
    }

    connect();

    return () => {
      active = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, []);

  return {
    currentOffer,
    clearOffer: () => setCurrentOffer(null),
  };
}
