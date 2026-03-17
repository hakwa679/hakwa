import { StyleSheet, Text, View } from "react-native";

export default function DriverSafetyHistoryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Safety History</Text>
      <Text style={styles.item}>No incidents yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: "700" },
  item: { color: "#555" },
});
