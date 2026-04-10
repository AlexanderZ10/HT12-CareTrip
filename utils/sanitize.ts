export function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function toMillis(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof value.toMillis === "function"
  ) {
    return value.toMillis();
  }
  return 0;
}
