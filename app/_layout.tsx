import React, { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { onAuthStateChanged } from "firebase/auth";
import type { EventSubscription } from "expo-notifications";

import { auth } from "../firebase";
import { AppLanguageProvider } from "../components/app-language-provider";
import { AppThemeProvider, useAppTheme } from "../components/app-theme-provider";
import {
  registerForPushNotifications,
  addNotificationReceivedListener,
  addNotificationResponseListener,
} from "../utils/notifications";

function RootNavigator() {
  const { colors, isDark } = useAppTheme();

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          contentStyle: {
            backgroundColor: colors.screen,
          },
          headerShown: false,
        }}
      />
    </>
  );
}

export default function RootLayout() {
  const notificationReceivedRef = useRef<EventSubscription | undefined>(undefined);
  const notificationResponseRef = useRef<EventSubscription | undefined>(undefined);

  useEffect(() => {
    // Set up notification listeners
    notificationReceivedRef.current = addNotificationReceivedListener(
      (notification) => {
        console.log("Notification received:", notification);
      }
    );

    notificationResponseRef.current = addNotificationResponseListener(
      (response) => {
        console.log("Notification tapped:", response);
      }
    );

    // Register for push notifications when the user signs in
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        registerForPushNotifications(user.uid).catch((err) =>
          console.warn("Failed to register push notifications:", err)
        );
      }
    });

    return () => {
      notificationReceivedRef.current?.remove();
      notificationResponseRef.current?.remove();
      unsubscribeAuth();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppLanguageProvider>
          <AppThemeProvider>
            <RootNavigator />
          </AppThemeProvider>
        </AppLanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
