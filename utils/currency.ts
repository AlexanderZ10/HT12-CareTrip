import type { AppLanguage } from "./translations";

const NUMBER_PATTERN = /\d+(?:[.,]\d+)?/g;
const ECB_REFERENCE_RATES_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const ECB_DATA_API_RATES_URL =
  "https://data-api.ecb.europa.eu/service/data/EXR/D.USD+GBP.EUR.SP00.A?lastNObservations=1&detail=dataonly&format=csvdata";
const ECB_RATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const BGN_PATTERN = /(лв\.?|лева|лев|bgn)/gi;
const EUR_PATTERN = /(€|евро|eur|euro|evro)/gi;
const USD_PATTERN = /(\$|us\$|usd|dollar|dollars|долар|долара|долари)/gi;
const GBP_PATTERN = /(£|gbp|pound|pounds|паунд|паунда|паунди)/gi;
const EXPLICIT_CURRENCY_PATTERN =
  /(€|евро|eur|euro|evro|\$|us\$|usd|dollar|dollars|долар|долара|долари|£|gbp|pound|pounds|паунд|паунда|паунди|лв\.?|лева|лев|bgn)/i;

type ParsedBudget = {
  amount: number;
  currency: string;
};

type CurrencyMention = {
  code: string;
  endIndex: number;
  startIndex: number;
};

type ParsedCurrencyConversion = {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
};

type EcbRatesCache = {
  fetchedAtMs: number;
  rates: Record<string, number>;
};

let ecbRatesCache: EcbRatesCache | null = null;

const DISPLAY_CURRENCY_NORMALIZERS = [
  {
    replace: (_match: string, amount: string) => `${amount} BGN`,
    pattern:
      /(\d+(?:[.,]\d+)?)\s*(?:bgn|lv|leva?|лв\.?|лева|лев)(?![\p{L}\p{N}_])/giu,
  },
  {
    replace: (_match: string, amount: string) => `${amount} euro`,
    pattern:
      /(\d+(?:[.,]\d+)?)\s*(?:eur|euro|evro|€|евро|евра)(?![\p{L}\p{N}_])/giu,
  },
  {
    replace: (_match: string, amount: string) => `${amount} USD`,
    pattern:
      /(\d+(?:[.,]\d+)?)\s*(?:usd|us\$|\$|dollars?|долари|долара|долар)(?![\p{L}\p{N}_])/giu,
  },
  {
    replace: (_match: string, amount: string) => `${amount} GBP`,
    pattern:
      /(\d+(?:[.,]\d+)?)\s*(?:gbp|£|pounds?|паунди|паунда|паунд)(?![\p{L}\p{N}_])/giu,
  },
  {
    replace: (_match: string, prefix: string) => `${prefix}BGN`,
    pattern: /(^|[^\p{L}\p{N}_])(?:bgn|lv|leva?|лв\.?|лева|лев)(?![\p{L}\p{N}_])/giu,
  },
  {
    replace: (_match: string, prefix: string) => `${prefix}euro`,
    pattern: /(^|[^\p{L}\p{N}_])(?:eur|euro|evro|евро|евра)(?![\p{L}\p{N}_])/giu,
  },
  {
    replace: (_match: string, prefix: string) => `${prefix}USD`,
    pattern: /(^|[^\p{L}\p{N}_])(?:usd|dollars?|долари|долара|долар)(?![\p{L}\p{N}_])/giu,
  },
  {
    replace: (_match: string, prefix: string) => `${prefix}GBP`,
    pattern: /(^|[^\p{L}\p{N}_])(?:gbp|pounds?|паунди|паунда|паунд)(?![\p{L}\p{N}_])/giu,
  },
] as const;

