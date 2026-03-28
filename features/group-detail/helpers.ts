import * as Linking from "expo-linking";

import {
  type GroupChatExpense,
  type GroupChatLinkedTransport,
  type GroupChatSharedTrip,
} from "../../utils/group-chat";
import {
  type GroupExpenseRepayment,
  buildGroupExpenseRepaymentId,
} from "../../utils/group-expense-repayments";
import {
  parseStoredHomePlannerStore,
  type StoredHomePlan,
} from "../../utils/home-chat-storage";
import { type PlannerTransportOption } from "../../utils/home-travel-planner";
import { getGroupDetailErrorMessage as _getGroupDetailErrorMessage } from "../../utils/error-messages";

// Re-export shared utilities so the screen file can import from one place
export { getAvatarColor, getInitials } from "../../components/Avatar";
export { getGroupDetailErrorMessage } from "../../utils/error-messages";
export { formatMessageTime } from "../../utils/formatting";

export function getSharedTripSourceLabel(source: "discover" | "home") {
  return source === "home" ? "Home Planner" : "Discover";
}

export function normalizeTextKey(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function getUniqueTextLines(text: string, excludedValues: string[] = []) {
  const excluded = new Set(
    excludedValues.map((value) => normalizeTextKey(value)).filter(Boolean)
  );
  const seen = new Set<string>();

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const normalized = normalizeTextKey(line);

      if (!normalized || excluded.has(normalized) || seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

export function buildSharedTripDetailsPreview(sharedTrip: GroupChatSharedTrip | null) {
  if (!sharedTrip) {
    return "";
  }

  return getUniqueTextLines(sharedTrip.details, [
    sharedTrip.summary,
    sharedTrip.title,
    sharedTrip.destination,
  ])
    .slice(0, 4)
    .join("\n");
}

export function buildSharedTripDetailsText(sharedTrip: GroupChatSharedTrip | null) {
  if (!sharedTrip) {
    return "";
  }

  return getUniqueTextLines(sharedTrip.details, [
    sharedTrip.summary,
    sharedTrip.title,
    sharedTrip.destination,
  ]).join("\n");
}

export function extractPlannerPriceAmount(value: string) {
  const match = value.match(/\d+(?:[.,]\d+)?/);

  if (!match) {
    return null;
  }

  const parsedValue = Number(match[0].replace(",", "."));
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

export function slugifyLinkedTransportKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function buildLinkedExpenseLookupKey(sourceKey: string, itemKey: string) {
  return `${sourceKey}::${itemKey}`;
}

export function buildLinkedTransportTitle(option: PlannerTransportOption, index: number) {
  const normalizedMode = option.mode.trim();
  const normalizedProvider = option.provider.trim();

  if (normalizedMode && normalizedProvider) {
    return `${normalizedMode} • ${normalizedProvider}`;
  }

  if (normalizedProvider) {
    return normalizedProvider;
  }

  if (normalizedMode) {
    return normalizedMode;
  }

  return `Ticket option ${index + 1}`;
}

export function buildLinkedTransportItemKey(option: PlannerTransportOption, index: number) {
  const stableLabel = [
    option.provider,
    option.route,
    option.price,
    option.sourceLabel,
    option.mode,
  ]
    .map((item) => (item ?? "").trim())
    .filter(Boolean)
    .join("-");

  return `transport-${index + 1}-${slugifyLinkedTransportKey(stableLabel || `option-${index + 1}`)}`;
}

export function buildLinkedTransportsFromStoredPlan(plan: StoredHomePlan | null): GroupChatLinkedTransport[] {
  if (!plan) {
    return [];
  }

  return plan.plan.transportOptions
    .map((option, index) => {
      const amountValue = extractPlannerPriceAmount(option.price);

      if (!amountValue || !(option.bookingUrl ?? "").trim()) {
        return null;
      }

      return {
        amountLabel: option.price.trim(),
        amountValue,
        bookingUrl: (option.bookingUrl ?? "").trim(),
        duration: option.duration.trim(),
        itemKey: buildLinkedTransportItemKey(option, index),
        provider: option.provider.trim(),
        route: option.route.trim(),
        sourceLabel: (option.sourceLabel ?? "").trim(),
        title: buildLinkedTransportTitle(option, index),
      } satisfies GroupChatLinkedTransport;
    })
    .filter((option): option is GroupChatLinkedTransport => !!option)
    .slice(0, 4);
}

export function buildStoredHomePlansBySourceKey(profileData: Record<string, unknown>) {
  const plannerStore = parseStoredHomePlannerStore(profileData, "Planner sync");

  return plannerStore.chats.reduce<Record<string, StoredHomePlan>>((summary, chat) => {
    const latestPlan = chat.state.latestPlan;

    if (latestPlan?.sourceKey) {
      summary[latestPlan.sourceKey] = latestPlan;
    }

    return summary;
  }, {});
}

export function formatExpenseAmount(value: number) {
  const normalizedValue = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
  return `${normalizedValue} EUR`;
}

export function getExpensePerPerson(expense: GroupChatExpense) {
  return expense.participantCount > 0 ? expense.amountValue / expense.participantCount : expense.amountValue;
}

export function parseCheckoutReturnState(url: string) {
  const parsedUrl = Linking.parse(url);
  const rawCheckoutValue = parsedUrl.queryParams?.checkout;
  const rawSessionIdValue = parsedUrl.queryParams?.session_id;

  return {
    checkout:
      typeof rawCheckoutValue === "string"
        ? rawCheckoutValue
        : Array.isArray(rawCheckoutValue)
          ? rawCheckoutValue[0] ?? ""
          : "",
    sessionId:
      typeof rawSessionIdValue === "string"
        ? rawSessionIdValue
        : Array.isArray(rawSessionIdValue)
          ? rawSessionIdValue[0] ?? ""
          : "",
  };
}

export function getStripeExpenseCheckoutErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const errorCode =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? ((error as { code: string }).code ?? "")
      : "";
  const errorDetails =
    error &&
    typeof error === "object" &&
    "details" in error &&
    typeof (error as { details?: unknown }).details === "string"
      ? (((error as { details: string }).details ?? "") as string)
      : "";

  if (message.includes("functions/not-found") || errorCode === "functions/not-found") {
    return "Липсват Stripe checkout Firebase функциите. Deploy-ни backend-а и опитай пак.";
  }

  if (message.includes("stripe-test-mode-disabled")) {
    return "Stripe test mode е изключен. Задай EXPO_PUBLIC_TEST_PAYMENTS_MODE=functions и рестартирай app-а.";
  }

  if (
    message.includes("Failed to fetch") ||
    message.includes("Network request failed") ||
    message.includes("functions/unavailable") ||
    errorCode === "functions/unavailable"
  ) {
    return "Stripe Functions emulator не е стартиран. Пусни `npm run payments:emulator` и опитай пак.";
  }

  if (message.includes("stripe-checkout-cancelled")) {
    return "Плащането беше прекъснато преди потвърждение.";
  }

  if (message.includes("stripe-checkout-incomplete") || message.includes("stripe-session-not-paid")) {
    return "Stripe Checkout не върна потвърдено test плащане. Опитай отново.";
  }

  if (
    message.includes("functions/failed-precondition") ||
    errorCode === "functions/failed-precondition" ||
    message.includes("STRIPE_SECRET_KEY") ||
    errorDetails.includes("STRIPE_SECRET_KEY")
  ) {
    return "Липсва Stripe test secret key във Firebase Functions. Добави STRIPE_SECRET_KEY и deploy-ни функциите.";
  }

  if (
    message.includes("functions/internal") ||
    errorCode === "functions/internal" ||
    message === "internal"
  ) {
    return (
      errorDetails ||
      "Stripe backend върна internal грешка. Ако си локално, пусни `npm run payments:emulator`. Ако си на production, трябва deploy на Firebase Functions."
    );
  }

  if (
    errorCode === "permission-denied" ||
    errorCode === "functions/permission-denied" ||
    message.includes("permission-denied") ||
    /missing or insufficient permissions/i.test(message) ||
    /missing or insufficient permissions/i.test(errorDetails)
  ) {
    return "Firestore rules блокират repayment записа за този expense. Обнових правилата, така че опитай пак.";
  }

  return _getGroupDetailErrorMessage(error, "write");
}

export function hasMeaningfulDescription(value: string) {
  return value.replace(/[.\s]/g, "").trim().length > 0;
}

export function buildInitialHomePlannerMessage(profileName: string) {
  return `Здравей, ${profileName}. Ще започнем с бюджета ти в евро.`;
}

export function getOutstandingExpenseAmount(
  expenseMessageId: string,
  expense: GroupChatExpense,
  payerUserId: string,
  expenseRepaymentsByKey: Record<string, GroupExpenseRepayment>
) {
  if (
    !expense.participantIds.includes(payerUserId) ||
    (expense.collectionMode !== "group-payment" && payerUserId === expense.paidById)
  ) {
    return 0;
  }

  const existingRepayment =
    expenseRepaymentsByKey[buildGroupExpenseRepaymentId(expenseMessageId, payerUserId)];
  const alreadyPaidAmount = existingRepayment?.amountValue ?? 0;
  const shareAmount = getExpensePerPerson(expense);

  return Math.max(shareAmount - alreadyPaidAmount, 0);
}

export function getExpenseRemainingCollectionAmount(
  expenseMessageId: string,
  expense: GroupChatExpense,
  expenseRepaymentsByExpenseId: Record<string, GroupExpenseRepayment[]>
) {
  const collectedAmount =
    expenseRepaymentsByExpenseId[expenseMessageId]?.reduce(
      (summary, repayment) => summary + repayment.amountValue,
      0
    ) ?? 0;
  const ownerShare = expense.participantIds.includes(expense.paidById)
    ? getExpensePerPerson(expense)
    : 0;
  const targetCollectionAmount =
    expense.collectionMode === "group-payment"
      ? expense.amountValue
      : Math.max(expense.amountValue - ownerShare, 0);

  return Math.max(targetCollectionAmount - collectedAmount, 0);
}

export function getExpenseSettledShareCount(
  expenseMessageId: string,
  expense: GroupChatExpense,
  expenseRepaymentsByExpenseId: Record<string, GroupExpenseRepayment[]>
) {
  const repaymentShareCount = expenseRepaymentsByExpenseId[expenseMessageId]?.length ?? 0;
  const paidUpfrontShareCount =
    expense.collectionMode === "group-payment"
      ? 0
      : expense.participantIds.includes(expense.paidById)
        ? 1
        : 0;

  return Math.min(expense.participantCount, repaymentShareCount + paidUpfrontShareCount);
}
