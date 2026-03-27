"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeCheckoutReturnBridge = void 0;
const https_1 = require("firebase-functions/v2/https");
function sanitizeString(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function sanitizeTargetUrl(value) {
    const url = sanitizeString(value);
    if (!url) {
        throw new https_1.HttpsError("invalid-argument", "target is required.");
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
    throw new https_1.HttpsError("invalid-argument", "target must be a valid app, https or local development URL.");
}
function appendQueryParam(url, key, value) {
    return `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}
exports.stripeCheckoutReturnBridge = (0, https_1.onRequest)({ region: "us-central1" }, async (request, response) => {
    try {
        const targetUrl = sanitizeTargetUrl(request.query.target);
        const checkout = sanitizeString(request.query.checkout).toLowerCase() === "cancel" ? "cancel" : "success";
        const kind = sanitizeString(request.query.kind).toLowerCase() === "expense-repayment"
            ? "expense-repayment"
            : "booking";
        const sessionId = sanitizeString(request.query.session_id);
        let redirectUrl = appendQueryParam(targetUrl, "checkout", checkout);
        redirectUrl = appendQueryParam(redirectUrl, "kind", kind);
        if (sessionId) {
            redirectUrl = appendQueryParam(redirectUrl, "session_id", sessionId);
        }
        const escapedRedirectUrl = escapeHtml(redirectUrl);
        response.set("Cache-Control", "no-store");
        response.status(200).send(`<!doctype html>
<html lang="bg">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0;url=${escapedRedirectUrl}" />
    <title>Returning to TravelApp</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #eef8de;
        color: #28460f;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .card {
        width: min(92vw, 440px);
        padding: 24px;
        border-radius: 24px;
        background: #ffffff;
        box-shadow: 0 18px 48px rgba(40, 70, 15, 0.12);
      }
      a {
        color: #4f8f13;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Връщаме те обратно в TravelApp</h1>
      <p>Ако приложението не се отвори автоматично, натисни линка отдолу.</p>
      <p><a href="${escapedRedirectUrl}">Обратно към приложението</a></p>
    </div>
    <script>
      window.location.replace(${JSON.stringify(redirectUrl)});
    </script>
  </body>
</html>`);
    }
    catch (error) {
        const message = error instanceof https_1.HttpsError ? error.message : "Неуспешно връщане към приложението.";
        response.set("Cache-Control", "no-store");
        response.status(400).send(`<!doctype html>
<html lang="bg">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TravelApp redirect error</title>
  </head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;">
    <h1>TravelApp redirect error</h1>
    <p>${escapeHtml(message)}</p>
  </body>
</html>`);
    }
});
