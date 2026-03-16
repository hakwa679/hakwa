/**
 * T019 — WizardProgressHeader
 * Horizontal segmented progress bar shown at the top of each wizard step.
 */
import { View, StyleSheet } from "react-native";

interface Props {
  step: number; // current step (1-indexed)
  totalSteps: number; // total steps
}

export function WizardProgressHeader({ step, totalSteps }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: totalSteps }, (_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            i < step ? styles.done : styles.pending,
            i < totalSteps - 1 && styles.gap,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: "#151718",
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  done: { backgroundColor: "#0a7ea4" },
  pending: { backgroundColor: "#2C2F30" },
  gap: { marginRight: 4 },
});
