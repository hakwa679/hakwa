import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  fetchPayoutHistory,
  type MerchantPayoutListItem,
} from "@/hooks/use-merchant-api";

function formatCurrency(amount: string): string {
  return `FJD ${Number(amount).toFixed(2)}`;
}

export default function PayoutsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<MerchantPayoutListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [nextPayoutDate, setNextPayoutDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchPayoutHistory();
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setNextPayoutDate(page.nextPayoutDate);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPayoutHistory(nextCursor);
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
      setNextPayoutDate(page.nextPayoutDate);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
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
      <View style={styles.header}>
        <Text style={styles.title}>Payout history</Text>
        {nextPayoutDate ? (
          <Text style={styles.subtitle}>
            Next payout: {new Date(nextPayoutDate).toLocaleDateString()}
          </Text>
        ) : null}
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={<Text style={styles.empty}>No payouts yet.</Text>}
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color="#0a7ea4" /> : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              router.push({
                pathname: "/payouts/[payoutId]",
                params: { payoutId: item.id },
              })
            }
          >
            <View style={styles.rowLeft}>
              <Text style={styles.week}>{item.weekPeriod}</Text>
              <Text style={styles.meta}>{item.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.amount}>{formatCurrency(item.netAmount)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "700", color: "#11181C" },
  subtitle: { marginTop: 4, color: "#687076" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E0E0E0",
    paddingVertical: 14,
  },
  rowLeft: { flex: 1, marginRight: 12 },
  week: { fontSize: 15, color: "#11181C", fontWeight: "600" },
  meta: { marginTop: 4, color: "#687076", fontSize: 12 },
  amount: { fontSize: 16, fontWeight: "700", color: "#0a7ea4" },
  empty: { textAlign: "center", color: "#687076", marginTop: 40 },
});
