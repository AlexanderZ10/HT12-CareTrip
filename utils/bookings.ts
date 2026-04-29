import { doc, getDoc, runTransaction, setDoc } from "firebase/firestore";

import { db } from "../firebase";
import { normalizeBudgetToEuro } from "./currency";
import { sanitizeString } from "./sanitize";
import {
  type PlannerStayOption,
  type PlannerTransportOption,
} from "./home-travel-planner";

export type BookingOrder = {
  bookingStatus: "confirmed" | "payment_captured";
  budget: string;
  contactEmail: string;
  contactName: string;
  createdAtMs: number;
  days: string;
  destination: string;
  id: string;
  note: string;
  paymentMethod: string;
  paymentStatus: "paid";
  paymentIntentId: string;
  paymentMode: "mock" | "stripe_test";
  paymentProvider: "stripe";
  platformFeeAmount: number | null;
  platformFeeLabel: string;
  providerBookingUrl: string;
  providerLabel: string;
  reservationMode: string;
  reservationStatusLabel: string;
  source: "home";
  stay: PlannerStayOption | null;
  subtotalAmount: number | null;
  subtotalLabel: string;
  timing: string;
  title: string;
  totalEstimate: number | null;
  totalLabel: string;
  transport: PlannerTransportOption | null;
  travelers: string;
};

function sanitizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTotalLabel(value: string) {
  return sanitizeString(value).replace(/\s+estimate$/i, "").trim();
}

function sanitizeTransportOption(value: unknown): PlannerTransportOption | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawValue = value as Record<string, unknown>;

  return {
    bookingUrl: sanitizeString(rawValue.bookingUrl),
    duration: sanitizeString(rawValue.duration),
    mode: sanitizeString(rawValue.mode),
    note: sanitizeString(rawValue.note),
    price: sanitizeString(rawValue.price),
    provider: sanitizeString(rawValue.provider),
    route: sanitizeString(rawValue.route),
    sourceLabel: sanitizeString(rawValue.sourceLabel),
  };
}

function sanitizeStayOption(value: unknown): PlannerStayOption | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawValue = value as Record<string, unknown>;

  return {
    area: sanitizeString(rawValue.area),
    bookingUrl: sanitizeString(rawValue.bookingUrl),
    directBookingUrl: sanitizeString(rawValue.directBookingUrl),
    imageUrl: sanitizeString(rawValue.imageUrl),
    name: sanitizeString(rawValue.name),
    note: sanitizeString(rawValue.note),
    pricePerNight: sanitizeString(rawValue.pricePerNight),
    providerAccommodationId: sanitizeString(rawValue.providerAccommodationId),
    providerKey: sanitizeString(rawValue.providerKey),
    providerPaymentModes: Array.isArray(rawValue.providerPaymentModes)
      ? rawValue.providerPaymentModes.filter(
          (item): item is string => typeof item === "string" && !!item.trim()
        )
      : [],
    providerProductId: sanitizeString(rawValue.providerProductId),
    ratingLabel: sanitizeString(rawValue.ratingLabel),
    reservationMode: sanitizeString(rawValue.reservationMode),
    sourceLabel: sanitizeString(rawValue.sourceLabel),
    type: sanitizeString(rawValue.type),
  };
}

function extractFirstEuroAmount(value: string) {
  const matches = value.match(/\d+(?:[.,]\d+)?/g);

  if (!matches) {
    return null;
  }

  const amounts = matches
    .map((match) => Number(match.replace(",", ".")))
    .filter((amount) => Number.isFinite(amount));

  if (amounts.length === 0) {
    return null;
  }

  return amounts[0] ?? null;
}

