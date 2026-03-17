import { View, Text, Pressable } from "react-native";

export default function DriverCommunityMapScreen() {
  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>
        Driver Map Verification
      </Text>
      <Text>
        Swipe through pending features and confirm or dispute them quickly.
      </Text>
      <Pressable
        accessibilityRole="button"
        style={{ backgroundColor: "#111", padding: 12, borderRadius: 8 }}
      >
        <Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>
          Open Swipe Verification
        </Text>
      </Pressable>
    </View>
  );
}
