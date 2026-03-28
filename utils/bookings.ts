import { doc, getDoc, setDoc } from "firebase/firestore";

import { db } from "../firebase";
import { normalizeBudgetToEuro } from "./currency";
import {
  type PlannerStayOption,
  type PlannerTransportOption,
} from "./home-travel-planner";

export type BookingOrder = {
  bookingStatus: "confirmed";
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
  source: "home";
  stay: PlannerStayOption | null;
  timing: string;
  title: string;
  totalEstimate: number | null;
  totalLabel: string;
  transport: PlannerTransportOption | null;
  travelers: string;
};

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

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
    imageUrl: sanitizeString(rawValue.imageUrl),
    name: sanitizeString(rawValue.name),
    note: sanitizeString(rawValue.note),
    pricePerNight: sanitizeString(rawValue.pricePerNight),
    ratingLabel: sanitizeString(rawValue.ratingLabel),
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

function isPersonalCarMode(mode: string) {
  const normalizedMode = mode.toLowerCase();
  return (
    normalizedMode.includes("личен автомобил") ||
    normalizedMode.includes("собствен автомобил") ||
    normalizedMode.includes("personal car")
  );
}

export function getBookingEstimate(params: {
  days: string;
  stay: PlannerStayOption | null;
  transport: PlannerTransportOption | null;
  travelers: string;
}) {
  const travelerCount = extractCount(params.travelers, 1);
  const nightCount = extractCount(params.days, 1);
  const roomCount = Math.max(1, Math.ceil(travelerCount / 2));

  const transportAmount =
    params.transport && isPersonalCarMode(params.transport.mode)
      ? null
      : extractFirstEuroAmount(params.transport?.price ?? "");
  const stayAmount = extractFirstEuroAmount(params.stay?.pricePerNight ?? "");

  let total = 0;
  let hasAnyAmount = false;

  if (transportAmount !== null) {
    total += transportAmount * travelerCount;
    hasAnyAmount = true;
  }

  if (stayAmount !== null) {
    total += stayAmount * nightCount * roomCount;
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
  stay: PlannerStayOption | null;
  timing: string;
  title: string;
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
    bookingStatus: "confirmed",
    budget: normalizeBudgetToEuro(params.budget),
    contactEmail: params.contactEmail.trim(),
    contactName: params.contactName.trim(),
    createdAtMs: Date.now(),
    days: params.days.trim(),
    destination: params.destination.trim(),
    id: `booking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    note: params.note.trim(),
    paymentMethod: params.paymentMethod.trim(),
    paymentIntentId: params.paymentIntentId.trim(),
    paymentMode: params.paymentMode,
    paymentProvider: "stripe",
    paymentStatus: "paid",
    source: "home",
    stay: sanitizeStayOption(params.stay),
    timing: params.timing.trim(),
    title: params.title.trim(),
    totalEstimate: estimate.totalEstimate,
    totalLabel: estimate.totalLabel,
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
          bookingStatus: "confirmed",
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
          source: "home",
          stay: sanitizeStayOption(booking.stay),
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
  const profileSnapshot = await getDoc(profileRef);
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

  await setDoc(
    profileRef,
    {
      bookingOrders: nextBookingOrders,
      bookingOrdersUpdatedAtMs: Date.now(),
    },
    { merge: true }
  );

  return nextBookingOrders;
}
