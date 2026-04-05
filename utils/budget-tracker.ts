import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { db } from "../firebase";

export type BudgetCategory =
  | "transport"
  | "accommodation"
  | "food"
  | "activities"
  | "shopping"
  | "other";

export type BudgetEntry = {
  id: string;
  tripId: string;
  groupId: string | null;
  category: BudgetCategory;
  amountValue: number;
  amountCurrency: string;
  description: string;
  createdAtMs: number;
  creatorId: string;
  creatorLabel: string;
};

export type BudgetSummary = {
  totalSpent: number;
  currency: string;
  byCategory: Record<BudgetCategory, number>;
  entryCount: number;
};

export const BUDGET_CATEGORIES: { key: BudgetCategory; emoji: string }[] = [
  { key: "transport", emoji: "\u{1F697}" },
  { key: "accommodation", emoji: "\u{1F3E8}" },
  { key: "food", emoji: "\u{1F37D}\uFE0F" },
  { key: "activities", emoji: "\u{1F3AF}" },
  { key: "shopping", emoji: "\u{1F6CD}\uFE0F" },
  { key: "other", emoji: "\u{1F4E6}" },
];

const VALID_CATEGORIES = new Set<string>([
  "transport",
  "accommodation",
  "food",
  "activities",
  "shopping",
  "other",
]);

function sanitizeCategory(value: unknown): BudgetCategory {
  if (typeof value === "string" && VALID_CATEGORIES.has(value)) {
    return value as BudgetCategory;
  }

  return "other";
}

export async function addBudgetEntry(
  entry: Omit<BudgetEntry, "id" | "createdAtMs">
): Promise<string> {
  const docRef = await addDoc(collection(db, "budgetEntries"), {
    tripId: entry.tripId,
    groupId: entry.groupId ?? null,
    category: entry.category,
    amountValue: entry.amountValue,
    amountCurrency: entry.amountCurrency,
    description: entry.description,
    createdAtMs: Date.now(),
    creatorId: entry.creatorId,
    creatorLabel: entry.creatorLabel,
    serverCreatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function deleteBudgetEntry(entryId: string): Promise<void> {
  await deleteDoc(doc(db, "budgetEntries", entryId));
}

export function subscribeToBudgetEntries(
  tripId: string,
  callback: (entries: BudgetEntry[]) => void
): () => void {
  const q = query(
    collection(db, "budgetEntries"),
    where("tripId", "==", tripId),
    orderBy("createdAtMs", "desc")
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const entries: BudgetEntry[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;

        return {
          id: docSnap.id,
          tripId: typeof data.tripId === "string" ? data.tripId : "",
          groupId: typeof data.groupId === "string" ? data.groupId : null,
          category: sanitizeCategory(data.category),
          amountValue:
            typeof data.amountValue === "number" ? data.amountValue : 0,
          amountCurrency:
            typeof data.amountCurrency === "string"
              ? data.amountCurrency
              : "EUR",
          description:
            typeof data.description === "string" ? data.description : "",
          createdAtMs:
            typeof data.createdAtMs === "number" ? data.createdAtMs : 0,
          creatorId:
            typeof data.creatorId === "string" ? data.creatorId : "",
          creatorLabel:
            typeof data.creatorLabel === "string" ? data.creatorLabel : "",
        };
      });

      callback(entries);
    },
    () => {
      callback([]);
    }
  );

  return unsubscribe;
}

export function calculateBudgetSummary(
  entries: BudgetEntry[],
  currency?: string
): BudgetSummary {
  const resolvedCurrency =
    currency ?? (entries.length > 0 ? entries[0].amountCurrency : "EUR");

  const byCategory: Record<BudgetCategory, number> = {
    transport: 0,
    accommodation: 0,
    food: 0,
    activities: 0,
    shopping: 0,
    other: 0,
  };

  let totalSpent = 0;

  for (const entry of entries) {
    const amount = entry.amountValue > 0 ? entry.amountValue : 0;
    totalSpent += amount;
    byCategory[entry.category] += amount;
  }

  return {
    totalSpent,
    currency: resolvedCurrency,
    byCategory,
    entryCount: entries.length,
  };
}
