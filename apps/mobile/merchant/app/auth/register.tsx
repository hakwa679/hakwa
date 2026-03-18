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

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

function passwordStrengthError(password: string): string | null {
  if (password.length === 0) return null;
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
}

export default function RegisterScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const registerMutation = useMutation({
    mutationFn: async () => {
      return fetch(`${API_URL}/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim(),
          role: "merchant",
          phone: phone.trim() || undefined,
        }),
      });
    },
  });

  const loading = registerMutation.isPending;

  const pwError = passwordStrengthError(password);
  const canSubmit =
    name.trim().length > 0 && email.trim().length > 0 && password.length >= 8;

  async function handleRegister() {
    if (!canSubmit || loading) return;
    setError(null);
    try {
      const res = await registerMutation.mutateAsync();
      if (res.status === 200 || res.status === 201) {
        router.replace("/auth/verify-email-sent");
      } else if (res.status === 409) {
        setError(
          "An account with this email already exists. Try signing in or resetting your password.",
        );
      } else if (res.status === 422) {
        setError(
          "Please use a valid email and a password of at least 8 characters.",
        );
      } else {
        setError("Registration failed. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
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
        <Text style={styles.title}>Merchant registration</Text>
        <Text style={styles.subtitle}>Create your merchant account</Text>

        <Text style={styles.label}>Full name</Text>
        <TextInput
          style={styles.input}
          placeholder="Your full name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
        />

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

        <Text style={styles.label}>Phone number</Text>
        <TextInput
          style={styles.input}
          placeholder="+25277xxxxxxx (optional)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          returnKeyType="next"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={[styles.input, pwError ? styles.inputError : null]}
          placeholder="At least 8 characters"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleRegister}
        />
        {pwError ? <Text style={styles.fieldError}>{pwError}</Text> : null}

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

        <Pressable
          style={[
            styles.button,
            (!canSubmit || loading) && styles.buttonDisabled,
          ]}
          onPress={handleRegister}
          disabled={!canSubmit || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create merchant account</Text>
          )}
        </Pressable>

        <Text style={styles.profileNote}>
          Complete your business profile after signing in.
        </Text>

        <Pressable
          style={styles.linkRow}
          onPress={() => router.push("/auth/sign-in")}
        >
          <Text style={styles.linkText}>Already have an account? </Text>
          <Text style={styles.link}>Sign in</Text>
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
  inputError: { borderColor: "#D9534F" },
  fieldError: { fontSize: 13, color: "#D9534F", marginTop: 4 },
  errorBanner: {
    backgroundColor: "#FFF3F3",
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    fontSize: 14,
    color: "#D9534F",
  },
  profileNote: {
    fontSize: 13,
    color: "#9BA1A6",
    textAlign: "center",
    marginTop: 16,
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
  linkRow: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  linkText: { fontSize: 15, color: "#687076" },
  link: { fontSize: 15, color: "#0a7ea4", fontWeight: "600" },
});
