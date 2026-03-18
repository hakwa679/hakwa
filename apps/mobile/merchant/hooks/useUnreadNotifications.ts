import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const WS_URL = (process.env.EXPO_PUBLIC_WS_URL ?? API_URL).replace(
  /^http/,
  "ws",
);
const TOKEN_KEY = "hakwa_token";

const unreadNotificationsQueryKey = ["notifications", "unread-count"] as const;

async function fetchUnreadNotificationsCount(): Promise<number> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return 0;

  const res = await fetch(`${API_URL}/api/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error("Failed to load unread notification count");
  }

  const body = (await res.json()) as { count?: number };
  return Math.max(0, Number(body.count ?? 0));
}

export function useUnreadNotifications(): number {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const { data: count = 0 } = useQuery({
    queryKey: unreadNotificationsQueryKey,
    queryFn: fetchUnreadNotificationsCount,
    retry: 1,
  });

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
          queryClient.setQueryData<number>(
            unreadNotificationsQueryKey,
            (prev = 0) => prev + 1,
          );
          return;
        }

        if (message["event"] === "notification.read") {
          queryClient.setQueryData<number>(
            unreadNotificationsQueryKey,
            (prev = 0) => Math.max(0, prev - 1),
          );
          return;
        }

        if (
          message["event"] === "unread.count" &&
          typeof message["count"] === "number"
        ) {
          queryClient.setQueryData<number>(
            unreadNotificationsQueryKey,
            Math.max(0, message["count"]),
          );
        }
      };

      ws.onclose = () => {
        if (!active) return;
        reconnectTimeout = setTimeout(() => {
          void connect();
        }, 3000);
      };
    };

    void queryClient.invalidateQueries({
      queryKey: unreadNotificationsQueryKey,
    });
    void connect();

    return () => {
      active = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, [queryClient]);

  return count;
}
