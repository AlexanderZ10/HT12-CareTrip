import React from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { AppLanguageProvider } from "../components/app-language-provider";
import { AppThemeProvider, useAppTheme } from "../components/app-theme-provider";

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
