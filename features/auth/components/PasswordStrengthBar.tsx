import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useAppTheme } from "../../../components/app-theme-provider";
import { Radius, Spacing, TypeScale, FontWeight } from "../../../constants/design-system";

export type PasswordStrength = "weak" | "medium" | "strong" | "";

const STRENGTH_STEPS: PasswordStrength[] = ["weak", "medium", "strong"];

const STRENGTH_LABEL: Record<PasswordStrength, string> = {
  "": "",
  weak: "Weak",
  medium: "Medium",
  strong: "Strong",
};

/** Score a password and return a strength level. */
export function checkPasswordStrength(pass: string): PasswordStrength {
  if (!pass) return "";
  let score = 0;
  if (pass.length >= 6) score++;
  if (pass.length >= 10) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;
  if (score <= 1) return "weak";
  if (score <= 3) return "medium";
  return "strong";
}

interface PasswordStrengthBarProps {
  strength: PasswordStrength;
}

export default function PasswordStrengthBar({ strength }: PasswordStrengthBarProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const strengthColor: Record<PasswordStrength, string> = {
    "": colors.border,
    weak: colors.error,
    medium: colors.warning,
    strong: colors.success,
  };

  // ── Segment animations ───────────────────────────────────────────────────
  const seg0Opacity = useSharedValue(0.25);
  const seg1Opacity = useSharedValue(0.25);
  const seg2Opacity = useSharedValue(0.25);
  const segOpacities = [seg0Opacity, seg1Opacity, seg2Opacity];

  const seg0Style = useAnimatedStyle(() => ({ opacity: seg0Opacity.value }));
  const seg1Style = useAnimatedStyle(() => ({ opacity: seg1Opacity.value }));
  const seg2Style = useAnimatedStyle(() => ({ opacity: seg2Opacity.value }));
  const segStyles = [seg0Style, seg1Style, seg2Style];

  useEffect(() => {
    const filledCount = STRENGTH_STEPS.indexOf(strength) + 1; // 0 when strength=""
    segOpacities.forEach((sv, i) => {
      sv.value = withTiming(i < filledCount ? 1 : 0.2, { duration: 250 });
    });
  }, [strength]);

  return (
    <View style={styles.strengthContainer}>
      <View style={styles.strengthBarRow}>
        {STRENGTH_STEPS.map((step, i) => (
          <Animated.View
            key={step}
            style={[
              styles.strengthSegment,
              i > 0 && styles.strengthSegmentGap,
              { backgroundColor: strengthColor[strength] },
              segStyles[i],
            ]}
          />
        ))}
      </View>
      <Text style={[styles.strengthLabel, { color: strengthColor[strength] }]}>
        {STRENGTH_LABEL[strength]}
      </Text>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    strengthContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
      marginTop: Spacing.sm,
    },
    strengthBarRow: {
      flex: 1,
      flexDirection: "row",
      height: 4,
      gap: Spacing.xs,
    },
    strengthSegment: {
      flex: 1,
      borderRadius: Radius.full,
    },
    strengthSegmentGap: {
      marginLeft: Spacing.xs,
    },
    strengthLabel: {
      ...TypeScale.labelSm,
      fontWeight: FontWeight.semibold,
      minWidth: 44,
      textAlign: "right",
    },
  });
}
