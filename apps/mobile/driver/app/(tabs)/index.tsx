import { useRouter } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function HomeScreen() {
  const router = useRouter();

  async function handleSignOut() {
    try {
      const token = await SecureStore.getItemAsync("hakwa_token");
      await fetch(`${API_URL}/auth/sign-out`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // best-effort
    } finally {
      await SecureStore.deleteItemAsync("hakwa_token");
      router.replace("/auth/sign-in");
    }
  }

  function confirmSignOut() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: handleSignOut },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Driver Home</Text>
      <Text style={styles.subtitle}>You are signed in.</Text>
      <Pressable
        style={styles.signOutBtn}
        onPress={confirmSignOut}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#687076",
    marginBottom: 40,
  },
  signOutBtn: {
    backgroundColor: "#d9534f",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  signOutText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
