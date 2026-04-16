import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";

export type StoryRailItem = {
  hasActiveStory?: boolean;
  key: string;
  kind: "current" | "friend";
  label: string;
  photoUrl: string;
};

type StoryRailProps = {
  items: StoryRailItem[];
  onAddPress?: (item: StoryRailItem) => void;
  onPress?: (item: StoryRailItem) => void;
};

const STORY_SIZE = 66;

export function StoryRail({ items, onAddPress, onPress }: StoryRailProps) {
  const { colors } = useAppTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {items.map((item) => {
        const isCurrent = item.kind === "current";
        const hasActiveStory = item.hasActiveStory === true;
        const initial = (item.label || "?")[0].toUpperCase();

        const inner = (
          <View style={[styles.avatarHolder, { backgroundColor: colors.card }]}>
            {item.photoUrl ? (
              <Image
                source={{ uri: item.photoUrl }}
                style={styles.avatarImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: colors.accent }]}>
                <Text style={styles.avatarFallbackText}>{initial}</Text>
              </View>
            )}
          </View>
        );

        return (
          <TouchableOpacity
            key={item.key}
            activeOpacity={0.85}
            disabled={!onPress}
            onPress={() => onPress?.(item)}
            style={styles.item}
          >
            <View style={styles.avatarOuter}>
              {isCurrent ? (
                <View
                  style={[
                    styles.plainRing,
                    { borderColor: hasActiveStory ? colors.accent : colors.border },
                  ]}
                >
                  {inner}
                </View>
              ) : (
                <LinearGradient
                  colors={["#FFD600", "#FF7A00", "#E0245E", "#A018C7"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gradientRing}
                >
                  {inner}
                </LinearGradient>
              )}
              {isCurrent ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  hitSlop={{ bottom: 10, left: 10, right: 10, top: 10 }}
                  onPress={() => onAddPress?.(item)}
                  style={[
                    styles.plusBadge,
                    { backgroundColor: colors.accent, borderColor: colors.card },
                  ]}
                >
                  <MaterialIcons name="add" size={14} color={colors.buttonTextOnAction} />
                </TouchableOpacity>
              ) : null}
            </View>
            <Text numberOfLines={1} style={[styles.label, { color: colors.textPrimary }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: {
    gap: Spacing.md,
    paddingRight: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  item: {
    alignItems: "center",
    width: STORY_SIZE + 12,
  },
  avatarOuter: {
    height: STORY_SIZE,
    position: "relative",
    width: STORY_SIZE,
  },
  gradientRing: {
    alignItems: "center",
    borderRadius: STORY_SIZE / 2,
    height: STORY_SIZE,
    justifyContent: "center",
    width: STORY_SIZE,
  },
  plainRing: {
    alignItems: "center",
    borderRadius: STORY_SIZE / 2,
    borderWidth: 2,
    height: STORY_SIZE,
    justifyContent: "center",
    width: STORY_SIZE,
  },
  avatarHolder: {
    alignItems: "center",
    borderRadius: (STORY_SIZE - 6) / 2,
    height: STORY_SIZE - 6,
    justifyContent: "center",
    overflow: "hidden",
    padding: 2,
    width: STORY_SIZE - 6,
  },
  avatarImage: {
    borderRadius: STORY_SIZE / 2,
    height: "100%",
    width: "100%",
  },
  avatarFallback: {
    alignItems: "center",
    borderRadius: STORY_SIZE / 2,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  avatarFallbackText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: FontWeight.extrabold,
  },
  plusBadge: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 2,
    bottom: -2,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: -2,
    width: 20,
  },
  label: {
    ...TypeScale.labelSm,
    marginTop: 6,
    maxWidth: STORY_SIZE + 8,
    textAlign: "center",
  },
});
