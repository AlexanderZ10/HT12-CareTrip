import { httpsCallable, httpsCallableFromURL } from "firebase/functions";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { functions } from "../firebase";
import { callAI, getAIApiKey } from "./ai";
import { sanitizeString } from "./sanitize";
import { GEMINI_MODEL, type DiscoverProfile } from "./trip-recommendations";

export type LiveTravelOffer = {
  bookingUrl: string;
  mode: string;
  note: string;
  priceAmount: number | null;
  priceCurrency: string;
  provider: string;
  route: string;
  sourceLabel: string;
  durationMinutes?: number | null;
};

export type LiveStayOffer = {
  area: string;
  bookingUrl: string;
  imageUrl: string;
  name: string;
  note: string;
  priceAmount: number | null;
  priceCurrency: string;
  ratingLabel: string;
  sourceLabel: string;
  type: string;
};

export type LiveTravelOffersResponse = {
  notes: string[];
  searchContext: {
    departureDate: string;
    nights: number;
    returnDate: string;
    windowLabel: string;
  };
  stayOptions: LiveStayOffer[];
  transportOptions: LiveTravelOffer[];
};

export type SearchTravelOffersInput = {
  budget: string;
  days: string;
  destination: string;
  profile: DiscoverProfile;
  timing: string;
  transportPreference: string;
  travelers: string;
};

export type CreateTestPaymentIntentInput = {
  amountCents: number;
  currency: string;
  description: string;
  destination: string;
  paymentMethod: string;
  userId: string;
};

export type TestPaymentIntentResponse = {
  clientSecret: string;
  mode: "mock" | "stripe_test";
  paymentIntentId: string;
  provider: "stripe";
  status: string;
};

export type CreateTestCheckoutSessionInput = {
  amountCents: number;
  cancelUrl: string;
  contactEmail: string;
  contactName: string;
  currency: string;
  description: string;
  destination: string;
  paymentMethod: string;
  successUrl: string;
  userId: string;
};

export type TestCheckoutSessionResponse = {
  checkoutUrl: string;
  mode: "stripe_test";
  provider: "stripe";
  sessionId: string;
  status: string;
};

export type VerifyTestCheckoutSessionInput = {
  sessionId: string;
};

export type TestCheckoutVerificationResponse = {
  mode: "stripe_test";
  paid: boolean;
  paymentIntentId: string;
  provider: "stripe";
  sessionStatus: string;
  status: string;
};

type GeminiFallbackOfferPayload = {
  notes?: string[];
  stayOptions?: Partial<LiveStayOffer>[];
  transportOptions?: Partial<LiveTravelOffer>[];
};

function sanitizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

