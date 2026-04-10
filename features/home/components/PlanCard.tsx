import { MaterialIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAppLanguage } from "../../../components/app-language-provider";
import { useAppTheme } from "../../../components/app-theme-provider";
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
  const { colors } = useAppTheme();
  const { language } = useAppLanguage();

  const labels = language === "en"
    ? { transport: "Transport", stay: "Accommodation", days: "Day-by-day itinerary", profileTip: "Profile tip", viewOffer: "View offer", buyTicket: "Buy ticket", bookStay: "Book stay" }
    : language === "de"
      ? { transport: "Transport", stay: "Unterkunft", days: "Tagesplan", profileTip: "Profil-Tipp", viewOffer: "Angebot", buyTicket: "Ticket kaufen", bookStay: "Buchen" }
      : language === "es"
        ? { transport: "Transporte", stay: "Alojamiento", days: "Itinerario por días", profileTip: "Consejo del perfil", viewOffer: "Ver oferta", buyTicket: "Comprar billete", bookStay: "Reservar" }
        : language === "fr"
          ? { transport: "Transport", stay: "Hébergement", days: "Itinéraire jour par jour", profileTip: "Conseil profil", viewOffer: "Voir l'offre", buyTicket: "Acheter", bookStay: "Réserver" }
          : { transport: "Транспорт", stay: "Настаняване", days: "Маршрут по дни", profileTip: "Съвет според профила", viewOffer: "Офертата", buyTicket: "Купи билет", bookStay: "Резервирай" };

  return (
    <View
      style={[
        styles.planCard,
        { backgroundColor: colors.warningBackground, borderColor: colors.border },
        isPhoneLayout && styles.planCardPhone,
      ]}
    >
      <View style={[styles.planHeader, isPhoneLayout && styles.planHeaderPhone]}>
        <View style={styles.planHeaderTextWrap}>
          <Text
            style={[
              styles.planTitle,
              { color: colors.warningText },
              isPhoneLayout && styles.planTitlePhone,
            ]}
          >
            {latestPlan.plan.title}
          </Text>
          <Text style={[styles.planMeta, { color: colors.warningText }]}>
            {latestPlan.destination} • {latestPlan.days} • {latestPlan.budget}
          </Text>
          {[latestPlan.travelers, latestPlan.transportPreference, latestPlan.timing]
            .filter(Boolean)
            .length > 0 ? (
            <Text style={[styles.planMetaSecondary, { color: colors.warningText }]}>
              {[latestPlan.travelers, latestPlan.transportPreference, latestPlan.timing]
                .filter(Boolean)
                .join(" • ")}
            </Text>
          ) : null}
        </View>
        {!isPhoneLayout ? (
          <View style={[styles.planHeaderIcon, { backgroundColor: colors.warningBackground }]}>
            <MaterialIcons name="map" size={24} color={colors.warningText} />
          </View>
        ) : null}
      </View>

      <Text style={[styles.planSummary, { color: colors.warningText }]}>
        {latestPlan.plan.summary}
      </Text>

      {latestPlan.plan.budgetNote ? (
        <View style={[styles.budgetNotePill, { backgroundColor: colors.warningBackground }]}>
          <MaterialIcons name="euro" size={16} color={colors.warningText} />
          <Text style={[styles.budgetNoteText, { color: colors.warningText }]}>
            {latestPlan.plan.budgetNote}
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{labels.transport}</Text>
        {latestPlan.plan.transportOptions.map((option, index) => (
          <View
            key={`${option.provider}-${index}`}
            style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.optionTopRow}>
              <View style={styles.optionModeWrap}>
                <MaterialIcons
                  name={getTransportIconName(option) as keyof typeof MaterialIcons.glyphMap}
                  size={18}
                  color={colors.accent}
                />
                <Text style={[styles.optionModeText, { color: colors.accent }]}>
                  {option.mode}
                </Text>
              </View>
              <Text style={[styles.optionPrice, { color: colors.warningText }]}>
                {option.price}
              </Text>
            </View>

            <Text style={[styles.optionProvider, { color: colors.textPrimary }]}>
              {option.provider}
            </Text>
            <Text style={[styles.optionRoute, { color: colors.textSecondary }]}>
              {option.route}
            </Text>
            <Text style={[styles.optionMeta, { color: colors.textMuted }]}>{option.duration}</Text>
            {option.sourceLabel ? (
              <Text style={[styles.offerSourceText, { color: colors.warningText }]}>
                Source: {option.sourceLabel}
              </Text>
            ) : null}
            <Text style={[styles.optionNote, { color: colors.textSecondary }]}>{option.note}</Text>

            <View style={styles.optionActionsRow}>
              {option.bookingUrl ? (
                <TouchableOpacity
                  style={[
                    styles.optionLinkButton,
                    {
                      backgroundColor: colors.cardAlt,
                      borderColor: colors.border,
                    },
                    styles.optionHalfButton,
                  ]}
                  onPress={() => {
                    void Linking.openURL(option.bookingUrl!);
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="open-in-new" size={16} color={colors.textPrimary} />
                  <Text style={[styles.optionLinkButtonText, { color: colors.textPrimary }]}>
                    {labels.viewOffer}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.optionActionButton,
                  { backgroundColor: colors.textPrimary },
                  option.bookingUrl ? styles.optionHalfButton : null,
                ]}
                onPress={() => onBookTransport(index)}
                activeOpacity={0.9}
              >
                <MaterialIcons name="confirmation-number" size={16} color={colors.buttonTextOnAction} />
                <Text style={[styles.optionActionButtonText, { color: colors.buttonTextOnAction }]}>
                  {labels.buyTicket}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{labels.stay}</Text>
        {latestPlan.plan.stayOptions.map((stay, index) => (
          <View
            key={`${stay.name}-${index}`}
            style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.optionTopRow}>
              <Text style={[styles.optionProvider, { color: colors.textPrimary }]}>
                {stay.name}
              </Text>
              <Text style={[styles.optionPrice, { color: colors.warningText }]}>
                {stay.pricePerNight}
              </Text>
            </View>
            <Text style={[styles.optionRoute, { color: colors.textSecondary }]}>
              {stay.type} • {stay.area}
            </Text>
            {stay.sourceLabel ? (
              <Text style={[styles.offerSourceText, { color: colors.warningText }]}>
                Source: {stay.sourceLabel}
              </Text>
            ) : null}
            <Text style={[styles.optionNote, { color: colors.textSecondary }]}>{stay.note}</Text>

            <View style={styles.optionActionsRow}>
              {stay.bookingUrl ? (
                <TouchableOpacity
                  style={[
                    styles.optionLinkButton,
                    {
                      backgroundColor: colors.cardAlt,
                      borderColor: colors.border,
                    },
                    styles.optionHalfButton,
                  ]}
                  onPress={() => {
                    void Linking.openURL(stay.bookingUrl!);
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="open-in-new" size={16} color={colors.textPrimary} />
                  <Text style={[styles.optionLinkButtonText, { color: colors.textPrimary }]}>
                    {labels.viewOffer}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.optionActionButton,
                  { backgroundColor: colors.textPrimary },
                  stay.bookingUrl ? styles.optionHalfButton : null,
                ]}
                onPress={() => onBookStay(index)}
                activeOpacity={0.9}
              >
                <MaterialIcons name="hotel" size={16} color={colors.buttonTextOnAction} />
                <Text style={[styles.optionActionButtonText, { color: colors.buttonTextOnAction }]}>
                  {labels.bookStay}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{labels.days}</Text>
        {latestPlan.plan.tripDays.map((day, index) => (
          <View
            key={`${day.dayLabel}-${index}`}
            style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.dayLabel, { color: colors.warningText }]}>{day.dayLabel}</Text>
            <Text style={[styles.dayTitle, { color: colors.textPrimary }]}>{day.title}</Text>
            {day.items.map((item, itemIndex) => (
              <Text
                key={`${day.dayLabel}-${itemIndex}`}
                style={[styles.dayItem, { color: colors.textSecondary }]}
              >
                • {item}
              </Text>
            ))}
          </View>
        ))}
      </View>

      {latestPlan.plan.profileTip ? (
        <View style={[styles.profileTipCard, { backgroundColor: colors.cardAlt }]}>
          <Text style={[styles.profileTipTitle, { color: colors.textPrimary }]}>
            {labels.profileTip}
          </Text>
          <Text style={[styles.profileTipText, { color: colors.textSecondary }]}>
            {latestPlan.plan.profileTip}
          </Text>
        </View>
      ) : null}

      {bookingSuccess ? (
        <Text style={[styles.bookingSuccessText, { color: colors.accent }]}>
          {bookingSuccess}
        </Text>
      ) : null}
      {bookingError ? (
        <Text style={[styles.bookingErrorText, { color: colors.error }]}>{bookingError}</Text>
      ) : null}
      {saveSuccess ? (
        <Text style={[styles.saveSuccessText, { color: colors.accent }]}>{saveSuccess}</Text>
      ) : null}
      {saveError ? (
        <Text style={[styles.saveErrorText, { color: colors.error }]}>{saveError}</Text>
      ) : null}

      <TouchableOpacity
        style={[
          styles.savePlanButton,
          { backgroundColor: colors.accent },
          (saving || saved) && styles.disabledButton,
          saved && { backgroundColor: colors.border, borderWidth: 1, borderColor: colors.border },
        ]}
        onPress={onSavePlan}
        disabled={saving || saved}
        activeOpacity={0.9}
      >
        <Text
          style={[
            styles.savePlanButtonText,
            { color: colors.buttonTextOnAction },
            saved && { color: colors.accent },
          ]}
        >
          {saving ? "Saving..." : saved ? "Saved in tab" : "Save to Saved"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.bookNowButton, { backgroundColor: colors.textPrimary }]}
        onPress={onBookNow}
        activeOpacity={0.9}
      >
        <MaterialIcons name="credit-card" size={18} color={colors.buttonTextOnAction} />
        <Text style={[styles.bookNowButtonText, { color: colors.buttonTextOnAction }]}>
          Pay & reserve in app
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  planCard: {
    borderRadius: Radius["2xl"],
    borderWidth: 1,
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
    alignItems: "center",
    justifyContent: "center",
  },
  planTitle: {
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
  },
  planTitlePhone: {
    ...TypeScale.titleLg,
  },
  planMeta: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  planMetaSecondary: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.semibold,
  },
  planSummary: {
    ...TypeScale.titleSm,
    marginBottom: Spacing.md,
  },
  budgetNotePill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  budgetNoteText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginLeft: Spacing.sm,
    flex: 1,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.sm,
  },
  optionCard: {
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
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
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  optionPrice: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
  },
  optionProvider: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  optionRoute: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  optionMeta: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  optionNote: {
    ...TypeScale.bodySm,
  },
  offerSourceText: {
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
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginRight: Spacing.sm,
    borderWidth: 1,
  },
  optionLinkButtonText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  optionActionButton: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  optionActionButtonText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  dayCard: {
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  dayLabel: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: Spacing.xs,
  },
  dayTitle: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
  },
  dayItem: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  profileTipCard: {
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  profileTipTitle: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
  },
  profileTipText: {
    ...TypeScale.bodyMd,
  },
  saveSuccessText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  saveErrorText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  bookingSuccessText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  bookingErrorText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  savePlanButton: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  savePlanButtonText: {
    fontWeight: FontWeight.extrabold,
  },
  bookNowButton: {
    marginTop: Spacing.sm,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  bookNowButtonText: {
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  disabledButton: {
    opacity: 0.55,
  },
});
