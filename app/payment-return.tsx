import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth } from "../firebase";
import { buildBookingOrder, saveBookingForUser } from "../utils/bookings";
import {
  clearPendingStripeCheckout,
  readPendingStripeCheckout,
} from "../utils/pending-stripe-checkout";
import { verifyTestCheckoutSession } from "../utils/travel-offers";

type ReturnStage = "processing" | "success" | "cancelled" | "error";

type ReceiptState = {
  destination: string;
  paymentIntentId: string;
  paymentMethod: string;
  processedAtLabel: string;
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

export default function PaymentReturnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ checkout?: string | string[]; session_id?: string | string[] }>();
  const [stage, setStage] = useState<ReturnStage>("processing");
  const [message, setMessage] = useState("Потвърждаваме Stripe checkout и запазваме резервацията.");
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const checkoutState = useMemo(() => {
    const checkoutValue = params.checkout;
    const sessionIdValue = params.session_id;

    return {
      checkout:
        typeof checkoutValue === "string"
          ? checkoutValue
          : Array.isArray(checkoutValue)
            ? checkoutValue[0] ?? ""
            : "",
      sessionId:
        typeof sessionIdValue === "string"
          ? sessionIdValue
          : Array.isArray(sessionIdValue)
            ? sessionIdValue[0] ?? ""
            : "",
    };
  }, [params.checkout, params.session_id]);

  useEffect(() => {
    let active = true;

    if (checkoutState.checkout === "cancel") {
      clearPendingStripeCheckout();
      setStage("cancelled");
      setMessage("Stripe checkout беше отказан. Няма записана резервация.");
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
        setMessage("Трябва да си логнат, за да завършим резервацията след Stripe checkout.");
        return;
      }

      if (checkoutState.checkout !== "success" || !checkoutState.sessionId) {
        setStage("error");
        setMessage("Stripe checkout не върна валиден session ID.");
        return;
      }

      const pendingCheckout = readPendingStripeCheckout();

      if (!pendingCheckout) {
        setStage("error");
        setMessage("Липсват запазените booking данни. Върни се в Home и опитай отново.");
        return;
      }

      try {
        const verification = await verifyTestCheckoutSession({
          sessionId: checkoutState.sessionId,
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
          destination: pendingCheckout.destination,
          paymentIntentId: verification.paymentIntentId,
          paymentMethod: pendingCheckout.paymentMethod,
          processedAtLabel: formatProcessedAt(Date.now()),
          totalLabel: pendingCheckout.totalLabel,
        });
        setStage("success");
        setMessage("Stripe test плащането е потвърдено и резервацията е записана в Saved.");
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
  }, [checkoutState.checkout, checkoutState.sessionId]);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <View style={styles.card}>
        {stage === "processing" ? (
          <>
            <ActivityIndicator size="large" color="#5C8C1F" />
            <Text style={styles.title}>Завършваме Stripe checkout</Text>
            <Text style={styles.text}>{message}</Text>
          </>
        ) : null}

        {stage === "success" ? (
          <>
            <Text style={styles.title}>Плащането е потвърдено</Text>
            <Text style={styles.text}>{message}</Text>
            {receipt ? (
              <View style={styles.receiptCard}>
                <Text style={styles.receiptTitle}>Stripe Test Receipt</Text>
                <Text style={styles.receiptLine}>Дестинация: {receipt.destination}</Text>
                <Text style={styles.receiptLine}>Метод: {receipt.paymentMethod}</Text>
                <Text style={styles.receiptLine}>Обработено на: {receipt.processedAtLabel}</Text>
                <Text style={styles.receiptLine}>
                  Референция: {formatCheckoutReference(receipt.paymentIntentId)}
                </Text>
                <Text style={styles.receiptTotal}>Обща сума: {receipt.totalLabel}</Text>
              </View>
            ) : null}
          </>
        ) : null}

        {stage === "cancelled" ? (
          <>
            <Text style={styles.title}>Checkout е отказан</Text>
            <Text style={styles.text}>{message}</Text>
          </>
        ) : null}

        {stage === "error" ? (
          <>
            <Text style={styles.title}>Проблем при връщане от Stripe</Text>
            <Text style={styles.text}>{message}</Text>
          </>
        ) : null}

        {stage !== "processing" ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.replace("/home")}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Обратно към Home</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: "#EAF3DE",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    alignItems: "center",
    backgroundColor: "#FAFCF5",
    borderColor: "#DDE8C7",
    borderRadius: 24,
    borderWidth: 1,
    maxWidth: 520,
    padding: 24,
    width: "100%",
  },
  title: {
    color: "#29440F",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 10,
    marginTop: 14,
    textAlign: "center",
  },
  text: {
    color: "#5A6E41",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  receiptCard: {
    alignSelf: "stretch",
    backgroundColor: "#FFF6E2",
    borderColor: "#F2CB88",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 20,
    padding: 18,
  },
  receiptTitle: {
    color: "#9A5F07",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  receiptLine: {
    color: "#6B4A16",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 6,
  },
  receiptTotal: {
    color: "#553711",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 10,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#5C8C1F",
    borderRadius: 16,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 14,
    width: "100%",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