function isPrivateDevelopmentHost(hostname: string) {
  return (
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

function isLocalWebRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location?.hostname ?? "";
  return hostname === "localhost" || hostname === "127.0.0.1" || isPrivateDevelopmentHost(hostname);
}

function shouldUseLocalFunctionsEmulator() {
  const forcedMode = process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_MODE?.trim().toLowerCase();
  const explicitEmulatorHost = normalizeEmulatorHost(
    process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST ?? ""
  );
  const isNativeRuntime = Platform.OS !== "web";

  if (forcedMode === "production") {
    return false;
  }

  if (isNativeRuntime) {
    return forcedMode === "emulator" && !!(explicitEmulatorHost || resolveFunctionsEmulatorHost());
  }

  if (forcedMode === "emulator") {
    return !!(explicitEmulatorHost || resolveFunctionsEmulatorHost());
  }

  return isLocalWebRuntime();
}

function shouldUseFunctionsBackend() {
  const forcedMode = process.env.EXPO_PUBLIC_TRAVEL_OFFERS_MODE?.trim().toLowerCase();

  if (forcedMode === "functions") {
    return true;
  }

  if (forcedMode === "fallback") {
    return false;
  }

  return !isLocalWebRuntime();
}

function shouldUseFunctionsForPayments() {
  const forcedMode = process.env.EXPO_PUBLIC_TEST_PAYMENTS_MODE?.trim().toLowerCase();

  if (forcedMode === "mock" || forcedMode === "fallback") {
    return false;
  }

  return true;
}

function normalizeEmulatorHost(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  return trimmedValue
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .trim();
}

function resolveExpoHostCandidate(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeEmulatorHost(value);
}

function resolveFunctionsEmulatorHost() {
  const envHost = normalizeEmulatorHost(
    process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST ?? ""
  );

  if (envHost) {
    return envHost;
  }

  if (typeof window !== "undefined") {
    const webHost = normalizeEmulatorHost(window.location?.hostname ?? "");

    if (webHost) {
      return webHost;
    }
  }

  const constantsRecord = Constants as unknown as Record<string, unknown>;
  const expoConfig = constantsRecord.expoConfig as Record<string, unknown> | undefined;
  const expoGoConfig = constantsRecord.expoGoConfig as Record<string, unknown> | undefined;
  const manifest = constantsRecord.manifest as Record<string, unknown> | undefined;
  const manifest2 = constantsRecord.manifest2 as Record<string, unknown> | undefined;
  const manifest2Extra =
    manifest2?.extra && typeof manifest2.extra === "object"
      ? (manifest2.extra as Record<string, unknown>)
      : undefined;
  const expoClient =
    manifest2Extra?.expoClient && typeof manifest2Extra.expoClient === "object"
      ? (manifest2Extra.expoClient as Record<string, unknown>)
      : undefined;

  const candidateHosts = [
    resolveExpoHostCandidate(expoConfig?.hostUri),
    resolveExpoHostCandidate(expoGoConfig?.debuggerHost),
    resolveExpoHostCandidate(manifest?.debuggerHost),
    resolveExpoHostCandidate(expoClient?.hostUri),
  ];

  const matchedHost = candidateHosts.find(Boolean);

  return matchedHost || "127.0.0.1";
}

function resolveFunctionsEmulatorOrigin() {
  const port = sanitizeString(
    process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT,
    "5001"
  );

  return `http://${resolveFunctionsEmulatorHost()}:${port}`;
}

function createEmulatorCallable<Input, Output>(name: string) {
  return httpsCallableFromURL<Input, Output>(
    functions,
    `${resolveFunctionsEmulatorOrigin()}/travelapp-f7ff4/us-central1/${name}`
  );
}

function createCallable<Input, Output>(name: string) {
  if (shouldUseLocalFunctionsEmulator()) {
    return createEmulatorCallable<Input, Output>(name);
  }

  return httpsCallable<Input, Output>(functions, name);
}

function shouldRetryWithEmulator(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const errorCode =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? ((error as { code: string }).code ?? "")
      : "";

  return (
    message.includes("unauthenticated") ||
    message.includes("functions/unauthenticated") ||
    message.includes("functions/internal") ||
    errorCode === "unauthenticated" ||
    errorCode === "functions/unauthenticated" ||
    errorCode === "internal" ||
    errorCode === "functions/internal"
  );
}

function parseCheckoutSessionResponse(data: Record<string, unknown>) {
  return {
    checkoutUrl: sanitizeString(data.checkoutUrl),
    mode: "stripe_test",
    provider: "stripe",
    sessionId: sanitizeString(data.sessionId),
    status: sanitizeString(data.status, "open"),
  } satisfies TestCheckoutSessionResponse;
}

function parseCheckoutVerificationResponse(data: Record<string, unknown>) {
  return {
    mode: "stripe_test",
    paid: data.paid === true,
    paymentIntentId: sanitizeString(data.paymentIntentId),
    provider: "stripe",
    sessionStatus: sanitizeString(data.sessionStatus, "open"),
    status: sanitizeString(data.status, "unpaid"),
  } satisfies TestCheckoutVerificationResponse;
}

const GEMINI_FALLBACK_SCHEMA = {
  type: "object",
  properties: {
    notes: {
      type: "array",
      items: { type: "string" },
      maxItems: 4,
    },
    transportOptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bookingUrl: { type: "string" },
          durationMinutes: { type: "number" },
          mode: { type: "string" },
          note: { type: "string" },
          priceAmount: { type: "number" },
          priceCurrency: { type: "string" },
          provider: { type: "string" },
          route: { type: "string" },
          sourceLabel: { type: "string" },
        },
        required: [
          "bookingUrl",
          "durationMinutes",
          "mode",
          "note",
          "priceAmount",
          "priceCurrency",
          "provider",
          "route",
          "sourceLabel",
        ],
      },
      minItems: 2,
      maxItems: 4,
    },
    stayOptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: { type: "string" },
          bookingUrl: { type: "string" },
          imageUrl: { type: "string" },
          name: { type: "string" },
          note: { type: "string" },
          priceAmount: { type: "number" },
          priceCurrency: { type: "string" },
          ratingLabel: { type: "string" },
          sourceLabel: { type: "string" },
          type: { type: "string" },
        },
        required: [
          "area",
          "bookingUrl",
          "imageUrl",
          "name",
          "note",
          "priceAmount",
          "priceCurrency",
          "ratingLabel",
          "sourceLabel",
          "type",
        ],
      },
      minItems: 2,
      maxItems: 4,
    },
  },
  required: ["notes", "transportOptions", "stayOptions"],
} as const;

