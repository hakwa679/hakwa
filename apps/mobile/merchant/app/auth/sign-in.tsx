import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
export const TOKEN_KEY = "hakwa_token";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendVisible, setResendVisible] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const signInMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_URL}/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      return { res, data };
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: async () => {
      await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
    },
  });

  const loading = signInMutation.isPending;
  const resendLoading = resendVerificationMutation.isPending;

  const canSubmit = email.trim().length > 0 && password.length > 0;

  async function handleSignIn() {
    if (!canSubmit || loading) return;
    setError(null);
    setResendVisible(false);
    try {
      const { res, data } = await signInMutation.mutateAsync();
      if (res.ok && data["token"]) {
        await SecureStore.setItemAsync(TOKEN_KEY, data["token"] as string);
        // Route to merchant dashboard
        router.replace("/(tabs)");
      } else if (res.status === 403) {
        setError("Please verify your email before signing in.");
        setResendVisible(true);
      } else if (res.status === 429) {
        const retryAfter =
          typeof data["retryAfter"] === "number" ? data["retryAfter"] : 60;
        setError(
          `Account temporarily locked. Try again in ${retryAfter} seconds.`,
        );
      } else {
        setError("Incorrect email or password. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    }
  }

  async function handleResendVerification() {
    if (resendCooldown > 0 || resendLoading) return;
    try {
      await resendVerificationMutation.mutateAsync();
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((c) => {
          if (c <= 1) {
            clearInterval(interval);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch {
      // Silently ignore
    }
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
        <Text style={styles.title}>Merchant sign in</Text>
        <Text style={styles.subtitle}>Sign in to your merchant account</Text>

        <Text style={styles.label}>Email address</Text>
        <TextInput
          style={styles.input}
          placeholder="merchant@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleSignIn}
        />

        <Pressable
          style={styles.forgotRow}
          onPress={() => router.push("/auth/forgot-password")}
        >
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

        {resendVisible ? (
          <Pressable
            style={[
              styles.resendButton,
              (resendCooldown > 0 || resendLoading) && styles.buttonDisabled,
            ]}
            onPress={handleResendVerification}
            disabled={resendCooldown > 0 || resendLoading}
          >
            {resendLoading ? (
              <ActivityIndicator color="#0a7ea4" />
            ) : (
              <Text style={styles.resendText}>
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend verification email"}
              </Text>
            )}
          </Pressable>
        ) : null}

        <Pressable
          style={[
            styles.button,
            (!canSubmit || loading) && styles.buttonDisabled,
          ]}
          onPress={handleSignIn}
          disabled={!canSubmit || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.linkRow}
          onPress={() => router.push("/auth/register")}
        >
          <Text style={styles.linkText}>New merchant? </Text>
          <Text style={styles.link}>Create account</Text>
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
  forgotRow: { alignSelf: "flex-end", marginTop: 8 },
  errorBanner: {
    backgroundColor: "#FFF3F3",
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    fontSize: 14,
    color: "#D9534F",
  },
  resendButton: {
    borderWidth: 1,
    borderColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
    minHeight: 52,
  },
  resendText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600" },
  button: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
    minHeight: 52,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  linkRow: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  linkText: { fontSize: 15, color: "#687076" },
  link: { fontSize: 15, color: "#0a7ea4", fontWeight: "600" },
});
