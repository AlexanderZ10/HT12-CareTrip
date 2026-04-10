import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppTheme } from "../components/app-theme-provider";
import { FontWeight, Radius, Spacing, TypeScale, shadow } from "../constants/design-system";
import { auth } from "../firebase";
import { buildBookingOrder, saveBookingForUser } from "../utils/bookings";
import {
  clearPendingStripeExpenseCheckout,
  readPendingStripeExpenseCheckout,
} from "../utils/pending-stripe-expense-checkout";
import {
  clearPendingStripeCheckout,
  readPendingStripeCheckout,
} from "../utils/pending-stripe-checkout";
import { saveGroupExpenseRepayment } from "../utils/group-expense-repayments";
import { verifyTestCheckoutSession } from "../utils/travel-offers";

type ReturnStage = "processing" | "success" | "cancelled" | "error";

type ReceiptState = {
  kicker: string;
  lines: string[];
  paymentIntentId: string;
  targetGroupId: string | null;
  targetLabel: string;
  totalLabel: string;
};

function formatProcessedAt(value: number) {
  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatCheckoutReference(value: string) {
  const compactValue = value
    .replace(/^pi_/, "")
    .replace(/^local_/, "")
    .replace(/^fallback_/, "")
    .replace(/^mock_/, "")
    .replace(/_secret.*$/, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-10)
    .toUpperCase();

  return `BK-${compactValue || "2475A1F9"}`;
}

function resolveParam(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return "";
}

export default function PaymentReturnScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    checkout?: string | string[];
    kind?: string | string[];
    session_id?: string | string[];
  }>();
  const [stage, setStage] = useState<ReturnStage>("processing");
  const [message, setMessage] = useState("Потвърждаваме Stripe checkout и довършваме действието.");
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const [returnTargetGroupId, setReturnTargetGroupId] = useState<string | null>(null);
  const [returnTargetLabel, setReturnTargetLabel] = useState("Обратно към Home");
  const returnState = useMemo(() => {
    const kindValue = resolveParam(params.kind);

    return {
      checkout: resolveParam(params.checkout),
      kind: kindValue === "expense-repayment" ? ("expense-repayment" as const) : ("booking" as const),
      sessionId: resolveParam(params.session_id),
    };
  }, [params.checkout, params.kind, params.session_id]);

  useEffect(() => {
    let active = true;

    const resolveCancelState = () => {
      if (returnState.kind === "expense-repayment") {
        const pendingExpenseCheckout = readPendingStripeExpenseCheckout();
        const targetGroupId = pendingExpenseCheckout?.groupId ?? null;

        clearPendingStripeExpenseCheckout();
        setReceipt(null);
        setReturnTargetGroupId(targetGroupId);
        setReturnTargetLabel(targetGroupId ? "Обратно към групата" : "Обратно към Home");
        setStage("cancelled");
        setMessage("Stripe checkout беше отказан. Expense repayment-ът не беше записан.");
        return;
      }

      clearPendingStripeCheckout();
      setReceipt(null);
      setReturnTargetGroupId(null);
      setReturnTargetLabel("Обратно към Home");
      setStage("cancelled");
      setMessage("Stripe checkout беше отказан. Няма записана резервация.");
    };

    if (returnState.checkout === "cancel") {
      resolveCancelState();

      return () => {
        active = false;
      };
    }

    const unsubscribe = onAuthStateChanged(auth, async (nextUser: User | null) => {
      if (!active) {
        return;
      }

      if (!nextUser) {
        setStage("error");
        setMessage("Трябва да си логнат, за да завършим Stripe checkout-а.");
        return;
      }

      if (returnState.checkout !== "success" || !returnState.sessionId) {
        setStage("error");
        setMessage("Stripe checkout не върна валиден session ID.");
        return;
      }

      if (returnState.kind === "expense-repayment") {
        const pendingExpenseCheckout = readPendingStripeExpenseCheckout();

        if (!pendingExpenseCheckout) {
          setStage("error");
          setReturnTargetGroupId(null);
          setReturnTargetLabel("Обратно към Home");
          setMessage("Липсват запазените repayment данни. Върни се в групата и опитай отново.");
          return;
        }

        setReturnTargetGroupId(pendingExpenseCheckout.groupId);
        setReturnTargetLabel("Обратно към групата");

        if (pendingExpenseCheckout.payerUserId !== nextUser.uid) {
          setStage("error");
          setMessage("Този Stripe checkout е свързан с друг user. Влез в правилния акаунт и опитай пак.");
          return;
        }

        try {
          const verification = await verifyTestCheckoutSession({
            sessionId: returnState.sessionId,
          });

          if (!verification.paid || !verification.paymentIntentId) {
            setStage("error");
            setMessage("Stripe checkout не беше потвърден като платен.");
            return;
          }

          await saveGroupExpenseRepayment({
            amountValue: pendingExpenseCheckout.amountValue,
            collectionMode: pendingExpenseCheckout.collectionMode,
            expenseMessageId: pendingExpenseCheckout.expenseMessageId,
            expenseTitle: pendingExpenseCheckout.expenseTitle,
            groupId: pendingExpenseCheckout.groupId,
            paidById: pendingExpenseCheckout.payerUserId,
            paidByLabel: pendingExpenseCheckout.payerUserLabel,
            paidToId: pendingExpenseCheckout.paidToId,
            paidToLabel: pendingExpenseCheckout.paidToLabel,
            paymentIntentId: verification.paymentIntentId,
            paymentMethod: pendingExpenseCheckout.paymentMethod,
            sessionId: returnState.sessionId,
          });

          clearPendingStripeExpenseCheckout();

          if (!active) {
            return;
          }

          setReceipt({
            kicker: "Expense Repayment Receipt",
            lines: [
              `Група: ${pendingExpenseCheckout.groupName}`,
              `Разход: ${pendingExpenseCheckout.expenseTitle}`,
              pendingExpenseCheckout.collectionMode === "group-payment"
                ? "Тип: Equal share in-app"
                : `Към: ${pendingExpenseCheckout.paidToLabel}`,
              `Метод: ${pendingExpenseCheckout.paymentMethod}`,
              `Обработено на: ${formatProcessedAt(Date.now())}`,
            ],
            paymentIntentId: verification.paymentIntentId,
            targetGroupId: pendingExpenseCheckout.groupId,
            targetLabel: "Обратно към групата",
            totalLabel: pendingExpenseCheckout.amountLabel,
          });
          setReturnTargetGroupId(pendingExpenseCheckout.groupId);
          setReturnTargetLabel("Обратно към групата");
          setStage("success");
          setMessage(
            pendingExpenseCheckout.collectionMode === "group-payment"
              ? `Stripe test плащането е потвърдено и ${pendingExpenseCheckout.amountLabel} вече са отчетени като твоя equal share за ${pendingExpenseCheckout.expenseTitle}.`
              : `Stripe test плащането е потвърдено и ${pendingExpenseCheckout.amountLabel} вече са отчетени към ${pendingExpenseCheckout.paidToLabel}.`
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message.trim() : "";
          setStage("error");
          setMessage(
            errorMessage
              ? `Не успяхме да финализираме Stripe repayment-а. ${errorMessage}`
              : "Не успяхме да финализираме Stripe repayment-а."
          );
        }

        return;
      }

      const pendingCheckout = readPendingStripeCheckout();

      if (!pendingCheckout) {
        setStage("error");
        setReturnTargetGroupId(null);
        setReturnTargetLabel("Обратно към Home");
        setMessage("Липсват запазените booking данни. Върни се в Home и опитай отново.");
        return;
      }

      try {
        const verification = await verifyTestCheckoutSession({
          sessionId: returnState.sessionId,
        });

        if (!verification.paid || !verification.paymentIntentId) {
          setStage("error");
          setMessage("Stripe checkout не беше потвърден като платен.");
          return;
        }

        await saveBookingForUser(
          nextUser.uid,
          buildBookingOrder({
            budget: pendingCheckout.budget,
            contactEmail: pendingCheckout.contactEmail,
            contactName: pendingCheckout.contactName,
            days: pendingCheckout.days,
            destination: pendingCheckout.destination,
            note: pendingCheckout.note,
            paymentIntentId: verification.paymentIntentId,
            paymentMethod: pendingCheckout.paymentMethod,
            paymentMode: verification.mode,
            stay: pendingCheckout.stay,
            timing: pendingCheckout.timing,
            title: pendingCheckout.title,
            transport: pendingCheckout.transport,
            travelers: pendingCheckout.travelers,
          })
        );

        clearPendingStripeCheckout();

        if (!active) {
          return;
        }

        setReceipt({
          kicker: "Stripe Test Receipt",
          lines: [
            `Дестинация: ${pendingCheckout.destination}`,
            `Метод: ${pendingCheckout.paymentMethod}`,
            `Обработено на: ${formatProcessedAt(Date.now())}`,
          ],
          paymentIntentId: verification.paymentIntentId,
          targetGroupId: null,
          targetLabel: "Обратно към Home",
          totalLabel: pendingCheckout.totalLabel,
        });
        setReturnTargetGroupId(null);
        setReturnTargetLabel("Обратно към Home");
        setStage("success");
        setMessage("Stripe test payment was confirmed and the booking was added to Trips.");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message.trim() : "";
        setStage("error");
        setMessage(
          errorMessage
            ? `Не успяхме да финализираме Stripe checkout. ${errorMessage}`
            : "Не успяхме да финализираме Stripe checkout."
        );
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [returnState.checkout, returnState.kind, returnState.sessionId]);

  const handleBack = () => {
    if (returnTargetGroupId) {
      router.replace({
        params: { groupId: returnTargetGroupId },
        pathname: "/groups/[groupId]",
      });
      return;
    }

    router.replace("/home");
  };

  const buttonLabel =
    receipt?.targetLabel ?? returnTargetLabel ?? (returnState.kind === "expense-repayment" ? "Обратно към групата" : "Обратно към Home");

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.screenSoft }]} edges={["top", "bottom", "left", "right"]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {stage === "processing" ? (
          <>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.title, { color: colors.textPrimary }]}>Завършваме Stripe checkout</Text>
            <Text style={[styles.text, { color: colors.textSecondary }]}>{message}</Text>
          </>
        ) : null}

        {stage === "success" ? (
          <>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {returnState.kind === "expense-repayment"
                ? "Expense плащането е потвърдено"
                : "Плащането е потвърдено"}
            </Text>
            <Text style={[styles.text, { color: colors.textSecondary }]}>{message}</Text>
            {receipt ? (
              <View style={[styles.receiptCard, { backgroundColor: colors.warningBackground, borderColor: colors.warningBorder }]}>
                <Text style={[styles.receiptTitle, { color: colors.warningText }]}>{receipt.kicker}</Text>
                {receipt.lines.map((line) => (
                  <Text key={line} style={[styles.receiptLine, { color: colors.textSecondary }]}>
                    {line}
                  </Text>
                ))}
                <Text style={[styles.receiptLine, { color: colors.textSecondary }]}>
                  Референция: {formatCheckoutReference(receipt.paymentIntentId)}
                </Text>
                <Text style={[styles.receiptTotal, { color: colors.textPrimary }]}>Обща сума: {receipt.totalLabel}</Text>
              </View>
            ) : null}
          </>
        ) : null}

        {stage === "cancelled" ? (
          <>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Checkout е отказан</Text>
            <Text style={[styles.text, { color: colors.textSecondary }]}>{message}</Text>
          </>
        ) : null}

        {stage === "error" ? (
          <>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Проблем при връщане от Stripe</Text>
            <Text style={[styles.text, { color: colors.textSecondary }]}>{message}</Text>
          </>
        ) : null}

        {stage !== "processing" ? (
          <TouchableOpacity activeOpacity={0.9} onPress={handleBack} style={[styles.button, { backgroundColor: colors.accent }]}>
            <Text style={[styles.buttonText, { color: colors.buttonTextOnAction }]}>{buttonLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: Spacing.xl,
  },
  card: {
    alignItems: "center",
    borderRadius: Radius["2xl"],
    borderWidth: 1,
    maxWidth: 520,
    padding: Spacing["2xl"],
    width: "100%",
    ...shadow("md"),
  },
  title: {
    ...TypeScale.headingLg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
    textAlign: "center",
  },
  text: {
    ...TypeScale.bodyMd,
    textAlign: "center",
  },
  receiptCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    width: "100%",
  },
  receiptTitle: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
  },
  receiptLine: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  receiptTotal: {
    ...TypeScale.headingMd,
    fontWeight: FontWeight.extrabold,
    marginTop: Spacing.sm,
  },
  button: {
    alignItems: "center",
    borderRadius: Radius.lg,
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    width: "100%",
  },
  buttonText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
});
