"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestPaymentIntent = void 0;
const https_1 = require("firebase-functions/v2/https");
const stripe_1 = __importDefault(require("stripe"));
function sanitizeString(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
}
function sanitizeNumber(value, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function toStripeWalletType(value) {
    const normalizedValue = value.toLowerCase();
    if (normalizedValue.includes("apple")) {
        return "apple_pay";
    }
    if (normalizedValue.includes("google")) {
        return "google_pay";
    }
    return "card";
}
let stripeClient = null;
function getStripeClient() {
    const stripeSecretKey = sanitizeString(process.env.STRIPE_SECRET_KEY);
    if (!stripeSecretKey) {
        throw new https_1.HttpsError("failed-precondition", "Missing STRIPE_SECRET_KEY. Add your Stripe test secret key in Firebase Functions.");
    }
    if (!stripeClient) {
        stripeClient = new stripe_1.default(stripeSecretKey);
    }
    return stripeClient;
}
exports.createTestPaymentIntent = (0, https_1.onCall)({ region: "us-central1" }, async (request) => {
    const data = (request.data ?? {});
    const amountCents = sanitizeNumber(data.amountCents);
    const currency = sanitizeString(data.currency, "eur").toLowerCase();
    if (amountCents <= 0) {
        throw new https_1.HttpsError("invalid-argument", "amountCents must be a positive integer.");
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
});
