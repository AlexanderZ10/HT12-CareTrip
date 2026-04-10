/**
 * Currency Converter Utility
 *
 * Uses the free Frankfurter API (https://api.frankfurter.app) for live
 * exchange-rate data.  No API key required.
 *
 * Usage:
 *   import { fetchExchangeRates, convertCurrency, formatCurrencyAmount, CURRENCIES } from "@/utils/currency-converter";
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CurrencyRate = {
  code: string;
  name: string;
  symbol: string;
  rate: number; // relative to base
};

export type ExchangeRates = {
  base: string;
  date: string;
  rates: Record<string, number>;
  fetchedAtMs: number;
};

// ---------------------------------------------------------------------------
// Currency catalogue — top travel currencies
// ---------------------------------------------------------------------------

export const CURRENCIES: {
  code: string;
  name: string;
  symbol: string;
  flag: string;
}[] = [
  { code: "EUR", name: "Euro", symbol: "\u20AC", flag: "\uD83C\uDDEA\uD83C\uDDFA" },
  { code: "USD", name: "US Dollar", symbol: "$", flag: "\uD83C\uDDFA\uD83C\uDDF8" },
  { code: "GBP", name: "British Pound", symbol: "\u00A3", flag: "\uD83C\uDDEC\uD83C\uDDE7" },
  { code: "BGN", name: "Bulgarian Lev", symbol: "\u043B\u0432", flag: "\uD83C\uDDE7\uD83C\uDDEC" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", flag: "\uD83C\uDDE8\uD83C\uDDED" },
  { code: "JPY", name: "Japanese Yen", symbol: "\u00A5", flag: "\uD83C\uDDEF\uD83C\uDDF5" },
  { code: "TRY", name: "Turkish Lira", symbol: "\u20BA", flag: "\uD83C\uDDF9\uD83C\uDDF7" },
  { code: "THB", name: "Thai Baht", symbol: "\u0E3F", flag: "\uD83C\uDDF9\uD83C\uDDED" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", flag: "\uD83C\uDDE6\uD83C\uDDFA" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", flag: "\uD83C\uDDE8\uD83C\uDDE6" },
  { code: "PLN", name: "Polish Zloty", symbol: "z\u0142", flag: "\uD83C\uDDF5\uD83C\uDDF1" },
  { code: "CZK", name: "Czech Koruna", symbol: "K\u010D", flag: "\uD83C\uDDE8\uD83C\uDDFF" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft", flag: "\uD83C\uDDED\uD83C\uDDFA" },
  { code: "RON", name: "Romanian Leu", symbol: "lei", flag: "\uD83C\uDDF7\uD83C\uDDF4" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", flag: "\uD83C\uDDF8\uD83C\uDDEA" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", flag: "\uD83C\uDDF3\uD83C\uDDF4" },
  { code: "DKK", name: "Danish Krone", symbol: "kr", flag: "\uD83C\uDDE9\uD83C\uDDF0" },
  { code: "HRK", name: "Croatian Kuna", symbol: "kn", flag: "\uD83C\uDDED\uD83C\uDDF7" },
  { code: "RUB", name: "Russian Ruble", symbol: "\u20BD", flag: "\uD83C\uDDF7\uD83C\uDDFA" },
  { code: "INR", name: "Indian Rupee", symbol: "\u20B9", flag: "\uD83C\uDDEE\uD83C\uDDF3" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", flag: "\uD83C\uDDE7\uD83C\uDDF7" },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", flag: "\uD83C\uDDF2\uD83C\uDDFD" },
  { code: "KRW", name: "South Korean Won", symbol: "\u20A9", flag: "\uD83C\uDDF0\uD83C\uDDF7" },
  { code: "CNY", name: "Chinese Yuan", symbol: "\u00A5", flag: "\uD83C\uDDE8\uD83C\uDDF3" },
  { code: "EGP", name: "Egyptian Pound", symbol: "E\u00A3", flag: "\uD83C\uDDEA\uD83C\uDDEC" },
  { code: "MAD", name: "Moroccan Dirham", symbol: "MAD", flag: "\uD83C\uDDF2\uD83C\uDDE6" },
  { code: "AED", name: "UAE Dirham", symbol: "AED", flag: "\uD83C\uDDE6\uD83C\uDDEA" },
  { code: "ZAR", name: "South African Rand", symbol: "R", flag: "\uD83C\uDDFF\uD83C\uDDE6" },
];

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Fetch the latest exchange rates from the Frankfurter API.
 *
 * The result includes every currency in `CURRENCIES` (except the base itself)
 * plus a synthetic `1` entry for the base so look-ups are always symmetric.
 */
export async function fetchExchangeRates(
  baseCurrency: string = "EUR"
): Promise<ExchangeRates> {
  const targetCodes = CURRENCIES.map((c) => c.code)
    .filter((c) => c !== baseCurrency)
    .join(",");

  const url = `https://api.frankfurter.app/latest?from=${baseCurrency}&to=${targetCodes}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Exchange-rate fetch failed (${response.status})`);
  }

  const data = await response.json();

  return {
    base: baseCurrency,
    date: data.date,
    rates: { [baseCurrency]: 1, ...data.rates },
    fetchedAtMs: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert an amount between two currencies using a previously-fetched rate
 * table.  Returns `null` when either currency code is missing from the table.
 */
export function convertCurrency(
  amount: number,
  fromCode: string,
  toCode: string,
  rates: ExchangeRates
): number | null {
  const fromRate = rates.rates[fromCode];
  const toRate = rates.rates[toCode];

  if (fromRate === undefined || toRate === undefined) {
    return null;
  }

  // Convert via the base currency: amount / fromRate gives the base-amount,
  // then multiply by toRate to get the target amount.
  return (amount / fromRate) * toRate;
}

/**
 * Format a numeric amount with the correct currency symbol.
 *
 * Examples:
 *   formatCurrencyAmount(12.5, "EUR")  => "€ 12.50"
 *   formatCurrencyAmount(1234, "JPY")  => "¥ 1234.00"
 */
export function formatCurrencyAmount(
  amount: number,
  currencyCode: string
): string {
  const info = CURRENCIES.find((c) => c.code === currencyCode);
  return `${info?.symbol ?? currencyCode} ${amount.toFixed(2)}`;
}
