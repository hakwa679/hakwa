import { useCallback, useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const WS_URL = (process.env.EXPO_PUBLIC_WS_URL ?? API_URL).replace(
  /^http/,
  "ws",
);
const TOKEN_KEY = "hakwa_token";

export interface NotificationItem {
  id: string;
  type: string;
  channel: "in_app";
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  status: "pending" | "sent" | "failed";
  readAt: string | null;
  createdAt: string;
}

interface ListResponse {
  data: NotificationItem[];
  nextCursor: string | null;
  totalUnread: number;
}

export function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchPage = useCallback(async (cursor?: string) => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return null;

    const query = new URLSearchParams({ limit: "20" });
    if (cursor) query.set("cursor", cursor);

    const res = await fetch(
      `${API_URL}/api/notifications?${query.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok) return null;
    return (await res.json()) as ListResponse;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchPage();
      if (!body) return;
      setItems(body.data);
      setNextCursor(body.nextCursor);
      setUnreadCount(body.totalUnread);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const body = await fetchPage(nextCursor);
      if (!body) return;
      setItems((prev) => [...prev, ...body.data]);
      setNextCursor(body.nextCursor);
      setUnreadCount(body.totalUnread);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, loadingMore, nextCursor]);

  const markAsRead = useCallback(async (id: string) => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;

    const res = await fetch(`${API_URL}/api/notifications/${id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok || res.status === 409) {
      const body = (await res.json()) as { readAt: string };
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, readAt: body.readAt ?? item.readAt }
            : item,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;

    const res = await fetch(`${API_URL}/api/notifications/mark-all-read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      );
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

        if (message["event"] !== "notification.new") return;

        const incoming: NotificationItem = {
          id: String(message["notificationId"] ?? ""),
          type: String(message["type"] ?? "system_alert"),
          channel: "in_app",
          title: String(message["title"] ?? "Notification"),
          body: String(message["body"] ?? ""),
          data:
            typeof message["data"] === "object" && message["data"] !== null
              ? (message["data"] as Record<string, unknown>)
              : null,
          status: "sent",
          readAt: null,
          createdAt: String(message["createdAt"] ?? new Date().toISOString()),
        };

        setItems((prev) => {
          if (!incoming.id || prev.some((item) => item.id === incoming.id)) {
            return prev;
          }
          return [incoming, ...prev];
        });
        setUnreadCount((prev) => prev + 1);
      };

      ws.onclose = () => {
        if (!active) return;
        reconnectTimeout = setTimeout(() => {
          void connect();
        }, 3000);
      };
    };

    void connect();

    return () => {
      active = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, []);

  return {
    items,
    loading,
    loadingMore,
    unreadCount,
    refresh,
    loadMore,
    markAsRead,
    markAllRead,
  };
}
