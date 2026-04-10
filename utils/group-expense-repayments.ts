import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";

import { db } from "../firebase";
import { sanitizeString, toMillis } from "./sanitize";

export type GroupExpenseRepayment = {
  amountLabel: string;
  amountValue: number;
  collectionMode: "group-payment" | "reimbursement";
  createdAtMs: number | null;
  expenseMessageId: string;
  expenseTitle: string;
  id: string;
  paidById: string;
  paidByLabel: string;
  paidToId: string;
  paidToLabel: string;
  paymentIntentId: string;
  paymentMethod: string;
  provider: "stripe";
  sessionId: string;
  status: "paid";
};

function sanitizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function formatExpenseRepaymentAmount(value: number) {
  const normalizedValue = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
  return `${normalizedValue} EUR`;
}

export function buildGroupExpenseRepaymentId(expenseMessageId: string, paidById: string) {
  return `${sanitizeString(expenseMessageId)}__${sanitizeString(paidById)}`;
}

export function parseGroupExpenseRepayment(
  id: string,
  data: Record<string, unknown> | undefined
): GroupExpenseRepayment | null {
  const amountValue = sanitizeNumber(data?.amountValue);
  const expenseMessageId = sanitizeString(data?.expenseMessageId);
  const expenseTitle = sanitizeString(data?.expenseTitle);
  const paidById = sanitizeString(data?.paidById);
  const paidByLabel = sanitizeString(data?.paidByLabel);
  const paidToId = sanitizeString(data?.paidToId);
  const paidToLabel = sanitizeString(data?.paidToLabel);
  const paymentIntentId = sanitizeString(data?.paymentIntentId);
  const paymentMethod = sanitizeString(data?.paymentMethod);
  const sessionId = sanitizeString(data?.sessionId);

  if (
    !amountValue ||
    amountValue <= 0 ||
    !expenseMessageId ||
    !expenseTitle ||
    !paidById ||
    !paidByLabel ||
    !paidToId ||
    !paidToLabel ||
    !paymentIntentId ||
    !paymentMethod ||
    !sessionId
  ) {
    return null;
  }

  return {
    amountLabel: sanitizeString(data?.amountLabel) || formatExpenseRepaymentAmount(amountValue),
    amountValue,
    collectionMode: data?.collectionMode === "group-payment" ? "group-payment" : "reimbursement",
    createdAtMs: toMillis(data?.createdAt),
    expenseMessageId,
    expenseTitle,
    id,
    paidById,
    paidByLabel,
    paidToId,
    paidToLabel,
    paymentIntentId,
    paymentMethod,
    provider: "stripe",
    sessionId,
    status: "paid",
  };
}

export async function saveGroupExpenseRepayment(input: {
  amountValue: number;
  collectionMode?: "group-payment" | "reimbursement";
  expenseMessageId: string;
  expenseTitle: string;
  groupId: string;
  paidById: string;
  paidByLabel: string;
  paidToId: string;
  paidToLabel: string;
  paymentIntentId: string;
  paymentMethod: string;
  sessionId: string;
}) {
  const repaymentId = buildGroupExpenseRepaymentId(input.expenseMessageId, input.paidById);
  const repaymentRef = doc(db, "groups", input.groupId, "expenseRepayments", repaymentId);
  const settlementMessageRef = doc(collection(db, "groups", input.groupId, "messages"));
  const amountLabel = formatExpenseRepaymentAmount(input.amountValue);
  const collectionMode = input.collectionMode ?? "reimbursement";

  await runTransaction(db, async (transaction) => {
    const repaymentSnapshot = await transaction.get(repaymentRef);

    if (repaymentSnapshot.exists()) {
      return;
    }

    transaction.set(repaymentRef, {
      amountLabel,
      amountValue: input.amountValue,
      collectionMode,
      createdAt: serverTimestamp(),
      expenseMessageId: input.expenseMessageId,
      expenseTitle: input.expenseTitle,
      paidById: input.paidById,
      paidByLabel: input.paidByLabel,
      paidToId: input.paidToId,
      paidToLabel: input.paidToLabel,
      paymentIntentId: input.paymentIntentId,
      paymentMethod: input.paymentMethod,
      provider: "stripe",
      sessionId: input.sessionId,
      status: "paid",
    });

    transaction.set(settlementMessageRef, {
      createdAt: serverTimestamp(),
      senderId: input.paidById,
      senderLabel: input.paidByLabel,
      text:
        collectionMode === "group-payment"
          ? `${input.paidByLabel} paid ${amountLabel} for their share of ${input.expenseTitle}.`
          : `${input.paidByLabel} paid ${amountLabel} to ${input.paidToLabel} for ${input.expenseTitle}.`,
    });
  });

  return {
    amountLabel,
    repaymentId,
  };
}
