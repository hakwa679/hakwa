import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

type GamificationResponse = {
  totalPoints: number;
  currentLevel: {
    number: number;
    name: string;
    iconUrl?: string | null;
    minPoints: number;
  } | null;
  nextLevel: {
    number: number;
    name: string;
    iconUrl?: string | null;
    minPoints: number;
  } | null;
  pointsToNext: number;
  progressPercent?: number;
  referralCode: string | null;
  referralCount?: number;
  currentStreak: number;
};

const WS_URL = (
  process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:3000"
).replace(/^http/, "ws");

type Props = {
  onPressLeaderboard?: () => void;
  onPressProfile?: () => void;
};

export function GamificationProfileCard(props: Props) {
  const [levelUpMessage, setLevelUpMessage] = useState<string | null>(null);
  const [animatedProgress] = useState(() => new Animated.Value(0));
  const gamificationQuery = useQuery({
    queryKey: ["passenger", "gamification", "summary"],
    queryFn: async () => {
      const token = await SecureStore.getItemAsync("hakwa_token");
      const res = await fetch(`${API_URL}/api/me/gamification`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`Failed to load gamification (${res.status})`);
      }

      return (await res.json()) as GamificationResponse;
    },
  });

  const loading = gamificationQuery.isPending;
  const error =
    gamificationQuery.error instanceof Error
      ? gamificationQuery.error.message
      : null;
  const data = gamificationQuery.data ?? null;

  const progress = useMemo(() => {
    if (!data) return 0;
    return Math.max(0, Math.min(100, Math.round(data.progressPercent ?? 0)));
  }, [data]);

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: progress,
      duration: 450,
      useNativeDriver: false,
    }).start();
  }, [animatedProgress, progress]);

  useEffect(() => {
    let mounted = true;
    let ws: WebSocket | null = null;

    async function connect() {
      const token = await SecureStore.getItemAsync("hakwa_token");
      if (!mounted || !token) return;

      ws = new WebSocket(`${WS_URL}/ws?token=${encodeURIComponent(token)}`);
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as Record<
            string,
            unknown
          >;
          if (payload["event"] === "level_up") {
            const name =
              typeof payload["currentLevel"] === "object" &&
              payload["currentLevel"] !== null &&
              "name" in payload["currentLevel"] &&
              typeof (payload["currentLevel"] as { name?: unknown }).name ===
                "string"
                ? ((payload["currentLevel"] as { name: string }).name ?? "")
                : "";
            setLevelUpMessage(name ? `Level up! ${name}` : "Level up!");
            setTimeout(() => setLevelUpMessage(null), 3000);
          }
        } catch {
          // Ignore malformed payloads from websocket stream.
        }
      };
    }

    connect();
    return () => {
      mounted = false;
      ws?.close();
    };
  }, []);

  const widthInterpolation = animatedProgress.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Your progress</Text>

      {loading ? <ActivityIndicator color="#113355" /> : null}
      {!loading && error ? <Text style={styles.error}>{error}</Text> : null}

      {!loading && !error && data ? (
        <>
          <Text style={styles.points}>{data.totalPoints} pts</Text>
          <Text style={styles.meta}>
            Level: {data.currentLevel?.name ?? "Bronze"}
          </Text>
          <Text style={styles.meta}>Streak: {data.currentStreak} days</Text>
          <Text style={styles.meta}>
            Referral: {data.referralCode ?? "Generating..."}
          </Text>
          <Text style={styles.meta}>
            Successful referrals: {data.referralCount ?? 0}
          </Text>

          {levelUpMessage ? (
            <Text style={styles.levelUpBanner}>{levelUpMessage}</Text>
          ) : null}

          <View style={styles.progressTrack}>
            <Animated.View
              style={[styles.progressBar, { width: widthInterpolation }]}
            />
          </View>

          <Text style={styles.nextLevel}>
            {data.nextLevel
              ? `${data.pointsToNext} pts to ${data.nextLevel.name}`
              : "Top level reached"}
          </Text>

          <View style={styles.actionsRow}>
            <Pressable
              style={styles.actionBtn}
              onPress={props.onPressLeaderboard}
            >
              <Text style={styles.actionText}>Leaderboard</Text>
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              onPress={props.onPressProfile}
            >
              <Text style={styles.actionText}>My Profile</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: "#f6fbff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cde1f0",
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#15364e",
  },
  points: {
    fontSize: 26,
    fontWeight: "800",
    color: "#15364e",
  },
  meta: {
    fontSize: 14,
    color: "#35556c",
  },
  progressTrack: {
    marginTop: 6,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#dbeaf5",
    overflow: "hidden",
  },
  progressBar: {
    height: 10,
    backgroundColor: "#2f92d6",
  },
  nextLevel: {
    fontSize: 13,
    color: "#496a80",
    marginTop: 2,
  },
  levelUpBanner: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: "#1f4f6a",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    backgroundColor: "#1f4f6a",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  actionText: {
    color: "#fff",
    fontWeight: "700",
  },
  error: {
    color: "#b62828",
    fontSize: 13,
  },
});
