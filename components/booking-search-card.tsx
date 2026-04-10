import React from "react";
import {
  Image,
  Linking,
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
  shadow,
} from "../constants/design-system";
import type {
  AccommodationResult,
  BookingSearchResult,
  TransportResult,
} from "../utils/booking-search";
import { useAppTheme } from "./app-theme-provider";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type BookingSearchCardProps = {
  results: BookingSearchResult;
  onBookTransport?: (result: TransportResult) => void;
  onBookAccommodation?: (result: AccommodationResult) => void;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TransportCard({
  result,
  onBook,
}: {
  result: TransportResult;
  onBook?: (result: TransportResult) => void;
}) {
  const { colors } = useAppTheme();

  const handlePress = () => {
    if (onBook) {
      onBook(result);
      return;
    }

    if (result.bookingUrl) {
      Linking.openURL(result.bookingUrl).catch(() => {
        // Silently ignore if the URL cannot be opened.
      });
    }
  };

  return (
    <View
      style={[
        styles.itemCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          ...shadow("sm"),
        },
      ]}
    >
      <View style={styles.itemCardHeader}>
        {result.logoUrl ? (
          <Image
            source={{ uri: result.logoUrl }}
            style={styles.providerLogo}
            resizeMode="contain"
          />
        ) : (
          <View
            style={[
              styles.providerLogoPlaceholder,
              { backgroundColor: colors.accentMuted },
            ]}
          >
            <Text
              style={[
                styles.providerLogoInitial,
                { color: colors.accentText },
              ]}
            >
              {result.provider.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.itemCardInfo}>
          <Text
            style={[styles.providerName, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {result.provider}
          </Text>
          <Text
            style={[styles.modeBadgeText, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {result.mode}
          </Text>
        </View>

        <View style={styles.priceContainer}>
          <Text style={[styles.priceText, { color: colors.accent }]}>
            {result.price}
          </Text>
        </View>
      </View>

      <View style={[styles.routeRow, { borderTopColor: colors.divider }]}>
        <Text
          style={[styles.routeText, { color: colors.textPrimary }]}
          numberOfLines={2}
        >
          {result.route}
        </Text>
      </View>

      <View style={styles.timeRow}>
        <Text style={[styles.durationText, { color: colors.textSecondary }]}>
          {result.duration}
        </Text>
      </View>

      {(result.bookingUrl || onBook) && (
        <Pressable
          style={({ pressed }) => [
            styles.bookButton,
            {
              backgroundColor: pressed
                ? colors.accentPressed
                : colors.primaryAction,
            },
          ]}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={`Book ${result.provider} ${result.mode}`}
        >
          <Text
            style={[
              styles.bookButtonText,
              { color: colors.buttonTextOnAction },
            ]}
          >
            Book
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function AccommodationCard({
  result,
  onBook,
}: {
  result: AccommodationResult;
  onBook?: (result: AccommodationResult) => void;
}) {
  const { colors } = useAppTheme();

  const handlePress = () => {
    if (onBook) {
      onBook(result);
      return;
    }

    if (result.bookingUrl) {
      Linking.openURL(result.bookingUrl).catch(() => {
        // Silently ignore if the URL cannot be opened.
      });
    }
  };

  return (
    <View
      style={[
        styles.itemCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          ...shadow("sm"),
        },
      ]}
    >
      {result.imageUrl ? (
        <Image
          source={{ uri: result.imageUrl }}
          style={styles.accommodationImage}
          resizeMode="cover"
        />
      ) : null}

      <View style={styles.accommodationContent}>
        <Text
          style={[styles.accommodationName, { color: colors.textPrimary }]}
          numberOfLines={2}
        >
          {result.name}
        </Text>

        <View style={styles.accommodationMeta}>
          <Text
            style={[styles.accommodationType, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {result.type}
          </Text>
          {result.area ? (
            <Text
              style={[styles.accommodationArea, { color: colors.textMuted }]}
              numberOfLines={1}
            >
              {result.area}
            </Text>
          ) : null}
        </View>

        <View style={styles.accommodationFooter}>
          <View style={styles.priceRatingRow}>
            <Text style={[styles.priceText, { color: colors.accent }]}>
              {result.pricePerNight}
              <Text style={[styles.perNightLabel, { color: colors.textMuted }]}>
                {" / night"}
              </Text>
            </Text>

            {result.rating !== null && (
              <View
                style={[
                  styles.ratingBadge,
                  { backgroundColor: colors.accentMuted },
                ]}
              >
                <Text
                  style={[
                    styles.ratingText,
                    { color: colors.accentText },
                  ]}
                >
                  {result.rating.toFixed(1)}
                </Text>
              </View>
            )}
          </View>

          {(result.bookingUrl || onBook) && (
            <Pressable
              style={({ pressed }) => [
                styles.bookButton,
                {
                  backgroundColor: pressed
                    ? colors.accentPressed
                    : colors.primaryAction,
                },
              ]}
              onPress={handlePress}
              accessibilityRole="button"
              accessibilityLabel={`Book ${result.name}`}
            >
              <Text
                style={[
                  styles.bookButtonText,
                  { color: colors.buttonTextOnAction },
                ]}
              >
                Book
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
        {message}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BookingSearchCard({
  results,
  onBookTransport,
  onBookAccommodation,
}: BookingSearchCardProps) {
  const { colors } = useAppTheme();

  const hasTransport = results.transport.length > 0;
  const hasAccommodation = results.accommodation.length > 0;
  const isEmpty = !hasTransport && !hasAccommodation;

  if (isEmpty) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            ...shadow("md"),
          },
        ]}
      >
        <EmptyState message="No booking results found. Try adjusting your search criteria." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Transport section */}
      {hasTransport && (
        <View style={styles.section}>
          <Text
            style={[styles.sectionTitle, { color: colors.textPrimary }]}
          >
            Transport
          </Text>
          {results.transport.map((item, index) => (
            <TransportCard
              key={`transport-${index}-${item.provider}`}
              result={item}
              onBook={onBookTransport}
            />
          ))}
        </View>
      )}

      {/* Accommodation section */}
      {hasAccommodation && (
        <View style={styles.section}>
          <Text
            style={[styles.sectionTitle, { color: colors.textPrimary }]}
          >
            Accommodation
          </Text>
          {results.accommodation.map((item, index) => (
            <AccommodationCard
              key={`accommodation-${index}-${item.name}`}
              result={item}
              onBook={onBookAccommodation}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    gap: Spacing.lg,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: TypeScale.headingSm.fontSize,
    lineHeight: TypeScale.headingSm.lineHeight,
    fontWeight: TypeScale.headingSm.fontWeight,
  },

  // Item card
  itemCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  itemCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.md,
  },
  itemCardInfo: {
    flex: 1,
  },

  // Provider logo
  providerLogo: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
  },
  providerLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  providerLogoInitial: {
    fontSize: TypeScale.titleLg.fontSize,
    fontWeight: FontWeight.bold,
  },

  // Provider text
  providerName: {
    fontSize: TypeScale.titleMd.fontSize,
    lineHeight: TypeScale.titleMd.lineHeight,
    fontWeight: TypeScale.titleMd.fontWeight,
  },
  modeBadgeText: {
    fontSize: TypeScale.labelMd.fontSize,
    lineHeight: TypeScale.labelMd.lineHeight,
    fontWeight: TypeScale.labelMd.fontWeight,
  },

  // Price
  priceContainer: {
    alignItems: "flex-end",
  },
  priceText: {
    fontSize: TypeScale.titleLg.fontSize,
    lineHeight: TypeScale.titleLg.lineHeight,
    fontWeight: FontWeight.bold,
  },

  // Route
  routeRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
  },
  routeText: {
    fontSize: TypeScale.bodyMd.fontSize,
    lineHeight: TypeScale.bodyMd.lineHeight,
    fontWeight: FontWeight.medium,
  },

  // Time / duration
  timeRow: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  durationText: {
    fontSize: TypeScale.labelMd.fontSize,
    lineHeight: TypeScale.labelMd.lineHeight,
    fontWeight: TypeScale.labelMd.fontWeight,
  },

  // Accommodation image
  accommodationImage: {
    width: "100%",
    height: 160,
  },
  accommodationContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  accommodationName: {
    fontSize: TypeScale.titleMd.fontSize,
    lineHeight: TypeScale.titleMd.lineHeight,
    fontWeight: TypeScale.titleMd.fontWeight,
  },
  accommodationMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  accommodationType: {
    fontSize: TypeScale.labelMd.fontSize,
    lineHeight: TypeScale.labelMd.lineHeight,
    fontWeight: TypeScale.labelMd.fontWeight,
  },
  accommodationArea: {
    fontSize: TypeScale.labelMd.fontSize,
    lineHeight: TypeScale.labelMd.lineHeight,
    fontWeight: TypeScale.labelMd.fontWeight,
  },
  accommodationFooter: {
    gap: Spacing.sm,
  },
  priceRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  perNightLabel: {
    fontSize: TypeScale.labelMd.fontSize,
    fontWeight: FontWeight.regular,
  },

  // Rating badge
  ratingBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  ratingText: {
    fontSize: TypeScale.labelLg.fontSize,
    lineHeight: TypeScale.labelLg.lineHeight,
    fontWeight: FontWeight.bold,
  },

  // Book button
  bookButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  bookButtonText: {
    fontSize: TypeScale.titleSm.fontSize,
    lineHeight: TypeScale.titleSm.lineHeight,
    fontWeight: FontWeight.semibold,
  },

  // Empty state
  emptyContainer: {
    paddingVertical: Spacing["3xl"],
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
  },
  emptyText: {
    fontSize: TypeScale.bodyMd.fontSize,
    lineHeight: TypeScale.bodyMd.lineHeight,
    textAlign: "center",
  },
});