function sanitizeTravelOffer(value: unknown): LiveTravelOffer | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawValue = value as Record<string, unknown>;

  return {
    bookingUrl: sanitizeString(rawValue.bookingUrl),
    durationMinutes: sanitizeNumber(rawValue.durationMinutes),
    mode: sanitizeString(rawValue.mode, "transport"),
    note: sanitizeString(rawValue.note),
    priceAmount: sanitizeNumber(rawValue.priceAmount),
    priceCurrency: sanitizeString(rawValue.priceCurrency, "EUR"),
    provider: sanitizeString(rawValue.provider, "Travel provider"),
    route: sanitizeString(rawValue.route, "Маршрутът се уточнява"),
    sourceLabel: sanitizeString(rawValue.sourceLabel, "Provider"),
  };
}

function sanitizeStayOffer(value: unknown): LiveStayOffer | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawValue = value as Record<string, unknown>;

  return {
    area: sanitizeString(rawValue.area, "Централна зона"),
    bookingUrl: sanitizeString(rawValue.bookingUrl),
    imageUrl: sanitizeString(rawValue.imageUrl),
    name: sanitizeString(rawValue.name, "Stay option"),
    note: sanitizeString(rawValue.note),
    priceAmount: sanitizeNumber(rawValue.priceAmount),
    priceCurrency: sanitizeString(rawValue.priceCurrency, "EUR"),
    ratingLabel: sanitizeString(rawValue.ratingLabel),
    sourceLabel: sanitizeString(rawValue.sourceLabel, "Stay provider"),
    type: sanitizeString(rawValue.type, "Настаняване"),
  };
}

