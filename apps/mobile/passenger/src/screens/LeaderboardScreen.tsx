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

type LeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  points: number;
  isCurrentUser?: boolean;
};

export function LeaderboardScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await SecureStore.getItemAsync("hakwa_token");
        const res = await fetch(
          `${API_URL}/api/gamification/leaderboard?limit=20`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );

        if (!res.ok) {
          throw new Error(`Failed to load leaderboard (${res.status})`);
        }

        const body = (await res.json()) as {
          entries: LeaderboardEntry[];
          currentUserId?: string;
        };
        if (alive) {
          const mapped = (body.entries ?? []).map((entry) => ({
            ...entry,
            isCurrentUser:
              entry.isCurrentUser ?? entry.userId === body.currentUserId,
          }));
          setEntries(mapped);
        }
      } catch (err) {
        if (alive) {
          setError(
            err instanceof Error ? err.message : "Failed to load leaderboard",
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
      <Text style={styles.title}>Weekly Leaderboard</Text>
      {loading ? <ActivityIndicator color="#1f4f6a" /> : null}
      {!loading && error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !error ? (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => (
            <View
              style={[styles.row, item.isCurrentUser ? styles.myRow : null]}
            >
              <Text style={styles.rank}>#{item.rank}</Text>
              <View style={styles.nameWrap}>
                <Text style={styles.name}>{item.name}</Text>
              </View>
              <Text style={styles.points}>{item.points} pts</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No leaderboard entries yet.</Text>
          }
        />
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f6fbff",
    borderColor: "#cde1f0",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  myRow: {
    borderColor: "#1f4f6a",
    backgroundColor: "#eef6fb",
  },
  rank: {
    width: 56,
    fontWeight: "800",
    color: "#1f4f6a",
  },
  nameWrap: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: "#15364e",
  },
  points: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2f92d6",
  },
  empty: {
    color: "#496a80",
    marginTop: 16,
  },
  error: {
    color: "#b62828",
  },
});
