import React, { useEffect, useRef } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../constants/design-system";
import type { WeatherForecast } from "../utils/weather";
import { useAppTheme } from "./app-theme-provider";

type WeatherForecastCardProps = {
  forecast: WeatherForecast | null;
  loading?: boolean;
  error?: string;
};

// ---------------------------------------------------------------------------
// Day-name helper
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function formatDayName(dateStr: string, index: number): string {
  if (index === 0) return "Today";
  const date = new Date(dateStr + "T00:00:00");
  return DAY_NAMES[date.getDay()];
}

// ---------------------------------------------------------------------------
// Skeleton shimmer for loading state
// ---------------------------------------------------------------------------

function SkeletonDayCard({
  skeletonColor,
  highlightColor,
}: {
  skeletonColor: string;
  highlightColor: string;
}) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const backgroundColor = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [skeletonColor, highlightColor],
  });

  return (
    <View style={[styles.dayCard, { backgroundColor: skeletonColor }]}>
      <Animated.View
        style={[styles.skeletonLine, styles.skeletonDay, { backgroundColor }]}
      />
      <Animated.View
        style={[styles.skeletonLine, styles.skeletonIcon, { backgroundColor }]}
      />
      <Animated.View
        style={[styles.skeletonLine, styles.skeletonTemp, { backgroundColor }]}
      />
      <Animated.View
        style={[
          styles.skeletonLine,
          styles.skeletonTempMin,
          { backgroundColor },
        ]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WeatherForecastCard({
  forecast,
  loading,
  error,
}: WeatherForecastCardProps) {
  const { colors } = useAppTheme();

  // Error state
  if (error) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            ...shadow("md"),
          },
        ]}
      >
        <Text style={[styles.errorText, { color: colors.error }]}>
          {error}
        </Text>
      </View>
    );
  }

  // Loading state
  if (loading || !forecast) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            ...shadow("md"),
          },
        ]}
      >
        <View style={styles.header}>
          <Animated.View
            style={[
              styles.skeletonLine,
              { width: 120, height: 16, backgroundColor: colors.skeleton },
            ]}
          />
          <Animated.View
            style={[
              styles.skeletonLine,
              { width: 90, height: 12, backgroundColor: colors.skeleton },
            ]}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.daysRow}
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonDayCard
              key={i}
              skeletonColor={colors.skeleton}
              highlightColor={colors.skeletonHighlight}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  // Loaded state
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          ...shadow("md"),
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.locationText, { color: colors.textPrimary }]}>
          {forecast.location}
        </Text>
        <Text style={[styles.subtitleText, { color: colors.textSecondary }]}>
          7-day forecast
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.daysRow}
      >
        {forecast.days.map((day, index) => (
          <View
            key={day.date}
            style={[
              styles.dayCard,
              { backgroundColor: colors.screenSoft },
            ]}
          >
            <Text style={[styles.dayName, { color: colors.textSecondary }]}>
              {formatDayName(day.date, index)}
            </Text>

            <Text style={styles.weatherIcon}>{day.weatherIcon}</Text>

            <Text style={[styles.tempMax, { color: colors.textPrimary }]}>
              {day.tempMax}\u00B0
            </Text>
            <Text style={[styles.tempMin, { color: colors.textMuted }]}>
              {day.tempMin}\u00B0
            </Text>

            {day.precipitation > 0 && (
              <Text
                style={[styles.precipitation, { color: colors.info }]}
              >
                {day.precipitation} mm
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  locationText: {
    fontSize: TypeScale.titleMd.fontSize,
    lineHeight: TypeScale.titleMd.lineHeight,
    fontWeight: TypeScale.titleMd.fontWeight,
  },
  subtitleText: {
    fontSize: TypeScale.labelMd.fontSize,
    lineHeight: TypeScale.labelMd.lineHeight,
    fontWeight: TypeScale.labelMd.fontWeight,
  },
  daysRow: {
    gap: Spacing.sm,
  },
  dayCard: {
    alignItems: "center",
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    minWidth: 72,
  },
  dayName: {
    fontSize: TypeScale.labelMd.fontSize,
    lineHeight: TypeScale.labelMd.lineHeight,
    fontWeight: FontWeight.semibold,
    marginBottom: Spacing.sm,
  },
  weatherIcon: {
    fontSize: 28,
    marginBottom: Spacing.sm,
  },
  tempMax: {
    fontSize: TypeScale.titleSm.fontSize,
    lineHeight: TypeScale.titleSm.lineHeight,
    fontWeight: FontWeight.semibold,
  },
  tempMin: {
    fontSize: TypeScale.bodySm.fontSize,
    lineHeight: TypeScale.bodySm.lineHeight,
    fontWeight: FontWeight.regular,
    marginTop: 2,
  },
  precipitation: {
    fontSize: TypeScale.labelSm.fontSize,
    lineHeight: TypeScale.labelSm.lineHeight,
    fontWeight: FontWeight.medium,
    marginTop: Spacing.xs,
  },
  errorText: {
    fontSize: TypeScale.bodyMd.fontSize,
    lineHeight: TypeScale.bodyMd.lineHeight,
    textAlign: "center",
    paddingVertical: Spacing.lg,
  },
  skeletonLine: {
    borderRadius: Radius.xs,
  },
  skeletonDay: {
    width: 32,
    height: 12,
    marginBottom: Spacing.sm,
  },
  skeletonIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    marginBottom: Spacing.sm,
  },
  skeletonTemp: {
    width: 28,
    height: 14,
    marginBottom: 4,
  },
  skeletonTempMin: {
    width: 24,
    height: 12,
  },
});