function extractCount(value: string, fallback: number) {
  const match = value.match(/\d+/);

  if (!match) {
    return fallback;
  }

  const parsedValue = Number(match[0]);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function resolveSummerStart(referenceDate: Date) {
  const currentYear = referenceDate.getFullYear();
  const summerStart = new Date(currentYear, 5, 20);

  if (summerStart <= referenceDate) {
    return new Date(currentYear + 1, 5, 20);
  }

  return summerStart;
}

export function resolveSearchWindow(timing: string, days: string) {
  const today = new Date();
  const normalizedTiming = timing.toLowerCase();
  const dayCount = Math.max(extractCount(days, 3), 1);
  const nightCount = Math.max(dayCount - 1, 1);
  let departureDate = new Date(today);

  if (normalizedTiming.includes("уикенд")) {
    const weekday = departureDate.getDay();
    const daysUntilFriday = (5 - weekday + 7) % 7 || 7;
    departureDate.setDate(departureDate.getDate() + daysUntilFriday);
  } else if (normalizedTiming.includes("2-4")) {
    departureDate.setDate(departureDate.getDate() + 21);
  } else if (normalizedTiming.includes("лято")) {
    departureDate = resolveSummerStart(today);
  } else {
    departureDate.setDate(departureDate.getDate() + 35);
  }

  const returnDate = new Date(departureDate);
  returnDate.setDate(returnDate.getDate() + nightCount);

  return {
    departureDate: toIsoDate(departureDate),
    nights: nightCount,
    returnDate: toIsoDate(returnDate),
    windowLabel: `${toIsoDate(departureDate)} → ${toIsoDate(returnDate)}`,
  };
}

function buildFallbackGroundingPrompt(
  input: SearchTravelOffersInput,
  searchWindow: ReturnType<typeof resolveSearchWindow>
) {
  const interests = input.profile.interests.selectedOptions.join(", ") || "не са посочени";
  const assistance =
    input.profile.assistance.selectedOptions.join(", ") || "няма специални нужди";

  return [
    "You are generating fallback travel offers for a local prototype when provider APIs are unavailable.",
    "Answer in Bulgarian.",
    "Use Google Search grounding for up-to-date offers when possible.",
    "Need realistic transport and stay options with concrete companies and booking URLs when available.",
    "All prices must be in EUR.",
    "Keep notes short and practical.",
    "Do not return JSON.",
    "Use these exact headings:",
    "NOTES",
    "TRANSPORT",
    "STAY",
    "",
    `Origin: ${input.profile.personalProfile.homeBase || "Sofia, Bulgaria"}`,
    `Destination: ${input.destination}`,
    `Budget: ${input.budget}`,
    `Days: ${input.days}`,
    `Travelers: ${input.travelers}`,
    `Preferred transport: ${input.transportPreference}`,
    `Timing: ${input.timing}`,
    `Date window: ${searchWindow.windowLabel}`,
    `Stay style: ${input.profile.personalProfile.stayStyle || "Смесено"}`,
    `Interests: ${interests}`,
    `Accessibility: ${assistance}`,
    `About me: ${input.profile.personalProfile.aboutMe || "Not provided"}`,
  ].join("\n");
}

function buildFallbackStructuringPrompt(groundedNotes: string) {
  return [
    "Convert the grounded travel research below into structured JSON in Bulgarian.",
    "Use only the grounded notes for factual claims.",
    "Do not invent booking URLs.",
    "Return concise options only.",
    "For transportOptions, use durationMinutes as a number. If unknown, use 0.",
    "For stayOptions, use priceAmount as a number. If unknown, use 0.",
    "For transportOptions, use priceAmount as a number. If unknown, use 0.",
    "Use EUR as priceCurrency.",
    "",
    "Grounded notes:",
    groundedNotes,
  ].join("\n");
}

async function searchTravelOffersFallback(
  input: SearchTravelOffersInput,
  searchWindow: ReturnType<typeof resolveSearchWindow>
) {
  const apiKey = getAIApiKey();

  if (!apiKey) {
    throw new Error("missing-ai-fallback-key");
  }

  const groundedNotes = await callAI({
    apiKey,
    prompt: buildFallbackGroundingPrompt(input, searchWindow),
  });

  const rawJson = await callAI({
    apiKey,
    prompt: buildFallbackStructuringPrompt(groundedNotes),
    jsonMode: true,
  });

  let payload: GeminiFallbackOfferPayload;
  try {
    payload = JSON.parse(rawJson) as GeminiFallbackOfferPayload;
  } catch {
    throw new Error("fallback-invalid-json");
  }

  return {
    notes: [
      "Fallback mode on localhost: provider backend is bypassed.",
      ...(Array.isArray(payload.notes)
        ? payload.notes.filter((item): item is string => typeof item === "string")
        : []),
    ].slice(0, 4),
    searchContext: searchWindow,
    stayOptions: Array.isArray(payload.stayOptions)
      ? payload.stayOptions
          .map((item) => sanitizeStayOffer(item))
          .filter((item): item is LiveStayOffer => !!item)
      : [],
    transportOptions: Array.isArray(payload.transportOptions)
      ? payload.transportOptions
          .map((item) => sanitizeTravelOffer(item))
          .filter((item): item is LiveTravelOffer => !!item)
      : [],
  } satisfies LiveTravelOffersResponse;
}

export async function searchTravelOffers(input: SearchTravelOffersInput) {
  const searchWindow = resolveSearchWindow(input.timing, input.days);

  if (!shouldUseFunctionsBackend()) {
    return searchTravelOffersFallback(input, searchWindow);
  }

  try {
    const callable = httpsCallable<
      {
        adults: number;
        departureDate: string;
        destinationQuery: string;
        locale: string;
        market: string;
        originQuery: string;
        returnDate: string;
        stayStyle: string;
        transportPreference: string;
      },
      LiveTravelOffersResponse
    >(functions, "searchOffers");
    const response = await callable({
      adults: extractCount(input.travelers, 1),
      departureDate: searchWindow.departureDate,
      destinationQuery: input.destination,
      locale: "bg-BG",
      market: "BG",
      originQuery: input.profile.personalProfile.homeBase || "Sofia, Bulgaria",
      returnDate: searchWindow.returnDate,
      stayStyle: input.profile.personalProfile.stayStyle || "Смесено",
      transportPreference: input.transportPreference,
    });
    const data = response.data as unknown as Record<string, unknown>;

    return {
      notes: Array.isArray(data.notes)
        ? data.notes.filter((item): item is string => typeof item === "string")
        : [],
      searchContext: {
        departureDate: sanitizeString(
          (data.searchContext as Record<string, unknown> | undefined)?.departureDate,
          searchWindow.departureDate
        ),
        nights:
          sanitizeNumber(
            (data.searchContext as Record<string, unknown> | undefined)?.nights
          ) ?? searchWindow.nights,
        returnDate: sanitizeString(
          (data.searchContext as Record<string, unknown> | undefined)?.returnDate,
          searchWindow.returnDate
        ),
        windowLabel: sanitizeString(
          (data.searchContext as Record<string, unknown> | undefined)?.windowLabel,
          searchWindow.windowLabel
        ),
      },
      stayOptions: Array.isArray(data.stayOptions)
        ? data.stayOptions
            .map((item) => sanitizeStayOffer(item))
            .filter((item): item is LiveStayOffer => !!item)
        : [],
      transportOptions: Array.isArray(data.transportOptions)
        ? data.transportOptions
            .map((item) => sanitizeTravelOffer(item))
            .filter((item): item is LiveTravelOffer => !!item)
        : [],
    } satisfies LiveTravelOffersResponse;
  } catch (error) {
    throw error;
  }
}

export async function createTestPaymentIntent(
  input: CreateTestPaymentIntentInput
) {
  if (!shouldUseFunctionsForPayments()) {
    return {
      clientSecret: `pi_local_mock_${Date.now()}_secret`,
      mode: "mock",
      paymentIntentId: `pi_local_mock_${Date.now()}`,
      provider: "stripe",
      status: "test_local_ready",
    } satisfies TestPaymentIntentResponse;
  }

  try {
    const callable = createCallable<
      CreateTestPaymentIntentInput,
      TestPaymentIntentResponse
    >("createTestPaymentIntent");
    const response = await callable(input);
    const data = response.data as unknown as Record<string, unknown>;

    return {
      clientSecret: sanitizeString(data.clientSecret),
      mode: data.mode === "stripe_test" ? "stripe_test" : "mock",
      paymentIntentId: sanitizeString(data.paymentIntentId),
      provider: "stripe",
      status: sanitizeString(data.status, "requires_payment_method"),
    } satisfies TestPaymentIntentResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (
      message.includes("functions/not-found") ||
      message.includes("functions/unavailable") ||
      message.includes("Failed to fetch") ||
      message.includes("CORS")
    ) {
      return {
        clientSecret: `pi_fallback_mock_${Date.now()}_secret`,
        mode: "mock",
        paymentIntentId: `pi_fallback_mock_${Date.now()}`,
        provider: "stripe",
        status: "test_fallback_ready",
      } satisfies TestPaymentIntentResponse;
    }

    throw error;
  }
}

export async function createTestCheckoutSession(
  input: CreateTestCheckoutSessionInput
) {
  if (!shouldUseFunctionsForPayments()) {
    throw new Error("stripe-test-mode-disabled");
  }

  try {
    const callable = createCallable<
      CreateTestCheckoutSessionInput,
      TestCheckoutSessionResponse
    >("createTestCheckoutSession");
    const response = await callable(input);
    return parseCheckoutSessionResponse(response.data as unknown as Record<string, unknown>);
  } catch (error) {
    if (!shouldRetryWithEmulator(error) || shouldUseLocalFunctionsEmulator()) {
      throw error;
    }

    const fallbackCallable = createEmulatorCallable<
      CreateTestCheckoutSessionInput,
      TestCheckoutSessionResponse
    >("createTestCheckoutSession");
    const fallbackResponse = await fallbackCallable(input);
    return parseCheckoutSessionResponse(
      fallbackResponse.data as unknown as Record<string, unknown>
    );
  }
}

export async function verifyTestCheckoutSession(
  input: VerifyTestCheckoutSessionInput
) {
  if (!shouldUseFunctionsForPayments()) {
    throw new Error("stripe-test-mode-disabled");
  }

  try {
    const callable = createCallable<
      VerifyTestCheckoutSessionInput,
      TestCheckoutVerificationResponse
    >("verifyTestCheckoutSession");
    const response = await callable(input);
    return parseCheckoutVerificationResponse(response.data as unknown as Record<string, unknown>);
  } catch (error) {
    if (!shouldRetryWithEmulator(error) || shouldUseLocalFunctionsEmulator()) {
      throw error;
    }

    const fallbackCallable = createEmulatorCallable<
      VerifyTestCheckoutSessionInput,
      TestCheckoutVerificationResponse
    >("verifyTestCheckoutSession");
    const fallbackResponse = await fallbackCallable(input);
    return parseCheckoutVerificationResponse(
      fallbackResponse.data as unknown as Record<string, unknown>
    );
  }
}