const CURRENCY_ALIAS_SOURCES = [
  {
    code: "BGN",
    source:
      "bgn|lv|leva?|\\u043b\\u0432\\.?|\\u043b\\u0435\\u0432\\u0430|\\u043b\\u0435\\u0432",
  },
  {
    code: "EUR",
    source: "eur|euro|evro|\\u20ac|\\u0435\\u0432\\u0440\\u043e",
  },
  {
    code: "USD",
    source:
      "usd|us\\$|[$]|dollars?|\\u0434\\u043e\\u043b\\u0430\\u0440\\u0438|\\u0434\\u043e\\u043b\\u0430\\u0440\\u0430|\\u0434\\u043e\\u043b\\u0430\\u0440",
  },
  {
    code: "GBP",
    source:
      "gbp|\\u00a3|pounds?|\\u043f\\u0430\\u0443\\u043d\\u0434\\u0438|\\u043f\\u0430\\u0443\\u043d\\u0434\\u0430|\\u043f\\u0430\\u0443\\u043d\\u0434",
  },
] as const;

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

function normalizeCurrencySpacing(value: string) {
  return value
    .replace(/(\d)([A-Za-z€$£])/g, "$1 $2")
    .replace(/([€$£])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCurrencyQuerySpacing(value: string) {
  return value
    .replace(/(\d)([A-Za-z\u0400-\u04ff\u20ac$£])/g, "$1 $2")
    .replace(/([\u20ac$£])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPattern(pattern: RegExp, value: string) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function getEuroLabel(language?: AppLanguage) {
  return language === "bg" || !language ? "евро" : "EUR";
}

function normalizeCurrencyCodeFromText(value: string) {
  if (hasPattern(BGN_PATTERN, value)) return "BGN";
  if (hasPattern(EUR_PATTERN, value)) return "EUR";
  if (hasPattern(USD_PATTERN, value)) return "USD";
  if (hasPattern(GBP_PATTERN, value)) return "GBP";
  return "";
}

export function normalizeCurrencyAliasesInText(value: string) {
  return DISPLAY_CURRENCY_NORMALIZERS.reduce(
    (normalized, { pattern, replace }) => normalized.replace(pattern, replace),
    value
  )
    .replace(/\s+/g, " ")
    .trim();
}

function parseBudget(value: string): ParsedBudget | null {
  const trimmedValue = normalizeCurrencySpacing(value);
  const numberMatch = trimmedValue.match(/\d+(?:[.,]\d+)?/);

  if (!numberMatch) {
    return null;
  }

  const amount = Number(numberMatch[0].replace(",", "."));
  const currency = normalizeCurrencyCodeFromText(trimmedValue);

  if (!Number.isFinite(amount) || amount <= 0 || !currency) {
    return null;
  }

  return { amount, currency };
}

function findCurrencyMentions(value: string) {
  const mentions: CurrencyMention[] = [];

  for (const alias of CURRENCY_ALIAS_SOURCES) {
    const pattern = new RegExp(alias.source, "gi");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(value)) !== null) {
      mentions.push({
        code: alias.code,
        endIndex: match.index + match[0].length,
        startIndex: match.index,
      });
    }
  }

  return mentions.sort((left, right) => left.startIndex - right.startIndex);
}

function parseCurrencyConversionQuery(value: string): ParsedCurrencyConversion | null {
  const normalizedValue = normalizeCurrencyQuerySpacing(value);
  const amountMatch = /\d+(?:[.,]\d+)?/.exec(normalizedValue);

  if (!amountMatch) {
    return null;
  }

  const amount = Number(amountMatch[0].replace(",", "."));

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const amountStart = amountMatch.index;
  const amountEnd = amountStart + amountMatch[0].length;
  const mentions = findCurrencyMentions(normalizedValue);
  const sourceAfterAmount = mentions.find(
    (mention) => mention.startIndex >= amountEnd && mention.startIndex - amountEnd <= 16
  );
  const sourceBeforeAmount = [...mentions]
    .reverse()
    .find((mention) => mention.endIndex <= amountStart && amountStart - mention.endIndex <= 8);
  const sourceMention = sourceAfterAmount ?? sourceBeforeAmount;

  if (!sourceMention) {
    return null;
  }

  const targetMention = mentions.find(
    (mention) => mention.startIndex > sourceMention.endIndex && mention.code !== sourceMention.code
  );

  if (!targetMention) {
    return null;
  }

  return {
    amount,
    fromCurrency: sourceMention.code,
    toCurrency: targetMention.code,
  };
}

function parseContextualCurrencyConversionQuery(
  value: string,
  contextValue?: string
): ParsedCurrencyConversion | null {
  if (!contextValue) {
    return null;
  }

  const contextBudget = parseBudget(contextValue);

  if (!contextBudget) {
    return null;
  }

  const normalizedValue = normalizeCurrencyQuerySpacing(value);

  if (/\d/.test(normalizedValue)) {
    return null;
  }

  const hasReferenceCue =
    /\b(this|that|it|how much|convert|to|in)\b/i.test(normalizedValue) ||
    /\u0442\u043e\u0432\u0430|\u043a\u043e\u043b\u043a\u043e|\u043a\u043e\u043d\u0432\u0435\u0440\u0442|\u0432\s|\u043a\u044a\u043c\s/i.test(
      normalizedValue
    );

  if (!hasReferenceCue) {
    return null;
  }

  const targetCurrencies = [...new Set(findCurrencyMentions(normalizedValue).map((item) => item.code))].filter(
    (currency) => currency !== contextBudget.currency
  );

  if (targetCurrencies.length !== 1) {
    return null;
  }

  return {
    amount: contextBudget.amount,
    fromCurrency: contextBudget.currency,
    toCurrency: targetCurrencies[0],
  };
}

function parseEcbRatesXml(xmlText: string) {
  const rates: Record<string, number> = {
    BGN: 1.95583,
    EUR: 1,
  };
  const ratePattern = /currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = ratePattern.exec(xmlText)) !== null) {
    const currency = match[1];
    const rate = Number(match[2]);

    if (currency && Number.isFinite(rate) && rate > 0) {
      rates[currency] = rate;
    }
  }

  return rates;
}

