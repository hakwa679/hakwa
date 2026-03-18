import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const TOKEN_KEY = "hakwa_token";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export default function MerchantNotificationsScreen() {
  const notificationsQuery = useQuery({
    queryKey: ["merchant-notifications", "list"],
    queryFn: async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) return [] as NotificationItem[];

      const res = await fetch(`${API_URL}/api/notifications?limit=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to load notifications");
      }

      const body = (await res.json()) as { data?: NotificationItem[] };
      return body.data ?? [];
    },
  });

  const items = useMemo(
    () => notificationsQuery.data ?? [],
    [notificationsQuery.data],
  );
  const loading = notificationsQuery.isPending;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#0a7ea4"
        />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={
        items.length === 0 ? styles.emptyContainer : styles.content
      }
      data={items}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => void notificationsQuery.refetch()}
        />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No notifications</Text>
          <Text style={styles.emptySubtitle}>
            Merchant wallet and payout updates show here.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
          <Text style={styles.date}>
            {new Date(item.createdAt).toLocaleString()}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: "#151718",
  },
  content: {
    padding: 16,
  },
  emptyContainer: {
    flexGrow: 1,
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    color: "#ECEDEE",
  },
  emptySubtitle: {
    color: "#9BA1A6",
  },
  card: {
    backgroundColor: "#1d2022",
    borderWidth: 1,
    borderColor: "#2f3336",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
    color: "#ECEDEE",
  },
  body: {
    color: "#d5d8db",
    marginBottom: 8,
  },
  date: {
    color: "#9BA1A6",
    fontSize: 12,
  },
});
