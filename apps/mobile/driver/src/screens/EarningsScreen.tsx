import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "hakwa_token";
const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EarningsItem {
  ledgerEntryId: string;
  driverEarnings: string;
  date: string | undefined;
  description: string | null | undefined;
}

interface EarningsResponse {
  items: EarningsItem[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-FJ", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * EarningsScreen — paginated list of driver earnings (T027).
 *
 * Fetches from `GET /api/driver/earnings` with cursor-based pagination.
 * Shows gross credit amounts from `ride_payment` ledger entries.
 */
export default function EarningsScreen() {
  const earningsQuery = useInfiniteQuery({
    queryKey: ["driver-earnings", "list"],
    queryFn: async ({ pageParam }) => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) {
        throw new Error("Not authenticated.");
      }

      const params = new URLSearchParams({ limit: "20" });
      if (typeof pageParam === "string" && pageParam.length > 0) {
        params.append("cursor", pageParam);
      }

      const res = await fetch(
        `${API_URL}/api/driver/earnings?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        throw new Error("Failed to load earnings. Please try again.");
      }

      return (await res.json()) as EarningsResponse;
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = earningsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const hasMore = earningsQuery.hasNextPage;
  const loading = earningsQuery.isFetchingNextPage;
  const initialLoading = earningsQuery.isPending;
  const error =
    earningsQuery.error instanceof Error ? earningsQuery.error.message : null;

  function handleLoadMore() {
    if (loading || !hasMore) return;
    void earningsQuery.fetchNextPage();
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (initialLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#3182CE"
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            void earningsQuery.refetch();
          }}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.screenTitle}>Earnings</Text>

      <FlatList
        data={items}
        keyExtractor={(item) => item.ledgerEntryId}
        contentContainerStyle={
          items.length === 0 ? styles.emptyContent : styles.listContent
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No earnings yet.</Text>
            <Text style={styles.emptySubtext}>
              Completed trips will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.earningsCard}>
            <View style={styles.cardLeft}>
              <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
              <Text
                style={styles.cardDesc}
                numberOfLines={1}
              >
                {item.description ?? "Trip payment"}
              </Text>
            </View>
            <Text style={styles.cardAmount}>FJD {item.driverEarnings}</Text>
          </View>
        )}
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity
              style={[styles.loadMoreButton, loading && styles.disabledButton]}
              onPress={handleLoadMore}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#3182CE" />
              ) : (
                <Text style={styles.loadMoreText}>Load more</Text>
              )}
            </TouchableOpacity>
          ) : items.length > 0 ? (
            <Text style={styles.endText}>All earnings loaded</Text>
          ) : null
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    paddingTop: 16,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1a1a1a",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  emptyContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  earningsCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  cardLeft: {
    flex: 1,
    marginRight: 12,
  },
  cardDate: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  cardAmount: {
    fontSize: 17,
    fontWeight: "800",
    color: "#38A169",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#555",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
  loadMoreButton: {
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#3182CE",
  },
  loadMoreText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#3182CE",
  },
  disabledButton: {
    opacity: 0.6,
  },
  endText: {
    textAlign: "center",
    color: "#aaa",
    fontSize: 13,
    marginTop: 8,
    marginBottom: 24,
  },
  errorText: {
    fontSize: 16,
    color: "#E53E3E",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: 28,
    backgroundColor: "#3182CE",
    borderRadius: 10,
  },
  retryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
