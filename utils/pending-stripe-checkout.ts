import { type PlannerStayOption, type PlannerTransportOption } from "./home-travel-planner";

const PENDING_STRIPE_CHECKOUT_KEY = "travelapp_pending_stripe_checkout";
let inMemoryPendingStripeCheckout: PendingStripeCheckout | null = null;

export type PendingStripeCheckout = {
  budget: string;
  contactEmail: string;
  contactName: string;
  createdAtMs: number;
  days: string;
  destination: string;
  note: string;
  paymentMethod: string;
  platformFeeAmount: number | null;
  platformFeeLabel: string;
  providerBookingUrl: string;
  providerLabel: string;
  reservationMode: string;
  reservationStatusLabel: string;
  stay: PlannerStayOption | null;
  subtotalAmount: number | null;
  subtotalLabel: string;
  timing: string;
  title: string;
  totalAmount: number | null;
  totalLabel: string;
  transport: PlannerTransportOption | null;
  travelers: string;
};

function canUseSessionStorage() {
  return typeof window !== "undefined" && !!window.sessionStorage;
}

export function savePendingStripeCheckout(payload: PendingStripeCheckout) {
  inMemoryPendingStripeCheckout = payload;

  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.setItem(PENDING_STRIPE_CHECKOUT_KEY, JSON.stringify(payload));
}

export function readPendingStripeCheckout() {
  if (!canUseSessionStorage()) {
    return inMemoryPendingStripeCheckout;
  }

  const rawValue = window.sessionStorage.getItem(PENDING_STRIPE_CHECKOUT_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as PendingStripeCheckout;
    inMemoryPendingStripeCheckout = parsedValue;
    return parsedValue;
  } catch {
    return inMemoryPendingStripeCheckout;
  }
}

export function clearPendingStripeCheckout() {
  inMemoryPendingStripeCheckout = null;

  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.removeItem(PENDING_STRIPE_CHECKOUT_KEY);
}
