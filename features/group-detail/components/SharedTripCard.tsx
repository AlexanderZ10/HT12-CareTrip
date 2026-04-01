import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAppLanguage } from "../../../components/app-language-provider";
import { useAppTheme } from "../../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
} from "../../../constants/design-system";
import {
  type GroupChatLinkedTransport,
  type GroupChatMessage,
  type GroupChatSharedTrip,
} from "../../../utils/group-chat";
import {
  buildLinkedExpenseLookupKey,
  buildSharedTripDetailsPreview,
  formatExpenseAmount,
} from "../helpers";

interface SharedTripCardProps {
  creatingLinkedExpenseKey: string | null;
  group: { memberCount: number } | null;
  isMine: boolean;
  linkedExpenseMessagesByKey: Record<string, GroupChatMessage>;
  message: GroupChatMessage;
  onCreateLinkedTransportExpense: (
    message: GroupChatMessage,
    linkedTransport: GroupChatLinkedTransport
  ) => void;
  onOpenPlannerTicket: (bookingUrl: string) => void;
  onPreviewTrip: (sharedTrip: GroupChatSharedTrip) => void;
}

export function SharedTripCard({
  creatingLinkedExpenseKey,
  group,
  isMine,
  linkedExpenseMessagesByKey,
  message,
  onCreateLinkedTransportExpense,
  onOpenPlannerTicket,
  onPreviewTrip,
}: SharedTripCardProps) {
  const { t } = useAppLanguage();
  const { colors } = useAppTheme();
  const sharedTripLinkedTransports = message.sharedTrip?.linkedTransports ?? [];

  return (
    <View
      style={[
        styles.sharedTripCard,
        {
          backgroundColor: isMine ? colors.accentMuted : colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => {
          if (message.sharedTrip) {
            onPreviewTrip(message.sharedTrip);
          }
        }}
      >
        <View style={styles.sharedTripTopRow}>
          <Text style={[styles.sharedTripKicker, { color: colors.textSecondary }]}>
            {t("groupDetail.tripPlan")}
          </Text>
          <View
            style={[
              styles.sharedTripSourceBadge,
              {
                backgroundColor:
                  message.sharedTrip?.source === "home"
                    ? colors.skeleton
                    : colors.warningBackground,
              },
            ]}
          >
            <Text
              style={[
                styles.sharedTripSourceBadgeText,
                {
                  color:
                    message.sharedTrip?.source === "home"
                      ? colors.accent
                      : colors.textSecondary,
                },
              ]}
            >
              {message.sharedTrip?.source === "home" ? t("common.homePlanner") : t("common.discover")}
            </Text>
          </View>
        </View>
        <Text style={[styles.sharedTripTitle, { color: colors.textPrimary }]}>
          {message.sharedTrip?.title}
        </Text>
        <Text
          style={[
            styles.sharedTripDestination,
            { color: colors.textSecondary },
          ]}
        >
          {message.sharedTrip?.destination}
        </Text>
        <View style={styles.sharedTripMetaRow}>
          {message.sharedTrip?.duration ? (
            <Text
              style={[
                styles.sharedTripMetaText,
                { color: colors.textSecondary },
              ]}
            >
              {message.sharedTrip.duration}
            </Text>
          ) : null}
          {message.sharedTrip?.budget ? (
            <Text
              style={[
                styles.sharedTripMetaText,
                { color: colors.textSecondary },
              ]}
            >
              {message.sharedTrip.budget}
            </Text>
          ) : null}
        </View>
        {message.sharedTrip?.summary ? (
          <Text
            numberOfLines={3}
            style={[styles.sharedTripSummary, { color: colors.textSecondary }]}
          >
            {message.sharedTrip.summary}
          </Text>
        ) : null}
        <Text
          numberOfLines={4}
          style={[
            styles.sharedTripDetailsPreview,
            { color: colors.textSecondary },
          ]}
        >
          {buildSharedTripDetailsPreview(message.sharedTrip)}
        </Text>
        <Text style={[styles.sharedTripHint, { color: colors.textMuted }]}>
          {t("groupDetail.openTripHint")}
        </Text>
      </TouchableOpacity>
      {sharedTripLinkedTransports.length > 0 ? (
        <View style={styles.linkedTransportSection}>
          <Text
            style={[
              styles.linkedTransportSectionTitle,
              { color: colors.textSecondary },
            ]}
          >
            {t("groupDetail.plannerTicketPrices")}
          </Text>
          {sharedTripLinkedTransports.slice(0, 2).map((linkedTransport) => {
            const linkedExpenseKey = buildLinkedExpenseLookupKey(
              message.sharedTrip?.sourceKey ?? "",
              linkedTransport.itemKey
            );
            const linkedExpenseMessage = linkedExpenseMessagesByKey[linkedExpenseKey] ?? null;
            const ticketShareAmount =
              group && group.memberCount > 0
                ? linkedTransport.amountValue / group.memberCount
                : linkedTransport.amountValue;

            return (
              <View
                key={linkedTransport.itemKey}
                style={[
                  styles.linkedTransportCard,
                  {
                    backgroundColor: isMine ? colors.card : colors.cardAlt,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.linkedTransportTopRow}>
                  <View style={styles.linkedTransportTextWrap}>
                    <Text
                      style={[
                        styles.linkedTransportTitle,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {linkedTransport.title}
                    </Text>
                    {linkedTransport.route ? (
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.linkedTransportRoute,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {linkedTransport.route}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.linkedTransportAmount,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {linkedTransport.amountLabel}
                  </Text>
                </View>

                <View style={styles.linkedTransportMetaRow}>
                  {linkedTransport.duration ? (
                    <Text
                      style={[
                        styles.linkedTransportMetaText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {linkedTransport.duration}
                    </Text>
                  ) : null}
                  {linkedTransport.sourceLabel ? (
                    <Text
                      style={[
                        styles.linkedTransportMetaText,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {linkedTransport.sourceLabel}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.linkedTransportMetaText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {formatExpenseAmount(ticketShareAmount)} {t("common.each")}
                  </Text>
                </View>

                {linkedExpenseMessage ? (
                  <View
                    style={[
                      styles.linkedTransportPostedBadge,
                      {
                        backgroundColor: isMine
                          ? colors.accentMuted
                          : colors.cardAlt,
                      },
                    ]}
                  >
                    <MaterialIcons color={colors.accent} name="check-circle" size={15} />
                    <Text style={[styles.linkedTransportPostedBadgeText, { color: colors.accent }]}>
                      {t("groupDetail.expensePosted")}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.linkedTransportActionsRow}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        onOpenPlannerTicket(linkedTransport.bookingUrl);
                      }}
                      style={[
                        styles.linkedTransportSecondaryButton,
                        { backgroundColor: colors.cardAlt, borderColor: colors.border },
                      ]}
                    >
                      <MaterialIcons color={colors.textSecondary} name="open-in-new" size={16} />
                      <Text style={[styles.linkedTransportSecondaryButtonText, { color: colors.textSecondary }]}>
                        {t("groupDetail.openLink")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      disabled={creatingLinkedExpenseKey === linkedExpenseKey}
                      onPress={() => {
                        onCreateLinkedTransportExpense(message, linkedTransport);
                      }}
                      style={[
                        styles.linkedTransportPrimaryButton,
                        { backgroundColor: colors.accent },
                        creatingLinkedExpenseKey === linkedExpenseKey &&
                          styles.linkedTransportPrimaryButtonDisabled,
                      ]}
                    >
                      <MaterialIcons color={colors.buttonTextOnAction} name="payments" size={16} />
                      <Text style={[styles.linkedTransportPrimaryButtonText, { color: colors.buttonTextOnAction }]}>
                        {creatingLinkedExpenseKey === linkedExpenseKey
                          ? t("groupDetail.posting")
                          : t("groupDetail.createSplit")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
          {sharedTripLinkedTransports.length > 2 ? (
            <Text
              style={[
                styles.linkedTransportMoreHint,
                { color: colors.textMuted },
              ]}
            >
              {t("groupDetail.openTripHint")}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sharedTripCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: 2,
    padding: Spacing.md,
  },
  sharedTripTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sharedTripKicker: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
  },
  sharedTripSourceBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  sharedTripSourceBadgeText: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.extrabold,
  },
  sharedTripTitle: {
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
  },
  sharedTripDestination: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.xs,
  },
  sharedTripMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: Spacing.sm,
  },
  sharedTripMetaText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
    marginRight: Spacing.sm,
  },
  sharedTripSummary: {
    ...TypeScale.bodyMd,
    marginTop: Spacing.sm,
  },
  sharedTripDetailsPreview: {
    ...TypeScale.bodySm,
    marginTop: Spacing.sm,
  },
  sharedTripHint: {
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.sm,
  },
  linkedTransportSection: {
    marginTop: Spacing.md,
  },
  linkedTransportSectionTitle: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  linkedTransportCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.sm,
    padding: Spacing.md,
  },
  linkedTransportTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  linkedTransportTextWrap: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  linkedTransportTitle: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
  linkedTransportRoute: {
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
  linkedTransportAmount: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  linkedTransportMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  linkedTransportMetaText: {
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
  },
  linkedTransportActionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  linkedTransportSecondaryButton: {
    alignItems: "center",
    borderRadius: Radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: Spacing.xs,
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  linkedTransportSecondaryButtonText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  linkedTransportPrimaryButton: {
    alignItems: "center",
    borderRadius: Radius.md,
    flex: 1,
    flexDirection: "row",
    gap: Spacing.xs,
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  linkedTransportPrimaryButtonDisabled: {
    opacity: 0.6,
  },
  linkedTransportPrimaryButtonText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  linkedTransportPostedBadge: {
    alignItems: "center",
    borderRadius: Radius.md,
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  linkedTransportPostedBadgeText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  linkedTransportMoreHint: {
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.sm,
  },
});
