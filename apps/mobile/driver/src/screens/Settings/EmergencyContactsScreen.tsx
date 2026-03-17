import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function DriverEmergencyContactsScreen() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <View style={styles.container}>
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
