import { StyleSheet, Text, View } from "react-native";

export default function DriverVehicleVerifyCard({
  safetyCode,
}: {
  safetyCode: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Passenger Verification Code</Text>
      <Text style={styles.code}>{safetyCode}</Text>
      <Text style={styles.help}>
        Show this code to the passenger before trip start.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#eef9f2",
    gap: 6,
  },
  title: { fontSize: 15, fontWeight: "700" },
  code: { fontSize: 28, fontWeight: "800", letterSpacing: 3, color: "#246b4f" },
  help: { fontSize: 12, color: "#555" },
});
