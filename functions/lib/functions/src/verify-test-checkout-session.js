"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTestCheckoutSession = void 0;
const https_1 = require("firebase-functions/v2/https");
const stripe_1 = __importDefault(require("stripe"));
function sanitizeString(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
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
        return new https_1.HttpsError("invalid-argument", message || "Stripe checkout sessionId е невалиден.");
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
exports.verifyTestCheckoutSession = (0, https_1.onCall)({ region: "us-central1" }, async (request) => {
    const data = (request.data ?? {});
    const sessionId = sanitizeString(data.sessionId);
    if (!sessionId) {
        throw new https_1.HttpsError("invalid-argument", "sessionId is required.");
    }
    try {
        const stripe = getStripeClient();
        const session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ["payment_intent"],
        });
        const paymentIntentId = typeof session.payment_intent === "string"
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
    }
    catch (error) {
        throw mapStripeError(error, "Stripe checkout session could not be verified.");
    }
});
