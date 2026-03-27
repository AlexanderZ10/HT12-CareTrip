import { HttpsError, onCall } from "firebase-functions/v2/https";
import Stripe from "stripe";

type CheckoutSessionPayload = {
  amountCents?: number;
  cancelUrl?: string;
  contactEmail?: string;
  contactName?: string;
  currency?: string;
  description?: string;
  destination?: string;
  paymentMethod?: string;
  successUrl?: string;
  userId?: string;
};

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function sanitizeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sanitizeReturnUrl(value: unknown, fieldName: string) {
  const url = sanitizeString(value);

  if (!url) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }

  const isPrivateHttpDevelopmentUrl =
    /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?(\/.*)?$/i.test(url) ||
    /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?(\/.*)?$/i.test(url) ||
    /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(?::\d+)?(\/.*)?$/i.test(url);

  if (
    url.startsWith("travelapp://") ||
    url.startsWith("exp://") ||
    url.startsWith("https://") ||
    url.startsWith("http://localhost") ||
    url.startsWith("http://127.0.0.1") ||
    isPrivateHttpDevelopmentUrl
  ) {
    return url;
  }

  throw new HttpsError(
    "invalid-argument",
    `${fieldName} must be a valid app, https or local development URL.`
  );
}

function appendQueryParam(url: string, key: string, value: string) {
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${value}`;
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
      message || "Stripe checkout получи невалидни данни."
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

export const createTestCheckoutSession = onCall(
  { invoker: "public", region: "us-central1", secrets: ["STRIPE_SECRET_KEY"] },
  async (request) => {
    const data = (request.data ?? {}) as CheckoutSessionPayload;
    const amountCents = sanitizeNumber(data.amountCents);
    const currency = sanitizeString(data.currency, "eur").toLowerCase();

    if (amountCents <= 0) {
      throw new HttpsError("invalid-argument", "amountCents must be a positive integer.");
    }

    try {
      const stripe = getStripeClient();
      const session = await stripe.checkout.sessions.create({
        billing_address_collection: "auto",
        cancel_url: sanitizeReturnUrl(data.cancelUrl, "cancelUrl"),
        customer_email: sanitizeString(data.contactEmail) || undefined,
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                description: sanitizeString(data.destination) || undefined,
                name: sanitizeString(data.description, "TravelApp reservation"),
              },
              unit_amount: Math.round(amountCents),
            },
            quantity: 1,
          },
        ],
        metadata: {
          contactEmail: sanitizeString(data.contactEmail),
          contactName: sanitizeString(data.contactName),
          destination: sanitizeString(data.destination),
          paymentMethod: sanitizeString(data.paymentMethod),
          paymentMode: "stripe_checkout_test",
          userId: sanitizeString(data.userId),
        },
        mode: "payment",
        payment_method_types: ["card"],
        success_url: appendQueryParam(
          sanitizeReturnUrl(data.successUrl, "successUrl"),
          "session_id",
          "{CHECKOUT_SESSION_ID}"
        ),
      });

      if (!session.url) {
        throw new HttpsError("internal", "Stripe checkout session did not return a checkout URL.");
      }

      return {
        checkoutUrl: session.url,
        mode: "stripe_test",
        provider: "stripe",
        sessionId: sanitizeString(session.id),
        status: sanitizeString(session.status, "open"),
      };
    } catch (error) {
      throw mapStripeError(error, "Stripe checkout session could not be created.");
    }
  }
);
