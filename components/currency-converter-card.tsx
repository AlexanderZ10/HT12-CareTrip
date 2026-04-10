import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../constants/design-system";
import {
  CURRENCIES,
  convertCurrency,
  fetchExchangeRates,
  formatCurrencyAmount,
  type ExchangeRates,
} from "../utils/currency-converter";
import { useAppTheme } from "./app-theme-provider";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of currencies shown by default before the user taps "More". */
const DEFAULT_VISIBLE_COUNT = 10;

/** How long (ms) before we consider cached rates stale and refetch. */
const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// Chip-based currency selector
// ---------------------------------------------------------------------------

type CurrencySelectorProps = {
  label: string;
  selectedCode: string;
  onSelect: (code: string) => void;
};

function CurrencySelector({
  label,
  selectedCode,
  onSelect,
}: CurrencySelectorProps) {
  const { colors } = useAppTheme();
  const [showAll, setShowAll] = useState(false);

  const visibleCurrencies = showAll
    ? CURRENCIES
    : CURRENCIES.slice(0, DEFAULT_VISIBLE_COUNT);

  return (
    <View style={selectorStyles.container}>
      <Text style={[selectorStyles.label, { color: colors.textSecondary }]}>
        {label}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={selectorStyles.chipRow}
      >
        {visibleCurrencies.map((currency) => {
          const isSelected = currency.code === selectedCode;

          return (
            <Pressable
              key={currency.code}
              onPress={() => onSelect(currency.code)}
              style={[
                selectorStyles.chip,
                {
                  backgroundColor: isSelected
                    ? colors.accent
                    : colors.inputBackground,
                  borderColor: isSelected
                    ? colors.accent
                    : colors.inputBorder,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${currency.name} (${currency.code})`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={selectorStyles.chipFlag}>{currency.flag}</Text>
              <Text
                style={[
                  selectorStyles.chipCode,
                  {
                    color: isSelected
                      ? colors.buttonTextOnAction
                      : colors.textPrimary,
                  },
                ]}
              >
                {currency.code}
              </Text>
            </Pressable>
          );
        })}

        {/* More / Less toggle */}
        <Pressable
          onPress={() => setShowAll((prev) => !prev)}
          style={[
            selectorStyles.chip,
            {
              backgroundColor: colors.accentMuted,
              borderColor: colors.accentMuted,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={showAll ? "Show fewer currencies" : "Show more currencies"}
        >
          <Text
            style={[
              selectorStyles.chipCode,
              { color: colors.accentText },
            ]}
          >
            {showAll ? "Less" : "More"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const selectorStyles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: TypeScale.labelLg.fontSize,
    lineHeight: TypeScale.labelLg.lineHeight,
    fontWeight: TypeScale.labelLg.fontWeight,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  chipFlag: {
    fontSize: 16,
  },
  chipCode: {
    fontSize: TypeScale.labelLg.fontSize,
    lineHeight: TypeScale.labelLg.lineHeight,
    fontWeight: FontWeight.semibold,
  },
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CurrencyConverterCard() {
  const { colors } = useAppTheme();

  // ---- state ----
  const [amountText, setAmountText] = useState("1");
  const [fromCode, setFromCode] = useState("EUR");
  const [toCode, setToCode] = useState("BGN");
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- fetch rates ----
  const loadRates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchExchangeRates("EUR");
      setRates(result);
    } catch {
      setError("Could not load exchange rates. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  // Refresh if rates become stale.
  useEffect(() => {
    if (!rates) return;

    const age = Date.now() - rates.fetchedAtMs;

    if (age >= STALE_AFTER_MS) {
      loadRates();
      return;
    }

    const timer = setTimeout(() => {
      loadRates();
    }, STALE_AFTER_MS - age);

    return () => clearTimeout(timer);
  }, [rates, loadRates]);

  // ---- derived values ----
  const parsedAmount = useMemo(() => {
    const n = parseFloat(amountText.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [amountText]);

  const convertedAmount = useMemo(() => {
    if (!rates) return null;
    return convertCurrency(parsedAmount, fromCode, toCode, rates);
  }, [parsedAmount, fromCode, toCode, rates]);

  const rateInfo = useMemo(() => {
    if (!rates) return null;
    const oneUnit = convertCurrency(1, fromCode, toCode, rates);
    if (oneUnit === null) return null;
    return `1 ${fromCode} = ${oneUnit.toFixed(4)} ${toCode}`;
  }, [fromCode, toCode, rates]);

  const updatedLabel = useMemo(() => {
    if (!rates) return "";
    const now = new Date();
    const rateDate = new Date(rates.date);
    const isToday =
      now.getFullYear() === rateDate.getFullYear() &&
      now.getMonth() === rateDate.getMonth() &&
      now.getDate() === rateDate.getDate();
    return isToday ? "Updated today" : `Rates from ${rates.date}`;
  }, [rates]);

  // ---- swap ----
  const handleSwap = useCallback(() => {
    setFromCode(toCode);
    setToCode(fromCode);
  }, [fromCode, toCode]);

  // ---- render ----
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          ...shadow("md"),
        },
      ]}
    >
      {/* Header */}
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Currency Converter
      </Text>

      {/* Amount input */}
      <View style={styles.inputSection}>
        <Text
          style={[styles.inputLabel, { color: colors.textSecondary }]}
        >
          Amount
        </Text>
        <View
          style={[
            styles.inputWrapper,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.inputBorder,
            },
          ]}
        >
          <Text style={[styles.inputSymbol, { color: colors.textMuted }]}>
            {CURRENCIES.find((c) => c.code === fromCode)?.symbol ?? fromCode}
          </Text>
          <TextInput
            style={[styles.input, { color: colors.inputText }]}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.inputPlaceholder}
            selectTextOnFocus
            accessibilityLabel="Amount to convert"
          />
        </View>
      </View>

      {/* From selector */}
      <CurrencySelector
        label="From"
        selectedCode={fromCode}
        onSelect={setFromCode}
      />

      {/* Swap button */}
      <View style={styles.swapRow}>
        <View style={[styles.swapLine, { backgroundColor: colors.divider }]} />
        <Pressable
          onPress={handleSwap}
          style={({ pressed }) => [
            styles.swapButton,
            {
              backgroundColor: pressed
                ? colors.accentPressed
                : colors.accent,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Swap currencies"
        >
          <Text style={[styles.swapIcon, { color: colors.buttonTextOnAction }]}>
            {"\u2195"}
          </Text>
        </Pressable>
        <View style={[styles.swapLine, { backgroundColor: colors.divider }]} />
      </View>

      {/* To selector */}
      <CurrencySelector
        label="To"
        selectedCode={toCode}
        onSelect={setToCode}
      />

      {/* Result */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            Loading rates...
          </Text>
        </View>
      ) : error ? (
        <View
          style={[
            styles.errorContainer,
            {
              backgroundColor: colors.errorBackground,
              borderColor: colors.errorBorder,
            },
          ]}
        >
          <Text style={[styles.errorText, { color: colors.errorText }]}>
            {error}
          </Text>
          <Pressable
            onPress={loadRates}
            style={({ pressed }) => [
              styles.retryButton,
              {
                backgroundColor: pressed
                  ? colors.accentPressed
                  : colors.primaryAction,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading exchange rates"
          >
            <Text
              style={[
                styles.retryButtonText,
                { color: colors.buttonTextOnAction },
              ]}
            >
              Retry
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.resultSection}>
          {/* Converted amount */}
          <View
            style={[
              styles.resultBox,
              {
                backgroundColor: colors.accentMuted,
                borderColor: colors.accent,
              },
            ]}
          >
            <Text
              style={[styles.resultLabel, { color: colors.textSecondary }]}
            >
              Converted Amount
            </Text>
            <Text
              style={[styles.resultAmount, { color: colors.accentText }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {convertedAmount !== null
                ? formatCurrencyAmount(convertedAmount, toCode)
                : "--"}
            </Text>
          </View>

          {/* Rate info */}
          {rateInfo && (
            <Text style={[styles.rateInfo, { color: colors.textMuted }]}>
              {rateInfo}
              {"  \u2022  "}
              {updatedLabel}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },

  // Header
  title: {
    fontSize: TypeScale.headingSm.fontSize,
    lineHeight: TypeScale.headingSm.lineHeight,
    fontWeight: TypeScale.headingSm.fontWeight,
  },

  // Amount input
  inputSection: {
    gap: Spacing.sm,
  },
  inputLabel: {
    fontSize: TypeScale.labelLg.fontSize,
    lineHeight: TypeScale.labelLg.lineHeight,
    fontWeight: TypeScale.labelLg.fontWeight,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  inputSymbol: {
    fontSize: TypeScale.titleLg.fontSize,
    lineHeight: TypeScale.titleLg.lineHeight,
    fontWeight: FontWeight.medium,
    minWidth: 28,
  },
  input: {
    flex: 1,
    fontSize: TypeScale.headingMd.fontSize,
    lineHeight: TypeScale.headingMd.lineHeight,
    fontWeight: FontWeight.semibold,
    paddingVertical: Spacing.md,
  },

  // Swap
  swapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  swapLine: {
    flex: 1,
    height: 1,
  },
  swapButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  swapIcon: {
    fontSize: 20,
    fontWeight: FontWeight.bold,
  },

  // Loading
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  loadingText: {
    fontSize: TypeScale.bodyMd.fontSize,
    lineHeight: TypeScale.bodyMd.lineHeight,
  },

  // Error
  errorContainer: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.md,
    alignItems: "center",
  },
  errorText: {
    fontSize: TypeScale.bodyMd.fontSize,
    lineHeight: TypeScale.bodyMd.lineHeight,
    textAlign: "center",
  },
  retryButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.md,
  },
  retryButtonText: {
    fontSize: TypeScale.titleSm.fontSize,
    lineHeight: TypeScale.titleSm.lineHeight,
    fontWeight: FontWeight.semibold,
  },

  // Result
  resultSection: {
    gap: Spacing.sm,
  },
  resultBox: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.xs,
  },
  resultLabel: {
    fontSize: TypeScale.labelLg.fontSize,
    lineHeight: TypeScale.labelLg.lineHeight,
    fontWeight: TypeScale.labelLg.fontWeight,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  resultAmount: {
    fontSize: TypeScale.displayMd.fontSize,
    lineHeight: TypeScale.displayMd.lineHeight,
    fontWeight: TypeScale.displayMd.fontWeight,
  },
  rateInfo: {
    fontSize: TypeScale.labelMd.fontSize,
    lineHeight: TypeScale.labelMd.lineHeight,
    fontWeight: TypeScale.labelMd.fontWeight,
    textAlign: "center",
  },
});
