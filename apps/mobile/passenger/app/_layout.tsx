import { useEffect, useState } from "react";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import {
  routeNotificationData,
  routeNotificationPath,
} from "@/constants/LinkingConfiguration";
import {
  startPassengerMapQueueBootstrap,
  stopPassengerMapQueueBootstrap,
} from "./bootstrap/mapQueueBootstrap";

export const TOKEN_KEY = "hakwa_token";
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const url = Linking.useURL();

  // null = loading, false = unauthenticated, true = authenticated
  const [authReady, setAuthReady] = useState<boolean | null>(null);

  usePushRegistration((data) => {
    routeNotificationData(router, data);
  });

  useEffect(() => {
    startPassengerMapQueueBootstrap(API_URL);
    return () => {
      stopPassengerMapQueueBootstrap();
    };
  }, []);

  // Step 1: Restore session from SecureStore on launch
  useEffect(() => {
    async function restoreSession() {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!token) {
          setAuthReady(false);
          return;
        }
        const res = await fetch(`${API_URL}/api/auth/session`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setAuthReady(true);
        } else {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          setAuthReady(false);
        }
      } catch {
        setAuthReady(false);
      }
    }
    restoreSession();
  }, []);

  // Step 2: Route based on auth state
  useEffect(() => {
    if (authReady === null) return; // still loading
    const inAuthGroup = segments[0] === "auth";
    if (!authReady && !inAuthGroup) {
      router.replace("/auth/sign-in");
    } else if (authReady && inAuthGroup) {
      // Passenger home is the booking tab
      router.replace("/(tabs)");
    }
  }, [authReady, segments]);

  // Step 3: Handle deep links (email verification, password reset)
  useEffect(() => {
    if (!url) return;
    handleDeepLink(url);
  }, [url]);

  async function handleDeepLink(deepLinkUrl: string) {
    try {
      const { queryParams, path } = Linking.parse(deepLinkUrl);
      const token = queryParams?.["token"];
      if (typeof token !== "string" || !token) return;

      if (path?.includes("verify-email")) {
        const res = await fetch(`${API_URL}/auth/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          // Token verified — user still needs to sign in (Better Auth flow)
          router.replace("/auth/sign-in");
        }
      } else if (path?.includes("reset-password")) {
        router.push({ pathname: "/auth/reset-password", params: { token } });
      } else {
        routeNotificationPath(router, path);
      }
    } catch {
      // Ignore deep link errors silently
    }
  }

  // Don't render any screens until auth check is complete
  if (authReady === null) return null;

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="auth/sign-in"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="auth/register"
          options={{ title: "Create account" }}
        />
        <Stack.Screen
          name="auth/forgot-password"
          options={{ title: "Reset password" }}
        />
        <Stack.Screen
          name="auth/verify-email-sent"
          options={{ title: "Verify your email" }}
        />
        <Stack.Screen
          name="notification-preferences"
          options={{ title: "Notification preferences" }}
        />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
