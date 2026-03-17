import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

type Badge = {
  key: string;
  name: string | null;
  iconUrl: string | null;
  awardedAt: string;
};

type ProfileResponse = {
  totalPoints: number;
  currentStreak: number;
  badges: Badge[];
  referralCode: string | null;
};

export function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProfileResponse | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await SecureStore.getItemAsync("hakwa_token");
        const res = await fetch(`${API_URL}/api/me/gamification`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          throw new Error(`Failed to load profile (${res.status})`);
        }
        const body = (await res.json()) as ProfileResponse;
        if (alive) {
          setData(body);
        }
      } catch (err) {
        if (alive) {
          setError(
            err instanceof Error ? err.message : "Failed to load profile",
          );
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gamification Profile</Text>
      {loading ? <ActivityIndicator color="#1f4f6a" /> : null}
      {!loading && error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !error && data ? (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{data.totalPoints} pts</Text>
            <Text style={styles.summaryMeta}>
              Current streak: {data.currentStreak} days
            </Text>
            <Text style={styles.summaryMeta}>
              Referral code: {data.referralCode ?? "-"}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Badges</Text>
          <FlatList
            data={data.badges}
            keyExtractor={(item) => item.key}
            numColumns={2}
            contentContainerStyle={styles.badgeGrid}
            columnWrapperStyle={styles.badgeRow}
            renderItem={({ item }) => (
              <View style={styles.badgeCard}>
                <Text style={styles.badgeName}>{item.name ?? item.key}</Text>
                <Text style={styles.badgeDate}>
                  {new Date(item.awardedAt).toLocaleDateString()}
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>No badges yet.</Text>
            }
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#15364e",
    marginBottom: 14,
  },
  summaryCard: {
    backgroundColor: "#f6fbff",
    borderColor: "#cde1f0",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    gap: 4,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#15364e",
  },
  summaryMeta: {
    color: "#496a80",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#15364e",
    marginBottom: 8,
  },
  badgeGrid: {
    paddingBottom: 16,
  },
  badgeRow: {
    gap: 8,
  },
  badgeCard: {
    flex: 1,
    backgroundColor: "#f8f9fb",
    borderColor: "#d8dce3",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  badgeName: {
    fontWeight: "700",
    color: "#22384a",
  },
  badgeDate: {
    color: "#697a88",
    marginTop: 4,
    fontSize: 12,
  },
  empty: {
    color: "#697a88",
  },
  error: {
    color: "#b62828",
  },
});
