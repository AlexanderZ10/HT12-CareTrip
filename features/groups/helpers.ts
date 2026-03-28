export function sanitizeString(value: string) {
  return value.trim().toLowerCase();
}

export function matchesQuery(source: string[], query: string) {
  if (!query.trim()) {
    return true;
  }

  const normalizedQuery = sanitizeString(query);
  return source.some((entry) => sanitizeString(entry).includes(normalizedQuery));
}
