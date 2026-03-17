/**
 * T015 — BankAccountScreen
 * Collects bank name, account number, account holder name, bank code, SWIFT.
 * Upserts via PUT /api/merchants/me/bank-account.
 */
import { useState } from "react";
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
import { upsertBankAccount } from "@/hooks/use-merchant-api";
import { WizardProgressHeader } from "@/components/wizard-progress-header";

export default function BankAccountScreen() {
  const { draft, setBank } = useWizard();
  const b = draft.bank;

  const [accountNumber, setAccountNumber] = useState(b.accountNumber ?? "");
  const [accountHolderName, setAccountHolderName] = useState(
    b.accountHolderName ?? "",
  );
  const [bankName, setBankName] = useState(b.bankName ?? "");
  const [bankCode, setBankCode] = useState(b.bankCode ?? "");
  const [swiftCode, setSwiftCode] = useState(b.swiftCode ?? "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    accountNumber.trim().length > 0 &&
    accountHolderName.trim().length > 0 &&
    bankName.trim().length > 0 &&
    bankCode.trim().length > 0 &&
    swiftCode.trim().length > 0;

  async function handleSave() {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        accountNumber: accountNumber.trim(),
        accountHolderName: accountHolderName.trim(),
        bankName: bankName.trim(),
        bankCode: bankCode.trim(),
        swiftCode: swiftCode.trim(),
      };
      await upsertBankAccount(payload);
      setBank(payload);
      router.push("/onboarding/vehicle");
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
        step={3}
        totalSteps={4}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Payout bank account</Text>
        <Text style={styles.sub}>
          This is the account Hakwa will pay your earnings into each week.
        </Text>

        <Text style={styles.label}>Bank name *</Text>
        <TextInput
          style={styles.input}
          value={bankName}
          onChangeText={setBankName}
          placeholder="e.g. ANZ Fiji"
          placeholderTextColor="#555"
          autoCapitalize="words"
          returnKeyType="next"
        />

        <Text style={styles.label}>Account number *</Text>
        <TextInput
          style={styles.input}
          value={accountNumber}
          onChangeText={setAccountNumber}
          placeholder="e.g. 1234567890"
          placeholderTextColor="#555"
          keyboardType="numeric"
          returnKeyType="next"
        />

        <Text style={styles.label}>Account holder name *</Text>
        <TextInput
          style={styles.input}
          value={accountHolderName}
          onChangeText={setAccountHolderName}
          placeholder="Name on the account"
          placeholderTextColor="#555"
          autoCapitalize="words"
          returnKeyType="next"
        />

        <Text style={styles.label}>Bank code (BSB) *</Text>
        <TextInput
          style={styles.input}
          value={bankCode}
          onChangeText={setBankCode}
          placeholder="e.g. 010101"
          placeholderTextColor="#555"
          keyboardType="numeric"
          returnKeyType="next"
        />

        <Text style={styles.label}>SWIFT / BIC *</Text>
        <TextInput
          style={styles.input}
          value={swiftCode}
          onChangeText={setSwiftCode}
          placeholder="e.g. ANZBFJFX"
          placeholderTextColor="#555"
          autoCapitalize="characters"
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
    marginBottom: 8,
  },
  sub: { fontSize: 14, color: "#9BA1A6", marginBottom: 24 },
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
