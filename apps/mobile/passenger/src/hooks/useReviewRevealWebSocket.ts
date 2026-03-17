import { useEffect, useRef } from "react";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "hakwa_token";
const WS_URL = (
  process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3000"
).replace(/^http/, "ws");

export function useReviewRevealWebSocket(
  onReveal: (tripId: string) => void,
): void {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let mounted = true;

    async function connect() {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!mounted || !token) return;

      const ws = new WebSocket(
        `${WS_URL}/ws?token=${encodeURIComponent(token)}`,
      );
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as Record<
            string,
            unknown
          >;
          if (
            payload["type"] === "review.revealed" &&
            typeof payload["tripId"] === "string"
          ) {
            onReveal(payload["tripId"]);
          }
        } catch {
          // ignore malformed message payloads
        }
      };
    }

    connect();
    return () => {
      mounted = false;
      wsRef.current?.close();
    };
  }, [onReveal]);
}
