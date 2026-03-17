/**
 * T014 + T020 — BusinessDetailsScreen
 * Licensed: shows Name, TIN, Business Registration Number.
 * Unlicensed: shows Name and National ID (hides TIN/LTA fields).
 *
 * Saves to API via PATCH /api/merchants/me.
 */
import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useWizard } from "@/hooks/use-wizard";
import { updateMerchantProfile } from "@/hooks/use-merchant-api";
import { WizardProgressHeader } from "@/components/wizard-progress-header";

export default function BusinessDetailsScreen() {
  const { draft, setBusiness } = useWizard();
  const isLicensed = draft.licenseType === "licensed";

  const [name, setName] = useState(draft.business.name ?? "");
  const [tin, setTin] = useState(draft.business.tin ?? "");
  const [brn, setBrn] = useState(
    draft.business.businessRegistrationNumber ?? "",
  );
  const [nationalId, setNationalId] = useState(draft.business.nationalId ?? "");
  const [phone, setPhone] = useState(draft.business.phone ?? "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = isLicensed
    ? name.trim().length > 0 && tin.trim().length > 0 && brn.trim().length > 0
    : name.trim().length > 0 && nationalId.trim().length > 0;

  async function handleSave() {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      const payload = isLicensed
        ? {
            name: name.trim(),
            tin: tin.trim(),
            businessRegistrationNumber: brn.trim(),
            phone: phone.trim() || undefined,
          }
        : {
            name: name.trim(),
            nationalId: nationalId.trim(),
            phone: phone.trim() || undefined,
          };
      await updateMerchantProfile(payload);
      setBusiness({ ...payload });
      router.push("/onboarding/bank-account");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#151718" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <WizardProgressHeader
        step={2}
        totalSteps={4}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Business details</Text>

        <Text style={styles.label}>Business / trade name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Island Cabs Ltd"
          placeholderTextColor="#555"
          autoCapitalize="words"
          returnKeyType="next"
        />

        {isLicensed ? (
          <>
            <Text style={styles.label}>Tax identification number (TIN) *</Text>
            <TextInput
              style={styles.input}
              value={tin}
              onChangeText={setTin}
              placeholder="e.g. FJ123456"
              placeholderTextColor="#555"
              autoCapitalize="characters"
              returnKeyType="next"
            />

            <Text style={styles.label}>LTA business registration number *</Text>
            <TextInput
              style={styles.input}
              value={brn}
              onChangeText={setBrn}
              placeholder="e.g. LTA-789"
              placeholderTextColor="#555"
              autoCapitalize="characters"
              returnKeyType="next"
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>National ID *</Text>
            <TextInput
              style={styles.input}
              value={nationalId}
              onChangeText={setNationalId}
              placeholder="Your national ID number"
              placeholderTextColor="#555"
              returnKeyType="next"
            />
          </>
        )}

        <Text style={styles.label}>Phone number (optional)</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+679 123 4567"
          placeholderTextColor="#555"
          keyboardType="phone-pad"
          returnKeyType="done"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.btn, (!canSubmit || loading) && styles.btnDisabled]}
          onPress={handleSave}
          disabled={!canSubmit || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Save & continue</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48 },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ECEDEE",
    marginBottom: 24,
  },
  label: { fontSize: 13, color: "#9BA1A6", marginBottom: 6, marginTop: 16 },
  input: {
    borderWidth: 1.5,
    borderColor: "#2C2F30",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#ECEDEE",
    backgroundColor: "#1E2122",
  },
  error: { color: "#e05252", fontSize: 13, marginTop: 12 },
  btn: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 28,
    minHeight: 52,
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
