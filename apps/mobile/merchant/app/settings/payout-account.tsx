/**
 * T024 + T025 — PayoutAccountScreen
 * Pre-fills from existing bank account data.
 * Blocked if merchant is in "approved" status (shows read-only view).
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
import {
  fetchBankAccount,
  upsertBankAccount,
  fetchMerchantProfile,
  type BankAccountData,
} from "@/hooks/use-merchant-api";

export default function PayoutAccountScreen() {
  const [initializing, setInitializing] = useState(true);
  const [isApproved, setIsApproved] = useState(false);

  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [swiftCode, setSwiftCode] = useState("");

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [profileData, bankData] = await Promise.all([
          fetchMerchantProfile(),
          fetchBankAccount().catch(() => null),
        ]);
        setIsApproved(profileData.status === "approved");
        if (bankData) {
          setAccountNumber(bankData.accountNumber ?? "");
          setAccountHolderName(bankData.accountHolderName ?? "");
          setBankName(bankData.bankName ?? "");
          setBankCode(bankData.bankCode ?? "");
          setSwiftCode(bankData.swiftCode ?? "");
        }
      } catch {
        setError("Failed to load account details.");
      } finally {
        setInitializing(false);
      }
    }
    loadData();
  }, []);

  const canSubmit =
    accountNumber.trim().length > 0 &&
    accountHolderName.trim().length > 0 &&
    bankName.trim().length > 0 &&
    bankCode.trim().length > 0 &&
    swiftCode.trim().length > 0;

  async function handleSave() {
    if (!canSubmit || saving || isApproved) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await upsertBankAccount({
        accountNumber: accountNumber.trim(),
        accountHolderName: accountHolderName.trim(),
        bankName: bankName.trim(),
        bankCode: bankCode.trim(),
        swiftCode: swiftCode.trim(),
      });
      setSuccess(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (initializing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator
          color="#0a7ea4"
          size="large"
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#151718" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {isApproved && (
          <View style={styles.lockBanner}>
            <Text style={styles.lockText}>
              Your account is approved. Contact support to update bank details.
            </Text>
          </View>
        )}

        <Text style={styles.label}>Bank name *</Text>
        <TextInput
          style={[styles.input, isApproved && styles.inputDisabled]}
          value={bankName}
          onChangeText={setBankName}
          placeholder="e.g. ANZ Fiji"
          placeholderTextColor="#555"
          autoCapitalize="words"
          editable={!isApproved}
          returnKeyType="next"
        />

        <Text style={styles.label}>Account number *</Text>
        <TextInput
          style={[styles.input, isApproved && styles.inputDisabled]}
          value={accountNumber}
          onChangeText={setAccountNumber}
          placeholder="e.g. 1234567890"
          placeholderTextColor="#555"
          keyboardType="numeric"
          editable={!isApproved}
          returnKeyType="next"
        />

        <Text style={styles.label}>Account holder name *</Text>
        <TextInput
          style={[styles.input, isApproved && styles.inputDisabled]}
          value={accountHolderName}
          onChangeText={setAccountHolderName}
          placeholder="Name on the account"
          placeholderTextColor="#555"
          autoCapitalize="words"
          editable={!isApproved}
          returnKeyType="next"
        />

        <Text style={styles.label}>Bank code (BSB) *</Text>
        <TextInput
          style={[styles.input, isApproved && styles.inputDisabled]}
          value={bankCode}
          onChangeText={setBankCode}
          placeholder="e.g. 010101"
          placeholderTextColor="#555"
          keyboardType="numeric"
          editable={!isApproved}
          returnKeyType="next"
        />

        <Text style={styles.label}>SWIFT / BIC *</Text>
        <TextInput
          style={[styles.input, isApproved && styles.inputDisabled]}
          value={swiftCode}
          onChangeText={setSwiftCode}
          placeholder="e.g. ANZBFJFX"
          placeholderTextColor="#555"
          autoCapitalize="characters"
          editable={!isApproved}
          returnKeyType="done"
        />

        {success && (
          <Text style={styles.success}>Bank account updated successfully.</Text>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!isApproved && (
          <Pressable
            style={[styles.btn, (!canSubmit || saving) && styles.btnDisabled]}
            onPress={handleSave}
            disabled={!canSubmit || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Save changes</Text>
            )}
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#151718",
  },
  container: { padding: 24, paddingBottom: 48 },
  lockBanner: {
    backgroundColor: "#1a3a4a",
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#0a7ea440",
  },
  lockText: { fontSize: 13, color: "#9BA1A6", lineHeight: 20 },
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
  inputDisabled: { opacity: 0.5 },
  success: { color: "#52e0a0", fontSize: 13, marginTop: 12 },
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
