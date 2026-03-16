/**
 * T016 — VehicleScreen
 * Collects make, model, year, registration plate, seating capacity, color.
 * Creates the vehicle record via POST /api/merchants/me/vehicles.
 */
import { useState } from "react";
import {
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
import { addVehicle } from "@/hooks/use-merchant-api";
import { WizardProgressHeader } from "@/components/wizard-progress-header";

export default function VehicleScreen() {
  const { draft, setVehicle } = useWizard();
  const v = draft.vehicle;

  const [make, setMake] = useState(v.make ?? "");
  const [model, setModel] = useState(v.model ?? "");
  const [year, setYear] = useState(v.year ?? "");
  const [plate, setPlate] = useState(v.registrationPlate ?? "");
  const [seats, setSeats] = useState(v.seatingCapacity ?? "");
  const [color, setColor] = useState(v.color ?? "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    make.trim().length > 0 &&
    model.trim().length > 0 &&
    year.trim().length === 4 &&
    plate.trim().length > 0 &&
    seats.trim().length > 0;

  async function handleSave() {
    if (!canSubmit || loading) return;
    const yearNum = parseInt(year, 10);
    const seatsNum = parseInt(seats, 10);
    if (isNaN(yearNum) || isNaN(seatsNum)) {
      setError("Year and seating capacity must be valid numbers.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await addVehicle({
        make: make.trim(),
        model: model.trim(),
        year: yearNum,
        registrationPlate: plate.trim().toUpperCase(),
        seatingCapacity: seatsNum,
        color: color.trim() || undefined,
      });
      setVehicle({
        make: make.trim(),
        model: model.trim(),
        year: year.trim(),
        registrationPlate: plate.trim().toUpperCase(),
        seatingCapacity: seats.trim(),
        color: color.trim(),
      });
      router.push("/onboarding/review");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to add vehicle. Please try again.",
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
        step={4}
        totalSteps={4}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Your vehicle</Text>
        <Text style={styles.sub}>
          Add at least one vehicle to complete your application.
        </Text>

        <Text style={styles.label}>Make *</Text>
        <TextInput
          style={styles.input}
          value={make}
          onChangeText={setMake}
          placeholder="e.g. Toyota"
          placeholderTextColor="#555"
          autoCapitalize="words"
          returnKeyType="next"
        />

        <Text style={styles.label}>Model *</Text>
        <TextInput
          style={styles.input}
          value={model}
          onChangeText={setModel}
          placeholder="e.g. Corolla"
          placeholderTextColor="#555"
          autoCapitalize="words"
          returnKeyType="next"
        />

        <Text style={styles.label}>Year *</Text>
        <TextInput
          style={styles.input}
          value={year}
          onChangeText={setYear}
          placeholder="e.g. 2019"
          placeholderTextColor="#555"
          keyboardType="numeric"
          maxLength={4}
          returnKeyType="next"
        />

        <Text style={styles.label}>Registration plate *</Text>
        <TextInput
          style={styles.input}
          value={plate}
          onChangeText={setPlate}
          placeholder="e.g. FJ1234"
          placeholderTextColor="#555"
          autoCapitalize="characters"
          returnKeyType="next"
        />

        <Text style={styles.label}>Seating capacity (excluding driver) *</Text>
        <TextInput
          style={styles.input}
          value={seats}
          onChangeText={setSeats}
          placeholder="e.g. 4"
          placeholderTextColor="#555"
          keyboardType="numeric"
          maxLength={2}
          returnKeyType="next"
        />

        <Text style={styles.label}>Color (optional)</Text>
        <TextInput
          style={styles.input}
          value={color}
          onChangeText={setColor}
          placeholder="e.g. White"
          placeholderTextColor="#555"
          autoCapitalize="words"
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
