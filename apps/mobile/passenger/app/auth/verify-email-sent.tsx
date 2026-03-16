import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";

export default function VerifyEmailSentScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>✉️</Text>
      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.body}>
        We sent a verification link to your email address. Please check your
        inbox (and spam folder) and click the link to activate your account.
      </Text>
      <Text style={styles.note}>
        Once verified, come back and sign in with your credentials.
      </Text>
      <Pressable
        style={styles.button}
        onPress={() => router.replace("/auth/sign-in")}
      >
        <Text style={styles.buttonText}>Go to sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    paddingTop: 80,
    alignItems: "center",
  },
  icon: { fontSize: 56, marginBottom: 24 },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#11181C",
    marginBottom: 16,
    textAlign: "center",
  },
  body: {
    fontSize: 16,
    color: "#687076",
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 16,
  },
  note: {
    fontSize: 14,
    color: "#9BA1A6",
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 40,
  },
  button: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    minHeight: 52,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
