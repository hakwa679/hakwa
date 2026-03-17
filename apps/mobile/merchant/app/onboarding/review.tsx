/**
 * T017 — ReviewScreen
 * Shows a summary of all wizard data and a "Submit for review" button.
 * Calls POST /api/merchants/me/submit then clears the draft on success.
 */
import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useWizard } from "@/hooks/use-wizard";
import { submitForReview } from "@/hooks/use-merchant-api";

export default function ReviewScreen() {
  const { draft, clearDraft } = useWizard();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLicensed = draft.licenseType === "licensed";
  const b = draft.business;
  const bank = draft.bank;
  const v = draft.vehicle;

  async function handleSubmit() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await submitForReview();
      clearDraft();
      // Navigate back to dashboard — status banner will show under_review
      router.replace("/(tabs)");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Submission failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      <Text style={styles.heading}>Review your application</Text>
      <Text style={styles.sub}>
        Check everything looks correct then submit for admin review.
      </Text>

      <Section title="Operator type">
        <Row
          label="Type"
          value={isLicensed ? "Licensed operator" : "Individual / unlicensed"}
        />
      </Section>

      <Section title="Business details">
        <Row
          label="Name"
          value={b.name}
        />
        {isLicensed ? (
          <>
            <Row
              label="TIN"
              value={b.tin}
            />
            <Row
              label="Business reg. no."
              value={b.businessRegistrationNumber}
            />
          </>
        ) : (
          <Row
            label="National ID"
            value={b.nationalId}
          />
        )}
        {b.phone ? (
          <Row
            label="Phone"
            value={b.phone}
          />
        ) : null}
      </Section>

      <Section title="Payout account">
        <Row
          label="Bank"
          value={bank.bankName}
        />
        <Row
          label="Account no."
          value={bank.accountNumber}
        />
        <Row
          label="Account holder"
          value={bank.accountHolderName}
        />
        <Row
          label="SWIFT"
          value={bank.swiftCode}
        />
      </Section>

      <Section title="Vehicle">
        <Row
          label="Make / model"
          value={
            v.make && v.model ? `${v.make} ${v.model} (${v.year})` : undefined
          }
        />
        <Row
          label="Plate"
          value={v.registrationPlate}
        />
        <Row
          label="Seats"
          value={v.seatingCapacity}
        />
        {v.color ? (
          <Row
            label="Color"
            value={v.color}
          />
        ) : null}
      </Section>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.btn, loading && styles.btnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Submit for review</Text>
        )}
      </Pressable>

      <Text style={styles.note}>
        After submission our team will review your application within 1–2
        business days.
      </Text>
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={sectionStyles.card}>
      <Text style={sectionStyles.title}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={sectionStyles.row}>
      <Text style={sectionStyles.label}>{label}</Text>
      <Text style={sectionStyles.value}>{value ?? "—"}</Text>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#2C2F30",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 12,
    color: "#9BA1A6",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#1c1f20",
  },
  label: { fontSize: 14, color: "#9BA1A6" },
  value: {
    fontSize: 14,
    color: "#ECEDEE",
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 12,
  },
});

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#151718" },
  container: { padding: 24, paddingBottom: 48 },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ECEDEE",
    marginBottom: 8,
  },
  sub: { fontSize: 14, color: "#9BA1A6", marginBottom: 24 },
  error: { color: "#e05252", fontSize: 13, marginBottom: 16 },
  btn: {
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    minHeight: 52,
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  note: {
    fontSize: 12,
    color: "#9BA1A6",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 18,
  },
});