function extractCount(value: string, fallback: number) {
  const match = value.match(/\d+/);

  if (!match) {
    return fallback;
  }

  const parsedValue = Number(match[0]);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

export function getBookingEstimate(params: {
  days: string;
  stay: PlannerStayOption | null;
  transport: PlannerTransportOption | null;
  travelers: string;
}) {
  const transportAmount = extractFirstEuroAmount(params.transport?.price ?? "");
  const stayAmount = extractFirstEuroAmount(params.stay?.pricePerNight ?? "");

  let total = 0;
  let hasAnyAmount = false;

  if (transportAmount !== null) {
    total += transportAmount;
    hasAnyAmount = true;
  }

  if (stayAmount !== null) {
    total += stayAmount;
    hasAnyAmount = true;
  }

  if (!hasAnyAmount) {
    return {
      totalEstimate: null,
      totalLabel: "Цена при запитване",
    };
  }

  const roundedTotal = Math.round(total);

  return {
    totalEstimate: roundedTotal,
    totalLabel: `${roundedTotal} EUR`,
  };
}

export function buildBookingOrder(params: {
  budget: string;
  contactEmail: string;
  contactName: string;
  days: string;
  destination: string;
  note: string;
  paymentMethod: string;
  paymentIntentId: string;
  paymentMode: "mock" | "stripe_test";
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
}) {
  const estimate = getBookingEstimate({
    days: params.days,
    stay: params.stay,
    transport: params.transport,
    travelers: params.travelers,
  });

  return {
    bookingStatus:
      params.providerBookingUrl || params.reservationMode === "provider_redirect"
        ? "payment_captured"
        : "confirmed",
    budget: normalizeBudgetToEuro(params.budget),
    contactEmail: params.contactEmail.trim(),
    contactName: params.contactName.trim(),
    createdAtMs: Date.now(),
    days: params.days.trim(),
    destination: params.destination.trim(),
    id: `booking-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`,
    note: params.note.trim(),
    paymentMethod: params.paymentMethod.trim(),
    paymentIntentId: params.paymentIntentId.trim(),
    paymentMode: params.paymentMode,
    paymentProvider: "stripe",
    paymentStatus: "paid",
    platformFeeAmount: params.platformFeeAmount,
    platformFeeLabel: params.platformFeeLabel.trim(),
    providerBookingUrl: sanitizeString(params.providerBookingUrl),
    providerLabel: sanitizeString(params.providerLabel),
    reservationMode: sanitizeString(params.reservationMode),
    reservationStatusLabel: sanitizeString(params.reservationStatusLabel),
    source: "home",
    stay: sanitizeStayOption(params.stay),
    subtotalAmount: params.subtotalAmount,
    subtotalLabel: params.subtotalLabel.trim(),
    timing: params.timing.trim(),
    title: params.title.trim(),
    totalEstimate:
      typeof params.totalAmount === "number" && Number.isFinite(params.totalAmount)
        ? params.totalAmount
        : estimate.totalEstimate,
    totalLabel: normalizeTotalLabel(params.totalLabel || estimate.totalLabel),
    transport: sanitizeTransportOption(params.transport),
    travelers: params.travelers.trim(),
  } satisfies BookingOrder;
}

export function parseBookingOrders(profileData: Record<string, unknown>): BookingOrder[] {
  const rawBookingOrders = Array.isArray(profileData.bookingOrders)
    ? profileData.bookingOrders
    : [];

  return rawBookingOrders
    .filter(
      (booking): booking is Record<string, unknown> => !!booking && typeof booking === "object"
    )
    .map(
      (booking, index) =>
        ({
          bookingStatus:
            sanitizeString(booking.bookingStatus) === "payment_captured"
              ? "payment_captured"
              : "confirmed",
          budget: normalizeBudgetToEuro(sanitizeString(booking.budget)),
          contactEmail: sanitizeString(booking.contactEmail),
          contactName: sanitizeString(booking.contactName),
          createdAtMs:
            typeof booking.createdAtMs === "number" ? booking.createdAtMs : Date.now() - index,
          days: sanitizeString(booking.days),
          destination: sanitizeString(booking.destination),
          id: sanitizeString(booking.id, `booking-${index}`),
          note: sanitizeString(booking.note),
          paymentMethod: sanitizeString(booking.paymentMethod, "Банкова карта"),
          paymentIntentId: sanitizeString(booking.paymentIntentId),
          paymentMode: booking.paymentMode === "stripe_test" ? "stripe_test" : "mock",
          paymentProvider: "stripe",
          paymentStatus: "paid",
          platformFeeAmount: sanitizeNumber(booking.platformFeeAmount),
          platformFeeLabel: sanitizeString(booking.platformFeeLabel),
          providerBookingUrl: sanitizeString(booking.providerBookingUrl),
          providerLabel: sanitizeString(booking.providerLabel),
          reservationMode: sanitizeString(booking.reservationMode),
          reservationStatusLabel: sanitizeString(booking.reservationStatusLabel),
          source: "home",
          stay: sanitizeStayOption(booking.stay),
          subtotalAmount: sanitizeNumber(booking.subtotalAmount),
          subtotalLabel: sanitizeString(booking.subtotalLabel),
          timing: sanitizeString(booking.timing),
          title: sanitizeString(booking.title, "Booking"),
          totalEstimate: sanitizeNumber(booking.totalEstimate),
          totalLabel: normalizeTotalLabel(
            sanitizeString(booking.totalLabel, "Цена при запитване")
          ),
          transport: sanitizeTransportOption(booking.transport),
          travelers: sanitizeString(booking.travelers),
        }) satisfies BookingOrder
    )
    .sort((left, right) => right.createdAtMs - left.createdAtMs);
}

export async function saveBookingForUser(userId: string, bookingOrder: BookingOrder) {
  const profileRef = doc(db, "profiles", userId);

  return runTransaction(db, async (transaction) => {
    const profileSnapshot = await transaction.get(profileRef);
    const profileData = profileSnapshot.exists()
      ? (profileSnapshot.data() as Record<string, unknown>)
      : {};
    const currentBookingOrders = parseBookingOrders(profileData);

    if (
      bookingOrder.paymentIntentId &&
      currentBookingOrders.some(
        (currentBookingOrder) =>
          currentBookingOrder.paymentIntentId &&
          currentBookingOrder.paymentIntentId === bookingOrder.paymentIntentId
      )
    ) {
      return currentBookingOrders;
    }

    const nextBookingOrders = [bookingOrder, ...currentBookingOrders].slice(0, 30);

    transaction.set(
      profileRef,
      {
        bookingOrders: nextBookingOrders,
        bookingOrdersUpdatedAtMs: Date.now(),
      },
      { merge: true }
    );

    return nextBookingOrders;
  });
}
