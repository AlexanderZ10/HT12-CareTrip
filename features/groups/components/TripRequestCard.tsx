import { MaterialIcons } from "@expo/vector-icons";
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
import type { TripRequest } from "../../../utils/trip-requests";

type TripRequestCardProps = {
  currentUserId: string;
  onClosePress: () => void;
  onCreateGroupPress: () => void;
  onToggleInterestPress: () => void;
  request: TripRequest;
  updating: boolean;
};

export function TripRequestCard({
  currentUserId,
  onClosePress,
  onCreateGroupPress,
  onToggleInterestPress,
  request,
  updating,
}: TripRequestCardProps) {
  const { colors, isDark } = useAppTheme();
  const isCreator = request.creatorId === currentUserId;
  const isInterested = request.interestedUserIds.includes(currentUserId);
  const interestedCount = Math.max(1, request.interestedUserIds.length);

  return (
    <View
      style={[
        styles.requestCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: isDark ? "#000000" : "#0D1F02",
        },
      ]}
    >
      <View style={styles.requestCardTopRow}>
        <View style={styles.requestCardTitleWrap}>
          <Text style={[styles.requestCardEyebrow, { color: colors.accent }]}>
            Trip request
          </Text>
          <Text style={[styles.requestCardTitle, { color: colors.textPrimary }]}>
            {request.destination}
          </Text>
          <Text style={[styles.requestCardCreator, { color: colors.textSecondary }]}>
            {request.creatorLabel} is looking for travel buddies
          </Text>
        </View>
        <View
          style={[
            styles.requestCountBadge,
            { backgroundColor: colors.accentMuted, borderColor: colors.border },
          ]}
        >
          <MaterialIcons color={colors.accent} name="groups" size={16} />
          <Text style={[styles.requestCountText, { color: colors.textPrimary }]}>
            {interestedCount}
          </Text>
        </View>
      </View>

      <View style={styles.requestChipsRow}>
        <View
          style={[
            styles.requestChip,
            { backgroundColor: colors.accentMuted, borderColor: colors.border },
          ]}
        >
          <MaterialIcons color={colors.accent} name="payments" size={15} />
          <Text style={[styles.requestChipText, { color: colors.textPrimary }]}>
            {request.budgetLabel}
          </Text>
        </View>
        <View
          style={[
            styles.requestChip,
            { backgroundColor: colors.warningBackground, borderColor: colors.warningBorder },
          ]}
        >
          <MaterialIcons color={colors.warningText} name="schedule" size={15} />
          <Text style={[styles.requestChipText, { color: colors.textPrimary }]}>
            {request.timingLabel}
          </Text>
        </View>
        <View
          style={[
            styles.requestChip,
            { backgroundColor: colors.cardAlt, borderColor: colors.border },
          ]}
        >
          <MaterialIcons color={colors.textMuted} name="airline-seat-recline-normal" size={15} />
          <Text style={[styles.requestChipText, { color: colors.textPrimary }]}>
            {request.travelersLabel}
          </Text>
        </View>
      </View>

      <Text
        numberOfLines={3}
        style={[styles.requestCardNote, { color: colors.textSecondary }]}
      >
        {request.note || "Open vibe check: food, route, budget and timing can be refined with the group."}
      </Text>

      <View style={styles.requestCardFooter}>
        <Text style={[styles.requestFooterText, { color: colors.textMuted }]}>
          {isCreator
            ? "You created this request."
            : isInterested
              ? "You already joined the interest list."
              : "Tap in if you want to join this trip idea."}
        </Text>

        <View style={styles.requestActionsRow}>
          {isCreator ? (
            <>
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={updating}
                onPress={onCreateGroupPress}
                style={[
                  styles.requestPrimaryButton,
                  { backgroundColor: colors.accent },
                  updating && styles.requestButtonDisabled,
                ]}
              >
                <Text style={[styles.requestPrimaryButtonText, { color: colors.buttonTextOnAction }]}>
                  {updating ? "..." : "Create group"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={updating}
                onPress={onClosePress}
                style={[
                  styles.requestSecondaryButton,
                  {
                    backgroundColor: colors.warningBackground,
                    borderColor: colors.warningBorder,
                  },
                  updating && styles.requestButtonDisabled,
                ]}
              >
                <Text style={[styles.requestSecondaryButtonText, { color: colors.warningText }]}>
                  Close
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={updating}
              onPress={onToggleInterestPress}
              style={[
                styles.requestPrimaryButton,
                {
                  backgroundColor: isInterested ? colors.cardAlt : colors.accent,
                  borderColor: isInterested ? colors.border : colors.accent,
                  borderWidth: isInterested ? 1 : 0,
                },
                updating && styles.requestButtonDisabled,
              ]}
            >
              <Text
                style={[
                  styles.requestPrimaryButtonText,
                  { color: isInterested ? colors.textPrimary : colors.buttonTextOnAction },
                ]}
              >
                {updating ? "..." : isInterested ? "Interested" : "I'm in"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  requestCard: {
    borderRadius: Radius["3xl"],
    borderWidth: 1,
    marginRight: Spacing.md,
    minHeight: 260,
    padding: Spacing.xl,
    ...shadow("md"),
    width: 300,
  },
  requestCardTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  requestCardTitleWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  requestCardEyebrow: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  requestCardTitle: {
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginTop: 6,
  },
  requestCardCreator: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
  },
  requestCountBadge: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  requestCountText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  requestChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  requestChip: {
    alignItems: "center",
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  requestChipText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
  requestCardNote: {
    flex: 1,
    ...TypeScale.bodyMd,
    marginTop: Spacing.md,
  },
  requestCardFooter: {
    marginTop: Spacing.lg,
  },
  requestFooterText: {
    ...TypeScale.bodySm,
  },
  requestActionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  requestPrimaryButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: Spacing.md,
  },
  requestPrimaryButtonText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  requestSecondaryButton: {
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: Spacing.md,
  },
  requestSecondaryButtonText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  requestButtonDisabled: {
    opacity: 0.65,
  },
});
