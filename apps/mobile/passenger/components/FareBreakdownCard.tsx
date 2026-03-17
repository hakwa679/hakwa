import { StyleSheet, Text, View } from "react-native";

interface FareBreakdownCardProps {
  estimatedFare: string;
  baseFare: string;
  distanceFare: string;
  distanceKm: string;
  currency?: string;
}

/**
 * FareBreakdownCard — shows the passenger a transparent fare breakdown before
 * they confirm booking. Renders total fare, base fare, and distance fare.
 */
export function FareBreakdownCard({
  estimatedFare,
  baseFare,
  distanceFare,
  distanceKm,
  currency = "FJD",
}: FareBreakdownCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.totalLabel}>Estimated fare</Text>
      <Text style={styles.totalFare}>
        {currency} {estimatedFare}
      </Text>
      <Text style={styles.distance}>{distanceKm} km route</Text>
      <View style={styles.divider} />
      <View style={styles.row}>
        <Text style={styles.lineLabel}>Base fare</Text>
        <Text style={styles.lineValue}>
          {currency} {baseFare}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.lineLabel}>Distance</Text>
        <Text style={styles.lineValue}>
          {currency} {distanceFare}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  totalLabel: {
    fontSize: 12,
    color: "#687076",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  totalFare: {
    fontSize: 28,
    fontWeight: "700",
    color: "#11181C",
    marginTop: 2,
  },
  distance: {
    fontSize: 13,
    color: "#687076",
    marginTop: 2,
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "#e0e0e0",
    marginVertical: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 2,
  },
  lineLabel: {
    fontSize: 14,
    color: "#687076",
  },
  lineValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#11181C",
  },
});
