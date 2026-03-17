import { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function SafetyReportScreen() {
  const [category, setCategory] = useState("other");
  const [description, setDescription] = useState("");

  function submit() {
    Alert.alert("Report submitted", `Category: ${category}`);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Safety Report</Text>
      <TextInput
        value={category}
        onChangeText={setCategory}
        style={styles.input}
        placeholder="Category"
      />
      <TextInput
        value={description}
        onChangeText={setDescription}
        style={[styles.input, styles.multi]}
        multiline
        placeholder="Description"
      />
      <Pressable
        style={styles.button}
        onPress={submit}
      >
        <Text style={styles.buttonText}>Submit</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "700" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10 },
  multi: { minHeight: 100, textAlignVertical: "top" },
  button: {
    backgroundColor: "#b42318",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700" },
});
