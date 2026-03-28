import { MaterialIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useAppTheme } from "../../components/app-theme-provider";
import { Spacing } from "../../constants/design-system";

const TAB_BAR_HEIGHT = 64;
const ACTIVE_DOT_SIZE = 5;

type TabIconName = React.ComponentProps<typeof MaterialIcons>["name"];

function TabIcon({
  name,
  color,
  focused,
}: {
  name: TabIconName;
  color: string;
  focused: boolean;
}) {
  const scale = useSharedValue(focused ? 1 : 0.85);
  const dotOpacity = useSharedValue(focused ? 1 : 0);

  React.useEffect(() => {
    scale.value = withSpring(focused ? 1 : 0.85, { damping: 15, stiffness: 200 });
    dotOpacity.value = withSpring(focused ? 1 : 0, { damping: 15, stiffness: 200 });
  }, [focused, scale, dotOpacity]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
    transform: [{ scale: dotOpacity.value }],
  }));

  return (
    <Animated.View style={[styles.tabIconContainer, iconStyle]}>
      <MaterialIcons name={name} size={24} color={color} />
      <Animated.View
        style={[styles.activeDot, { backgroundColor: color }, dotStyle]}
      />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { colors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.screen,
        },
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.divider,
          elevation: 0,
          height: TAB_BAR_HEIGHT,
          paddingBottom: Platform.OS === "ios" ? Spacing.sm : Spacing.xs,
          paddingTop: Spacing.sm,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarAccessibilityLabel: "Home",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="explore" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="favorite-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groups",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="chat-bubble-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person-outline" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  activeDot: {
    width: ACTIVE_DOT_SIZE,
    height: ACTIVE_DOT_SIZE,
    borderRadius: ACTIVE_DOT_SIZE / 2,
  },
});
