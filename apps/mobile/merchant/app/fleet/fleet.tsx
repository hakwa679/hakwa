/**
 * T029 — FleetScreen
 * Lists all vehicles for the merchant.
 * Shows active/inactive status and links to add-vehicle.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { fetchVehicles, type VehicleData } from "@/hooks/use-merchant-api";

export default function FleetScreen() {
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchVehicles();
      setVehicles(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load vehicles.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, []),
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator
          color="#0a7ea4"
          size="large"
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={styles.retryBtn}
          onPress={() => load()}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor="#0a7ea4"
          />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No vehicles yet.</Text>
            <Text style={styles.emptySubText}>
              Add your first vehicle to get started.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, !item.isActive && styles.cardInactive]}>
            <View style={styles.cardTop}>
              <Text style={styles.plate}>{item.registrationPlate}</Text>
              <View
                style={[
                  styles.badge,
                  item.isActive ? styles.badgeActive : styles.badgeInactive,
                ]}
              >
                <Text style={styles.badgeText}>
                  {item.isActive ? "Active" : "Inactive"}
                </Text>
              </View>
            </View>
            <Text style={styles.vehicleName}>
              {item.make} {item.model} · {item.year}
            </Text>
            <Text style={styles.vehicleSub}>
              {item.seatingCapacity} seats{item.color ? ` · ${item.color}` : ""}
            </Text>
          </View>
        )}
      />
      <Pressable
        style={styles.fab}
        onPress={() => router.push("/fleet/add-vehicle")}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#151718" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#151718",
  },
  list: { padding: 16, paddingBottom: 80 },
  card: {
    borderWidth: 1,
    borderColor: "#2C2F30",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: "#1E2122",
  },
  cardInactive: { opacity: 0.6 },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  plate: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ECEDEE",
    letterSpacing: 1.2,
  },
  badge: { borderRadius: 20, paddingVertical: 3, paddingHorizontal: 10 },
  badgeActive: { backgroundColor: "#1a4a3a" },
  badgeInactive: { backgroundColor: "#3a2a1a" },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ECEDEE",
    textTransform: "uppercase",
  },
  vehicleName: { fontSize: 15, color: "#ECEDEE", marginBottom: 2 },
  vehicleSub: { fontSize: 13, color: "#9BA1A6" },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ECEDEE",
    marginBottom: 8,
  },
  emptySubText: { fontSize: 14, color: "#9BA1A6" },
  errorText: { fontSize: 15, color: "#e05252", marginBottom: 16 },
  retryBtn: {
    backgroundColor: "#0a7ea4",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: { color: "#fff", fontWeight: "700" },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0a7ea4",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  fabIcon: { fontSize: 30, color: "#fff", lineHeight: 34 },
});
