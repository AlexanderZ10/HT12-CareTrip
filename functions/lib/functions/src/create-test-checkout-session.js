"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestCheckoutSession = void 0;
const https_1 = require("firebase-functions/v2/https");
const stripe_1 = __importDefault(require("stripe"));
function sanitizeString(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
}
function sanitizeNumber(value, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function sanitizeReturnUrl(value, fieldName) {
    const url = sanitizeString(value);
    if (!url) {
        throw new https_1.HttpsError("invalid-argument", `${fieldName} is required.`);
    }
    const isPrivateHttpDevelopmentUrl = /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?(\/.*)?$/i.test(url) ||
        /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?(\/.*)?$/i.test(url) ||
        /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(?::\d+)?(\/.*)?$/i.test(url);
    if (url.startsWith("travelapp://") ||
        url.startsWith("exp://") ||
        url.startsWith("https://") ||
        url.startsWith("http://localhost") ||
        url.startsWith("http://127.0.0.1") ||
        isPrivateHttpDevelopmentUrl) {
        return url;
    }
    throw new https_1.HttpsError("invalid-argument", `${fieldName} must be a valid app, https or local development URL.`);
}
function appendQueryParam(url, key, value) {
    return `${url}${url.includes("?") ? "&" : "?"}${key}=${value}`;
}
function mapStripeError(error, fallbackMessage) {
    if (error instanceof https_1.HttpsError) {
        return error;
    }
    const message = error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message.trim()
        : "";
    const type = error && typeof error === "object" && "type" in error && typeof error.type === "string"
        ? error.type.trim()
        : "";
    if (type === "StripeAuthenticationError" ||
        /api key|authentication|invalid api key|secret key/i.test(message)) {
        return new https_1.HttpsError("failed-precondition", "STRIPE_SECRET_KEY липсва или е невалиден във Firebase Functions.");
    }
    if (type === "StripeInvalidRequestError") {
        return new https_1.HttpsError("invalid-argument", message || "Stripe checkout получи невалидни данни.");
    }
    if (type === "StripeConnectionError" || type === "StripeAPIError") {
        return new https_1.HttpsError("unavailable", "Stripe временно не отговаря. Опитай пак след малко.");
    }
    return new https_1.HttpsError("internal", message || fallbackMessage);
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
exports.createTestCheckoutSession = (0, https_1.onCall)({ invoker: "public", region: "us-central1", secrets: ["STRIPE_SECRET_KEY"] }, async (request) => {
    const data = (request.data ?? {});
    const amountCents = sanitizeNumber(data.amountCents);
    const requestedSubtotalCents = sanitizeNumber(data.subtotalCents, amountCents);
    const subtotalCents = requestedSubtotalCents > 0 ? requestedSubtotalCents : amountCents;
    const platformFeeCents = sanitizeNumber(data.platformFeeCents, Math.max(amountCents - subtotalCents, 0));
    const currency = sanitizeString(data.currency, "eur").toLowerCase();
    if (amountCents <= 0) {
        throw new https_1.HttpsError("invalid-argument", "amountCents must be a positive integer.");
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
                            name: sanitizeString(data.description, "TravelApp reservation subtotal"),
                        },
                        unit_amount: Math.max(Math.round(subtotalCents), 1),
                    },
                    quantity: 1,
                },
                ...(platformFeeCents > 0
                    ? [
                        {
                            price_data: {
                                currency,
                                product_data: {
                                    description: "TravelApp platform fee",
                                    name: "TravelApp service fee (4%)",
                                },
                                unit_amount: Math.round(platformFeeCents),
                            },
                            quantity: 1,
                        },
                    ]
                    : []),
            ],
            metadata: {
                contactEmail: sanitizeString(data.contactEmail),
                contactName: sanitizeString(data.contactName),
                destination: sanitizeString(data.destination),
                paymentMethod: sanitizeString(data.paymentMethod),
                paymentMode: "stripe_checkout_test",
                platformFeeCents: String(Math.max(platformFeeCents, 0)),
                providerBookingUrl: sanitizeString(data.providerBookingUrl),
                providerLabel: sanitizeString(data.providerLabel),
                reservationMode: sanitizeString(data.reservationMode),
                subtotalCents: String(Math.max(subtotalCents, 0)),
                userId: sanitizeString(data.userId),
            },
            mode: "payment",
            payment_method_types: ["card"],
            success_url: appendQueryParam(sanitizeReturnUrl(data.successUrl, "successUrl"), "session_id", "{CHECKOUT_SESSION_ID}"),
        });
        if (!session.url) {
            throw new https_1.HttpsError("internal", "Stripe checkout session did not return a checkout URL.");
        }
        return {
            checkoutUrl: session.url,
            mode: "stripe_test",
            provider: "stripe",
            sessionId: sanitizeString(session.id),
            status: sanitizeString(session.status, "open"),
        };
    }
    catch (error) {
        throw mapStripeError(error, "Stripe checkout session could not be created.");
    }
});
