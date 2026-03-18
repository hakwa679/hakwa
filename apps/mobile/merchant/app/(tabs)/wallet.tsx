/**
 * T017 — Merchant Wallet Screen
 *
 * Displays the merchant's current balance, a paginated ledger of entries,
 * and listens for real-time `balance_updated` WebSocket events so the balance
 * refreshes immediately after a trip completes without a manual pull-to-refresh.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const WS_URL = API_URL.replace(/^http/, "ws") + "/ws";

interface WalletBalance {
  balance: string;
  currency: string;
  pendingPayoutAmount: string;
  lastPayoutAt: string | null;
  nextPayoutAt: string;
}

interface LedgerItem {
  id: string;
  entryType: string;
  amount: string;
  label: string;
  tripId: string | null;
  createdAt: string;
}

interface LedgerPage {
  items: LedgerItem[];
  nextCursor: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await SecureStore.getItemAsync("hakwa_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function WalletScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const balanceQueryKey = ["merchant-wallet", "balance"] as const;
  const ledgerQueryKey = ["merchant-wallet", "ledger"] as const;

  const balanceQuery = useQuery({
    queryKey: balanceQueryKey,
    queryFn: async () => {
      const headers = await authHeaders();
      const res = await fetch(`${API_URL}/api/merchant/wallet/balance`, {
        headers,
      });

      if (!res.ok) {
        throw new Error("Failed to load wallet balance");
      }

      return (await res.json()) as WalletBalance;
    },
  });

  const ledgerQuery = useInfiniteQuery({
    queryKey: ledgerQueryKey,
    queryFn: async ({ pageParam }) => {
      const headers = await authHeaders();
      const params = new URLSearchParams({ limit: "20" });
      if (typeof pageParam === "string" && pageParam.length > 0) {
        params.set("cursor", pageParam);
      }
      const res = await fetch(
        `${API_URL}/api/merchant/wallet/ledger?${params.toString()}`,
        { headers },
      );

      if (!res.ok) {
        throw new Error("Failed to load wallet ledger");
      }

      return (await res.json()) as LedgerPage;
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const balance = balanceQuery.data ?? null;
  const items = ledgerQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const loadingBalance = balanceQuery.isPending;
  const loadingLedger = ledgerQuery.isPending;
  const loadingMore = ledgerQuery.isFetchingNextPage;
  const hasMore = ledgerQuery.hasNextPage;

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    await ledgerQuery.fetchNextPage();
  }, [hasMore, ledgerQuery, loadingMore]);

  // ---------------------------------------------------------------------------
  // Pull-to-refresh
  // ---------------------------------------------------------------------------
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([balanceQuery.refetch(), ledgerQuery.refetch()]);
    setRefreshing(false);
  }, [balanceQuery, ledgerQuery]);

  // ---------------------------------------------------------------------------
  // T017: Real-time WebSocket — refresh balance on `balance_updated` event
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = async () => {
      const token = await SecureStore.getItemAsync("hakwa_token");
      const url = token
        ? `${WS_URL}?token=${encodeURIComponent(token)}`
        : WS_URL;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type?: string };
          if (msg.type === "balance_updated") {
            void queryClient.invalidateQueries({ queryKey: balanceQueryKey });
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    void connect();

    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [queryClient]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const formatCurrency = (amount: string, currency = "FJD") =>
    `${currency} ${parseFloat(amount).toFixed(2)}`;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const renderItem = ({ item }: { item: LedgerItem }) => {
    const isCredit = parseFloat(item.amount) >= 0;
    return (
      <View style={styles.ledgerRow}>
        <View style={styles.ledgerLeft}>
          <Text style={styles.ledgerLabel}>{item.label}</Text>
          <Text style={styles.ledgerDate}>{formatDate(item.createdAt)}</Text>
        </View>
        <Text
          style={[styles.ledgerAmount, isCredit ? styles.credit : styles.debit]}
        >
          {isCredit ? "+" : ""}
          {formatCurrency(item.amount)}
        </Text>
      </View>
    );
  };

  if (loadingBalance && loadingLedger) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator
          size="large"
          color="#0a7ea4"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Balance card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current balance</Text>
        <Text style={styles.balanceAmount}>
          {balance ? formatCurrency(balance.balance, balance.currency) : "—"}
        </Text>
        {balance?.pendingPayoutAmount &&
          parseFloat(balance.pendingPayoutAmount) > 0 && (
            <Text style={styles.pendingText}>
              Pending payout:{" "}
              {formatCurrency(balance.pendingPayoutAmount, balance.currency)}
            </Text>
          )}
        {balance?.lastPayoutAt && (
          <Text style={styles.lastPayoutText}>
            Last payout: {formatDate(balance.lastPayoutAt)}
          </Text>
        )}
        {balance?.nextPayoutAt && (
          <Text style={styles.lastPayoutText}>
            Next payout: {formatDate(balance.nextPayoutAt)}
          </Text>
        )}
        <Pressable
          style={styles.payoutHistoryButton}
          onPress={() => router.push("/payouts")}
        >
          <Text style={styles.payoutHistoryButtonText}>
            View payout history
          </Text>
        </Pressable>
      </View>

      {/* Ledger list */}
      <Text style={styles.sectionTitle}>Transaction history</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          loadingLedger ? null : (
            <Text style={styles.emptyText}>No transactions yet.</Text>
          )
        }
        ListFooterComponent={
          hasMore && loadingMore ? (
            <ActivityIndicator
              size="small"
              color="#0a7ea4"
            />
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  balanceCard: {
    backgroundColor: "#0a7ea4",
    padding: 24,
    marginBottom: 16,
  },
  balanceLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginBottom: 4,
  },
  balanceAmount: { color: "#fff", fontSize: 36, fontWeight: "700" },
  pendingText: { color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 6 },
  lastPayoutText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginTop: 2,
  },
  payoutHistoryButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  payoutHistoryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: "#11181C",
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  ledgerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E0E0E0",
  },
  ledgerLeft: { flex: 1, marginRight: 8 },
  ledgerLabel: { fontSize: 14, color: "#11181C", fontWeight: "500" },
  ledgerDate: { fontSize: 12, color: "#687076", marginTop: 2 },
  ledgerAmount: { fontSize: 15, fontWeight: "600" },
  credit: { color: "#1B8A2E" },
  debit: { color: "#C0392B" },
  emptyText: {
    textAlign: "center",
    color: "#687076",
    marginTop: 40,
    fontSize: 15,
  },
});
