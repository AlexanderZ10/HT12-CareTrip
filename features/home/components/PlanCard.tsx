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
  const hasVisiblePrice = (value?: string) => !!value?.match(/\d/);
  const hasBookableOptions =
    latestPlan.plan.transportOptions.some((option) => hasVisiblePrice(option.price)) ||
    latestPlan.plan.stayOptions.some((stay) => hasVisiblePrice(stay.pricePerNight));

  const labels = language === "en"
    ? { transport: "Transport", stay: "Accommodation", days: "Verified trip structure", profileTip: "Verification", viewOffer: "View offer", buyTicket: "Buy ticket", bookStay: "Book stay", noTransport: "No reliable live transport offers were found for this search yet.", noStay: "No reliable live accommodation offers were found for this search yet.", transportPriceHint: "Exact fare for the selected search", stayPriceHint: "Exact total for the selected dates", saving: "Saving...", saved: "Saved", saveTrip: "Save trip", payReserve: "Pay & reserve", bookNow: "Book now" }
    : language === "de"
      ? { transport: "Transport", stay: "Unterkunft", days: "Verifizierte Reisestruktur", profileTip: "Verifizierung", viewOffer: "Angebot", buyTicket: "Ticket kaufen", bookStay: "Buchen", noTransport: "Fur diese Suche wurden noch keine verlasslichen Live-Transportangebote gefunden.", noStay: "Fur diese Suche wurden noch keine verlasslichen Live-Unterkunfte gefunden.", transportPriceHint: "Exakter Preis fur diese Suche", stayPriceHint: "Exakter Gesamtpreis fur die gewahlten Daten", saving: "Wird gespeichert...", saved: "Gespeichert", saveTrip: "Reise speichern", payReserve: "Bezahlen & reservieren", bookNow: "Jetzt buchen" }
      : language === "es"
        ? { transport: "Transporte", stay: "Alojamiento", days: "Estructura verificada del viaje", profileTip: "Verificación", viewOffer: "Ver oferta", buyTicket: "Comprar billete", bookStay: "Reservar", noTransport: "Todavia no se encontraron ofertas fiables de transporte en vivo para esta busqueda.", noStay: "Todavia no se encontraron ofertas fiables de alojamiento en vivo para esta busqueda.", transportPriceHint: "Tarifa exacta para esta búsqueda", stayPriceHint: "Total exacto para las fechas elegidas", saving: "Guardando...", saved: "Guardado", saveTrip: "Guardar viaje", payReserve: "Pagar y reservar", bookNow: "Reservar ahora" }
        : language === "fr"
          ? { transport: "Transport", stay: "Hébergement", days: "Structure verifiée du voyage", profileTip: "Vérification", viewOffer: "Voir l'offre", buyTicket: "Acheter", bookStay: "Réserver", noTransport: "Aucune offre fiable de transport en direct n'a encore ete trouvee pour cette recherche.", noStay: "Aucune offre fiable d'hebergement en direct n'a encore ete trouvee pour cette recherche.", transportPriceHint: "Tarif exact pour cette recherche", stayPriceHint: "Total exact pour les dates choisies", saving: "Enregistrement...", saved: "Enregistré", saveTrip: "Enregistrer le voyage", payReserve: "Payer et réserver", bookNow: "Réserver" }
          : { transport: "Транспорт", stay: "Настаняване", days: "Проверена структура на пътуването", profileTip: "Проверка", viewOffer: "Офертата", buyTicket: "Купи билет", bookStay: "Резервирай", noTransport: "Все още няма достатъчно надеждни live транспортни оферти за това търсене.", noStay: "Все още няма достатъчно надеждни live оферти за настаняване за това търсене.", transportPriceHint: "Точна цена за това търсене", stayPriceHint: "Точна обща цена за избраните дати", saving: "Запазване...", saved: "Запазено", saveTrip: "Запази пътуването", payReserve: "Плати и резервирай", bookNow: "Резервирай" };
  const providerLabel =
    language === "bg"
      ? "Доставчик"
      : language === "de"
        ? "Anbieter"
        : language === "es"
          ? "Proveedor"
          : language === "fr"
            ? "Fournisseur"
            : "Provider";

  return (
    <View
      style={[
        styles.planCard,
        { backgroundColor: colors.card, borderColor: colors.border },
        isPhoneLayout && styles.planCardPhone,
      ]}
    >
      <View style={[styles.planHeader, isPhoneLayout && styles.planHeaderPhone]}>
        <View style={styles.planHeaderTextWrap}>
          <Text
            style={[
              styles.planTitle,
              { color: colors.textPrimary },
              isPhoneLayout && styles.planTitlePhone,
            ]}
          >
            {latestPlan.plan.title}
          </Text>
          <Text style={[styles.planMeta, { color: colors.textSecondary }]}>
            {latestPlan.destination} • {latestPlan.days} • {latestPlan.budget}
          </Text>
          {[latestPlan.travelers, latestPlan.transportPreference, latestPlan.timing]
            .filter(Boolean)
            .length > 0 ? (
            <Text style={[styles.planMetaSecondary, { color: colors.textMuted }]}>
              {[latestPlan.travelers, latestPlan.transportPreference, latestPlan.timing]
                .filter(Boolean)
                .join(" • ")}
            </Text>
          ) : null}
        </View>
        {!isPhoneLayout ? (
          <View style={[styles.planHeaderIcon, { backgroundColor: colors.cardAlt }]}>
            <MaterialIcons name="map" size={24} color={colors.accent} />
          </View>
        ) : null}
      </View>

      <Text style={[styles.planSummary, { color: colors.textSecondary }]}>
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
        {latestPlan.plan.transportOptions.length === 0 ? (
          <Text style={[styles.emptySectionText, { color: colors.textSecondary }]}>
            {labels.noTransport}
          </Text>
        ) : null}
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
              {hasVisiblePrice(option.price) ? (
                <Text style={[styles.optionPrice, { color: colors.accent }]}>
                  {option.price}
                </Text>
              ) : null}
            </View>

            <Text style={[styles.optionProvider, { color: colors.textPrimary }]}>
              {option.provider}
            </Text>
            <Text style={[styles.optionRoute, { color: colors.textSecondary }]}>
              {option.route}
            </Text>
            <Text style={[styles.optionMeta, { color: colors.textMuted }]}>{option.duration}</Text>
            {hasVisiblePrice(option.price) ? (
              <Text style={[styles.optionMeta, { color: colors.textMuted }]}>
                {labels.transportPriceHint}
              </Text>
            ) : null}
            {option.sourceLabel ? (
              <Text style={[styles.offerSourceText, { color: colors.accent }]}>
                {providerLabel}: {option.sourceLabel}
              </Text>
            ) : null}
            <Text style={[styles.optionNote, { color: colors.textSecondary }]}>{option.note}</Text>

            <View style={styles.optionActionsRow}>
              {option.bookingUrl && hasVisiblePrice(option.price) ? (
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

              {hasVisiblePrice(option.price) ? (
                <TouchableOpacity
                  style={[
                    styles.optionActionButton,
                    { backgroundColor: colors.textPrimary },
                    option.bookingUrl ? styles.optionHalfButton : null,
                  ]}
                  onPress={() => {
                    onBookTransport(index);
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="confirmation-number" size={16} color={colors.buttonTextOnAction} />
                  <Text style={[styles.optionActionButtonText, { color: colors.buttonTextOnAction }]}>
                    {labels.buyTicket}
                  </Text>
                </TouchableOpacity>
              ) : option.bookingUrl ? (
                <TouchableOpacity
                  style={[
                    styles.optionLinkButton,
                    { backgroundColor: colors.cardAlt, borderColor: colors.border },
                    styles.optionSingleButton,
                  ]}
                  onPress={() => {
                    void Linking.openURL(option.bookingUrl!);
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="open-in-new" size={16} color={colors.textPrimary} />
                  <Text style={[styles.optionLinkButtonText, { color: colors.textPrimary }]}>{labels.viewOffer}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{labels.stay}</Text>
        {latestPlan.plan.stayOptions.length === 0 ? (
          <Text style={[styles.emptySectionText, { color: colors.textSecondary }]}>
            {labels.noStay}
          </Text>
        ) : null}
        {latestPlan.plan.stayOptions.map((stay, index) => (
          <View
            key={`${stay.name}-${index}`}
            style={[styles.optionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.optionTopRow}>
              <Text style={[styles.optionProvider, { color: colors.textPrimary }]}>
                {stay.name}
              </Text>
              {hasVisiblePrice(stay.pricePerNight) ? (
                <Text style={[styles.optionPrice, { color: colors.accent }]}>
                  {stay.pricePerNight}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.optionRoute, { color: colors.textSecondary }]}>
              {stay.type} • {stay.area}
            </Text>
            {hasVisiblePrice(stay.pricePerNight) ? (
              <Text style={[styles.optionMeta, { color: colors.textMuted }]}>
                {labels.stayPriceHint}
              </Text>
            ) : null}
            {stay.sourceLabel ? (
              <Text style={[styles.offerSourceText, { color: colors.accent }]}>
                {providerLabel}: {stay.sourceLabel}
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

              {hasVisiblePrice(stay.pricePerNight) ? (
                <TouchableOpacity
                  style={[
                    styles.optionActionButton,
                    { backgroundColor: colors.textPrimary },
                    stay.bookingUrl ? styles.optionHalfButton : null,
                  ]}
                  onPress={() => {
                    onBookStay(index);
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="hotel" size={16} color={colors.buttonTextOnAction} />
                  <Text style={[styles.optionActionButtonText, { color: colors.buttonTextOnAction }]}>
                    {labels.bookStay}
                  </Text>
                </TouchableOpacity>
              ) : stay.bookingUrl ? (
                <TouchableOpacity
                  style={[
                    styles.optionLinkButton,
                    { backgroundColor: colors.cardAlt, borderColor: colors.border },
                    styles.optionSingleButton,
                  ]}
                  onPress={() => {
                    void Linking.openURL(stay.bookingUrl!);
                  }}
                  activeOpacity={0.9}
                >
                  <MaterialIcons name="open-in-new" size={16} color={colors.textPrimary} />
                  <Text style={[styles.optionLinkButtonText, { color: colors.textPrimary }]}>{labels.viewOffer}</Text>
                </TouchableOpacity>
              ) : null}
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
          saved && { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
        ]}
        onPress={onSavePlan}
        disabled={saving || saved}
        activeOpacity={0.9}
      >
        <MaterialIcons
          name={saved ? "check-circle" : "bookmark-border"}
          size={18}
          color={saved ? colors.accent : colors.buttonTextOnAction}
          style={styles.savePlanButtonIcon}
        />
        <Text
          style={[
            styles.savePlanButtonText,
            { color: colors.buttonTextOnAction },
            saved && { color: colors.accent },
          ]}
        >
          {saving ? labels.saving : saved ? labels.saved : labels.saveTrip}
        </Text>
      </TouchableOpacity>

      {hasBookableOptions ? (
        <TouchableOpacity
          style={[styles.bookNowButton, { backgroundColor: colors.textPrimary }]}
          onPress={onBookNow}
          activeOpacity={0.9}
        >
          <MaterialIcons name="credit-card" size={18} color={colors.buttonTextOnAction} />
          <Text style={[styles.bookNowButtonText, { color: colors.buttonTextOnAction }]}>
            {labels.payReserve}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  planCard: {
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    padding: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
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
  emptySectionText: {
    ...TypeScale.bodySm,
    marginBottom: Spacing.sm,
    lineHeight: 20,
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
  optionSingleButton: {
    flex: 1,
  },
  optionLinkButton: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm + 2,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginRight: Spacing.sm,
    borderWidth: 1,
    minHeight: 40,
  },
  optionLinkButtonText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  optionActionButton: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm + 2,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    minHeight: 40,
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
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    minHeight: 48,
  },
  savePlanButtonIcon: {
    marginRight: Spacing.sm,
  },
  savePlanButtonText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  bookNowButton: {
    marginTop: Spacing.sm,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    minHeight: 48,
  },
  bookNowButtonText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
