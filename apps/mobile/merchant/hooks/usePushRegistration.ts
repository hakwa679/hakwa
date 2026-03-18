import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { AppState, type AppStateStatus, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const TOKEN_KEY = "hakwa_token";
const PUSH_TOKEN_KEY = "hakwa_push_token";

export function usePushRegistration(
  onDeepLink?: (data: Record<string, unknown>) => void,
): void {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const registerDeviceMutation = useMutation({
    mutationFn: async ({
      authToken,
      pushToken,
    }: {
      authToken: string;
      pushToken: string;
    }) => {
      const response = await fetch(`${API_URL}/api/devices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          pushToken,
          platform: Platform.OS === "ios" ? "ios" : "android",
        }),
      });

      return response.ok;
    },
  });

  useEffect(() => {
    let active = true;

    const register = async () => {
      try {
        const authToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!authToken) return;

        const permission = await Notifications.getPermissionsAsync();
        let status = permission.status;
        if (status !== "granted") {
          const request = await Notifications.requestPermissionsAsync();
          status = request.status;
        }

        if (status !== "granted") return;

        const pushTokenResult = await Notifications.getExpoPushTokenAsync();
        const pushToken = pushTokenResult.data;
        const currentStoredToken =
          await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
        if (currentStoredToken === pushToken) return;

        const ok = await registerDeviceMutation.mutateAsync({
          authToken,
          pushToken,
        });

        if (ok) {
          await SecureStore.setItemAsync(PUSH_TOKEN_KEY, pushToken);
        }
      } catch {
        // Ignore permission and network failures for push setup.
      }
    };

    const sub = AppState.addEventListener("change", (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        void register();
      }
      appStateRef.current = nextState;
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        if (!active || !onDeepLink) return;
        const data = (response.notification.request.content.data ??
          {}) as Record<string, unknown>;
        onDeepLink(data);
      },
    );

    void register();

    return () => {
      active = false;
      sub.remove();
      responseSub.remove();
    };
  }, [onDeepLink, registerDeviceMutation]);
}