function parseCsvRow(row: string) {
  const cells: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    const nextCharacter = row[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  cells.push(currentCell.trim());
  return cells;
}

function parseEcbRatesCsv(csvText: string) {
  const rates: Record<string, number> = {
    BGN: 1.95583,
    EUR: 1,
  };
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return rates;
  }

  const headers = parseCsvRow(lines[0]);
  const currencyIndex = headers.findIndex((header) => header === "CURRENCY");
  const valueIndex = headers.findIndex(
    (header) => header === "OBS_VALUE" || header === "OBS_VALUE_DEC"
  );

  if (currencyIndex < 0 || valueIndex < 0) {
    return rates;
  }

  for (const line of lines.slice(1)) {
    const row = parseCsvRow(line);
    const currency = row[currencyIndex];
    const value = Number(row[valueIndex]);

    if (currency && Number.isFinite(value) && value > 0) {
      rates[currency] = value;
    }
  }

  return rates;
}

async function getEcbRates() {
  if (ecbRatesCache && Date.now() - ecbRatesCache.fetchedAtMs < ECB_RATE_CACHE_TTL_MS) {
    return ecbRatesCache.rates;
  }

  let rates: Record<string, number> | null = null;

  try {
    const apiResponse = await fetch(ECB_DATA_API_RATES_URL);

    if (apiResponse.ok) {
      rates = parseEcbRatesCsv(await apiResponse.text());
    }
  } catch {
    rates = null;
  }

  if (!rates || Object.keys(rates).length <= 2) {
    const xmlResponse = await fetch(ECB_REFERENCE_RATES_URL);

    if (!xmlResponse.ok) {
      throw new Error("ecb-rates-unavailable");
    }

    rates = parseEcbRatesXml(await xmlResponse.text());
  }

  ecbRatesCache = {
    fetchedAtMs: Date.now(),
    rates,
  };

  return rates;
}

async function getRatesForConversion(fromCurrency: string, toCurrency: string) {
  const builtInRates: Record<string, number> = {
    BGN: 1.95583,
    EUR: 1,
  };

  if (builtInRates[fromCurrency] && builtInRates[toCurrency]) {
    return builtInRates;
  }

  return getEcbRates();
}

