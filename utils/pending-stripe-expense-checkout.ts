const PENDING_STRIPE_EXPENSE_CHECKOUT_KEY = "travelapp_pending_stripe_expense_checkout";
let inMemoryPendingStripeExpenseCheckout: PendingStripeExpenseCheckout | null = null;

export type PendingStripeExpenseCheckout = {
  amountLabel: string;
  amountValue: number;
  collectionMode: "group-payment" | "reimbursement";
  createdAtMs: number;
  expenseMessageId: string;
  expenseTitle: string;
  groupId: string;
  groupName: string;
  paidByLabel: string;
  paidToId: string;
  paidToLabel: string;
  payerUserId: string;
  payerUserLabel: string;
  paymentMethod: string;
};

function canUseSessionStorage() {
  return typeof window !== "undefined" && !!window.sessionStorage;
}

export function savePendingStripeExpenseCheckout(payload: PendingStripeExpenseCheckout) {
  inMemoryPendingStripeExpenseCheckout = payload;

  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.setItem(PENDING_STRIPE_EXPENSE_CHECKOUT_KEY, JSON.stringify(payload));
}

export function readPendingStripeExpenseCheckout() {
  if (!canUseSessionStorage()) {
    return inMemoryPendingStripeExpenseCheckout;
  }

  const rawValue = window.sessionStorage.getItem(PENDING_STRIPE_EXPENSE_CHECKOUT_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as PendingStripeExpenseCheckout;
    inMemoryPendingStripeExpenseCheckout = parsedValue;
    return parsedValue;
  } catch {
    return inMemoryPendingStripeExpenseCheckout;
  }
}

export function clearPendingStripeExpenseCheckout() {
  inMemoryPendingStripeExpenseCheckout = null;

  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.removeItem(PENDING_STRIPE_EXPENSE_CHECKOUT_KEY);
}
