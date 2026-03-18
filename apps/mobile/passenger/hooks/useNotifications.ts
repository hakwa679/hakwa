import { useEffect, useRef } from "react";
import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  const notificationsQueryKey = ["notifications", "list"] as const;

  const notificationsQuery = useInfiniteQuery({
    queryKey: notificationsQueryKey,
    queryFn: async ({ pageParam }) => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) {
        return {
          data: [],
          nextCursor: null,
          totalUnread: 0,
        } satisfies ListResponse;
      }

      const query = new URLSearchParams({ limit: "20" });
      if (typeof pageParam === "string" && pageParam.length > 0) {
        query.set("cursor", pageParam);
      }

      const res = await fetch(
        `${API_URL}/api/notifications?${query.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        throw new Error("Failed to load notifications");
      }

      return (await res.json()) as ListResponse;
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items =
    notificationsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const unreadCount = notificationsQuery.data?.pages[0]?.totalUnread ?? 0;

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) return null;

      const res = await fetch(`${API_URL}/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok && res.status !== 409) {
        throw new Error("Failed to mark notification as read");
      }

      const body = (await res.json()) as { readAt: string };
      return { id, readAt: body.readAt ?? new Date().toISOString() };
    },
    onSuccess: (result) => {
      if (!result) return;

      queryClient.setQueryData<InfiniteData<ListResponse>>(
        notificationsQueryKey,
        (prev) => {
          if (!prev) return prev;

          let wasUnread = false;
          const nextPages = prev.pages.map((page) => ({
            ...page,
            data: page.data.map((item) => {
              if (item.id !== result.id) return item;
              if (!item.readAt) wasUnread = true;
              return { ...item, readAt: result.readAt };
            }),
          }));

          if (!wasUnread) {
            return { ...prev, pages: nextPages };
          }

          const first = nextPages[0];
          nextPages[0] = {
            ...first,
            totalUnread: Math.max(0, first.totalUnread - 1),
          };

          return {
            ...prev,
            pages: nextPages,
          };
        },
      );
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) return;

      const res = await fetch(`${API_URL}/api/notifications/mark-all-read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to mark all notifications as read");
      }
    },
    onSuccess: () => {
      queryClient.setQueryData<InfiniteData<ListResponse>>(
        notificationsQueryKey,
        (prev) => {
          if (!prev) return prev;

          const now = new Date().toISOString();
          const nextPages = prev.pages.map((page, index) => ({
            ...page,
            totalUnread: index === 0 ? 0 : page.totalUnread,
            data: page.data.map((item) => ({
              ...item,
              readAt: item.readAt ?? now,
            })),
          }));

          return {
            ...prev,
            pages: nextPages,
          };
        },
      );
    },
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

        queryClient.setQueryData<InfiniteData<ListResponse>>(
          notificationsQueryKey,
          (prev) => {
            if (!prev) {
              return {
                pageParams: [""],
                pages: [
                  {
                    data: [incoming],
                    nextCursor: null,
                    totalUnread: 1,
                  },
                ],
              };
            }

            const firstPage = prev.pages[0];
            if (
              !incoming.id ||
              firstPage.data.some((item) => item.id === incoming.id)
            ) {
              return prev;
            }

            const updatedFirst = {
              ...firstPage,
              data: [incoming, ...firstPage.data],
              totalUnread: firstPage.totalUnread + 1,
            };

            return {
              ...prev,
              pages: [updatedFirst, ...prev.pages.slice(1)],
            };
          },
        );
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
  }, [queryClient]);

  return {
    items,
    loading: notificationsQuery.isPending,
    loadingMore: notificationsQuery.isFetchingNextPage,
    unreadCount,
    refresh: notificationsQuery.refetch,
    loadMore: notificationsQuery.fetchNextPage,
    markAsRead: markAsReadMutation.mutateAsync,
    markAllRead: markAllReadMutation.mutateAsync,
  };
}