function formatEuroBudget(value: number, language?: AppLanguage) {
  return `${formatEuroAmount(value)} ${getEuroLabel(language)}`;
}

function formatCurrencyNumber(value: number, language?: AppLanguage) {
  const roundedValue =
    value >= 100 ? Math.round(value) : value >= 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;

  return new Intl.NumberFormat(language === "bg" || !language ? "bg-BG" : undefined, {
    maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2,
  }).format(roundedValue);
}

function getCurrencyLabel(currency: string, language?: AppLanguage) {
  if (language === "bg" || !language) {
    if (currency === "EUR") return "\u0435\u0432\u0440\u043e";
    if (currency === "BGN") return "\u043b\u0432.";
  }

  return currency;
}

function formatCurrencyAmount(value: number, currency: string, language?: AppLanguage) {
  return `${formatCurrencyNumber(value, language)} ${getCurrencyLabel(currency, language)}`;
}

function formatExchangeRateNumber(value: number, language?: AppLanguage) {
  const roundedValue = Math.round(value * 10000) / 10000;

  return new Intl.NumberFormat(language === "bg" || !language ? "bg-BG" : undefined, {
    maximumFractionDigits: 4,
    minimumFractionDigits: roundedValue < 10 ? 2 : 0,
  }).format(roundedValue);
}

async function convertCurrencyAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string
) {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  const rates = await getRatesForConversion(fromCurrency, toCurrency);
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];

  if (!fromRate || !toRate) {
    throw new Error("currency-rate-unavailable");
  }

  return (amount / fromRate) * toRate;
}

export async function getCurrencyConversionAnswer(
  value: string,
  language?: AppLanguage,
  contextValue?: string
) {
  const conversion =
    parseCurrencyConversionQuery(value) ??
    parseContextualCurrencyConversionQuery(value, contextValue);

  if (!conversion) {
    return "";
  }

  try {
    const convertedAmount = await convertCurrencyAmount(
      conversion.amount,
      conversion.fromCurrency,
      conversion.toCurrency
    );
    const unitConvertedAmount = await convertCurrencyAmount(
      1,
      conversion.fromCurrency,
      conversion.toCurrency
    );
    const fromText = formatCurrencyAmount(
      conversion.amount,
      conversion.fromCurrency,
      language
    );
    const toText = formatCurrencyAmount(convertedAmount, conversion.toCurrency, language);
    const rateText = `1 ${getCurrencyLabel(
      conversion.fromCurrency,
      language
    )} = ${formatExchangeRateNumber(unitConvertedAmount, language)} ${getCurrencyLabel(
      conversion.toCurrency,
      language
    )}`;

    if (language === "en") {
      return `${fromText} is approximately ${toText}. ${rateText}. I am using the latest ECB reference exchange rates, so I will keep this separate from your trip budget.`;
    }

    if (language === "de") {
      return `${fromText} sind ungefahr ${toText}. ${rateText}. Ich nutze die aktuellen ECB-Referenzkurse und behandle das nicht als Reisebudget.`;
    }

    if (language === "es") {
      return `${fromText} son aproximadamente ${toText}. ${rateText}. Uso los tipos de referencia del ECB y no lo tratare como presupuesto del viaje.`;
    }

    if (language === "fr") {
      return `${fromText} valent environ ${toText}. ${rateText}. J'utilise les taux de reference de la BCE et je ne le traiterai pas comme budget de voyage.`;
    }

    return `${fromText} \u0441\u0430 \u043f\u0440\u0438\u0431\u043b\u0438\u0437\u0438\u0442\u0435\u043b\u043d\u043e ${toText}. ${rateText}. \u041f\u043e\u043b\u0437\u0432\u0430\u043c \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0442\u0435 \u0440\u0435\u0444\u0435\u0440\u0435\u043d\u0442\u043d\u0438 \u043a\u0443\u0440\u0441\u043e\u0432\u0435 \u043d\u0430 ECB \u0438 \u043d\u044f\u043c\u0430 \u0434\u0430 \u0433\u043e \u0431\u0440\u043e\u044f \u043a\u0430\u0442\u043e \u0431\u044e\u0434\u0436\u0435\u0442 \u0437\u0430 \u043f\u044a\u0442\u0443\u0432\u0430\u043d\u0435.`;
  } catch {
    if (language === "en") {
      return "I recognized the currency question, but I couldn't load the latest exchange rate right now. Try again in a moment.";
    }

    if (language === "de") {
      return "Ich habe die Wahrungsfrage erkannt, konnte den aktuellen Kurs aber gerade nicht laden. Versuch es gleich noch einmal.";
    }

    if (language === "es") {
      return "Reconoci la pregunta de divisas, pero ahora no pude cargar el tipo de cambio actual. Intentalo de nuevo en un momento.";
    }

    if (language === "fr") {
      return "J'ai reconnu la question de devise, mais je n'ai pas pu charger le taux actuel. Reessaie dans un instant.";
    }

    return "\u0420\u0430\u0437\u043f\u043e\u0437\u043d\u0430\u0445 \u0432\u044a\u043f\u0440\u043e\u0441\u0430 \u0437\u0430 \u0432\u0430\u043b\u0443\u0442\u0430, \u043d\u043e \u043d\u0435 \u0443\u0441\u043f\u044f\u0445 \u0434\u0430 \u0437\u0430\u0440\u0435\u0434\u044f \u0430\u043a\u0442\u0443\u0430\u043b\u043d\u0438\u044f \u043a\u0443\u0440\u0441. \u041e\u043f\u0438\u0442\u0430\u0439 \u043f\u0430\u043a \u0441\u043b\u0435\u0434 \u043c\u0430\u043b\u043a\u043e.";
  }
}

