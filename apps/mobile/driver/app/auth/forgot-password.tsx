import { useState } from "react";
import {
  TextInput,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!email.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      // Always returns 200 regardless of whether the email exists — prevents account enumeration
      await fetch(`${API_URL}/auth/forget-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          redirectTo: `${process.env.EXPO_PUBLIC_WEB_URL ?? "https://portal.hakwa.af"}/auth/reset-password`,
        }),
      });
      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.body}>
          If an account with that address exists, you'll receive a password
          reset link shortly. Please check your inbox and spam folder.
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Back to sign in</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>
          Enter your email address and we'll send you a reset link.
        </Text>

        <Text style={styles.label}>Email address</Text>
        <TextInput
          style={styles.input}
          placeholder="ada@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

        <Pressable
          style={[
            styles.button,
            (!email.trim() || loading) && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!email.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send reset link</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.linkRow}
          onPress={() => router.back()}
        >
          <Text style={styles.link}>Back to sign in</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  container: { flexGrow: 1, padding: 24, paddingTop: 48 },
  title: { fontSize: 28, fontWeight: "700", color: "#11181C", marginBottom: 4 },
  subtitle: { fontSize: 15, color: "#687076", marginBottom: 32 },
  body: { fontSize: 16, color: "#687076", lineHeight: 24, marginBottom: 32 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#11181C",
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#11181C",
    backgroundColor: "#FAFAFA",
  },
  errorBanner: {
    backgroundColor: "#FFF3F3",
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    fontSize: 14,
    color: "#D9534F",
  },
  button: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 28,
    minHeight: 52,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  linkRow: { alignItems: "center", marginTop: 20 },
  link: { fontSize: 15, color: "#0a7ea4", fontWeight: "600" },
});
