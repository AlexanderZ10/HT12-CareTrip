import { HttpsError, onCall } from "firebase-functions/v2/https";
import Stripe from "stripe";

type PaymentIntentPayload = {
  amountCents?: number;
  currency?: string;
  description?: string;
  destination?: string;
  paymentMethod?: string;
  userId?: string;
};

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function sanitizeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStripeWalletType(value: string) {
  const normalizedValue = value.toLowerCase();

  if (normalizedValue.includes("apple")) {
    return "apple_pay";
  }

  if (normalizedValue.includes("google")) {
    return "google_pay";
  }

  return "card";
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

export const createTestPaymentIntent = onCall(
  { region: "us-central1" },
  async (request) => {
    const data = (request.data ?? {}) as PaymentIntentPayload;
    const amountCents = sanitizeNumber(data.amountCents);
    const currency = sanitizeString(data.currency, "eur").toLowerCase();

    if (amountCents <= 0) {
      throw new HttpsError("invalid-argument", "amountCents must be a positive integer.");
    }

    const walletType = toStripeWalletType(sanitizeString(data.paymentMethod));
    const stripe = getStripeClient();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amountCents),
      automatic_payment_methods: { enabled: true },
      capture_method: "automatic",
      currency,
      description: sanitizeString(data.description, "TravelApp test payment"),
      metadata: {
        destination: sanitizeString(data.destination),
        paymentMethod: sanitizeString(data.paymentMethod),
        paymentMode: "school_project_test",
        userId: sanitizeString(data.userId),
        walletType,
      },
    });

    return {
      clientSecret: sanitizeString(paymentIntent.client_secret),
      mode: "stripe_test",
      paymentIntentId: sanitizeString(paymentIntent.id),
      provider: "stripe",
      status: sanitizeString(paymentIntent.status, "requires_payment_method"),
    };
  }
);
