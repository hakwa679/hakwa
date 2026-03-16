/**
 * T013 — LicenseTypeScreen
 * Single-selection: licensed / unlicensed.
 * Saves choice to wizard draft and navigates to the first wizard step.
 */
import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useWizard } from "@/hooks/use-wizard";
import { updateMerchantProfile } from "@/hooks/use-merchant-api";

type LicenseType = "licensed" | "unlicensed";

export default function LicenseTypeScreen() {
  const { draft, setLicenseType } = useWizard();
  const [selected, setSelected] = useState<LicenseType | undefined>(
    draft.licenseType,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!selected || loading) return;
    setLoading(true);
    setError(null);
    try {
      setLicenseType(selected);
      router.push("/onboarding/business-details");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>How do you operate?</Text>
      <Text style={styles.sub}>
        This determines what documents we'll ask for during onboarding.
      </Text>

      <Pressable
        style={[styles.card, selected === "licensed" && styles.cardSelected]}
        onPress={() => setSelected("licensed")}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected === "licensed" }}
      >
        <Text style={styles.cardTitle}>Licensed operator</Text>
        <Text style={styles.cardDesc}>
          You hold a Land Transport Authority licence and a registered business.
          TIN and business number required.
        </Text>
      </Pressable>

      <Pressable
        style={[styles.card, selected === "unlicensed" && styles.cardSelected]}
        onPress={() => setSelected("unlicensed")}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected === "unlicensed" }}
      >
        <Text style={styles.cardTitle}>Individual / unlicensed</Text>
        <Text style={styles.cardDesc}>
          You operate independently without a formal business registration.
          National ID required instead.
        </Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.btn, (!selected || loading) && styles.btnDisabled]}
        onPress={handleContinue}
        disabled={!selected || loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Continue</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#151718",
  },
  heading: {
    fontSize: 26,
    fontWeight: "700",
    color: "#ECEDEE",
    marginBottom: 8,
  },
  sub: {
    fontSize: 14,
    color: "#9BA1A6",
    marginBottom: 32,
  },
  card: {
    borderWidth: 1.5,
    borderColor: "#2C2F30",
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
  },
  cardSelected: {
    borderColor: "#0a7ea4",
    backgroundColor: "#0a7ea415",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ECEDEE",
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: "#9BA1A6",
    lineHeight: 20,
  },
  error: {
    color: "#e05252",
    fontSize: 13,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    minHeight: 52,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
});
