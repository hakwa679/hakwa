import { useCallback, useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const WS_URL = (process.env.EXPO_PUBLIC_WS_URL ?? API_URL).replace(
  /^http/,
  "ws",
);
const TOKEN_KEY = "hakwa_token";

export function useUnreadNotifications(): number {
  const [count, setCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  const refreshUnread = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) return;

      const res = await fetch(`${API_URL}/api/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const body = (await res.json()) as { count?: number };
        setCount(Math.max(0, Number(body.count ?? 0)));
      }
    } catch {
      // Ignore transient refresh failures.
    }
  }, []);

  useEffect(() => {
    let active = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token || !active) return;

      const ws = new WebSocket(
        `${WS_URL}/ws?token=${encodeURIComponent(token)}`,
      );
      wsRef.current = ws;

      ws.onmessage = (event) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(event.data as string) as Record<string, unknown>;
        } catch {
          return;
        }

        if (message["event"] === "notification.new") {
          setCount((prev) => prev + 1);
          return;
        }

        if (message["event"] === "notification.read") {
          setCount((prev) => Math.max(0, prev - 1));
          return;
        }

        if (
          message["event"] === "unread.count" &&
          typeof message["count"] === "number"
        ) {
          setCount(Math.max(0, message["count"]));
        }
      };

      ws.onclose = () => {
        if (!active) return;
        reconnectTimeout = setTimeout(() => {
          void connect();
        }, 3000);
      };
    };

    void refreshUnread();
    void connect();

    return () => {
      active = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, [refreshUnread]);

  return count;
}
