import AsyncStorage from "@react-native-async-storage/async-storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocumentType =
  | "passport"
  | "visa"
  | "insurance"
  | "id_card"
  | "drivers_license"
  | "vaccination"
  | "other";

export type TravelDocument = {
  id: string;
  type: DocumentType;
  label: string;
  holderName: string;
  documentNumber: string;
  issuingCountry: string;
  expiryDate: string; // YYYY-MM-DD
  notes: string;
  createdAtMs: number;
};

export const DOCUMENT_TYPES: {
  key: DocumentType;
  emoji: string;
  label: string;
}[] = [
  { key: "passport", emoji: "\u{1F6C2}", label: "Passport" },
  { key: "visa", emoji: "\u{1F4CB}", label: "Visa" },
  { key: "insurance", emoji: "\u{1F3E5}", label: "Travel Insurance" },
  { key: "id_card", emoji: "\u{1FAAA}", label: "ID Card" },
  { key: "drivers_license", emoji: "\u{1F697}", label: "Driver's License" },
  { key: "vaccination", emoji: "\u{1F489}", label: "Vaccination Record" },
  { key: "other", emoji: "\u{1F4C4}", label: "Other" },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "caretrip_travel_documents";

const VALID_DOCUMENT_TYPES = new Set<string>([
  "passport",
  "visa",
  "insurance",
  "id_card",
  "drivers_license",
  "vaccination",
  "other",
]);

// ---------------------------------------------------------------------------
// Sanitization helpers
// ---------------------------------------------------------------------------

function sanitizeDocumentType(value: unknown): DocumentType {
  if (typeof value === "string" && VALID_DOCUMENT_TYPES.has(value)) {
    return value as DocumentType;
  }

  return "other";
}

function sanitizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function sanitizeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function sanitizeDocument(raw: unknown): TravelDocument | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const data = raw as Record<string, unknown>;

  const id = sanitizeString(data.id);

  if (!id) {
    return null;
  }

  return {
    id,
    type: sanitizeDocumentType(data.type),
    label: sanitizeString(data.label),
    holderName: sanitizeString(data.holderName),
    documentNumber: sanitizeString(data.documentNumber),
    issuingCountry: sanitizeString(data.issuingCountry),
    expiryDate: sanitizeString(data.expiryDate),
    notes: sanitizeString(data.notes),
    createdAtMs: sanitizeNumber(data.createdAtMs),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function readAll(): Promise<TravelDocument[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const documents: TravelDocument[] = [];

  for (const entry of parsed) {
    const doc = sanitizeDocument(entry);

    if (doc) {
      documents.push(doc);
    }
  }

  return documents;
}

async function writeAll(documents: TravelDocument[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
}

// ---------------------------------------------------------------------------
// CRUD functions
// ---------------------------------------------------------------------------

export async function saveDocument(doc: TravelDocument): Promise<void> {
  const existing = await readAll();
  existing.push(doc);
  await writeAll(existing);
}

export async function getDocuments(): Promise<TravelDocument[]> {
  return readAll();
}

export async function deleteDocument(docId: string): Promise<void> {
  const existing = await readAll();
  const filtered = existing.filter((d) => d.id !== docId);
  await writeAll(filtered);
}

export async function updateDocument(doc: TravelDocument): Promise<void> {
  const existing = await readAll();
  const index = existing.findIndex((d) => d.id === doc.id);

  if (index === -1) {
    existing.push(doc);
  } else {
    existing[index] = doc;
  }

  await writeAll(existing);
}

// ---------------------------------------------------------------------------
// Expiry helpers
// ---------------------------------------------------------------------------

export function getDaysUntilExpiry(expiryDate: string): number {
  const expiry = new Date(expiryDate + "T00:00:00");
  const now = new Date();
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const diffMs = expiry.getTime() - todayMidnight.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function isExpiringSoon(expiryDate: string): boolean {
  if (!expiryDate) {
    return false;
  }

  const days = getDaysUntilExpiry(expiryDate);
  return days >= 0 && days <= 90;
}

export function isExpired(expiryDate: string): boolean {
  if (!expiryDate) {
    return false;
  }

  return getDaysUntilExpiry(expiryDate) < 0;
}
