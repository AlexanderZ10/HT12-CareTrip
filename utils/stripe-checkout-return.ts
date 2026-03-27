import * as Linking from "expo-linking";
import { Platform } from "react-native";

import { functions } from "../firebase";

type StripeCheckoutKind = "booking" | "expense-repayment";

const DEFAULT_PROJECT_ID = "travelapp-f7ff4";

function appendQueryParam(url: string, key: string, value: string) {
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

function getFunctionsProjectId() {
  const options =
    functions?.app?.options && typeof functions.app.options === "object"
      ? (functions.app.options as Record<string, unknown>)
      : null;
  const projectId = typeof options?.projectId === "string" ? options.projectId.trim() : "";

  return projectId || DEFAULT_PROJECT_ID;
}

function getStripeReturnBridgeUrl() {
  return `https://${getFunctionsProjectId()}.web.app/stripe-return.html`;
}

function buildBridgeRedirectUrl(params: {
  checkout: "cancel" | "success";
  kind: StripeCheckoutKind;
  targetUrl: string;
}) {
  let bridgeUrl = getStripeReturnBridgeUrl();
  bridgeUrl = appendQueryParam(bridgeUrl, "checkout", params.checkout);
  bridgeUrl = appendQueryParam(bridgeUrl, "kind", params.kind);
  bridgeUrl = appendQueryParam(bridgeUrl, "target", params.targetUrl);
  return bridgeUrl;
}

export function buildStripeCheckoutReturnUrls(kind: StripeCheckoutKind) {
  const returnTargetUrl = Linking.createURL("/payment-return");

  if (Platform.OS === "web") {
    return {
      cancelUrl: `${returnTargetUrl}?checkout=cancel&kind=${kind}`,
      returnTargetUrl,
      successUrl: `${returnTargetUrl}?checkout=success&kind=${kind}`,
    };
  }

  return {
    cancelUrl: buildBridgeRedirectUrl({
      checkout: "cancel",
      kind,
      targetUrl: returnTargetUrl,
    }),
    returnTargetUrl,
    successUrl: buildBridgeRedirectUrl({
      checkout: "success",
      kind,
      targetUrl: returnTargetUrl,
    }),
  };
}
