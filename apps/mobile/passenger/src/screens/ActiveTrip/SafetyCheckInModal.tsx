import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

export default function SafetyCheckInModal(props: {
  visible: boolean;
  countdown: number;
  onOk: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Are you OK?</Text>
          <Text style={styles.text}>
            Respond within {props.countdown}s to avoid escalation.
          </Text>
          <View style={styles.row}>
            <Pressable
              style={styles.ok}
              onPress={props.onOk}
            >
              <Text style={styles.okText}>I'm OK</Text>
            </Pressable>
            <Pressable
              style={styles.cancel}
              onPress={props.onCancel}
            >
              <Text style={styles.cancelText}>Cancel Alert</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: "700" },
  text: { color: "#555" },
  row: { flexDirection: "row", gap: 8 },
  ok: {
    flex: 1,
    backgroundColor: "#2e7d32",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  cancel: {
    flex: 1,
    borderColor: "#b42318",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  okText: { color: "#fff", fontWeight: "700" },
  cancelText: { color: "#b42318", fontWeight: "700" },
});
