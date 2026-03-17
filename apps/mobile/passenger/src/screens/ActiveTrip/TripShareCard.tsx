import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function TripShareCard({ tripId }: { tripId?: string }) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  async function createShare() {
    if (!tripId) return;
    const token = await SecureStore.getItemAsync("hakwa_token");
    const res = await fetch(`${API_URL}/api/v1/safety/trips/${tripId}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      Alert.alert("Share failed", "Unable to create share link.");
      return;
    }
    const payload = (await res.json()) as { shareUrl?: string };
    setShareUrl(payload.shareUrl ?? null);
  }

  async function revokeShare() {
    if (!tripId) return;
    const token = await SecureStore.getItemAsync("hakwa_token");
    await fetch(`${API_URL}/api/v1/safety/trips/${tripId}/share`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    setShareUrl(null);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Trip Share</Text>
      <Text style={styles.body}>{shareUrl ?? "No active share link"}</Text>
      <View style={styles.row}>
        <Pressable
          style={styles.button}
          onPress={createShare}
        >
          <Text style={styles.buttonText}>Create Share</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={revokeShare}
        >
          <Text style={styles.secondaryButtonText}>Revoke</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#f7f7ff",
    gap: 6,
  },
  title: { fontWeight: "700", fontSize: 15 },
  body: { fontSize: 12, color: "#555" },
  row: { flexDirection: "row", gap: 8 },
  button: {
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  secondaryButton: {
    borderColor: "#0a7ea4",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  buttonText: { color: "#fff", fontWeight: "700" },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "700" },
});
