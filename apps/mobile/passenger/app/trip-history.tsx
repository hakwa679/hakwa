import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

interface TripRow {
  tripId: string;
  status: string;
  destinationAddress: string | null;
  pickupAddress: string | null;
  estimatedFare: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string | null;
}

export default function TripHistoryScreen() {
  const router = useRouter();
  const tripsQuery = useInfiniteQuery({
    queryKey: ["passenger-trips", "history"],
    queryFn: async ({ pageParam }) => {
      const token = await SecureStore.getItemAsync("session_token");
      const page = typeof pageParam === "number" ? pageParam : 1;
      const res = await fetch(
        `${API_URL}/api/bookings/history?page=${page}&limit=20`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        throw new Error("Failed to load history");
      }

      return (await res.json()) as { trips: TripRow[]; hasMore: boolean };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.hasMore ? Number(lastPageParam) + 1 : undefined,
  });

  const trips = tripsQuery.data?.pages.flatMap((page) => page.trips) ?? [];
  const hasMore = tripsQuery.hasNextPage;
  const loading = tripsQuery.isFetchingNextPage;
  const initialLoading = tripsQuery.isPending;
  const error =
    tripsQuery.error instanceof Error ? tripsQuery.error.message : null;

  const loadMore = () => {
    if (!hasMore || loading) return;
    void tripsQuery.fetchNextPage();
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderItem = ({ item }: { item: TripRow }) => {
    const endedAt = item.completedAt ?? item.cancelledAt ?? item.createdAt;
    return (
      <Pressable
        style={styles.row}
        onPress={() => router.push(`/trip-receipt?tripId=${item.tripId}`)}
      >
        <View style={styles.rowMain}>
          <Text
            style={styles.destination}
            numberOfLines={1}
          >
            {item.destinationAddress ?? "Unknown destination"}
          </Text>
          <Text style={styles.date}>{formatDate(endedAt)}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.fare}>
            {item.estimatedFare
              ? `FJD ${parseFloat(item.estimatedFare).toFixed(2)}`
              : "—"}
          </Text>
          <Text
            style={[
              styles.statusBadge,
              item.status === "completed"
                ? styles.statusCompleted
                : styles.statusCancelled,
            ]}
          >
            {item.status}
          </Text>
        </View>
      </Pressable>
    );
  };

  if (initialLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#6C63FF"
        />
        <Text style={styles.loadingText}>Loading trips…</Text>
      </View>
    );
  }

  if (error && trips.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={styles.retryBtn}
          onPress={() => {
            void tripsQuery.refetch();
          }}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your trips</Text>
      {trips.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No trips yet</Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.tripId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loading ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator
                  size="small"
                  color="#6C63FF"
                />
              </View>
            ) : !hasMore ? (
              <Text style={styles.endText}>No more trips</Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1A2E",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  row: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
  },
  rowMain: { flex: 1, marginRight: 12 },
  destination: { fontSize: 15, fontWeight: "600", color: "#1A1A2E" },
  date: { fontSize: 12, color: "#888", marginTop: 4 },
  rowRight: { alignItems: "flex-end", gap: 6 },
  fare: { fontSize: 15, fontWeight: "700", color: "#6C63FF" },
  statusBadge: {
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden",
    textTransform: "capitalize",
  },
  statusCompleted: { backgroundColor: "#E8F5E9", color: "#388E3C" },
  statusCancelled: { backgroundColor: "#FFEBEE", color: "#C62828" },
  loadingText: { color: "#888", marginTop: 8 },
  emptyText: { fontSize: 16, color: "#888" },
  errorText: { fontSize: 15, color: "#C62828", textAlign: "center" },
  retryBtn: {
    backgroundColor: "#6C63FF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryBtnText: { color: "#FFF", fontWeight: "600" },
  footerLoader: { paddingVertical: 16, alignItems: "center" },
  endText: {
    textAlign: "center",
    color: "#AAA",
    fontSize: 13,
    paddingVertical: 16,
  },
});
