import { MaterialIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { FontWeight, Radius, Spacing, TypeScale } from "../../../constants/design-system";
import type { StoredHomePlan } from "../../../utils/home-chat-storage";
import { getTransportIconName } from "../helpers";

type PlanCardProps = {
  bookingError: string;
  bookingEstimateLabel: string;
  bookingSuccess: string;
  isPhoneLayout: boolean;
  latestPlan: NonNullable<StoredHomePlan>;
  onBookNow: () => void;
  onBookStay: (index: number) => void;
  onBookTransport: (index: number) => void;
  onSavePlan: () => void;
  saveError: string;
  saveSuccess: string;
  saved: boolean;
  saving: boolean;
};

export function PlanCard({
  bookingError,
  bookingEstimateLabel,
  bookingSuccess,
  isPhoneLayout,
  latestPlan,
  onBookNow,
  onBookStay,
  onBookTransport,
  onSavePlan,
  saveError,
  saveSuccess,
  saved,
  saving,
}: PlanCardProps) {
  return (
    <View style={[styles.planCard, isPhoneLayout && styles.planCardPhone]}>
      <View style={[styles.planHeader, isPhoneLayout && styles.planHeaderPhone]}>
        <View style={styles.planHeaderTextWrap}>
          <Text style={[styles.planTitle, isPhoneLayout && styles.planTitlePhone]}>
            {latestPlan.plan.title}
          </Text>
          <Text style={styles.planMeta}>
            {latestPlan.destination} • {latestPlan.days} • {latestPlan.budget}
          </Text>
          {[latestPlan.travelers, latestPlan.transportPreference, latestPlan.timing]
            .filter(Boolean)
            .length > 0 ? (
            <Text style={styles.planMetaSecondary}>
              {[latestPlan.travelers, latestPlan.transportPreference, latestPlan.timing]
                .filter(Boolean)
                .join(" • ")}
            </Text>
          ) : null}
        </View>
        {!isPhoneLayout ? (
          <View style={styles.planHeaderIcon}>
            <MaterialIcons name="map" size={24} color="#92400E" />
          </View>
        ) : null}
      </View>

      <Text style={styles.planSummary}>{latestPlan.plan.summary}</Text>

      {latestPlan.plan.budgetNote ? (
        <View style={styles.budgetNotePill}>
          <MaterialIcons name="euro" size={16} color="#92400E" />
          <Text style={styles.budgetNoteText}>{latestPlan.plan.budgetNote}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Транспорт</Text>
        {latestPlan.plan.transportOptions.map((option, index) => (
          <View key={`${option.provider}-${index}`} style={styles.optionCard}>
            <View style={styles.optionTopRow}>
              <View style={styles.optionModeWrap}>
                <MaterialIcons
                  name={getTransportIconName(option) as keyof typeof MaterialIcons.glyphMap}
                  size={18}
                  color="#2D6A4F"
                />
                <Text style={styles.optionModeText}>{option.mode}</Text>
              </View>
              <Text style={styles.optionPrice}>{option.price}</Text>
            </View>

            <Text style={styles.optionProvider}>{option.provider}</Text>
            <Text style={styles.optionRoute}>{option.route}</Text>
            <Text style={styles.optionMeta}>{option.duration}</Text>
            {option.sourceLabel ? (
              <Text style={styles.offerSourceText}>Source: {option.sourceLabel}</Text>
            ) : null}
            <Text style={styles.optionNote}>{option.note}</Text>

            <View style={styles.optionActionsRow}>
              {option.bookingUrl ? (
                <TouchableOpacity
                  style={[styles.optionLinkButton, styles.optionHalfButton]}
                  onPress={() => {
                    void Linking.openURL(option.bookingUrl!);
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="open-in-new" size={16} color="#1A1A1A" />
                  <Text style={styles.optionLinkButtonText}>Офертата</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.optionActionButton,
                  option.bookingUrl ? styles.optionHalfButton : null,
                ]}
                onPress={() => onBookTransport(index)}
                activeOpacity={0.9}
              >
                <MaterialIcons name="confirmation-number" size={16} color="#FFFFFF" />
                <Text style={styles.optionActionButtonText}>Купи билет</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Настаняване</Text>
        {latestPlan.plan.stayOptions.map((stay, index) => (
          <View key={`${stay.name}-${index}`} style={styles.optionCard}>
            <View style={styles.optionTopRow}>
              <Text style={styles.optionProvider}>{stay.name}</Text>
              <Text style={styles.optionPrice}>{stay.pricePerNight}</Text>
            </View>
            <Text style={styles.optionRoute}>
              {stay.type} • {stay.area}
            </Text>
            {stay.sourceLabel ? (
              <Text style={styles.offerSourceText}>Source: {stay.sourceLabel}</Text>
            ) : null}
            <Text style={styles.optionNote}>{stay.note}</Text>

            <View style={styles.optionActionsRow}>
              {stay.bookingUrl ? (
                <TouchableOpacity
                  style={[styles.optionLinkButton, styles.optionHalfButton]}
                  onPress={() => {
                    void Linking.openURL(stay.bookingUrl!);
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="open-in-new" size={16} color="#1A1A1A" />
                  <Text style={styles.optionLinkButtonText}>Офертата</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.optionActionButton,
                  stay.bookingUrl ? styles.optionHalfButton : null,
                ]}
                onPress={() => onBookStay(index)}
                activeOpacity={0.9}
              >
                <MaterialIcons name="hotel" size={16} color="#FFFFFF" />
                <Text style={styles.optionActionButtonText}>Резервирай</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Маршрут по дни</Text>
        {latestPlan.plan.tripDays.map((day, index) => (
          <View key={`${day.dayLabel}-${index}`} style={styles.dayCard}>
            <Text style={styles.dayLabel}>{day.dayLabel}</Text>
            <Text style={styles.dayTitle}>{day.title}</Text>
            {day.items.map((item, itemIndex) => (
              <Text key={`${day.dayLabel}-${itemIndex}`} style={styles.dayItem}>
                • {item}
              </Text>
            ))}
          </View>
        ))}
      </View>

      {latestPlan.plan.profileTip ? (
        <View style={styles.profileTipCard}>
          <Text style={styles.profileTipTitle}>Съвет според профила</Text>
          <Text style={styles.profileTipText}>{latestPlan.plan.profileTip}</Text>
        </View>
      ) : null}

      {bookingSuccess ? <Text style={styles.bookingSuccessText}>{bookingSuccess}</Text> : null}
      {bookingError ? <Text style={styles.bookingErrorText}>{bookingError}</Text> : null}
      {saveSuccess ? <Text style={styles.saveSuccessText}>{saveSuccess}</Text> : null}
      {saveError ? <Text style={styles.saveErrorText}>{saveError}</Text> : null}

      <TouchableOpacity
        style={[
          styles.savePlanButton,
          (saving || saved) && styles.disabledButton,
          saved && styles.savedPlanButton,
        ]}
        onPress={onSavePlan}
        disabled={saving || saved}
        activeOpacity={0.9}
      >
        <Text style={[styles.savePlanButtonText, saved && styles.savedPlanButtonText]}>
          {saving ? "Saving..." : saved ? "Saved in tab" : "Save to Saved"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.bookNowButton}
        onPress={onBookNow}
        activeOpacity={0.9}
      >
        <MaterialIcons name="credit-card" size={18} color="#FFFFFF" />
        <Text style={styles.bookNowButtonText}>Pay & reserve in app</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  planCard: {
    backgroundColor: "#FFFBF5",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: Spacing.lg,
    marginTop: Spacing.xs,
  },
  planCardPhone: {
    borderRadius: Radius.xl,
    padding: Spacing.md,
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  planHeaderPhone: {
    marginBottom: Spacing.sm,
  },
  planHeaderTextWrap: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  planHeaderIcon: {
    width: 46,
    height: 46,
    borderRadius: Radius.lg,
    backgroundColor: "#FFF7ED",
    alignItems: "center",
    justifyContent: "center",
  },
  planTitle: {
    color: "#78350F",
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
  },
  planTitlePhone: {
    ...TypeScale.titleLg,
  },
  planMeta: {
    color: "#92400E",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  planMetaSecondary: {
    color: "#B45309",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.semibold,
  },
  planSummary: {
    color: "#78350F",
    ...TypeScale.titleSm,
    marginBottom: Spacing.md,
  },
  budgetNotePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF7ED",
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  budgetNoteText: {
    color: "#92400E",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginLeft: Spacing.sm,
    flex: 1,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.sm,
  },
  optionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    marginBottom: Spacing.sm,
  },
  optionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  optionModeWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: Spacing.sm,
  },
  optionModeText: {
    color: "#2D6A4F",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  optionPrice: {
    color: "#92400E",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  optionProvider: {
    color: "#1A1A1A",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  optionRoute: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  optionMeta: {
    color: "#9CA3AF",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  optionNote: {
    color: "#6B7280",
    ...TypeScale.bodySm,
  },
  offerSourceText: {
    color: "#B45309",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  optionActionsRow: {
    flexDirection: "row",
    marginTop: Spacing.md,
  },
  optionHalfButton: {
    flex: 1,
  },
  optionLinkButton: {
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  optionLinkButtonText: {
    color: "#1A1A1A",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  optionActionButton: {
    backgroundColor: "#1A1A1A",
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  optionActionButtonText: {
    color: "#FFFFFF",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  dayCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    marginBottom: Spacing.sm,
  },
  dayLabel: {
    color: "#92400E",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: Spacing.xs,
  },
  dayTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
  },
  dayItem: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  profileTipCard: {
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  profileTipTitle: {
    color: "#1A1A1A",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
  },
  profileTipText: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
  },
  saveSuccessText: {
    color: "#2D6A4F",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  saveErrorText: {
    color: "#DC3545",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  bookingSuccessText: {
    color: "#2D6A4F",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  bookingErrorText: {
    color: "#DC3545",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  savePlanButton: {
    backgroundColor: "#2D6A4F",
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  savePlanButtonText: {
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
  },
  savedPlanButton: {
    backgroundColor: "#E5E7EB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  savedPlanButtonText: {
    color: "#2D6A4F",
  },
  bookNowButton: {
    marginTop: Spacing.sm,
    backgroundColor: "#1A1A1A",
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  bookNowButtonText: {
    color: "#FFFFFF",
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  disabledButton: {
    opacity: 0.55,
  },
});
