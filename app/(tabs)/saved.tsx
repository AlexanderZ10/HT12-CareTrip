import { MaterialIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppLanguage } from "../../components/app-language-provider";
import { useAppTheme } from "../../components/app-theme-provider";
import { DismissKeyboard } from "../../components/dismiss-keyboard";
import { ConfirmDialog } from "../../components/confirm-dialog";
import {
  FontWeight,
  Layout,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../../constants/design-system";
import { auth, db } from "../../firebase";
import { parseBookingOrders, type BookingOrder } from "../../utils/bookings";
import { getFirestoreUserMessage } from "../../utils/firestore-errors";
import { parseSavedTrips, removeSavedTripForUser, type SavedTrip } from "../../utils/saved-trips";

type SavedFilter = "all" | "paid" | "home" | "discover";
type SavedThemeColors = ReturnType<typeof useAppTheme>["colors"];
type SavedLanguage = ReturnType<typeof useAppLanguage>["language"];
type SavedDisplayPlan = Pick<NonNullable<SavedTrip["plan"]>, "stayOptions" | "transportOptions" | "tripDays">;

function formatSavedDate(value: number) {
  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
  }).format(new Date(value));
}

function cleanSavedDetailLine(value: string) {
  return value.replace(/^[-•]\s*/, "").replace(/\s+/g, " ").trim();
}

