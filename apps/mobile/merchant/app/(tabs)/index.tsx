/**
 * T018 + T032 — Merchant Dashboard
 * On mount: fetches merchant profile.
 *   - If onboarding is incomplete → redirects to /onboarding/license-type
 *   - If complete → shows status banner reflecting current review state
 */
import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import {
  fetchMerchantProfile,
  type MerchantProfile,
} from "@/hooks/use-merchant-api";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function HomeScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<MerchantProfile | null>(null);

  // T018: On every focus check onboarding status
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchMerchantProfile()
        .then((p) => {
          if (cancelled) return;
          const onboardingComplete =
            p.onboardingSteps.businessDetails &&
            p.onboardingSteps.bankAccount &&
            p.onboardingSteps.vehicle;
          if (!onboardingComplete) {
            router.replace("/onboarding/license-type");
            return;
          }
          setProfile(p);
        })
        .catch(() => {
          // If profile fetch fails, stay on dashboard
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

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
      {/* T032 — Status banner */}
      {profile && <StatusBanner status={profile.status} />}

      <View style={styles.body}>
        <Text style={styles.title}>Merchant Home</Text>
        <Text style={styles.subtitle}>{profile?.name ?? "Welcome back"}</Text>

        <Pressable
          style={styles.signOutBtn}
          onPress={confirmSignOut}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

// T032 — Status banner component
type Status = MerchantProfile["status"];

function StatusBanner({ status }: { status: Status }) {
  if (status === "draft") return null;

  const config: Partial<
    Record<
      Status,
      { bg: string; border: string; text: string; message: string }
    >
  > = {
    under_review: {
      bg: "#2a2200",
      border: "#7a6000",
      text: "#f0c020",
      message:
        "Your application is under review. We'll notify you within 1–2 business days.",
    },
    approved: {
      bg: "#0a2a1a",
      border: "#1a7a4a",
      text: "#20e08a",
      message: "Your account is approved. You're ready to accept bookings!",
    },
    rejected: {
      bg: "#2a0a0a",
      border: "#7a1a1a",
      text: "#e05252",
      message:
        "Your application was rejected. Please contact support for more information.",
    },
    suspended_pending_review: {
      bg: "#1a1a2a",
      border: "#3a3a7a",
      text: "#9090e0",
      message:
        "Your account is under review following a report. Please contact support.",
    },
  };

  const c = config[status];
  if (!c) return null;

  return (
    <View
      style={[styles.banner, { backgroundColor: c.bg, borderColor: c.border }]}
    >
      <Text style={[styles.bannerText, { color: c.text }]}>{c.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
  },
  banner: {
    borderBottomWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 20,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#ECEDEE",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#9BA1A6",
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
