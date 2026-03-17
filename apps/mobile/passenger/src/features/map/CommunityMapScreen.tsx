import { View, Text, Pressable } from "react-native";

export default function CommunityMapScreen() {
  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>
        Explore and Map Fiji
      </Text>
      <Text>
        Browse pending community contributions and help verify map quality.
      </Text>
      <Pressable
        accessibilityRole="button"
        style={{ backgroundColor: "#111", padding: 12, borderRadius: 8 }}
      >
        <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>
          Start Verifying
        </Text>
      </Pressable>
    </View>
  );
}