function getSavedTripDetailLines(trip: SavedTrip) {
  const excluded = new Set(
    [trip.summary, trip.destination, trip.title]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  const seen = new Set<string>();

  return trip.details
    .split("\n")
    .map(cleanSavedDetailLine)
    .filter((line) => line && !line.endsWith(":"))
    .filter((line) => {
      const normalized = line.toLowerCase();

      if (
        !normalized ||
        excluded.has(normalized) ||
        seen.has(normalized) ||
        normalized === `${trip.duration ?? ""} • ${trip.budget ?? ""}`.trim().toLowerCase()
      ) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

function buildTripPreviewPoints(trip: SavedTrip) {
  return getSavedTripDetailLines(trip)
    .filter((line) => {
      const normalized = line.toLowerCase();

      return (
        !normalized.startsWith("verified search for") &&
        !normalized.startsWith("budget:") &&
        !normalized.includes(" transport result(s)") &&
        !normalized.includes(" stay result(s)")
      );
    })
    .slice(0, 3);
}

function hasVisiblePrice(value?: string | null) {
  return /\d/.test(value ?? "");
}

function parseLegacySavedPlan(trip: SavedTrip): SavedDisplayPlan | null {
  let section: "days" | "other" | "stay" | "transport" = "other";
  const transportOptions: SavedDisplayPlan["transportOptions"] = [];
  const stayOptions: SavedDisplayPlan["stayOptions"] = [];
  const tripDays: SavedDisplayPlan["tripDays"] = [];

  trip.details.split("\n").forEach((rawLine) => {
    const line = cleanSavedDetailLine(rawLine);
    const normalized = line.toLowerCase();
    const heading = normalized.replace(/:$/, "");

    if (!line) {
      return;
    }

    if (["transport", "транспорт", "transporte"].includes(heading)) {
      section = "transport";
      return;
    }

    if (
      [
        "accommodation",
        "stay",
        "настаняване",
        "unterkunft",
        "alojamiento",
        "hébergement",
        "hebergement",
      ].includes(heading)
    ) {
      section = "stay";
      return;
    }

    if (
      normalized.includes("verified trip structure") ||
      normalized.includes("проверена структура") ||
      normalized.includes("trip days") ||
      normalized.includes("план по дни") ||
      ["days", "дни"].includes(heading)
    ) {
      section = "days";
      return;
    }

    if (
      normalized.includes("verification") ||
      normalized.includes("проверка") ||
      normalized.includes("budget:") ||
      normalized === trip.title.toLowerCase() ||
      normalized === trip.summary.toLowerCase()
    ) {
      section = "other";
      return;
    }

    if (section === "transport") {
      const modeSplit = line.split(":");
      const mode = modeSplit.length > 1 ? modeSplit[0].trim() : "Transport";
      const details = modeSplit.length > 1 ? modeSplit.slice(1).join(":").trim() : line;
      const [provider, route, price, duration, sourceLabel] = details
        .split("|")
        .map((part) => part.trim());

      if (provider || route) {
        transportOptions.push({
          bookingUrl: "",
          duration: duration || "",
          mode,
          note: "",
          price: price || "",
          provider: provider || mode,
          route: route || "",
          sourceLabel: sourceLabel || "",
        });
      }

      return;
    }

    if (section === "stay") {
      const [nameWithType, area, pricePerNight, sourceLabel, directBookingUrl] = line
        .split("|")
        .map((part) => part.trim());
      const typeMatch = nameWithType?.match(/\(([^)]+)\)/);
      const name = nameWithType?.replace(/\s*\([^)]*\)\s*/g, "").trim();

      if (name || area) {
        stayOptions.push({
          area: area || trip.destination,
          bookingUrl: "",
          directBookingUrl: directBookingUrl || "",
          imageUrl: "",
          name: name || area || trip.destination,
          note: "",
          pricePerNight: pricePerNight || "",
          providerAccommodationId: "",
          providerKey: "",
          providerPaymentModes: [],
          providerProductId: "",
          ratingLabel: "",
          reservationMode: "",
          sourceLabel: sourceLabel || "",
          type: typeMatch?.[1] || "Stay",
        });
      }

      return;
    }

    if (section === "days") {
      const [dayLabel, rest] = line.split(":").map((part) => part.trim());
      const [title, itemsText] = (rest || line).split("|").map((part) => part.trim());
      const items = (itemsText || "")
        .split("•")
        .map((item) => item.trim())
        .filter(Boolean);

      if (title || items.length > 0) {
        tripDays.push({
          dayLabel: dayLabel || `Day ${tripDays.length + 1}`,
          items,
          title: title || dayLabel || `Day ${tripDays.length + 1}`,
        });
      }
    }
  });

  if (transportOptions.length === 0 && stayOptions.length === 0 && tripDays.length === 0) {
    return null;
  }

  return { stayOptions, transportOptions, tripDays };
}

function getSavedDisplayPlan(trip: SavedTrip): SavedDisplayPlan | null {
  return trip.plan ?? parseLegacySavedPlan(trip);
}

function getSavedLabels(language: SavedLanguage) {
  if (language === "bg") {
    return {
      days: "План по дни",
      details: "Детайли",
      hotelSite: "Хотел",
      open: "Отвори",
      source: "Provider",
      stay: "Настаняване",
      transport: "Транспорт",
      verified: "точна цена",
    };
  }

  return {
    days: "Trip days",
    details: "Details",
    hotelSite: "Hotel",
    open: "Open",
    source: "Provider",
    stay: "Accommodation",
    transport: "Transport",
    verified: "exact price",
  };
}

function SavedOfferRow({
  bookingUrl,
  colors,
  icon,
  meta,
  price,
  sourceLabel,
  title,
  verifiedLabel,
}: {
  bookingUrl?: string;
  colors: SavedThemeColors;
  icon: keyof typeof MaterialIcons.glyphMap;
  meta: string;
  price?: string;
  sourceLabel?: string;
  title: string;
  verifiedLabel: string;
}) {
  return (
    <View style={[styles.savedOfferRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.savedOfferIcon, { backgroundColor: colors.accentMuted }]}>
        <MaterialIcons name={icon} size={18} color={colors.accent} />
      </View>

      <View style={styles.savedOfferBody}>
        <Text style={[styles.savedOfferTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text style={[styles.savedOfferMeta, { color: colors.textSecondary }]} numberOfLines={2}>
            {meta}
          </Text>
        ) : null}
        {sourceLabel ? (
          <Text style={[styles.savedOfferSource, { color: colors.textMuted }]} numberOfLines={1}>
            {sourceLabel}
          </Text>
        ) : null}
      </View>

      <View style={styles.savedOfferSide}>
        {hasVisiblePrice(price) ? (
          <View style={[styles.savedOfferPricePill, { backgroundColor: colors.successBackground, borderColor: colors.successBorder }]}>
            <Text style={[styles.savedOfferPriceText, { color: colors.successText }]} numberOfLines={1}>
              {price}
            </Text>
            <Text style={[styles.savedOfferVerifiedText, { color: colors.successText }]} numberOfLines={1}>
              {verifiedLabel}
            </Text>
          </View>
        ) : null}
        {bookingUrl ? (
          <TouchableOpacity
            style={[styles.savedOfferOpenButton, { backgroundColor: colors.textPrimary }]}
            onPress={() => {
              void Linking.openURL(bookingUrl);
            }}
            activeOpacity={0.9}
          >
            <MaterialIcons name="open-in-new" size={15} color={colors.buttonTextOnAction} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function SavedTripHighlights({
  colors,
  compact = false,
  language,
  trip,
}: {
  colors: SavedThemeColors;
  compact?: boolean;
  language: SavedLanguage;
  trip: SavedTrip;
}) {
  const labels = getSavedLabels(language);
  const plan = getSavedDisplayPlan(trip);

  if (!plan) {
    const previewPoints = buildTripPreviewPoints(trip);

    if (previewPoints.length === 0) {
      return null;
    }

    return (
      <View style={styles.previewPointsWrap}>
        {previewPoints.map((point) => (
          <Text key={`${trip.id}-${point}`} style={[styles.previewPointText, { color: colors.textSecondary }]} numberOfLines={compact ? 2 : undefined}>
            • {point}
          </Text>
        ))}
      </View>
    );
  }

  const transportOptions = plan.transportOptions.slice(0, compact ? 1 : 3);
  const stayOptions = plan.stayOptions.slice(0, compact ? 1 : 3);
  const dayPlans = plan.tripDays.slice(0, compact ? 2 : 5);

  return (
    <View style={styles.structuredPreview}>
      {transportOptions.length > 0 ? (
        <View style={styles.structuredSection}>
          <View style={styles.structuredSectionHeader}>
            <MaterialIcons name="flight-takeoff" size={18} color={colors.accent} />
            <Text style={[styles.structuredSectionTitle, { color: colors.textPrimary }]}>{labels.transport}</Text>
          </View>
          {transportOptions.map((option, index) => (
            <SavedOfferRow
              key={`${trip.id}-transport-${option.provider}-${index}`}
              bookingUrl={option.bookingUrl}
              colors={colors}
              icon="flight"
              meta={[option.route, option.duration].filter(Boolean).join(" • ")}
              price={option.price}
              sourceLabel={option.sourceLabel}
              title={option.provider || option.mode}
              verifiedLabel={labels.verified}
            />
          ))}
        </View>
      ) : null}

      {stayOptions.length > 0 ? (
        <View style={styles.structuredSection}>
          <View style={styles.structuredSectionHeader}>
            <MaterialIcons name="hotel" size={18} color={colors.accent} />
            <Text style={[styles.structuredSectionTitle, { color: colors.textPrimary }]}>{labels.stay}</Text>
          </View>
          {stayOptions.map((stay, index) => (
            <SavedOfferRow
              key={`${trip.id}-stay-${stay.name}-${index}`}
              bookingUrl={stay.directBookingUrl || stay.bookingUrl}
              colors={colors}
              icon="hotel"
              meta={[stay.type, stay.area].filter(Boolean).join(" • ")}
              price={stay.pricePerNight}
              sourceLabel={stay.directBookingUrl ? labels.hotelSite : stay.sourceLabel}
              title={stay.name}
              verifiedLabel={labels.verified}
            />
          ))}
        </View>
      ) : null}

      {dayPlans.length > 0 ? (
        <View style={styles.structuredSection}>
          <View style={styles.structuredSectionHeader}>
            <MaterialIcons name="route" size={18} color={colors.accent} />
            <Text style={[styles.structuredSectionTitle, { color: colors.textPrimary }]}>{labels.days}</Text>
          </View>
          <View style={styles.savedDayGrid}>
            {dayPlans.map((day, index) => (
              <View key={`${trip.id}-day-${day.dayLabel}-${index}`} style={[styles.savedDayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.savedDayLabel, { color: colors.accent }]}>{day.dayLabel}</Text>
                <Text style={[styles.savedDayTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {day.title}
                </Text>
                {day.items.slice(0, compact ? 1 : 3).map((item, itemIndex) => (
                  <Text key={`${day.dayLabel}-${itemIndex}`} style={[styles.savedDayItem, { color: colors.textSecondary }]} numberOfLines={2}>
                    • {item}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function SavedTabScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { language, t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isPhoneLayout = width < 768;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingOrders, setBookingOrders] = useState<BookingOrder[]>([]);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState<SavedFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [tripSearch, setTripSearch] = useState("");
  const [selectedTrip, setSelectedTrip] = useState<SavedTrip | null>(null);
  const [pendingDeleteTrip, setPendingDeleteTrip] = useState<SavedTrip | null>(null);
  const [deletingTripKey, setDeletingTripKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      setUser(nextUser);

      if (!nextUser) {
        setBookingOrders([]);
        setSavedTrips([]);
        setLoading(false);
        router.replace("/login");
        return;
      }

      setLoading(true);
      setError("");

      unsubscribeProfile = onSnapshot(
        doc(db, "profiles", nextUser.uid),
        (profileSnapshot) => {
          if (!profileSnapshot.exists()) {
            setSavedTrips([]);
            setLoading(false);
            router.replace("/onboarding");
            return;
          }

          const profileData = profileSnapshot.data() as Record<string, unknown>;
          setBookingOrders(parseBookingOrders(profileData));
          setSavedTrips(parseSavedTrips(profileData));
          setLoading(false);
        },
        (nextError) => {
          setError(getFirestoreUserMessage(nextError, "read"));
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, [router]);

  async function handleDeleteTrip(trip: SavedTrip) {
    if (!user) return;
    const key = `${trip.source}_${trip.id}`;
    setDeletingTripKey(key);
    try {
      const remaining = await removeSavedTripForUser(user.uid, trip.sourceKey);
      setSavedTrips(remaining);
    } catch {
      // silent
    } finally {
      setDeletingTripKey(null);
      setPendingDeleteTrip(null);
    }
  }

  const filterOptions = useMemo(
    () => [
      { id: "all" as const, label: t("saved.all") },
      { id: "paid" as const, label: t("common.paid") },
      { id: "home" as const, label: t("common.homePlanner") },
      { id: "discover" as const, label: t("common.discover") },
    ],
    [t]
  );

  const selectedFilterLabel =
    filterOptions.find((option) => option.id === activeFilter)?.label ?? t("saved.all");
  const filteredBookingOrders = activeFilter === "all" || activeFilter === "paid"
    ? bookingOrders
    : [];
  const filteredSavedTrips =
    activeFilter === "all"
      ? savedTrips
      : savedTrips.filter((trip) => trip.source === activeFilter);

  const filteredTrips = useMemo(() => {
    const query = tripSearch.trim().toLowerCase();

    if (!query) {
      return filteredSavedTrips;
    }

    return filteredSavedTrips.filter((trip) =>
      [trip.title, trip.destination, trip.summary, trip.details, trip.budget, trip.duration]
        .filter((value): value is string => !!value)
        .some((value) => value.toLowerCase().includes(query))
    );
  }, [filteredSavedTrips, tripSearch]);

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.loader, { backgroundColor: colors.screenSoft }]}
        edges={["top", "left", "right"]}
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.screenSoft }]}
      edges={["top", "left", "right"]}
    >
      <DismissKeyboard>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 8 : 0}
      >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* ── Instagram-style minimal top bar ── */}
        <View style={styles.topBar}>
          <Text style={[styles.brandTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {t("saved.title")}
          </Text>
        </View>

        {/* ── Instagram-style rounded gray search pill ── */}
        <View style={[styles.searchShell, { backgroundColor: colors.inputBackground }]}>
          <MaterialIcons color={colors.textMuted} name="search" size={20} />
          <TextInput
            accessibilityLabel="Search saved trips"
            style={[styles.searchInput, { color: colors.inputText }]}
            placeholder={t("saved.searchPlaceholder")}
            placeholderTextColor={colors.textMuted}
            value={tripSearch}
            onChangeText={setTripSearch}
          />
        </View>

        <View style={styles.filterSection}>
          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{t("saved.filter")}</Text>
          <TouchableOpacity
            style={[styles.filterButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setFilterOpen((current) => !current)}
            activeOpacity={0.9}
          >
            <Text style={[styles.filterButtonText, { color: colors.textPrimary }]}>{selectedFilterLabel}</Text>
            <Text style={[styles.filterButtonArrow, { color: colors.textSecondary }]}>{filterOpen ? "▲" : "▼"}</Text>
          </TouchableOpacity>

          {filterOpen ? (
            <View style={[styles.filterMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {filterOptions.map((option) => {
                const isActive = option.id === activeFilter;

                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.filterOption,
                      isActive && { backgroundColor: colors.screenSoft },
                    ]}
                    onPress={() => {
                      setActiveFilter(option.id);
                      setFilterOpen(false);
                    }}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.filterOptionText,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>

      {error ? (
        <View
          style={[
            styles.errorCard,
            { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
          ]}
        >
          <Text style={[styles.errorTitle, { color: colors.error }]}>{t("saved.loadError")}</Text>
          <Text style={[styles.errorText, { color: colors.errorText }]}>{error}</Text>
        </View>
      ) : null}

      {!error && filteredBookingOrders.length > 0 ? (
        <View style={styles.bookingsSection}>
          <Text style={[styles.bookingsSectionTitle, { color: colors.textPrimary }]}>{t("saved.bookedInApp")}</Text>
          <Text style={[styles.bookingsSectionSubtitle, { color: colors.textSecondary }]}>
            {t("saved.bookingsDescription")}
          </Text>

          {filteredBookingOrders.map((booking) => (
            <View
              key={booking.id}
              style={[
                styles.bookingCard,
                {
                  backgroundColor: colors.warningBackground,
                  borderColor: colors.warningBorder,
                },
              ]}
            >
              <View style={styles.bookingTopRow}>
                <View style={[styles.bookingPaidBadge, { backgroundColor: colors.accentMuted }]}>
                  <Text style={[styles.bookingPaidBadgeText, { color: colors.accent }]}>
                    {booking.bookingStatus === "payment_captured" ? "Paid / handoff" : t("common.paid")}
                  </Text>
                </View>
                <Text style={[styles.dateText, { color: colors.textMuted }]}>{formatSavedDate(booking.createdAtMs)}</Text>
              </View>

              <Text style={[styles.tripTitle, { color: colors.textPrimary }]}>{booking.title}</Text>
              <Text style={[styles.tripDestination, { color: colors.textSecondary }]}>{booking.destination}</Text>

              <View style={styles.metaRow}>
                {booking.days ? <Text style={[styles.metaText, { color: colors.textSecondary }]}>{booking.days}</Text> : null}
                {booking.travelers ? <Text style={[styles.metaText, { color: colors.textSecondary }]}>{booking.travelers}</Text> : null}
                {booking.budget ? <Text style={[styles.metaText, { color: colors.textSecondary }]}>{booking.budget}</Text> : null}
              </View>

              <Text style={[styles.bookingTotal, { color: colors.warningText }]}>{booking.totalLabel}</Text>
              <Text style={[styles.bookingPaymentMeta, { color: colors.warningText }]}>{booking.paymentMethod}</Text>
              {booking.subtotalLabel ? (
                <Text style={[styles.bookingPaymentMeta, { color: colors.warningText }]}>
                  Subtotal: {booking.subtotalLabel}
                </Text>
              ) : null}
              {booking.platformFeeLabel ? (
                <Text style={[styles.bookingPaymentMeta, { color: colors.warningText }]}>
                  TravelApp fee: {booking.platformFeeLabel}
                </Text>
              ) : null}
              {booking.reservationStatusLabel ? (
                <Text style={[styles.bookingPaymentMeta, { color: colors.warningText }]}>
                  {booking.reservationStatusLabel}
                </Text>
              ) : null}

              {booking.transport ? (
                <View style={styles.bookingDetailBlock}>
                  <Text style={[styles.bookingDetailTitle, { color: colors.textSecondary }]}>{t("common.transport")}</Text>
                  <Text style={[styles.bookingDetailText, { color: colors.textSecondary }]}>
                    {booking.transport.mode} • {booking.transport.provider}
                  </Text>
                  <Text style={[styles.bookingDetailText, { color: colors.textSecondary }]}>{booking.transport.route}</Text>
                </View>
              ) : null}

              {booking.stay ? (
                <View style={styles.bookingDetailBlock}>
                  <Text style={[styles.bookingDetailTitle, { color: colors.textSecondary }]}>{t("common.stay")}</Text>
                  <Text style={[styles.bookingDetailText, { color: colors.textSecondary }]}>
                    {booking.stay.name} • {booking.stay.type}
                  </Text>
                  <Text style={[styles.bookingDetailText, { color: colors.textSecondary }]}>
                    {booking.stay.area} • {booking.stay.pricePerNight}
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.bookingContactText, { color: colors.textMuted }]}>
                {booking.contactName} • {booking.contactEmail}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {!error && filteredBookingOrders.length === 0 && filteredTrips.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.cardAlt }]}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t("saved.emptyFilter")}</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t("saved.emptyFilterDescription")}
          </Text>
        </View>
      ) : null}

      {!error && savedTrips.length > 0 && filteredTrips.length === 0 && tripSearch.trim() ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.cardAlt }]}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t("saved.noMatchingTrips")}</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t("saved.noMatchingDescription")}
          </Text>
        </View>
      ) : null}

        {filteredTrips.map((trip) => {
          const isDeleting = deletingTripKey === trip.sourceKey;

          return (
          <TouchableOpacity
            key={trip.id}
            style={[
              styles.tripCard,
              { backgroundColor: colors.cardAlt, borderColor: colors.border },
            ]}
            activeOpacity={0.94}
            onPress={() => setSelectedTrip(trip)}
          >
          <View style={styles.cardTopRow}>
            <View
              style={[
                styles.sourceBadge,
                trip.source === "home"
                  ? { backgroundColor: colors.skeleton }
                  : { backgroundColor: colors.warningBackground },
              ]}
            >
              <Text
                style={[
                  styles.sourceBadgeText,
                  { color: trip.source === "home" ? colors.accent : colors.warningText },
                ]}
              >
                {trip.source === "home" ? t("common.homePlanner") : t("common.discover")}
              </Text>
            </View>
            <View style={styles.cardTopRowRight}>
              <Text style={[styles.dateText, { color: colors.textMuted }]}>{formatSavedDate(trip.createdAtMs)}</Text>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  setPendingDeleteTrip(trip);
                }}
                hitSlop={8}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.tripTitle, { color: colors.textPrimary }]}>{trip.title}</Text>
          <Text style={[styles.tripDestination, { color: colors.textSecondary }]}>{trip.destination}</Text>

          <View style={[styles.previewGrid, isPhoneLayout && styles.previewGridPhone]}>
            <View style={[styles.previewInfoCard, { backgroundColor: colors.screenSoft, borderColor: colors.border }]}>
              <Text style={[styles.previewInfoLabel, { color: colors.textMuted }]}>{t("common.destination")}</Text>
              <Text style={[styles.previewInfoValue, { color: colors.textPrimary }]}>{trip.destination}</Text>
            </View>
            <View style={[styles.previewInfoCard, { backgroundColor: colors.screenSoft, borderColor: colors.border }]}>
              <Text style={[styles.previewInfoLabel, { color: colors.textMuted }]}>{t("common.source")}</Text>
              <Text style={[styles.previewInfoValue, { color: colors.textPrimary }]}>
                {trip.source === "home" ? t("common.homePlanner") : t("common.discover")}
              </Text>
            </View>
            {trip.duration ? (
              <View style={[styles.previewInfoCard, { backgroundColor: colors.screenSoft, borderColor: colors.border }]}>
                <Text style={[styles.previewInfoLabel, { color: colors.textMuted }]}>{t("common.duration")}</Text>
                <Text style={[styles.previewInfoValue, { color: colors.textPrimary }]}>{trip.duration}</Text>
              </View>
            ) : null}
            {trip.budget ? (
              <View style={[styles.previewInfoCard, { backgroundColor: colors.screenSoft, borderColor: colors.border }]}>
                <Text style={[styles.previewInfoLabel, { color: colors.textMuted }]}>{t("common.budget")}</Text>
                <Text style={[styles.previewInfoValue, { color: colors.textPrimary }]}>{trip.budget}</Text>
              </View>
            ) : null}
          </View>

          {trip.summary ? (
            <Text style={[styles.summaryText, { color: colors.textSecondary }]} numberOfLines={isPhoneLayout ? 4 : 3}>
              {trip.summary}
            </Text>
          ) : null}

          <SavedTripHighlights colors={colors} compact language={language} trip={trip} />
          </TouchableOpacity>
        );
        })}
      </ScrollView>
      </KeyboardAvoidingView>
      </DismissKeyboard>

      <Modal
        visible={!!selectedTrip}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTrip(null)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTextWrap}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{selectedTrip?.title}</Text>
                <Text style={[styles.modalDestination, { color: colors.textSecondary }]}>{selectedTrip?.destination}</Text>
              </View>
              <TouchableOpacity
                style={[styles.modalCloseButton, { backgroundColor: colors.screenSoft }]}
                onPress={() => setSelectedTrip(null)}
                activeOpacity={0.9}
              >
                <MaterialIcons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {selectedTrip ? (
              <>
                <View style={[styles.previewGrid, isPhoneLayout && styles.previewGridPhone]}>
                  <View style={[styles.previewInfoCard, { backgroundColor: colors.screenSoft, borderColor: colors.border }]}>
                    <Text style={[styles.previewInfoLabel, { color: colors.textMuted }]}>{t("common.source")}</Text>
                    <Text style={[styles.previewInfoValue, { color: colors.textPrimary }]}>
                      {selectedTrip.source === "home" ? t("common.homePlanner") : t("common.discover")}
                    </Text>
                  </View>
                  <View style={[styles.previewInfoCard, { backgroundColor: colors.screenSoft, borderColor: colors.border }]}>
                    <Text style={[styles.previewInfoLabel, { color: colors.textMuted }]}>{t("saved.savedOn")}</Text>
                    <Text style={[styles.previewInfoValue, { color: colors.textPrimary }]}>
                      {formatSavedDate(selectedTrip.createdAtMs)}
                    </Text>
                  </View>
                  {selectedTrip.duration ? (
                    <View style={[styles.previewInfoCard, { backgroundColor: colors.screenSoft, borderColor: colors.border }]}>
                      <Text style={[styles.previewInfoLabel, { color: colors.textMuted }]}>{t("common.duration")}</Text>
                      <Text style={[styles.previewInfoValue, { color: colors.textPrimary }]}>{selectedTrip.duration}</Text>
                    </View>
                  ) : null}
                  {selectedTrip.budget ? (
                    <View style={[styles.previewInfoCard, { backgroundColor: colors.screenSoft, borderColor: colors.border }]}>
                      <Text style={[styles.previewInfoLabel, { color: colors.textMuted }]}>{t("common.budget")}</Text>
                      <Text style={[styles.previewInfoValue, { color: colors.textPrimary }]}>{selectedTrip.budget}</Text>
                    </View>
                  ) : null}
                </View>

                {selectedTrip.summary ? (
                  <Text style={[styles.modalSummary, { color: colors.textSecondary }]}>{selectedTrip.summary}</Text>
                ) : null}

                <ScrollView
                  style={styles.modalDetailsScroll}
                  contentContainerStyle={styles.modalDetailsContent}
                  showsVerticalScrollIndicator={false}
                >
                  {getSavedDisplayPlan(selectedTrip) ? (
                    <SavedTripHighlights colors={colors} language={language} trip={selectedTrip} />
                  ) : (
                    getSavedTripDetailLines(selectedTrip).map((line) => (
                      <Text key={`${selectedTrip.id}-${line}`} style={[styles.modalDetailLine, { color: colors.textSecondary }]}>
                        • {line}
                      </Text>
                    ))
                  )}
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!pendingDeleteTrip}
        title={t("saved.deleteTrip")}
        message={t("saved.deleteTripConfirm")}
        confirmLabel={t("common.delete")}
        onConfirm={() => {
          if (pendingDeleteTrip) handleDeleteTrip(pendingDeleteTrip);
        }}
        onCancel={() => setPendingDeleteTrip(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: Spacing["3xl"],
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // ── Instagram-style top bar ──
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    minHeight: 48,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: FontWeight.black,
    letterSpacing: 0.3,
  },
  searchShell: {
    alignItems: "center",
    borderRadius: Radius.md,
    flexDirection: "row",
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  searchInput: {
    ...TypeScale.bodyMd,
    flex: 1,
    marginLeft: Spacing.sm,
    padding: 0,
  },
  errorCard: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  errorTitle: {
    ...TypeScale.titleLg,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
  },
  errorText: {
    ...TypeScale.bodyMd,
  },
  emptyCard: {
    borderRadius: Radius["2xl"],
    padding: Spacing["2xl"],
    alignItems: "center",
  },
  emptyTitle: {
    ...TypeScale.headingMd,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  emptyText: {
    ...TypeScale.titleSm,
    textAlign: "center",
  },
  filterSection: {
    marginBottom: Spacing.lg,
  },
  filterLabel: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    marginBottom: Spacing.sm,
  },
  filterButton: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterButtonText: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.bold,
  },
  filterButtonArrow: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
  },
  filterMenu: {
    marginTop: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  filterOption: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  filterOptionText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.bold,
  },
  bookingsSection: {
    marginBottom: Spacing.lg,
  },
  bookingsSectionTitle: {
    ...TypeScale.headingMd,
    marginBottom: Spacing.xs,
  },
  bookingsSectionSubtitle: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.md,
  },
  bookingCard: {
    borderRadius: Radius["2xl"],
    padding: Spacing.xl,
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  bookingTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  bookingPaidBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  bookingPaidBadgeText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
  },
  bookingTotal: {
    ...TypeScale.headingMd,
    marginBottom: Spacing.xs,
  },
  bookingPaymentMeta: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  bookingDetailBlock: {
    marginBottom: Spacing.sm,
  },
  bookingDetailTitle: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    marginBottom: Spacing.xs,
  },
  bookingDetailText: {
    ...TypeScale.bodyMd,
  },
  bookingContactText: {
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
  tripCard: {
    borderRadius: Radius["2xl"],
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    ...shadow("md"),
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  cardTopRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sourceBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sourceBadgeText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.extrabold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dateText: {
    ...TypeScale.labelMd,
  },
  tripTitle: {
    ...TypeScale.headingMd,
    marginBottom: Spacing.xs,
  },
  tripDestination: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
  },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  previewGridPhone: {
    gap: Spacing.sm,
  },
  previewInfoCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    minWidth: 132,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  previewInfoLabel: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.4,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
  },
  previewInfoValue: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.extrabold,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: Spacing.sm,
  },
  metaText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.bold,
    marginRight: Spacing.md,
    marginBottom: Spacing.xs,
  },
  summaryText: {
    ...TypeScale.titleSm,
    marginBottom: Spacing.sm,
  },
  previewPointsWrap: {
    marginBottom: Spacing.sm,
  },
  previewPointText: {
    ...TypeScale.bodyMd,
    marginBottom: Spacing.xs,
  },
  detailsText: {
    ...TypeScale.bodyMd,
  },
  structuredPreview: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  structuredSection: {
    gap: Spacing.sm,
  },
  structuredSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  structuredSectionTitle: {
    ...TypeScale.titleMd,
    fontWeight: FontWeight.extrabold,
  },
  savedOfferRow: {
    alignItems: "center",
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  savedOfferIcon: {
    alignItems: "center",
    borderRadius: Radius.md,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  savedOfferBody: {
    flex: 1,
    minWidth: 0,
  },
  savedOfferTitle: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
  },
  savedOfferMeta: {
    ...TypeScale.bodySm,
    marginTop: 2,
  },
  savedOfferSource: {
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
    marginTop: 2,
  },
  savedOfferSide: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  savedOfferPricePill: {
    alignItems: "flex-end",
    borderRadius: Radius.md,
    borderWidth: 1,
    maxWidth: 116,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  savedOfferPriceText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.black,
  },
  savedOfferVerifiedText: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.bold,
  },
  savedOfferOpenButton: {
    alignItems: "center",
    borderRadius: Radius.md,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  savedDayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  savedDayCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 150,
    padding: Spacing.md,
  },
  savedDayLabel: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.black,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  savedDayTitle: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.extrabold,
    marginBottom: Spacing.xs,
  },
  savedDayItem: {
    ...TypeScale.bodySm,
    marginBottom: 2,
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: Layout.modalMaxWidth + 380,
    maxHeight: "84%",
    borderRadius: Radius["3xl"],
    borderWidth: 1,
    padding: Spacing.xl,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  modalHeaderTextWrap: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  modalTitle: {
    ...TypeScale.displayMd,
  },
  modalDestination: {
    ...TypeScale.titleLg,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.xs,
  },
  modalCloseButton: {
    width: Layout.touchTarget,
    height: Layout.touchTarget,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSummary: {
    ...TypeScale.bodyLg,
    marginBottom: Spacing.md,
  },
  modalDetailsScroll: {
    marginTop: Spacing.xs,
  },
  modalDetailsContent: {
    paddingBottom: Spacing.xs,
  },
  modalDetailLine: {
    ...TypeScale.titleSm,
    marginBottom: Spacing.sm,
  },
});
