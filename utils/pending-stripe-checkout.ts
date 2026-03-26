import { type PlannerStayOption, type PlannerTransportOption } from "./home-travel-planner";

const PENDING_STRIPE_CHECKOUT_KEY = "travelapp_pending_stripe_checkout";

export type PendingStripeCheckout = {
  budget: string;
  contactEmail: string;
  contactName: string;
  createdAtMs: number;
  days: string;
  destination: string;
  note: string;
  paymentMethod: string;
  stay: PlannerStayOption | null;
  timing: string;
  title: string;
  totalLabel: string;
  transport: PlannerTransportOption | null;
  travelers: string;
};

function canUseSessionStorage() {
  return typeof window !== "undefined" && !!window.sessionStorage;
}

export function savePendingStripeCheckout(payload: PendingStripeCheckout) {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.setItem(PENDING_STRIPE_CHECKOUT_KEY, JSON.stringify(payload));
}

export function readPendingStripeCheckout() {
  if (!canUseSessionStorage()) {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(PENDING_STRIPE_CHECKOUT_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as PendingStripeCheckout;
  } catch {
    return null;
  }
}

export function clearPendingStripeCheckout() {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.removeItem(PENDING_STRIPE_CHECKOUT_KEY);
}
