import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  calculateReviewPreview,
  initialReviewFlowState,
  nextStep,
} from "@hakwa/ui-native/review";

const TAGS = [
  "polite",
  "ready_on_time",
  "respectful",
  "clear_pickup",
  "friendly",
  "helpful",
];

export default function DriverReviewCard() {
  const [state, setState] = useState(initialReviewFlowState());

  const preview = useMemo(
    () =>
      calculateReviewPreview({
        tagCount: state.tagKeys.length,
        hasComment: state.comment.trim().length > 0,
      }),
    [state.comment, state.tagKeys.length],
  );

  const commentTooLong = state.comment.trim().length > 280;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Rate this passenger</Text>
      <Text style={styles.window}>Review window: 24 hours</Text>

      {state.step === "stars" && (
        <View style={styles.row}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Pressable
              key={value}
              style={[styles.star, state.rating >= value && styles.starActive]}
              onPress={() =>
                setState((s) => ({
                  ...s,
                  rating: value,
                  step: nextStep(s.step),
                }))
              }
            >
              <Text>{value}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {state.step === "tags" && (
        <View style={styles.tags}>
          {TAGS.map((tag) => {
            const selected = state.tagKeys.includes(tag);
            return (
              <Pressable
                key={tag}
                style={[styles.tag, selected && styles.tagActive]}
                onPress={() =>
                  setState((s) => ({
                    ...s,
                    tagKeys: selected
                      ? s.tagKeys.filter((x) => x !== tag)
                      : [...s.tagKeys, tag],
                  }))
                }
              >
                <Text style={styles.tagText}>{tag}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setState((s) => ({ ...s, step: nextStep(s.step) }))}
          >
            <Text style={styles.link}>Skip</Text>
          </Pressable>
        </View>
      )}

      {state.step === "comment" && (
        <View>
          <TextInput
            value={state.comment}
            onChangeText={(comment) => setState((s) => ({ ...s, comment }))}
            placeholder="Add a note for 10 extra points"
            style={styles.input}
            multiline
          />
          <Text style={[styles.meta, commentTooLong && styles.warn]}>
            {state.comment.trim().length}/280
          </Text>
        </View>
      )}

      <Text style={styles.points}>
        Base {preview.base} + Tags {preview.tagBonus} + Comment{" "}
        {preview.commentBonus} = {preview.total} pts
      </Text>

      <Pressable
        style={[
          styles.submit,
          (state.rating < 1 || commentTooLong) && styles.submitDisabled,
        ]}
        disabled={state.rating < 1 || commentTooLong}
        onPress={() => {
          console.info("[review][telemetry] driver_submit_tap", {
            rating: state.rating,
            tagCount: state.tagKeys.length,
            hasComment: state.comment.trim().length > 0,
          });
        }}
      >
        <Text style={styles.submitText}>Submit</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: "700" },
  window: { color: "#6b7280" },
  row: { flexDirection: "row", gap: 8 },
  star: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    padding: 10,
  },
  starActive: { backgroundColor: "#fee2e2", borderColor: "#ef4444" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  tagActive: { backgroundColor: "#fef3c7", borderColor: "#f59e0b" },
  tagText: { fontSize: 12 },
  link: { color: "#2563eb", marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d8",
    borderRadius: 8,
    minHeight: 96,
    padding: 10,
    textAlignVertical: "top",
  },
  meta: { color: "#6b7280", marginTop: 6 },
  warn: { color: "#b91c1c" },
  points: { fontWeight: "600" },
  submit: {
    backgroundColor: "#111827",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  submitDisabled: { backgroundColor: "#9ca3af" },
  submitText: { color: "white", fontWeight: "700" },
});
