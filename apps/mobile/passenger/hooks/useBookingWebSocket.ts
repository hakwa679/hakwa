import { useEffect, useRef, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";

const WS_URL = (
  process.env.EXPO_PUBLIC_WS_URL ?? "ws://localhost:3000"
).replace(/^http/, "ws");

export type TripStatus =
  | "pending"
  | "accepted"
  | "driver_arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "timed_out";

export interface DriverLocation {
  lat: number;
  lng: number;
  at: string;
}

export interface DriverInfo {
  id?: string;
  name?: string;
  vehicle?: {
    make?: string;
    model?: string;
    plate?: string;
    color?: string;
  };
  estimatedArrivalMinutes?: number;
}

interface StatusChangedMessage {
  type: "status_changed";
  tripId: string;
  status: TripStatus;
  driverId?: string;
  driverName?: string;
  at: string;
}

interface LocationUpdateMessage {
  type: "location_update";
  tripId: string;
  lat: number;
  lng: number;
  at: string;
}

type BookingMessage = StatusChangedMessage | LocationUpdateMessage;

interface UseBookingWebSocketOptions {
  tripId: string | null;
  enabled?: boolean;
}

interface UseBookingWebSocketResult {
  status: TripStatus | null;
  driverLocation: DriverLocation | null;
  driverInfo: DriverInfo | null;
  connected: boolean;
}

const TERMINAL_STATES: TripStatus[] = ["completed", "cancelled", "timed_out"];

/**
 * useBookingWebSocket — manages WebSocket lifecycle for a booking.
 *
 * Subscribes to `booking:{tripId}:status` and `booking:{tripId}:location`
 * channels via the server WS. Reconnects automatically on disconnect unless
 * a terminal state has been reached.
 */
export function useBookingWebSocket({
  tripId,
  enabled = true,
}: UseBookingWebSocketOptions): UseBookingWebSocketResult {
  const [status, setStatus] = useState<TripStatus | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(
    null,
  );
  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isTerminalRef = useRef(false);

  const connect = useCallback(async () => {
    if (!tripId || !enabled || isTerminalRef.current) return;

    const token = await SecureStore.getItemAsync("hakwa_token").catch(
      () => null,
    );
    const url = token
      ? `${WS_URL}/ws?token=${encodeURIComponent(token)}`
      : `${WS_URL}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", channel: "trip", tripId }));
    };

    ws.onmessage = (event) => {
      let msg: BookingMessage;
      try {
        msg = JSON.parse(event.data as string) as BookingMessage;
      } catch {
        return;
      }

      if (msg.type === "status_changed") {
        setStatus(msg.status);
        if (msg.driverName) {
          setDriverInfo((prev) => ({
            ...prev,
            id: msg.driverId,
            name: msg.driverName,
          }));
        }
        if (TERMINAL_STATES.includes(msg.status)) {
          isTerminalRef.current = true;
          ws.close();
        }
      } else if (msg.type === "location_update") {
        setDriverLocation({ lat: msg.lat, lng: msg.lng, at: msg.at });
      }
    };

    ws.onerror = () => {
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;

      if (!isTerminalRef.current && enabled) {
        // Reconnect after 3 s
        reconnectTimeoutRef.current = setTimeout(() => {
          connect().catch(() => {});
        }, 3000);
      }
    };
  }, [tripId, enabled]);

  useEffect(() => {
    isTerminalRef.current = false;
    connect().catch(() => {});

    return () => {
      isTerminalRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { status, driverLocation, driverInfo, connected };
}
