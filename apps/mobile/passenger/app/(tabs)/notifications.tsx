import { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  useNotifications,
  type NotificationItem,
} from "@/hooks/useNotifications";
import { routeNotificationData } from "@/constants/LinkingConfiguration";

export default function NotificationsScreen() {
  const router = useRouter();
  const {
    items,
    loading,
    loadingMore,
    unreadCount,
    refresh,
    loadMore,
    markAsRead,
    markAllRead,
  } = useNotifications();

  const emptyState = useMemo(() => {
    if (loading) return null;
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No notifications yet</Text>
        <Text style={styles.emptyBody}>
          Trip, wallet, and system updates will appear here.
        </Text>
      </View>
    );
  }, [loading]);

  const onPressItem = async (item: NotificationItem) => {
    if (!item.readAt) {
      await markAsRead(item.id);
    }
    routeNotificationData(router, item.data ?? undefined);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => router.push("/notification-preferences")}
          >
            <Text style={styles.secondaryBtnText}>Preferences</Text>
          </Pressable>
          <Pressable
            style={[
              styles.secondaryBtn,
              unreadCount === 0 && styles.disabledBtn,
            ]}
            onPress={() => {
              if (unreadCount > 0) {
                void markAllRead();
              }
            }}
          >
            <Text style={styles.secondaryBtnText}>Mark all read</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator
            size="large"
            color="#0a7ea4"
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => void onPressItem(item)}
            >
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardBody}>{item.body}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>
                  {new Date(item.createdAt).toLocaleString()}
                </Text>
                {!item.readAt && <View style={styles.unreadDot} />}
              </View>
            </Pressable>
          )}
          onEndReached={() => {
            void loadMore();
          }}
          onEndReachedThreshold={0.2}
          ListEmptyComponent={emptyState}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                color="#0a7ea4"
                style={styles.footerLoader}
              />
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => void refresh()}
            />
          }
          contentContainerStyle={
            items.length === 0 ? styles.emptyContainer : undefined
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 10,
  },
  headerActions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryBtn: {
    backgroundColor: "#edf5f8",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    color: "#0a7ea4",
    fontWeight: "600",
  },
  disabledBtn: {
    opacity: 0.5,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: "#f6f8fa",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e6ebf0",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  cardBody: {
    color: "#475467",
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaText: {
    color: "#667085",
    fontSize: 12,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#0a7ea4",
  },
  footerLoader: {
    marginVertical: 12,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyBody: {
    color: "#667085",
    textAlign: "center",
  },
});
