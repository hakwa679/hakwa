import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function EmergencyContactsScreen() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nudgeSeen, setNudgeSeen] = useState(false);

  return (
    <View style={styles.container}>
      {!nudgeSeen && (
        <View style={styles.nudge}>
          <Text style={styles.nudgeTitle}>
            Add emergency contacts for SOS alerts
          </Text>
          <Pressable onPress={() => setNudgeSeen(true)}>
            <Text style={styles.link}>Dismiss</Text>
          </Pressable>
        </View>
      )}
      <Text style={styles.title}>Emergency Contacts</Text>
      <TextInput
        style={styles.input}
        placeholder="Name"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone"
        value={phone}
        onChangeText={setPhone}
      />
      <Pressable style={styles.button}>
        <Text style={styles.buttonText}>Save Contact</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10, backgroundColor: "#fff" },
  nudge: { backgroundColor: "#fff7e6", borderRadius: 8, padding: 10, gap: 4 },
  nudgeTitle: { fontWeight: "700", color: "#8a5700" },
  link: { color: "#0a7ea4", fontWeight: "600" },
  title: { fontSize: 20, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10 },
  button: {
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700" },
});
