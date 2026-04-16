import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useAppLanguage } from "../../../components/app-language-provider";
import { useAppTheme } from "../../../components/app-theme-provider";
import { FontWeight, Radius, Spacing, TypeScale } from "../../../constants/design-system";
import type { StoredHomePlan } from "../../../utils/home-chat-storage";
import type {
  PlannerStayOption,
  PlannerTransportOption,
} from "../../../utils/home-travel-planner";
import { formatCheckoutReference, getPaymentMethodDisplayLabel, getPaymentMethodIcon } from "../helpers";
import { formatProcessedAt } from "../../../utils/formatting";
import { getLanguageLocale } from "../../../utils/translations";
import type { BookingCheckoutStage, BookingReceipt } from "../types";

type BookingForm = {
  contactEmail: string;
  contactName: string;
  note: string;
  paymentMethod: string;
};

type ThemeColors = ReturnType<typeof useAppTheme>["colors"];

type BookingModalProps = {
  bookingError: string;
  bookingEstimateLabel: string;
  bookingForm: BookingForm;
  bookingPlatformFeeLabel: string;
  bookingProcessing: boolean;
  bookingProgressLabel: string;
  bookingProgress: number;
  bookingProviderLabel: string;
  bookingReceipt: BookingReceipt | null;
  bookingReservationStatusLabel: string;
  bookingStage: BookingCheckoutStage;
  bookingSubtotalLabel: string;
  paymentMethods: string[];
  latestPlan: NonNullable<StoredHomePlan>;
  onClose: () => void;
  onConfirm: () => void;
  onUpdateForm: (updater: (current: BookingForm) => BookingForm) => void;
  selectedStay: PlannerStayOption | null;
  selectedStayIndex: number | null;
  selectedTransport: PlannerTransportOption | null;
  selectedTransportIndex: number | null;
  setSelectedStayIndex: (index: number | null) => void;
  setSelectedTransportIndex: (index: number | null) => void;
  visible: boolean;
};

