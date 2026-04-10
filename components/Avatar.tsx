import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "./app-theme-provider";
import { FontWeight, Spacing, TypeScale } from "../constants/design-system";

const AVATAR_PALETTE = ["#4D7CFE", "#7C3AED", "#DB2777", "#0EA5E9", "#16A34A", "#F97316"];

export function getAvatarColor(seed: string) {
  const sum = seed.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
}

export function getInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "?";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

type AvatarProps = {
  label: string;
  photoUrl?: string;
  size?: number;
  subtitle?: string;
};

export function Avatar({ label, photoUrl, size = 72, subtitle }: AvatarProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.avatarWrap}>
      <View
        style={[
          styles.avatarCircle,
          { backgroundColor: getAvatarColor(label), height: size, width: size, borderRadius: size / 2 },
        ]}
      >
        {photoUrl ? (
          <Image contentFit="cover" source={{ uri: photoUrl }} style={[styles.avatarImage, { backgroundColor: colors.cardAlt }]} />
        ) : (
          <Text style={[styles.avatarText, { fontSize: Math.max(16, size * 0.26) }]}>
            {getInitials(label)}
          </Text>
        )}
      </View>
      {subtitle ? <Text style={[styles.avatarSubtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarWrap: {
    alignItems: "center",
  },
  avatarCircle: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    height: "100%",
    width: "100%",
  },
  avatarText: {
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
  avatarSubtitle: {
    ...TypeScale.labelLg,
    marginTop: Spacing.xs,
  },
});
