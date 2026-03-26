import { HttpsError, onCall } from "firebase-functions/v2/https";

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

export const createTestPaymentIntent = onCall(
  { region: "us-central1" },
  async (request) => {
    const data = (request.data ?? {}) as PaymentIntentPayload;
    const amountCents = sanitizeNumber(data.amountCents);
    const currency = sanitizeString(data.currency, "eur").toLowerCase();

    if (amountCents <= 0) {
      throw new HttpsError("invalid-argument", "amountCents must be a positive integer.");
    }

    const stripeSecretKey = sanitizeString(process.env.STRIPE_SECRET_KEY);
    const walletType = toStripeWalletType(sanitizeString(data.paymentMethod));

    if (!stripeSecretKey) {
      return {
        clientSecret: `pi_mock_${Date.now()}_secret_school_project`,
        mode: "mock",
        paymentIntentId: `pi_mock_${Date.now()}`,
        provider: "stripe",
        status: `test_${walletType}_ready`,
      };
    }

    const body = new URLSearchParams();
    body.set("amount", String(Math.round(amountCents)));
    body.set("currency", currency);
    body.set("automatic_payment_methods[enabled]", "true");
    body.set("capture_method", "automatic");
    body.set("description", sanitizeString(data.description, "TravelApp test payment"));
    body.set("metadata[userId]", sanitizeString(data.userId));
    body.set("metadata[destination]", sanitizeString(data.destination));
    body.set("metadata[paymentMethod]", sanitizeString(data.paymentMethod));
    body.set("metadata[paymentMode]", "school_project_test");

    const response = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new HttpsError("internal", `Stripe create PaymentIntent failed: ${errorText}`);
    }

    const payload = (await response.json()) as {
      client_secret?: string;
      id?: string;
      status?: string;
    };

    return {
      clientSecret: sanitizeString(payload.client_secret),
      mode: "stripe_test",
      paymentIntentId: sanitizeString(payload.id),
      provider: "stripe",
      status: sanitizeString(payload.status, "requires_payment_method"),
    };
  }
);
