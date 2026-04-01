import { MaterialIcons } from "@expo/vector-icons";
import React from "react";
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { FontWeight, Radius, Spacing, TypeScale } from "../../../constants/design-system";
import type { StoredHomePlan } from "../../../utils/home-chat-storage";
import type {
  PlannerStayOption,
  PlannerTransportOption,
} from "../../../utils/home-travel-planner";
import { formatCheckoutReference, getPaymentMethodDisplayLabel, getPaymentMethodIcon } from "../helpers";
import { formatProcessedAt } from "../../../utils/formatting";
import type { BookingCheckoutStage, BookingReceipt } from "../types";

type BookingForm = {
  contactEmail: string;
  contactName: string;
  note: string;
  paymentMethod: string;
};

type BookingModalProps = {
  bookingError: string;
  bookingEstimateLabel: string;
  bookingForm: BookingForm;
  bookingProcessing: boolean;
  bookingProgressLabel: string;
  bookingProgress: number;
  bookingReceipt: BookingReceipt | null;
  bookingStage: BookingCheckoutStage;
  paymentMethods: string[];
  colors: {
    border: string;
    card: string;
    modalOverlay: string;
  };
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
  bookingProcessing,
  bookingProgress,
  bookingProgressLabel,
  bookingReceipt,
  bookingStage,
  paymentMethods,
  colors,
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.bookingModalOverlay, { backgroundColor: colors.modalOverlay }]}>
        <View
          style={[
            styles.bookingModalCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <ScrollView contentContainerStyle={styles.bookingModalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.bookingModalHeader}>
              <View style={styles.bookingModalHeaderText}>
                <Text style={styles.bookingModalKicker}>Secure checkout</Text>
                <Text style={styles.bookingModalTitle}>
                  {bookingStage === "success"
                    ? "Потвърдено плащане"
                    : latestPlan?.plan.title || "Потвърди резервацията"}
                </Text>
                <Text style={styles.bookingModalSubtitle}>
                  {bookingStage === "processing"
                    ? "Подготвяме плащането и потвърждението на резервацията."
                    : bookingStage === "success"
                      ? "Сумата е обработена успешно и резервацията е потвърдена."
                      : "Избери транспорт, място за престой и потвърди плащането директно от приложението."}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.bookingCloseButton}
                onPress={onClose}
                disabled={bookingProcessing}
                activeOpacity={0.9}
              >
                <MaterialIcons name="close" size={18} color="#1A1A1A" />
              </TouchableOpacity>
            </View>

            {bookingStage === "processing" ? (
              <ProcessingView
                bookingForm={bookingForm}
                bookingProgress={bookingProgress}
                bookingProgressLabel={bookingProgressLabel}
                estimateLabel={bookingEstimateLabel}
                destination={latestPlan?.destination}
              />
            ) : bookingStage === "success" ? (
              <SuccessView
                bookingEstimateLabel={bookingEstimateLabel}
                bookingForm={bookingForm}
                bookingReceipt={bookingReceipt}
                destination={latestPlan?.destination}
                onClose={onClose}
              />
            ) : (
              <FormView
                bookingError={bookingError}
                bookingEstimateLabel={bookingEstimateLabel}
                bookingForm={bookingForm}
                bookingProcessing={bookingProcessing}
                latestPlan={latestPlan}
                onConfirm={onConfirm}
                onUpdateForm={onUpdateForm}
                paymentMethods={paymentMethods}
                selectedStay={selectedStay}
                selectedStayIndex={selectedStayIndex}
                selectedTransport={selectedTransport}
                selectedTransportIndex={selectedTransportIndex}
                setSelectedStayIndex={setSelectedStayIndex}
                setSelectedTransportIndex={setSelectedTransportIndex}
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
  destination,
  estimateLabel,
}: {
  bookingForm: BookingForm;
  bookingProgress: number;
  bookingProgressLabel: string;
  destination?: string;
  estimateLabel: string;
}) {
  return (
    <View style={styles.checkoutProcessingCard}>
      <View style={styles.checkoutProcessingIcon}>
        <MaterialIcons
          name={getPaymentMethodIcon(bookingForm.paymentMethod) as keyof typeof MaterialIcons.glyphMap}
          size={34}
          color="#1A1A1A"
        />
      </View>
      <Text style={styles.checkoutProcessingTitle}>Обработваме плащането</Text>
      <Text style={styles.checkoutProcessingSubtitle}>
        {bookingProgressLabel || "Подготвяме плащането..."}
      </Text>
      <View style={styles.checkoutProgressTrack}>
        <View style={[styles.checkoutProgressFill, { width: `${Math.max(8, bookingProgress * 100)}%` }]} />
      </View>
      <View style={styles.checkoutProcessingSteps}>
        <Text style={styles.checkoutProcessingStep}>1. Авторизация на плащането</Text>
        <Text style={styles.checkoutProcessingStep}>2. Потвърждение на wallet / карта</Text>
        <Text style={styles.checkoutProcessingStep}>3. Финализиране на резервацията</Text>
      </View>
      <View style={styles.bookingSummaryCard}>
        <Text style={styles.bookingSummaryTitle}>Обобщение</Text>
        <Text style={styles.bookingSummaryLine}>{destination || "Дестинация"}</Text>
        <Text style={styles.bookingSummaryLine}>{estimateLabel}</Text>
        <Text style={styles.bookingSummaryHint}>
          Сумата е изчислена според избрания транспорт и мястото за престой.
        </Text>
      </View>
    </View>
  );
}

function SuccessView({
  bookingEstimateLabel,
  bookingForm,
  bookingReceipt,
  destination,
  onClose,
}: {
  bookingEstimateLabel: string;
  bookingForm: BookingForm;
  bookingReceipt: BookingReceipt | null;
  destination?: string;
  onClose: () => void;
}) {
  return (
    <View style={styles.checkoutSuccessCard}>
      <View style={styles.checkoutSuccessBadge}>
        <MaterialIcons name="check" size={34} color="#FFFFFF" />
      </View>
      <Text style={styles.checkoutSuccessTitle}>Плащането мина успешно</Text>
      <Text style={styles.checkoutSuccessSubtitle}>
        Резервацията е потвърдена и детайлите са готови за преглед.
      </Text>
      <View style={styles.checkoutReceiptCard}>
        <Text style={styles.checkoutReceiptKicker}>Потвърждение</Text>
        <Text style={styles.checkoutReceiptLine}>
          Дестинация: {bookingReceipt?.destination || destination || "-"}
        </Text>
        <Text style={styles.checkoutReceiptLine}>
          Метод: {getPaymentMethodDisplayLabel(bookingReceipt?.paymentMethod || bookingForm.paymentMethod)}
        </Text>
        <Text style={styles.checkoutReceiptLine}>Статус: Потвърдено</Text>
        <Text style={styles.checkoutReceiptLine}>
          Обработено на: {bookingReceipt?.processedAtLabel || formatProcessedAt(Date.now())}
        </Text>
        <Text style={styles.checkoutReceiptLine}>
          Код за оторизация: {bookingReceipt?.authorizationCode || "A47K92"}
        </Text>
        {bookingReceipt?.selectedTransportLabel ? (
          <Text style={styles.checkoutReceiptLine}>Транспорт: {bookingReceipt.selectedTransportLabel}</Text>
        ) : null}
        {bookingReceipt?.selectedStayLabel ? (
          <Text style={styles.checkoutReceiptLine}>Престой: {bookingReceipt.selectedStayLabel}</Text>
        ) : null}
        <Text style={styles.checkoutReceiptTotal}>
          Обща сума: {bookingReceipt?.totalLabel || bookingEstimateLabel}
        </Text>
        <Text style={styles.checkoutReceiptRef}>
          Референция: {formatCheckoutReference(bookingReceipt?.paymentIntentId || "test-payment")}
        </Text>
      </View>
      <TouchableOpacity style={styles.bookingPayButton} onPress={onClose} activeOpacity={0.9}>
        <MaterialIcons name="done-all" size={18} color="#FFFFFF" />
        <Text style={styles.bookingPayButtonText}>Затвори</Text>
      </TouchableOpacity>
    </View>
  );
}

function FormView({
  bookingError,
  bookingEstimateLabel,
  bookingForm,
  bookingProcessing,
  latestPlan,
  onConfirm,
  onUpdateForm,
  paymentMethods,
  selectedStay,
  selectedStayIndex,
  selectedTransport,
  selectedTransportIndex,
  setSelectedStayIndex,
  setSelectedTransportIndex,
}: {
  bookingError: string;
  bookingEstimateLabel: string;
  bookingForm: BookingForm;
  bookingProcessing: boolean;
  latestPlan: NonNullable<StoredHomePlan>;
  onConfirm: () => void;
  onUpdateForm: (updater: (current: BookingForm) => BookingForm) => void;
  paymentMethods: string[];
  selectedStay: PlannerStayOption | null;
  selectedStayIndex: number | null;
  selectedTransport: PlannerTransportOption | null;
  selectedTransportIndex: number | null;
  setSelectedStayIndex: (index: number | null) => void;
  setSelectedTransportIndex: (index: number | null) => void;
}) {
  return (
    <>
      <View style={styles.bookingSection}>
        <View style={styles.bookingSectionHeader}>
          <Text style={styles.bookingSectionTitle}>Транспорт</Text>
          <TouchableOpacity
            style={[styles.bookingSkipChip, selectedTransportIndex === null && styles.bookingSkipChipSelected]}
            onPress={() => setSelectedTransportIndex(null)}
            activeOpacity={0.9}
          >
            <Text
              style={[
                styles.bookingSkipChipText,
                selectedTransportIndex === null && styles.bookingSkipChipTextSelected,
              ]}
            >
              Без билет
            </Text>
          </TouchableOpacity>
        </View>
        {latestPlan.plan.transportOptions.map((option, index) => {
          const isSelected = selectedTransportIndex === index;
          return (
            <TouchableOpacity
              key={`${option.provider}-${index}`}
              style={[styles.bookingOptionCard, isSelected && styles.bookingOptionCardSelected]}
              onPress={() => setSelectedTransportIndex(index)}
              activeOpacity={0.9}
            >
              <View style={styles.bookingOptionTopRow}>
                <Text style={styles.bookingOptionTitle}>{option.mode}</Text>
                <Text style={styles.bookingOptionPrice}>{option.price}</Text>
              </View>
              <Text style={styles.bookingOptionMeta}>{option.provider}</Text>
              <Text style={styles.bookingOptionMeta}>{option.route}</Text>
              <Text style={styles.bookingOptionNote}>{option.note}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.bookingSection}>
        <View style={styles.bookingSectionHeader}>
          <Text style={styles.bookingSectionTitle}>Място за престой</Text>
          <TouchableOpacity
            style={[styles.bookingSkipChip, selectedStayIndex === null && styles.bookingSkipChipSelected]}
            onPress={() => setSelectedStayIndex(null)}
            activeOpacity={0.9}
          >
            <Text
              style={[
                styles.bookingSkipChipText,
                selectedStayIndex === null && styles.bookingSkipChipTextSelected,
              ]}
            >
              Без хотел
            </Text>
          </TouchableOpacity>
        </View>
        {latestPlan.plan.stayOptions.map((stay, index) => {
          const isSelected = selectedStayIndex === index;
          return (
            <TouchableOpacity
              key={`${stay.name}-${index}`}
              style={[styles.bookingOptionCard, isSelected && styles.bookingOptionCardSelected]}
              onPress={() => setSelectedStayIndex(index)}
              activeOpacity={0.9}
            >
              <View style={styles.bookingOptionTopRow}>
                <Text style={styles.bookingOptionTitle}>{stay.name}</Text>
                <Text style={styles.bookingOptionPrice}>{stay.pricePerNight}</Text>
              </View>
              <Text style={styles.bookingOptionMeta}>{stay.type} • {stay.area}</Text>
              <Text style={styles.bookingOptionNote}>{stay.note}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.bookingSection}>
        <Text style={styles.bookingSectionTitle}>Данни за резервацията</Text>
        <TextInput
          style={styles.bookingInput}
          placeholder="Име за резервацията"
          placeholderTextColor="#9CA3AF"
          value={bookingForm.contactName}
          onChangeText={(value) => onUpdateForm((c) => ({ ...c, contactName: value }))}
        />
        <TextInput
          style={styles.bookingInput}
          placeholder="Email за потвърждение"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          autoCapitalize="none"
          value={bookingForm.contactEmail}
          onChangeText={(value) => onUpdateForm((c) => ({ ...c, contactEmail: value }))}
        />
        <TextInput
          style={[styles.bookingInput, styles.bookingNoteInput]}
          placeholder="Бележка по желание"
          placeholderTextColor="#9CA3AF"
          value={bookingForm.note}
          onChangeText={(value) => onUpdateForm((c) => ({ ...c, note: value }))}
          multiline
        />
      </View>

      <View style={styles.bookingSection}>
        <Text style={styles.bookingSectionTitle}>Метод на плащане</Text>
        <View style={styles.paymentMethodsRow}>
          {paymentMethods.map((method) => {
            const isSelected = bookingForm.paymentMethod === method;
            return (
              <TouchableOpacity
                key={method}
                style={[styles.paymentMethodChip, isSelected && styles.paymentMethodChipSelected]}
                onPress={() => onUpdateForm((c) => ({ ...c, paymentMethod: method }))}
                activeOpacity={0.9}
              >
                <Text
                  style={[
                    styles.paymentMethodChipText,
                    isSelected && styles.paymentMethodChipTextSelected,
                  ]}
                >
                  {method}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.bookingSummaryCard}>
        <Text style={styles.bookingSummaryTitle}>Обобщение</Text>
        <Text style={styles.bookingSummaryLine}>
          {latestPlan?.destination || "Дестинация"} • {latestPlan?.days || "Пътуване"}
        </Text>
        <Text style={styles.bookingSummaryLine}>
          {latestPlan?.travelers || "Пътници"} • {latestPlan?.timing || "Период"}
        </Text>
        {selectedTransport ? (
          <Text style={styles.bookingSummaryLine}>
            Транспорт: {selectedTransport.mode} • {selectedTransport.price}
          </Text>
        ) : null}
        {selectedStay ? (
          <Text style={styles.bookingSummaryLine}>
            Престой: {selectedStay.name} • {selectedStay.pricePerNight}
          </Text>
        ) : null}
        <Text style={styles.bookingSummaryTotal}>{bookingEstimateLabel}</Text>
        <Text style={styles.bookingSummaryHint}>
          Сумата е изчислена спрямо избрания транспорт и мястото за престой.
        </Text>
      </View>

      {bookingError ? <Text style={styles.bookingErrorText}>{bookingError}</Text> : null}

      <TouchableOpacity
        style={[styles.bookingPayButton, bookingProcessing && styles.disabledButton]}
        onPress={onConfirm}
        disabled={bookingProcessing}
        activeOpacity={0.9}
      >
        <MaterialIcons name="lock" size={18} color="#FFFFFF" />
        <Text style={styles.bookingPayButtonText}>
          {bookingProcessing ? "Обработваме..." : "Плати и потвърди"}
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
    color: "#2D6A4F",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  bookingModalTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.sm,
  },
  bookingModalSubtitle: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
  },
  bookingCloseButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: "#F5F5F5",
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
    color: "#1A1A1A",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
  bookingSkipChip: {
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  bookingSkipChipSelected: {
    backgroundColor: "#1A1A1A",
    borderColor: "#1A1A1A",
  },
  bookingSkipChipText: {
    color: "#1A1A1A",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  bookingSkipChipTextSelected: {
    color: "#FFFFFF",
  },
  bookingOptionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  bookingOptionCardSelected: {
    borderColor: "#2D6A4F",
    backgroundColor: "#F5F5F5",
  },
  bookingOptionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.xs,
  },
  bookingOptionTitle: {
    color: "#1A1A1A",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    flex: 1,
    paddingRight: Spacing.sm,
  },
  bookingOptionPrice: {
    color: "#92400E",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  bookingOptionMeta: {
    color: "#6B7280",
    ...TypeScale.bodySm,
    marginBottom: Spacing.xs,
  },
  bookingOptionNote: {
    color: "#9CA3AF",
    ...TypeScale.bodySm,
  },
  bookingInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: "#1A1A1A",
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
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  paymentMethodChipSelected: {
    backgroundColor: "#2D6A4F",
    borderColor: "#2D6A4F",
  },
  paymentMethodChipText: {
    color: "#1A1A1A",
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
  },
  paymentMethodChipTextSelected: {
    color: "#FFFFFF",
  },
  bookingSummaryCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "#FCD34D",
    marginBottom: Spacing.lg,
  },
  bookingSummaryTitle: {
    color: "#92400E",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.sm,
  },
  bookingSummaryLine: {
    color: "#92400E",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  bookingSummaryTotal: {
    color: "#78350F",
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  bookingSummaryHint: {
    color: "#B45309",
    ...TypeScale.labelMd,
  },
  bookingErrorText: {
    color: "#DC3545",
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  bookingPayButton: {
    backgroundColor: "#1A1A1A",
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  bookingPayButtonText: {
    color: "#FFFFFF",
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    marginLeft: Spacing.sm,
  },
  disabledButton: {
    opacity: 0.55,
  },
  checkoutProcessingCard: {
    backgroundColor: "#F8F8F8",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: Spacing.xl,
  },
  checkoutProcessingIcon: {
    width: 72,
    height: 72,
    borderRadius: Radius["2xl"],
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    alignSelf: "center",
  },
  checkoutProcessingTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingMd,
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  checkoutProcessingSubtitle: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  checkoutProgressTrack: {
    height: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
    marginBottom: Spacing.lg,
  },
  checkoutProgressFill: {
    height: "100%",
    borderRadius: Radius.full,
    backgroundColor: "#2D6A4F",
  },
  checkoutProcessingSteps: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  checkoutProcessingStep: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  checkoutSuccessCard: {
    backgroundColor: "#F8F8F8",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    borderColor: "#E8E8E8",
    padding: Spacing.xl,
    alignItems: "center",
  },
  checkoutSuccessBadge: {
    width: 74,
    height: 74,
    borderRadius: Radius["2xl"],
    backgroundColor: "#2D6A4F",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  checkoutSuccessTitle: {
    color: "#1A1A1A",
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  checkoutSuccessSubtitle: {
    color: "#6B7280",
    ...TypeScale.bodyMd,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  checkoutReceiptCard: {
    width: "100%",
    backgroundColor: "#FFFBEB",
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "#FCD34D",
    marginBottom: Spacing.lg,
  },
  checkoutReceiptKicker: {
    color: "#92400E",
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  checkoutReceiptLine: {
    color: "#78350F",
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  checkoutReceiptTotal: {
    color: "#78350F",
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  checkoutReceiptRef: {
    color: "#B45309",
    ...TypeScale.labelMd,
  },
});
