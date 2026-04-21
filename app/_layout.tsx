import React, { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { onAuthStateChanged } from "firebase/auth";

import { auth } from "../firebase";
import { AppLanguageProvider } from "../components/app-language-provider";
import { AppThemeProvider, useAppTheme } from "../components/app-theme-provider";
import { GroupsScreenProvider } from "../features/groups/GroupsScreenProvider";
import {
  addNotificationReceivedListener,
  addNotificationResponseListener,
  initializeNotifications,
  registerForPushNotifications,
  type NotificationSubscription,
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
  const notificationReceivedRef = useRef<NotificationSubscription | undefined>(undefined);
  const notificationResponseRef = useRef<NotificationSubscription | undefined>(undefined);

  useEffect(() => {
    let isActive = true;

    const setupNotifications = async () => {
      await initializeNotifications();

      const [receivedSubscription, responseSubscription] = await Promise.all([
        addNotificationReceivedListener((_notification) => {
          // Foreground notification received — could show in-app banner
        }),
        addNotificationResponseListener((_response) => {
          // User tapped a notification — could navigate to relevant screen
        }),
      ]);

      if (!isActive) {
        receivedSubscription?.remove();
        responseSubscription?.remove();
        return;
      }

      notificationReceivedRef.current = receivedSubscription;
      notificationResponseRef.current = responseSubscription;
    };

    void setupNotifications();

    // Register for push notifications when the user signs in
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        registerForPushNotifications(user.uid).catch((err) =>
          console.warn("Failed to register push notifications:", err)
        );
      }
    });

    return () => {
      isActive = false;
      notificationReceivedRef.current?.remove();
      notificationResponseRef.current?.remove();
      unsubscribeAuth();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <AppLanguageProvider>
          <AppThemeProvider>
            <GroupsScreenProvider>
              <RootNavigator />
            </GroupsScreenProvider>
          </AppThemeProvider>
        </AppLanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