export function BookingModal({
  bookingError,
  bookingEstimateLabel,
  bookingForm,
  bookingPlatformFeeLabel,
  bookingProcessing,
  bookingProgress,
  bookingProgressLabel,
  bookingProviderLabel,
  bookingReceipt,
  bookingReservationStatusLabel,
  bookingStage,
  bookingSubtotalLabel,
  paymentMethods,
  latestPlan,
  onClose,
  onConfirm,
  onUpdateForm,
  selectedStay,
  selectedStayIndex,
  selectedTransport,
  selectedTransportIndex,
  setSelectedStayIndex,
  setSelectedTransportIndex,
  visible,
}: BookingModalProps) {
  const { colors } = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.bookingModalOverlay, { backgroundColor: colors.overlay }]}>
        <View
          style={[
            styles.bookingModalCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <ScrollView contentContainerStyle={styles.bookingModalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.bookingModalHeader}>
              <View style={styles.bookingModalHeaderText}>
                <Text style={[styles.bookingModalKicker, { color: colors.accent }]}>Secure checkout</Text>
                <Text style={[styles.bookingModalTitle, { color: colors.textPrimary }]}>
                  {bookingStage === "success"
                    ? "Тестовото плащане е потвърдено"
                    : latestPlan?.plan.title || "Потвърди плащането"}
                </Text>
                <Text style={[styles.bookingModalSubtitle, { color: colors.textSecondary }]}>
                  {bookingStage === "processing"
                    ? "Подготвяме Stripe test checkout и provider handoff-а."
                    : bookingStage === "success"
                      ? "Плащането е отчетено. Ако има външен доставчик, следва provider потвърждение."
                      : "Избери транспорт и stay, плати тестово през Stripe и продължи към доставчика при нужда."}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.bookingCloseButton, { backgroundColor: colors.inputBackground }]}
                onPress={onClose}
                disabled={bookingProcessing}
                activeOpacity={0.9}
              >
                <MaterialIcons name="close" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {bookingStage === "processing" ? (
              <ProcessingView
                bookingForm={bookingForm}
                bookingProgress={bookingProgress}
                bookingProgressLabel={bookingProgressLabel}
                estimateLabel={bookingEstimateLabel}
                destination={latestPlan?.destination}
                colors={colors}
              />
            ) : bookingStage === "success" ? (
              <SuccessView
                bookingEstimateLabel={bookingEstimateLabel}
                bookingForm={bookingForm}
                bookingReceipt={bookingReceipt}
                destination={latestPlan?.destination}
                onClose={onClose}
                colors={colors}
              />
            ) : (
              <FormView
                bookingError={bookingError}
                bookingEstimateLabel={bookingEstimateLabel}
                bookingForm={bookingForm}
                bookingPlatformFeeLabel={bookingPlatformFeeLabel}
                bookingProcessing={bookingProcessing}
                latestPlan={latestPlan}
                onConfirm={onConfirm}
                onUpdateForm={onUpdateForm}
                paymentMethods={paymentMethods}
                providerLabel={bookingProviderLabel}
                reservationStatusLabel={bookingReservationStatusLabel}
                selectedStay={selectedStay}
                selectedStayIndex={selectedStayIndex}
                selectedTransport={selectedTransport}
                selectedTransportIndex={selectedTransportIndex}
                setSelectedStayIndex={setSelectedStayIndex}
                setSelectedTransportIndex={setSelectedTransportIndex}
                subtotalLabel={bookingSubtotalLabel}
                colors={colors}
              />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ProcessingView({
  bookingForm,
  bookingProgress,
  bookingProgressLabel,
  colors,
  destination,
  estimateLabel,
}: {
  bookingForm: BookingForm;
  bookingProgress: number;
  bookingProgressLabel: string;
  colors: ThemeColors;
  destination?: string;
  estimateLabel: string;
}) {
  return (
    <View style={[styles.checkoutProcessingCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
      <View style={[styles.checkoutProcessingIcon, { backgroundColor: colors.skeleton }]}>
        <MaterialIcons
          name={getPaymentMethodIcon(bookingForm.paymentMethod) as keyof typeof MaterialIcons.glyphMap}
          size={34}
          color={colors.textPrimary}
        />
      </View>
      <Text style={[styles.checkoutProcessingTitle, { color: colors.textPrimary }]}>Обработваме плащането</Text>
      <Text style={[styles.checkoutProcessingSubtitle, { color: colors.textSecondary }]}>
        {bookingProgressLabel || "Подготвяме плащането..."}
      </Text>
      <View style={[styles.checkoutProgressTrack, { backgroundColor: colors.skeleton }]}>
        <View style={[styles.checkoutProgressFill, { width: `${Math.max(8, bookingProgress * 100)}%`, backgroundColor: colors.accent }]} />
      </View>
      <View style={[styles.checkoutProcessingSteps, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.checkoutProcessingStep, { color: colors.textSecondary }]}>1. Авторизация на плащането</Text>
        <Text style={[styles.checkoutProcessingStep, { color: colors.textSecondary }]}>2. Потвърждение на wallet / карта</Text>
        <Text style={[styles.checkoutProcessingStep, { color: colors.textSecondary }]}>3. Финализиране на резервацията</Text>
      </View>
      <View style={[styles.bookingSummaryCard, { backgroundColor: colors.warningBackground, borderColor: colors.warningBorder }]}>
        <Text style={[styles.bookingSummaryTitle, { color: colors.warningText }]}>Обобщение</Text>
        <Text style={[styles.bookingSummaryLine, { color: colors.warningText }]}>{destination || "Дестинация"}</Text>
        <Text style={[styles.bookingSummaryLine, { color: colors.warningText }]}>{estimateLabel}</Text>
        <Text style={[styles.bookingSummaryHint, { color: colors.warningText }]}>
          Сумата е изчислена само от точните live цени, които provider-ът е върнал за избраните дати и търсене.
        </Text>
      </View>
    </View>
  );
}

function SuccessView({
  bookingEstimateLabel,
  bookingForm,
  bookingReceipt,
  colors,
  destination,
  onClose,
}: {
  bookingEstimateLabel: string;
  bookingForm: BookingForm;
  bookingReceipt: BookingReceipt | null;
  colors: ThemeColors;
  destination?: string;
  onClose: () => void;
}) {
  const { language: successLanguage } = useAppLanguage();
  const successLocale = getLanguageLocale(successLanguage);

  return (
    <View style={[styles.checkoutSuccessCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
      <View style={[styles.checkoutSuccessBadge, { backgroundColor: colors.accent }]}>
        <MaterialIcons name="check" size={34} color={colors.buttonTextOnAction} />
      </View>
      <Text style={[styles.checkoutSuccessTitle, { color: colors.textPrimary }]}>Плащането мина успешно</Text>
      <Text style={[styles.checkoutSuccessSubtitle, { color: colors.textSecondary }]}>
        Stripe test плащането е готово, а ако има външен доставчик, следва provider потвърждение.
      </Text>
      <View style={[styles.checkoutReceiptCard, { backgroundColor: colors.warningBackground, borderColor: colors.warningBorder }]}>
        <Text style={[styles.checkoutReceiptKicker, { color: colors.warningText }]}>Потвърждение</Text>
        <Text style={[styles.checkoutReceiptLine, { color: colors.warningText }]}>
          Дестинация: {bookingReceipt?.destination || destination || "-"}
        </Text>
        <Text style={[styles.checkoutReceiptLine, { color: colors.warningText }]}>
          Метод: {getPaymentMethodDisplayLabel(bookingReceipt?.paymentMethod || bookingForm.paymentMethod)}
        </Text>
        <Text style={[styles.checkoutReceiptLine, { color: colors.warningText }]}>Статус: Потвърдено</Text>
        {bookingReceipt?.reservationStatusLabel ? (
          <Text style={[styles.checkoutReceiptLine, { color: colors.warningText }]}>
            Provider: {bookingReceipt.reservationStatusLabel}
          </Text>
        ) : null}
        <Text style={[styles.checkoutReceiptLine, { color: colors.warningText }]}>
          Обработено на: {bookingReceipt?.processedAtLabel || formatProcessedAt(Date.now(), successLocale)}
        </Text>
        <Text style={[styles.checkoutReceiptLine, { color: colors.warningText }]}>
          Код за оторизация: {bookingReceipt?.authorizationCode || "A47K92"}
        </Text>
        {bookingReceipt?.selectedTransportLabel ? (
          <Text style={[styles.checkoutReceiptLine, { color: colors.warningText }]}>Транспорт: {bookingReceipt.selectedTransportLabel}</Text>
        ) : null}
        {bookingReceipt?.selectedStayLabel ? (
          <Text style={[styles.checkoutReceiptLine, { color: colors.warningText }]}>Престой: {bookingReceipt.selectedStayLabel}</Text>
        ) : null}
        {bookingReceipt?.subtotalLabel ? (
          <Text style={[styles.checkoutReceiptLine, { color: colors.warningText }]}>
            Subtotal: {bookingReceipt.subtotalLabel}
          </Text>
        ) : null}
        {bookingReceipt?.serviceFeeLabel ? (
          <Text style={[styles.checkoutReceiptLine, { color: colors.warningText }]}>
            TravelApp fee: {bookingReceipt.serviceFeeLabel}
          </Text>
        ) : null}
        <Text style={[styles.checkoutReceiptTotal, { color: colors.warningText }]}>
          Обща сума: {bookingReceipt?.totalLabel || bookingEstimateLabel}
        </Text>
        <Text style={[styles.checkoutReceiptRef, { color: colors.warningText }]}>
          Референция: {formatCheckoutReference(bookingReceipt?.paymentIntentId || "test-payment")}
        </Text>
      </View>
      <TouchableOpacity style={[styles.bookingPayButton, { backgroundColor: colors.hero }]} onPress={onClose} activeOpacity={0.9}>
        <MaterialIcons name="done-all" size={18} color={colors.buttonTextOnAction} />
        <Text style={[styles.bookingPayButtonText, { color: colors.buttonTextOnAction }]}>Затвори</Text>
      </TouchableOpacity>
    </View>
  );
}

function FormView({
  bookingError,
  bookingEstimateLabel,
  bookingForm,
  bookingPlatformFeeLabel,
  bookingProcessing,
  colors,
  latestPlan,
  onConfirm,
  onUpdateForm,
  paymentMethods,
  providerLabel,
  reservationStatusLabel,
  selectedStay,
  selectedStayIndex,
  selectedTransport,
  selectedTransportIndex,
  setSelectedStayIndex,
  setSelectedTransportIndex,
  subtotalLabel,
}: {
  bookingError: string;
  bookingEstimateLabel: string;
  bookingForm: BookingForm;
  bookingPlatformFeeLabel: string;
  bookingProcessing: boolean;
  colors: ThemeColors;
  latestPlan: NonNullable<StoredHomePlan>;
  onConfirm: () => void;
  onUpdateForm: (updater: (current: BookingForm) => BookingForm) => void;
  paymentMethods: string[];
  providerLabel: string;
  reservationStatusLabel: string;
  selectedStay: PlannerStayOption | null;
  selectedStayIndex: number | null;
  selectedTransport: PlannerTransportOption | null;
  selectedTransportIndex: number | null;
  setSelectedStayIndex: (index: number | null) => void;
  setSelectedTransportIndex: (index: number | null) => void;
  subtotalLabel: string;
}) {
  const hasVisiblePrice = (value?: string) => !!value?.match(/\d/);
  const bookableTransportOptions = latestPlan.plan.transportOptions
    .map((option, index) => ({ index, option }))
    .filter(({ option }) => hasVisiblePrice(option.price));
  const bookableStayOptions = latestPlan.plan.stayOptions
    .map((stay, index) => ({ index, stay }))
    .filter(({ stay }) => hasVisiblePrice(stay.pricePerNight));

  return (
    <>
      <View style={styles.bookingSection}>
        <View style={styles.bookingSectionHeader}>
          <Text style={[styles.bookingSectionTitle, { color: colors.textPrimary }]}>Транспорт</Text>
          <TouchableOpacity
            style={[
              styles.bookingSkipChip,
              { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
              selectedTransportIndex === null && { backgroundColor: colors.hero, borderColor: colors.hero },
            ]}
            onPress={() => setSelectedTransportIndex(null)}
            activeOpacity={0.9}
          >
            <Text
              style={[
                styles.bookingSkipChipText,
                { color: colors.textPrimary },
                selectedTransportIndex === null && { color: colors.buttonTextOnAction },
              ]}
            >
              Без билет
            </Text>
          </TouchableOpacity>
        </View>
        {bookableTransportOptions.length === 0 ? (
          <Text style={[styles.bookingOptionNote, { color: colors.textMuted }]}>
            Все още няма transport опции с точна цена за in-app checkout. Отвори provider линка от плана.
          </Text>
        ) : null}
        {bookableTransportOptions.map(({ index: originalIndex, option }) => {
          const isSelected = selectedTransportIndex === originalIndex;
          return (
            <TouchableOpacity
              key={`${option.provider}-${originalIndex}`}
              style={[
                styles.bookingOptionCard,
                { backgroundColor: colors.card, borderColor: colors.border },
                isSelected && { borderColor: colors.accent, backgroundColor: colors.inputBackground },
              ]}
              onPress={() => setSelectedTransportIndex(originalIndex)}
              activeOpacity={0.9}
            >
              <View style={styles.bookingOptionTopRow}>
                <Text style={[styles.bookingOptionTitle, { color: colors.textPrimary }]}>{option.mode}</Text>
                <Text style={[styles.bookingOptionPrice, { color: colors.accent }]}>{option.price}</Text>
              </View>
              <Text style={[styles.bookingOptionMeta, { color: colors.textSecondary }]}>{option.provider}</Text>
              <Text style={[styles.bookingOptionMeta, { color: colors.textSecondary }]}>{option.route}</Text>
              <Text style={[styles.bookingOptionNote, { color: colors.textMuted }]}>
                Точна цена за това търсене
              </Text>
              <Text style={[styles.bookingOptionNote, { color: colors.textMuted }]}>{option.note}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.bookingSection}>
        <View style={styles.bookingSectionHeader}>
          <Text style={[styles.bookingSectionTitle, { color: colors.textPrimary }]}>Място за престой</Text>
          <TouchableOpacity
            style={[
              styles.bookingSkipChip,
              { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
              selectedStayIndex === null && { backgroundColor: colors.hero, borderColor: colors.hero },
            ]}
            onPress={() => setSelectedStayIndex(null)}
            activeOpacity={0.9}
          >
            <Text
              style={[
                styles.bookingSkipChipText,
                { color: colors.textPrimary },
                selectedStayIndex === null && { color: colors.buttonTextOnAction },
              ]}
            >
              Без хотел
            </Text>
          </TouchableOpacity>
        </View>
        {bookableStayOptions.length === 0 ? (
          <Text style={[styles.bookingOptionNote, { color: colors.textMuted }]}>
            Все още няма stay опции с точна цена за in-app checkout. Отвори provider линка от плана.
          </Text>
        ) : null}
        {bookableStayOptions.map(({ index: originalIndex, stay }) => {
          const isSelected = selectedStayIndex === originalIndex;
          return (
            <TouchableOpacity
              key={`${stay.name}-${originalIndex}`}
              style={[
                styles.bookingOptionCard,
                { backgroundColor: colors.card, borderColor: colors.border },
                isSelected && { borderColor: colors.accent, backgroundColor: colors.inputBackground },
              ]}
              onPress={() => setSelectedStayIndex(originalIndex)}
              activeOpacity={0.9}
            >
              <View style={styles.bookingOptionTopRow}>
                <Text style={[styles.bookingOptionTitle, { color: colors.textPrimary }]}>{stay.name}</Text>
                <Text style={[styles.bookingOptionPrice, { color: colors.accent }]}>{stay.pricePerNight}</Text>
              </View>
              <Text style={[styles.bookingOptionMeta, { color: colors.textSecondary }]}>{stay.type} • {stay.area}</Text>
              <Text style={[styles.bookingOptionNote, { color: colors.textMuted }]}>
                Точен total за избраните дати
              </Text>
              <Text style={[styles.bookingOptionNote, { color: colors.textMuted }]}>{stay.note}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.bookingSection}>
        <Text style={[styles.bookingSectionTitle, { color: colors.textPrimary }]}>Данни за резервацията</Text>
        <TextInput
          style={[styles.bookingInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
          placeholder="Име за резервацията"
          placeholderTextColor={colors.textMuted}
          value={bookingForm.contactName}
          onChangeText={(value) => onUpdateForm((c) => ({ ...c, contactName: value }))}
        />
        <TextInput
          style={[styles.bookingInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
          placeholder="Email за потвърждение"
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          value={bookingForm.contactEmail}
          onChangeText={(value) => onUpdateForm((c) => ({ ...c, contactEmail: value }))}
        />
        <TextInput
          style={[styles.bookingInput, styles.bookingNoteInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
          placeholder="Бележка по желание"
          placeholderTextColor={colors.textMuted}
          value={bookingForm.note}
          onChangeText={(value) => onUpdateForm((c) => ({ ...c, note: value }))}
          multiline
        />
      </View>

      <View style={styles.bookingSection}>
        <Text style={[styles.bookingSectionTitle, { color: colors.textPrimary }]}>Метод на плащане</Text>
        <View style={styles.paymentMethodsRow}>
          {paymentMethods.map((method) => {
            const isSelected = bookingForm.paymentMethod === method;
            return (
              <TouchableOpacity
                key={method}
                style={[
                  styles.paymentMethodChip,
                  { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder },
                  isSelected && { backgroundColor: colors.accent, borderColor: colors.accent },
                ]}
                onPress={() => onUpdateForm((c) => ({ ...c, paymentMethod: method }))}
                activeOpacity={0.9}
              >
                <Text
                  style={[
                    styles.paymentMethodChipText,
                    { color: colors.textPrimary },
                    isSelected && { color: colors.buttonTextOnAction },
                  ]}
                >
                  {method}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={[styles.bookingSummaryCard, { backgroundColor: colors.warningBackground, borderColor: colors.warningBorder }]}>
        <Text style={[styles.bookingSummaryTitle, { color: colors.warningText }]}>Обобщение</Text>
        <Text style={[styles.bookingSummaryLine, { color: colors.warningText }]}>
          {latestPlan?.destination || "Дестинация"} • {latestPlan?.days || "Пътуване"}
        </Text>
        <Text style={[styles.bookingSummaryLine, { color: colors.warningText }]}>
          {latestPlan?.travelers || "Пътници"} • {latestPlan?.timing || "Период"}
        </Text>
        {selectedTransport ? (
          <Text style={[styles.bookingSummaryLine, { color: colors.warningText }]}>
            Транспорт: {selectedTransport.mode} • {selectedTransport.price}
          </Text>
        ) : null}
        {selectedStay ? (
          <Text style={[styles.bookingSummaryLine, { color: colors.warningText }]}>
            Престой: {selectedStay.name} • {selectedStay.pricePerNight}
          </Text>
        ) : null}
        <Text style={[styles.bookingSummaryLine, { color: colors.warningText }]}>
          Subtotal: {subtotalLabel}
        </Text>
        <Text style={[styles.bookingSummaryLine, { color: colors.warningText }]}>
          TravelApp fee (4%): {bookingPlatformFeeLabel}
        </Text>
        <Text style={[styles.bookingSummaryLine, { color: colors.warningText }]}>
          Provider: {providerLabel}
        </Text>
        <Text style={[styles.bookingSummaryTotal, { color: colors.warningText }]}>{bookingEstimateLabel}</Text>
        <Text style={[styles.bookingSummaryHint, { color: colors.warningText }]}>
          {reservationStatusLabel}
        </Text>
      </View>

      {bookingError ? <Text style={[styles.bookingErrorText, { color: colors.errorText }]}>{bookingError}</Text> : null}

      <TouchableOpacity
        style={[styles.bookingPayButton, { backgroundColor: colors.hero }, bookingProcessing && styles.disabledButton]}
        onPress={onConfirm}
        disabled={bookingProcessing}
        activeOpacity={0.9}
      >
        <MaterialIcons name="lock" size={18} color={colors.buttonTextOnAction} />
        <Text style={[styles.bookingPayButtonText, { color: colors.buttonTextOnAction }]}>
          {bookingProcessing ? "Обработваме..." : "Плати тестово и продължи"}
        </Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  bookingModalOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: Spacing.lg,
  },
  bookingModalCard: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    maxHeight: "92%",
    borderRadius: Radius["3xl"],
    padding: Spacing.lg,
    borderWidth: 1,
  },
  bookingModalContent: {
    paddingBottom: Spacing.xs,
  },
  bookingModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  bookingModalHeaderText: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  bookingModalKicker: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  bookingModalTitle: {
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.sm,
  },
  bookingModalSubtitle: {
    ...TypeScale.bodyMd,
  },
  bookingCloseButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  bookingSection: {
    marginBottom: Spacing.lg,
  },
  bookingSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  bookingSectionTitle: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
  bookingSkipChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
  },
  bookingSkipChipText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  bookingOptionCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  bookingOptionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.xs,
  },
  bookingOptionTitle: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    flex: 1,
    paddingRight: Spacing.sm,
  },
  bookingOptionPrice: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  bookingOptionMeta: {
    ...TypeScale.bodySm,
    marginBottom: Spacing.xs,
  },
  bookingOptionNote: {
    ...TypeScale.bodySm,
  },
  bookingInput: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...TypeScale.bodyMd,
    marginBottom: Spacing.sm,
  },
  bookingNoteInput: {
    minHeight: 86,
    textAlignVertical: "top",
  },
  paymentMethodsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  paymentMethodChip: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
  },
  paymentMethodChipText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
  },
  bookingSummaryCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  bookingSummaryTitle: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.sm,
  },
  bookingSummaryLine: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  bookingSummaryTotal: {
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  bookingSummaryHint: {
    ...TypeScale.labelMd,
  },
  bookingErrorText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  bookingPayButton: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  bookingPayButtonText: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  disabledButton: {
    opacity: 0.55,
  },
  checkoutProcessingCard: {
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    padding: Spacing.xl,
  },
  checkoutProcessingIcon: {
    width: 72,
    height: 72,
    borderRadius: Radius["2xl"],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    alignSelf: "center",
  },
  checkoutProcessingTitle: {
    ...TypeScale.headingMd,
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  checkoutProcessingSubtitle: {
    ...TypeScale.bodyMd,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  checkoutProgressTrack: {
    height: Spacing.md,
    borderRadius: Radius.full,
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  checkoutProgressFill: {
    height: "100%",
    borderRadius: Radius.full,
  },
  checkoutProcessingSteps: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  checkoutProcessingStep: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  checkoutSuccessCard: {
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: "center",
  },
  checkoutSuccessBadge: {
    width: 74,
    height: 74,
    borderRadius: Radius["2xl"],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  checkoutSuccessTitle: {
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  checkoutSuccessSubtitle: {
    ...TypeScale.bodyMd,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  checkoutReceiptCard: {
    width: "100%",
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  checkoutReceiptKicker: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  checkoutReceiptLine: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  checkoutReceiptTotal: {
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  checkoutReceiptRef: {
    ...TypeScale.labelMd,
  },
});
