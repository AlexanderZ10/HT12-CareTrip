import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";

// ── SectionHeader ─────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  color,
}: {
  title: string;
  color: string;
}) {
  return (
    <Text
      style={[
        styles.sectionHeader,
        { color },
      ]}
    >
      {title}
    </Text>
  );
}

// ── SettingsRow ───────────────────────────────────────────────────────────

export function SettingsRow({
  icon,
  label,
  onPress,
  colors,
  loading: isLoading,
  destructive,
  trailing,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  colors: { textPrimary: string; border: string; accent: string; textMuted: string; errorText: string };
  loading?: boolean;
  destructive?: boolean;
  trailing?: string;
}) {
  const color = destructive ? colors.errorText : colors.textPrimary;
  return (
    <Pressable
      style={[styles.settingsRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
      disabled={isLoading}
    >
      <MaterialIcons name={icon} size={20} color={color} />
      <Text style={[styles.settingsRowLabel, { color }]}>{label}</Text>
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : trailing ? (
        <Text style={[styles.settingsRowTrailing, { color: colors.textMuted }]}>
          {trailing}
        </Text>
      ) : (
        <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

// ── ChoicePill ────────────────────────────────────────────────────────────

export function ChoicePill({
  label,
  onPress,
  selected,
  accentColor,
  cardBg,
  cardBorder,
  textColor,
  selectedTextColor,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
  accentColor: string;
  cardBg: string;
  cardBorder: string;
  textColor: string;
  selectedTextColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: selected ? accentColor : cardBg,
          borderColor: selected ? accentColor : cardBorder,
        },
      ]}
    >
      <Text
        style={[
          styles.pillText,
          { color: selected ? selectedTextColor : textColor },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── MiniToggle ────────────────────────────────────────────────────────────

export function MiniToggle({
  icon,
  label,
  active,
  onPress,
  accentColor,
  cardBg,
  cardBorder,
  textColor,
  activeTextColor,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
  accentColor: string;
  cardBg: string;
  cardBorder: string;
  textColor: string;
  activeTextColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.miniToggle,
        {
          backgroundColor: active ? accentColor : cardBg,
          borderColor: active ? accentColor : cardBorder,
        },
      ]}
    >
      <MaterialIcons
        name={icon}
        size={18}
        color={active ? activeTextColor : textColor}
      />
      <Text
        style={[
          styles.miniToggleLabel,
          { color: active ? activeTextColor : textColor },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionHeader: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingsRowLabel: {
    ...TypeScale.bodyLg,
    flex: 1,
  },
  settingsRowTrailing: {
    ...TypeScale.bodySm,
  },
  pill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
  },
  pillText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.semibold,
  },
  miniToggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.md,
    justifyContent: "center",
  },
  miniToggleLabel: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.semibold,
  },
  toggleRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
});
