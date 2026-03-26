const BGN_PATTERN = /(лв\.?|лева|лев|bgn)/gi;
const EUR_PATTERN = /(евро|eur|€)/gi;
const NUMBER_PATTERN = /\d+(?:[.,]\d+)?/g;

function formatEuroAmount(value: number) {
  if (value >= 100) {
    return String(Math.round(value / 5) * 5);
  }

  if (value >= 20) {
    return String(Math.round(value));
  }

  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
}

function convertBgnNumberToEuro(rawValue: string) {
  const numericValue = Number(rawValue.replace(",", "."));

  if (!Number.isFinite(numericValue)) {
    return rawValue;
  }

  return formatEuroAmount(numericValue / 1.95583);
}

export function normalizeBudgetToEuro(value: string) {
  const trimmedValue = value.trim().replace(/\s+/g, " ");

  if (!trimmedValue) {
    return "";
  }

  const hasBgn = BGN_PATTERN.test(trimmedValue);
  const hasEur = EUR_PATTERN.test(trimmedValue);

  if (hasBgn) {
    return trimmedValue
      .replace(NUMBER_PATTERN, (match) => convertBgnNumberToEuro(match))
      .replace(BGN_PATTERN, "евро")
      .replace(/\s+/g, " ")
      .replace(/\s+евро/gi, " евро")
      .trim();
  }

  if (hasEur) {
    return trimmedValue.replace(EUR_PATTERN, "евро").replace(/\s+/g, " ").trim();
  }

  if (/\d/.test(trimmedValue)) {
    return `${trimmedValue} евро`;
  }

  return trimmedValue;
}
