import { MaterialIcons } from "@expo/vector-icons";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { useAppTheme } from "../../components/app-theme-provider";

function CenterActionButton({
  accessibilityState,
  activeColor,
  borderColor,
  iconColor,
  onPress,
}: BottomTabBarButtonProps & {
  activeColor: string;
  borderColor: string;
  iconColor: string;
}) {
  const focused = Boolean(accessibilityState?.selected);

  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.92}
      onPress={onPress}
      style={styles.centerButtonWrapper}
    >
      <View
        style={[
          styles.centerButton,
          { backgroundColor: activeColor, borderColor },
          focused && styles.centerButtonActive,
        ]}
      >
        <MaterialIcons name="add" size={34} color={iconColor} />
      </View>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  const { colors, isDark } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.screen,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: 0,
          elevation: isDark ? 0 : 10,
          height: 88,
          paddingBottom: 14,
          paddingTop: 12,
          shadowColor: "#18240F",
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: isDark ? 0.28 : 0.08,
          shadowRadius: 14,
        },
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
        },
        tabBarItemStyle: {
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="saved"
        options={{
          title: "Trips",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="format-list-bulleted" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groups",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarAccessibilityLabel: "Open home planner",
          tabBarButton: (props) => (
            <CenterActionButton
              {...props}
              activeColor={colors.accent}
              borderColor={colors.centerButtonBorder}
              iconColor={colors.card}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="travel-explore" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerButtonWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -24,
  },
  centerButton: {
    alignItems: "center",
    borderRadius: 34,
    borderWidth: 6,
    height: 68,
    justifyContent: "center",
    shadowColor: "#18240F",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    width: 68,
  },
  centerButtonActive: {
    transform: [{ scale: 0.98 }],
  },
});
