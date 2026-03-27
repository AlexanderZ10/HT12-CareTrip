import { HttpsError, onCall } from "firebase-functions/v2/https";
import Stripe from "stripe";

type VerifyCheckoutSessionPayload = {
  sessionId?: string;
};

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function mapStripeError(error: unknown, fallbackMessage: string) {
  if (error instanceof HttpsError) {
    return error;
  }

  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message.trim()
      : "";
  const type =
    error && typeof error === "object" && "type" in error && typeof error.type === "string"
      ? error.type.trim()
      : "";

  if (
    type === "StripeAuthenticationError" ||
    /api key|authentication|invalid api key|secret key/i.test(message)
  ) {
    return new HttpsError(
      "failed-precondition",
      "STRIPE_SECRET_KEY липсва или е невалиден във Firebase Functions."
    );
  }

  if (type === "StripeInvalidRequestError") {
    return new HttpsError(
      "invalid-argument",
      message || "Stripe checkout sessionId е невалиден."
    );
  }

  if (type === "StripeConnectionError" || type === "StripeAPIError") {
    return new HttpsError(
      "unavailable",
      "Stripe временно не отговаря. Опитай пак след малко."
    );
  }

  return new HttpsError("internal", message || fallbackMessage);
}

let stripeClient: Stripe | null = null;

function getStripeClient() {
  const stripeSecretKey = sanitizeString(process.env.STRIPE_SECRET_KEY);

  if (!stripeSecretKey) {
    throw new HttpsError(
      "failed-precondition",
      "Missing STRIPE_SECRET_KEY. Add your Stripe test secret key in Firebase Functions."
    );
  }

  if (!stripeClient) {
    stripeClient = new Stripe(stripeSecretKey);
  }

  return stripeClient;
}

export const verifyTestCheckoutSession = onCall(
  { invoker: "public", region: "us-central1", secrets: ["STRIPE_SECRET_KEY"] },
  async (request) => {
    const data = (request.data ?? {}) as VerifyCheckoutSessionPayload;
    const sessionId = sanitizeString(data.sessionId);

    if (!sessionId) {
      throw new HttpsError("invalid-argument", "sessionId is required.");
    }

    try {
      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["payment_intent"],
      });

      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : sanitizeString(session.payment_intent?.id);

      const paymentStatus = sanitizeString(session.payment_status, "unpaid");
      const sessionStatus = sanitizeString(session.status, "open");

      return {
        mode: "stripe_test",
        paid: paymentStatus === "paid" && sessionStatus === "complete",
        paymentIntentId,
        provider: "stripe",
        sessionStatus,
        status: paymentStatus,
      };
    } catch (error) {
      throw mapStripeError(error, "Stripe checkout session could not be verified.");
    }
  }
);
