import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const TOKEN_KEY = "hakwa_token";

type Channel = "push" | "in_app" | "email" | "sms";

interface PreferenceRow {
  channel: Channel;
  enabled: boolean;
  locked: boolean;
}

type PreferencesByType = Record<string, PreferenceRow[]>;

export default function NotificationPreferencesScreen() {
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<PreferencesByType>({});

  const fetchPreferences = useCallback(async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) return;
      const res = await fetch(
        `${API_URL}/api/notifications/me/notification-preferences`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) return;
      const body = (await res.json()) as { preferences?: PreferencesByType };
      setPreferences(body.preferences ?? {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPreferences();
  }, [fetchPreferences]);

  const grouped = useMemo(
    () =>
      Object.entries(preferences).sort((a, b) =>
        a[0].localeCompare(b[0], "en", { sensitivity: "base" }),
      ),
    [preferences],
  );

  const updatePreference = async (
    type: string,
    channel: Channel,
    enabled: boolean,
  ) => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;

    const res = await fetch(
      `${API_URL}/api/notifications/me/notification-preferences/${encodeURIComponent(type)}/${encodeURIComponent(channel)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      },
    );

    if (!res.ok) return;

    setPreferences((prev) => ({
      ...prev,
      [type]: (prev[type] ?? []).map((row) =>
        row.channel === channel ? { ...row, enabled } : row,
      ),
    }));
  };

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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>Notification Preferences</Text>
      <Text style={styles.subtitle}>
        Control delivery channels by notification type.
      </Text>

      {grouped.map(([type, rows]) => (
        <View
          key={type}
          style={styles.groupCard}
        >
          <Text style={styles.groupTitle}>{type.replaceAll("_", " ")}</Text>
          {rows
            .slice()
            .sort((a, b) => a.channel.localeCompare(b.channel))
            .map((row) => (
              <View
                key={`${type}:${row.channel}`}
                style={styles.row}
              >
                <Text
                  style={[styles.channelText, row.locked && styles.lockedText]}
                >
                  {row.channel.toUpperCase()}
                  {row.locked ? " (locked)" : ""}
                </Text>
                <Switch
                  value={row.enabled}
                  disabled={row.locked}
                  onValueChange={(value) => {
                    void updatePreference(type, row.channel, value);
                  }}
                />
              </View>
            ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: "#667085",
    marginBottom: 14,
  },
  groupCard: {
    borderWidth: 1,
    borderColor: "#e6ebf0",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  groupTitle: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 8,
    textTransform: "capitalize",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e6ebf0",
  },
  channelText: {
    color: "#101828",
    fontWeight: "500",
  },
  lockedText: {
    color: "#667085",
  },
});
