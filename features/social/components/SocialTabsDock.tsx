import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialIcons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../../../constants/design-system";

type SocialRoute = "/groups" | "/feed" | "/social-profile";

const SOCIAL_TAB_STORAGE_KEY = "caretrip:last-social-tab";

export async function getLastSocialTab(): Promise<SocialRoute> {
  try {
    const value = await AsyncStorage.getItem(SOCIAL_TAB_STORAGE_KEY);
    if (value === "/feed" || value === "/social-profile") {
      return value;
    }
  } catch {}
  return "/groups";
}

export const SOCIAL_DOCK_HEIGHT = 66;
export const SOCIAL_DOCK_BOTTOM_GAP = 0;
export const SOCIAL_DOCK_CONTENT_SPACER = Spacing.lg;

const SOCIAL_ITEMS: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  key: SocialRoute;
  label: string;
}[] = [
  { key: "/groups", label: "Groups", icon: "forum" },
  { key: "/feed", label: "Feed", icon: "dynamic-feed" },
  { key: "/social-profile", label: "Profile", icon: "person-outline" },
];

export function SocialTabsDock() {
  const { colors } = useAppTheme();
  const pathname = usePathname();
  const router = useRouter();

  const activeKey = React.useMemo<SocialRoute>(() => {
    if (pathname.startsWith("/feed")) {
      return "/feed";
    }
    if (pathname.startsWith("/social-profile")) {
      return "/social-profile";
    }
    return "/groups";
  }, [pathname]);

  React.useEffect(() => {
    AsyncStorage.setItem(SOCIAL_TAB_STORAGE_KEY, activeKey).catch(() => {});
  }, [activeKey]);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: SOCIAL_DOCK_BOTTOM_GAP,
        },
      ]}
    >
      <View
        style={[
          styles.dock,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        {SOCIAL_ITEMS.map((item) => {
          const active = item.key === activeKey;

          return (
            <TouchableOpacity
              key={item.key}
              accessibilityLabel={item.label}
              accessibilityRole="tab"
              activeOpacity={0.88}
              onPress={() => router.replace(item.key)}
              style={[
                styles.item,
                active && { backgroundColor: colors.accent },
              ]}
            >
              <MaterialIcons
                name={item.icon}
                size={20}
                color={active ? colors.buttonTextOnAction : colors.textSecondary}
              />
              <Text
                style={[
                  styles.itemLabel,
                  {
                    color: active ? colors.buttonTextOnAction : colors.textPrimary,
                    fontWeight: active ? FontWeight.extrabold : FontWeight.semibold,
                  },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    left: Spacing.xl,
    position: "absolute",
    right: Spacing.xl,
    zIndex: 18,
  },
  dock: {
    borderRadius: Radius["3xl"],
    borderWidth: 1,
    flexDirection: "row",
    minHeight: SOCIAL_DOCK_HEIGHT,
    padding: 6,
    ...shadow("lg"),
  },
  item: {
    alignItems: "center",
    borderRadius: Radius.xl,
    flex: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "center",
    minHeight: 54,
    paddingHorizontal: Spacing.md,
  },
  itemLabel: {
    ...TypeScale.bodyMd,
  },
});
