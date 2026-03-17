import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  fetchPayoutDetail,
  type MerchantPayoutDetail,
} from "@/hooks/use-merchant-api";

function formatCurrency(amount: string): string {
  return `FJD ${Number(amount).toFixed(2)}`;
}

export default function PayoutDetailScreen() {
  const { payoutId } = useLocalSearchParams<{ payoutId: string }>();
  const [detail, setDetail] = useState<MerchantPayoutDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDetail() {
      if (!payoutId) return;
      try {
        const result = await fetchPayoutDetail(payoutId);
        setDetail(result);
      } finally {
        setLoading(false);
      }
    }

    void loadDetail();
  }, [payoutId]);

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

  if (!detail) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Payout not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payout detail</Text>
      <Text style={styles.line}>
        Week: {detail.weekStart} to {detail.weekEnd}
      </Text>
      <Text style={styles.line}>
        Gross amount: {formatCurrency(detail.amount)}
      </Text>
      <Text style={styles.line}>
        Service fee: {formatCurrency(detail.serviceFee)}
      </Text>
      <Text style={styles.line}>
        Net amount: {formatCurrency(detail.netAmount)}
      </Text>
      <Text style={styles.line}>Status: {detail.status.toUpperCase()}</Text>
      <Text style={styles.line}>
        Bank account: {detail.bankAccount.bankName} ****
        {detail.bankAccount.accountNumberLast4}
      </Text>
      {detail.failureReason ? (
        <Text style={styles.failureText}>
          Failure reason: {detail.failureReason}
        </Text>
      ) : null}
      {detail.note ? <Text style={styles.note}>{detail.note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 14,
    color: "#11181C",
  },
  line: { fontSize: 15, color: "#2a2f35", marginBottom: 10 },
  failureText: { color: "#b42318", marginTop: 8, fontWeight: "600" },
  note: { marginTop: 10, color: "#687076" },
  errorText: { color: "#b42318" },
});