export function hasExplicitCurrency(value: string) {
  return EXPLICIT_CURRENCY_PATTERN.test(normalizeCurrencySpacing(value));
}

export function normalizeBudgetToEuro(value: string, language?: AppLanguage) {
  const trimmedValue = normalizeCurrencySpacing(value);
  const euroLabel = getEuroLabel(language);

  if (!trimmedValue) {
    return "";
  }

  if (hasPattern(BGN_PATTERN, trimmedValue)) {
    return normalizeCurrencySpacing(
      trimmedValue
        .replace(NUMBER_PATTERN, (match) => convertBgnNumberToEuro(match))
        .replace(BGN_PATTERN, euroLabel)
    );
  }

  if (hasPattern(EUR_PATTERN, trimmedValue)) {
    return normalizeCurrencySpacing(trimmedValue.replace(EUR_PATTERN, euroLabel));
  }

  if (hasPattern(USD_PATTERN, trimmedValue)) {
    return normalizeCurrencySpacing(
      trimmedValue.replace(USD_PATTERN, "USD").replace(EUR_PATTERN, "")
    );
  }

  if (hasPattern(GBP_PATTERN, trimmedValue)) {
    return normalizeCurrencySpacing(
      trimmedValue.replace(GBP_PATTERN, "GBP").replace(EUR_PATTERN, "")
    );
  }

  if (EXPLICIT_CURRENCY_PATTERN.test(trimmedValue)) {
    return trimmedValue;
  }

  return trimmedValue;
}

export async function convertBudgetToEuroForSearch(
  value: string,
  language?: AppLanguage
) {
  const parsedBudget = parseBudget(value);

  if (!parsedBudget) {
    return "";
  }

  if (parsedBudget.currency === "EUR") {
    return formatEuroBudget(parsedBudget.amount, language);
  }

  if (parsedBudget.currency === "BGN") {
    return formatEuroBudget(parsedBudget.amount / 1.95583, language);
  }

  let rates: Record<string, number>;

  try {
    rates = await getEcbRates();
  } catch {
    return "";
  }

  const currencyRate = rates[parsedBudget.currency];

  if (!currencyRate) {
    return "";
  }

  return formatEuroBudget(parsedBudget.amount / currencyRate, language);
}
