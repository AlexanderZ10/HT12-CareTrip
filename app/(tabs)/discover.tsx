import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { useAppLanguage } from "../../components/app-language-provider";
import { useAppTheme } from "../../components/app-theme-provider";
import {
  FontWeight,
  Radius,
  Spacing,
  TypeScale,
  shadow,
} from "../../constants/design-system";
import { auth, db } from "../../firebase";
import { getFirestoreUserMessage } from "../../utils/firestore-errors";
import {
  buildSavedTripFromDiscover,
  getDiscoverSavedSourceKey,
  parseSavedTrips,
  saveTripForUser,
} from "../../utils/saved-trips";
import {
  DEFAULT_SETTLEMENT_MAP_ZOOM,
  enrichDiscoverTrips,
  GEMINI_MODEL,
  extractDiscoverProfile,
  generateTripsWithGemini,
  getLocalDateKey,
  isTripGenerationError,
  getTripGenerationErrorMessage,
  parseStoredDiscoverData,
  type DiscoverProfile,
  type StoredDiscoverData,
  type TripRecommendation,
} from "../../utils/trip-recommendations";
import { getLanguageLocale } from "../../utils/translations";

type ExpandedPreviewState =
  | {
      imageIndex: number;
      kind: "image";
      trip: TripRecommendation;
    }
  | {
      kind: "map";
      trip: TripRecommendation;
    }
  | null;

function formatGeneratedDate(
  value: number | null,
  locale: string,
  fallbackText: string
) {
  if (!value) {
    return fallbackText;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function getTripImageUrls(trip: TripRecommendation) {
  if (trip.imageUrls?.length) {
    return trip.imageUrls;
  }

  return trip.imageUrl ? [trip.imageUrl] : [];
}

const MIN_MAP_LEVEL = 1;
const MAX_MAP_LEVEL = 17;
const PREVIEW_MAP_ZOOM = DEFAULT_SETTLEMENT_MAP_ZOOM + 1;

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampLatitude(value: number) {
  return clampValue(value, -85, 85);
}

function clampLongitude(value: number) {
  return clampValue(value, -180, 180);
}

function buildMapBounds(params: {
  height: number;
  latitude: number;
  longitude: number;
  width: number;
  zoom: number;
}) {
  const zoom = clampValue(params.zoom, MIN_MAP_LEVEL, MAX_MAP_LEVEL);
  const latitude = clampLatitude(params.latitude);
  const longitude = clampLongitude(params.longitude);
  const latitudeRadians = (latitude * Math.PI) / 180;
  const metersPerPixel =
    (156543.03392 * Math.cos(latitudeRadians)) / Math.pow(2, zoom);
  const latitudeDelta = ((metersPerPixel * params.height) / 111320) * 1.35;
  const longitudeDivisor = Math.max(0.15, Math.cos(latitudeRadians));
  const longitudeDelta =
    ((metersPerPixel * params.width) / (111320 * longitudeDivisor)) * 1.2;

  return {
    bottom: clampLatitude(latitude - latitudeDelta / 2),
    left: clampLongitude(longitude - longitudeDelta / 2),
    right: clampLongitude(longitude + longitudeDelta / 2),
    top: clampLatitude(latitude + latitudeDelta / 2),
  };
}

function buildOpenStreetMapEmbedUrl(params: {
  height: number;
  latitude: number;
  longitude: number;
  width: number;
  zoom: number;
}) {
  const bounds = buildMapBounds(params);

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    `${bounds.left},${bounds.bottom},${bounds.right},${bounds.top}`
  )}&layer=mapnik&marker=${encodeURIComponent(
    `${params.latitude},${params.longitude}`
  )}`;
}

function buildOpenStreetMapSource(params: {
  latitude: number;
  longitude: number;
  viewportHeight?: number;
  viewportWidth?: number;
  zoom: number;
}) {
  const roundedZoom = clampValue(Math.round(params.zoom), MIN_MAP_LEVEL, MAX_MAP_LEVEL);
  return buildOpenStreetMapEmbedUrl({
    height: params.viewportHeight ?? 620,
    latitude: params.latitude,
    longitude: params.longitude,
    width: params.viewportWidth ?? 820,
    zoom: roundedZoom,
  });
}

function ZoomableMap({
  latitude,
  longitude,
  unavailableLabel,
}: {
  latitude: number | null;
  longitude: number | null;
  unavailableLabel: string;
}) {
  const { colors } = useAppTheme();

  if (latitude === null || longitude === null) {
    return (
      <View style={[styles.zoomableMapViewport, { backgroundColor: colors.skeleton }]}>
        <View style={[styles.mapFallback, { backgroundColor: colors.cardAlt }]}>
          <Text style={[styles.mapFallbackText, { color: colors.textMuted }]}>{unavailableLabel}</Text>
        </View>
      </View>
    );
  }

  const mapUrl = buildOpenStreetMapSource({
    latitude,
    longitude,
    viewportHeight: 620,
    viewportWidth: 820,
    zoom: DEFAULT_SETTLEMENT_MAP_ZOOM,
  });

  return (
    <View style={styles.zoomableMapRoot}>
      <View style={[styles.zoomableMapViewport, { backgroundColor: colors.skeleton }]}>
        <WebView
          key={`map-${latitude}-${longitude}`}
          source={{ uri: mapUrl }}
          style={[styles.modalMapWebView, { backgroundColor: colors.skeleton }]}
          originWhitelist={["*"]}
          startInLoadingState
          scrollEnabled={false}
          nestedScrollEnabled={false}
          overScrollMode="never"
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled
          bounces={false}
        />
      </View>
    </View>
  );
}

function SaveHeartButton({
  isSaved,
  isSaving,
  onPress,
}: {
  isSaved: boolean;
  isSaving: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (isSaved || isSaving) return;
    scale.value = withSpring(0.7, { damping: 10, stiffness: 300 }, () => {
      scale.value = withSpring(1, { damping: 8, stiffness: 200 });
    });
    onPress();
  };

  return (
    <TouchableOpacity
      style={[styles.heartButton, { backgroundColor: colors.modalOverlay }]}
      onPress={handlePress}
      disabled={isSaved || isSaving}
      activeOpacity={0.9}
    >
      <Animated.View style={animatedStyle}>
        <MaterialIcons
          name={isSaved ? "favorite" : "favorite-outline"}
          size={22}
          color={isSaved ? colors.destructive : colors.heroText}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function DiscoverTabScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { language, languageForPrompt, t } = useAppLanguage();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DiscoverProfile | null>(null);
  const [discoverData, setDiscoverData] = useState<StoredDiscoverData | null>(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [savedSourceKeys, setSavedSourceKeys] = useState<string[]>([]);
  const [savingTripKey, setSavingTripKey] = useState<string | null>(null);
  const [expandedPreview, setExpandedPreview] = useState<ExpandedPreviewState>(null);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const previewImageUrls =
    expandedPreview?.kind === "image" ? getTripImageUrls(expandedPreview.trip) : [];
  const hasRequestedInitialTripsRef = useRef(false);
  const metadataRepairKeyRef = useRef<string | null>(null);

  const todayKey = getLocalDateKey();
  const refreshUsedToday = discoverData?.lastRefreshDateKey === todayKey;
  const locale = getLanguageLocale(language);

  const toggleDetails = (tripId: string) => {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(tripId)) {
        next.delete(tripId);
      } else {
        next.add(tripId);
      }
      return next;
    });
  };

  const generateAndStoreTrips = useCallback(
    async (
      profileData: DiscoverProfile,
      nextUser: User,
      isManualRefresh: boolean,
      previousTrips: TripRecommendation[],
      currentDiscoverData: StoredDiscoverData | null
    ) => {
      try {
        setGenerating(true);
        setError("");

        const generatedTrips = await generateTripsWithGemini(
          profileData,
          previousTrips,
          languageForPrompt
        );
        const enrichedTrips = await enrichDiscoverTrips(generatedTrips.trips);
        const generatedAtMs = Date.now();

        const nextDiscoverData: StoredDiscoverData = {
          generatedAtMs,
          lastRefreshDateKey: isManualRefresh
            ? todayKey
            : currentDiscoverData?.lastRefreshDateKey ?? null,
          language: languageForPrompt,
          sourceModel: GEMINI_MODEL,
          summary: generatedTrips.summary,
          trips: enrichedTrips.trips,
        };

        await setDoc(
          doc(db, "profiles", nextUser.uid),
          {
            discover: nextDiscoverData,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        setDiscoverData(nextDiscoverData);
      } catch (nextError) {
        if (isTripGenerationError(nextError)) {
          setError(getTripGenerationErrorMessage(nextError, language));
          return;
        }

        setError(getFirestoreUserMessage(nextError, "write", language));
      } finally {
        setGenerating(false);
      }
    },
    [language, languageForPrompt, todayKey]
  );

  const generateAndStoreTripsRef = useRef(generateAndStoreTrips);
  generateAndStoreTripsRef.current = generateAndStoreTrips;
  const languageRef = useRef(language);
  languageRef.current = language;
  const languageForPromptRef = useRef(languageForPrompt);
  languageForPromptRef.current = languageForPrompt;

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;
      hasRequestedInitialTripsRef.current = false;

      if (!nextUser) {
        setUser(null);
        setLoading(false);
        router.replace("/login");
        return;
      }

      setUser(nextUser);
      setLoading(true);
      setError("");
      setSaveError("");
      setSaveSuccess("");

      unsubscribeProfile = onSnapshot(
        doc(db, "profiles", nextUser.uid),
        (profileSnapshot) => {
          if (!profileSnapshot.exists()) {
            setLoading(false);
            router.replace("/onboarding");
            return;
          }

          const profileData = profileSnapshot.data() as Record<string, unknown>;
          const discoverProfile = extractDiscoverProfile(profileData);

          if (!discoverProfile) {
            setLoading(false);
            router.replace("/onboarding");
            return;
          }

          setProfile(discoverProfile);
          setSavedSourceKeys(parseSavedTrips(profileData).map((trip) => trip.sourceKey));

          const storedDiscoverData = parseStoredDiscoverData(profileData);
          setDiscoverData(storedDiscoverData);

          const tripsMissingMetadata =
            storedDiscoverData?.trips.filter(
              (trip) =>
                (!trip.imageUrl && (trip.imageUrls?.length ?? 0) === 0) ||
                trip.latitude === null ||
                trip.longitude === null
            ) ?? [];

          if (tripsMissingMetadata.length > 0) {
            const repairKey = tripsMissingMetadata
              .map(
                (trip) =>
                  `${trip.id}:${trip.imageUrl ? 1 : 0}:${trip.imageUrls?.length ?? 0}:${trip.latitude ?? "x"}:${trip.longitude ?? "x"}`
              )
              .join("|");

            if (metadataRepairKeyRef.current !== repairKey) {
              metadataRepairKeyRef.current = repairKey;

              void (async () => {
                try {
                  const enrichedDiscoverData = await enrichDiscoverTrips(
                    storedDiscoverData?.trips ?? []
                  );

                  if (!enrichedDiscoverData.changed) {
                    return;
                  }

                  await setDoc(
                    doc(db, "profiles", nextUser.uid),
                    {
                      discover: {
                        ...storedDiscoverData,
                        trips: enrichedDiscoverData.trips,
                      },
                      updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                  );
                } catch {
                  metadataRepairKeyRef.current = null;
                }
              })();
            }
          } else {
            metadataRepairKeyRef.current = null;
          }

          if (storedDiscoverData?.trips.length) {
            hasRequestedInitialTripsRef.current = false;
          }

          if (
            (!storedDiscoverData || storedDiscoverData.trips.length === 0) &&
            !hasRequestedInitialTripsRef.current
          ) {
            hasRequestedInitialTripsRef.current = true;
            void generateAndStoreTripsRef.current(
              discoverProfile,
              nextUser,
              false,
              [],
              storedDiscoverData
            );
          } else if (
            storedDiscoverData?.trips.length &&
            storedDiscoverData.language !== languageForPromptRef.current &&
            !hasRequestedInitialTripsRef.current
          ) {
            hasRequestedInitialTripsRef.current = true;
            void generateAndStoreTripsRef.current(
              discoverProfile,
              nextUser,
              false,
              storedDiscoverData.trips,
              storedDiscoverData
            );
          }

          setLoading(false);
        },
        (nextError) => {
          setError(getFirestoreUserMessage(nextError, "read", languageRef.current));
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, [router]);

  // Regenerate discover trips when the UI language changes
  useEffect(() => {
    if (!user || !profile || generating) return;
    if (!discoverData?.trips.length) return;
    if (discoverData.language === languageForPrompt) return;

    void generateAndStoreTripsRef.current(
      profile,
      user,
      false,
      discoverData.trips,
      discoverData
    );
  }, [discoverData, generating, languageForPrompt, profile, user]);

  const handleRefresh = async () => {
    if (!user || !profile || generating || refreshUsedToday) {
      return;
    }

    await generateAndStoreTrips(
      profile,
      user,
      true,
      discoverData?.trips ?? [],
      discoverData
    );
  };

  const handleSaveTrip = async (trip: TripRecommendation) => {
    if (!user) {
      return;
    }

    const sourceKey = getDiscoverSavedSourceKey(trip);

    if (savedSourceKeys.includes(sourceKey)) {
      setSaveError("");
      setSaveSuccess(`${trip.title} — ${t("discover.tripAlreadySaved")}`);
      return;
    }

    try {
      setSavingTripKey(sourceKey);
      setSaveError("");
      setSaveSuccess("");

      const nextSavedTrips = await saveTripForUser(
        user.uid,
        buildSavedTripFromDiscover(trip)
      );

      setSavedSourceKeys(nextSavedTrips.map((savedTrip) => savedTrip.sourceKey));
      setSaveSuccess(`${trip.title} — ${t("discover.tripSaved")}`);
    } catch (nextError) {
      setSaveSuccess("");
      setSaveError(getFirestoreUserMessage(nextError, "write", language, "trip"));
    } finally {
      setSavingTripKey(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.loader, { backgroundColor: colors.screen }]}
        edges={["top", "left", "right"]}
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView
        style={[styles.screen, { backgroundColor: colors.screen }]}
        edges={["top", "left", "right"]}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Clean header — no dark hero */}
          <Animated.View
            entering={FadeInDown.duration(400).springify()}
            style={styles.header}
          >
            <View style={styles.headerTop}>
              <View>
                <Text style={[styles.greeting, { color: colors.textSecondary }]}>
                  {t("discover.welcomeBack")}
                </Text>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                  {t("tab.discover")}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.refreshButton,
                  { backgroundColor: colors.textPrimary },
                  (generating || refreshUsedToday) && styles.refreshButtonDisabled,
                ]}
                onPress={handleRefresh}
                disabled={generating || refreshUsedToday}
                activeOpacity={0.85}
              >
                {generating ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <MaterialIcons name="refresh" size={20} color={colors.textInverse} />
                )}
              </TouchableOpacity>
            </View>

            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
              {discoverData?.generatedAtMs
                ? `${t("discover.updated")} ${formatGeneratedDate(
                    discoverData.generatedAtMs,
                    locale,
                    t("discover.notGeneratedYet")
                  )}`
                : t("discover.aiCurated")}
              {refreshUsedToday ? `  ·  ${t("discover.refreshTomorrow")}` : ""}
            </Text>
          </Animated.View>

          {/* Status messages */}
          {error ? (
            <View
              style={[
                styles.statusCard,
                { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
              ]}
            >
              <MaterialIcons name="error-outline" size={18} color={colors.errorText} />
              <Text style={[styles.statusText, { color: colors.errorText }]}>{error}</Text>
            </View>
          ) : null}

          {saveSuccess ? (
            <View
              style={[
                styles.statusCard,
                { backgroundColor: colors.successBackground, borderColor: colors.successBorder },
              ]}
            >
              <MaterialIcons name="check-circle-outline" size={18} color={colors.successText} />
              <Text style={[styles.statusText, { color: colors.successText }]}>{saveSuccess}</Text>
            </View>
          ) : null}

          {saveError ? (
            <View
              style={[
                styles.statusCard,
                { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
              ]}
            >
              <MaterialIcons name="error-outline" size={18} color={colors.errorText} />
              <Text style={[styles.statusText, { color: colors.errorText }]}>{saveError}</Text>
            </View>
          ) : null}

          {/* Summary callout */}
          {discoverData?.summary ? (
            <Animated.View
              entering={FadeInDown.delay(100).duration(400).springify()}
              style={[
                styles.summaryCard,
                { backgroundColor: colors.cardAlt, borderColor: colors.border },
              ]}
            >
              <MaterialIcons name="auto-awesome" size={16} color={colors.accent} />
              <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
                {discoverData.summary}
              </Text>
            </Animated.View>
          ) : null}

          {/* Loading state */}
          {generating && !discoverData?.trips.length ? (
            <View
              style={[styles.loadingCard, { backgroundColor: colors.cardAlt }]}
            >
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={[styles.loadingTitle, { color: colors.textPrimary }]}>
                {t("discover.loadingTitle")}
              </Text>
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                {t("discover.loadingText")}
              </Text>
            </View>
          ) : null}

          {/* Trip cards — image-first design */}
          {discoverData?.trips.map((trip, index) => {
            const sourceKey = getDiscoverSavedSourceKey(trip);
            const isSaved = savedSourceKeys.includes(sourceKey);
            const isSaving = savingTripKey === sourceKey;
            const isDetailsExpanded = expandedDetails.has(trip.id);
            const mapUrl =
              trip.latitude !== null && trip.longitude !== null
                ? buildOpenStreetMapSource({
                    latitude: trip.latitude,
                    longitude: trip.longitude,
                    viewportHeight: 360,
                    viewportWidth: 360,
                    zoom: PREVIEW_MAP_ZOOM,
                  })
                : "";

            return (
              <Animated.View
                key={trip.id}
                entering={FadeInUp.delay(150 * Math.min(index, 4)).duration(500).springify()}
                style={[
                  styles.tripCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                {/* Image with gradient overlay */}
                <TouchableOpacity
                  onPress={() =>
                    trip.imageUrl
                      ? setExpandedPreview({ kind: "image", trip, imageIndex: 0 })
                      : null
                  }
                  activeOpacity={0.95}
                  style={styles.imageContainer}
                >
                  {trip.imageUrl ? (
                    <Image
                      source={{ uri: trip.imageUrl }}
                      style={styles.tripImage}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      recyclingKey={trip.id}
                      placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                      transition={200}
                    />
                  ) : (
                    <View style={[styles.tripImage, styles.imageFallback, { backgroundColor: colors.cardAlt }]}>
                      <MaterialIcons name="landscape" size={48} color={colors.textMuted} />
                    </View>
                  )}
                  <LinearGradient
                    colors={["transparent", colors.overlay]}
                    style={styles.imageGradient}
                  />
                  <View style={styles.imageOverlayContent}>
                    <Text style={[styles.overlayTitle, { color: colors.heroText }]}>{trip.title}</Text>
                    {trip.popularityNote ? (
                      <View style={styles.ratingRow}>
                        <MaterialIcons name="star" size={14} color={colors.highlight} />
                        <Text style={[styles.ratingText, { color: colors.heroText }]}>{trip.popularityNote}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Save heart on image */}
                  <SaveHeartButton
                    isSaved={isSaved}
                    isSaving={isSaving}
                    onPress={() => void handleSaveTrip(trip)}
                  />
                </TouchableOpacity>

                {/* Info section below image */}
                <View style={styles.tripInfo}>
                  <Text style={[styles.whyText, { color: colors.textSecondary }]}>
                    {trip.whyItFits}
                  </Text>

                  {/* Highlights preview */}
                  <View style={styles.highlightsRow}>
                    {trip.highlights.slice(0, 3).map((highlight) => (
                      <View
                        key={`${trip.id}-h-${highlight}`}
                        style={[styles.highlightChip, { backgroundColor: colors.cardAlt }]}
                      >
                        <Text style={[styles.highlightText, { color: colors.textPrimary }]} numberOfLines={1}>
                          {highlight}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Expandable details */}
                  <TouchableOpacity
                    style={[styles.seeMoreButton, { borderTopColor: colors.divider }]}
                    onPress={() => toggleDetails(trip.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.seeMoreText, { color: colors.textPrimary }]}>
                      {isDetailsExpanded
                        ? t("discover.showLess")
                        : t("discover.seeMore")}
                    </Text>
                    <MaterialIcons
                      name={isDetailsExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                      size={20}
                      color={colors.textPrimary}
                    />
                  </TouchableOpacity>

                  {isDetailsExpanded ? (
                    <Animated.View entering={FadeInDown.duration(300)}>
                      {/* Map preview */}
                      {mapUrl ? (
                        <TouchableOpacity
                          style={styles.mapContainer}
                          onPress={() => setExpandedPreview({ kind: "map", trip })}
                          activeOpacity={0.92}
                        >
                          <WebView
                            key={`${trip.id}-map-preview`}
                            source={{ uri: mapUrl }}
                            style={[styles.mapPreview, { backgroundColor: colors.skeleton }]}
                            pointerEvents="none"
                            originWhitelist={["*"]}
                            scrollEnabled={false}
                            setSupportMultipleWindows={false}
                            javaScriptEnabled
                            domStorageEnabled
                            bounces={false}
                          />
                          <View style={[styles.mapExpandHint, { backgroundColor: colors.modalOverlay }]}>
                            <MaterialIcons name="open-in-full" size={16} color={colors.heroText} />
                          </View>
                        </TouchableOpacity>
                      ) : null}

                      <View style={styles.detailsSection}>
                        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                          {t("discover.whatToDo")}
                        </Text>
                        {trip.highlights.map((highlight) => (
                          <View key={`${trip.id}-a-${highlight}`} style={styles.detailRow}>
                            <MaterialIcons name="check" size={16} color={colors.accent} />
                            <Text style={[styles.detailText, { color: colors.textPrimary }]}>
                              {highlight}
                            </Text>
                          </View>
                        ))}
                      </View>

                      <View style={styles.detailsSection}>
                        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                          {t("discover.mustSee")}
                        </Text>
                        {trip.attractions.map((attraction) => (
                          <View key={`${trip.id}-s-${attraction}`} style={styles.detailRow}>
                            <MaterialIcons name="place" size={16} color={colors.accent} />
                            <Text style={[styles.detailText, { color: colors.textPrimary }]}>
                              {attraction}
                            </Text>
                          </View>
                        ))}
                      </View>

                      <View style={styles.detailsSection}>
                        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                          {t("discover.accessibility")}
                        </Text>
                        <Text style={[styles.detailText, { color: colors.textSecondary, marginLeft: 0 }]}>
                          {trip.accessibilityNotes}
                        </Text>
                      </View>
                    </Animated.View>
                  ) : null}
                </View>
              </Animated.View>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {/* Expanded preview modal */}
      <Modal
        visible={!!expandedPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedPreview(null)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeaderRow}>
              <Text
                style={[styles.modalTitle, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {expandedPreview?.trip.title}
              </Text>
              <TouchableOpacity
                style={[styles.modalCloseButton, { backgroundColor: colors.cardAlt }]}
                onPress={() => setExpandedPreview(null)}
                activeOpacity={0.9}
              >
                <MaterialIcons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {expandedPreview ? (
              expandedPreview.kind === "image" ? (
                <View>
                  {previewImageUrls[expandedPreview.imageIndex] ? (
                    <Image
                      source={{ uri: previewImageUrls[expandedPreview.imageIndex] }}
                      style={[styles.modalHeroImage, { backgroundColor: colors.skeleton }]}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                  ) : null}
                  {previewImageUrls.length > 1 ? (
                    <ScrollView
                      horizontal
                      style={styles.modalThumbnailScroll}
                      contentContainerStyle={styles.modalThumbnailRow}
                      showsHorizontalScrollIndicator={false}
                    >
                      {previewImageUrls.map((imageUrl, imgIdx) => (
                        <TouchableOpacity
                          key={`${expandedPreview.trip.id}-image-${imgIdx}`}
                          onPress={() =>
                            setExpandedPreview({
                              ...expandedPreview,
                              imageIndex: imgIdx,
                            })
                          }
                          activeOpacity={0.92}
                        >
                          <Image
                            source={{ uri: imageUrl }}
                            style={[
                              styles.modalThumbnailImage,
                              { backgroundColor: colors.skeleton },
                              imgIdx === expandedPreview.imageIndex && {
                                borderColor: colors.accent,
                              },
                            ]}
                            contentFit="cover"
                          />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
              ) : (
                <ZoomableMap
                  latitude={expandedPreview.trip.latitude}
                  longitude={expandedPreview.trip.longitude}
                  unavailableLabel={t("discover.mapUnavailable")}
                />
              )
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["3xl"],
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Header
  header: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  greeting: {
    ...TypeScale.bodySm,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: FontWeight.black,
    lineHeight: 38,
  },
  headerSubtitle: {
    ...TypeScale.bodySm,
    marginTop: Spacing.xs,
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshButtonDisabled: {
    opacity: 0.35,
  },

  // Status cards
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  statusText: {
    ...TypeScale.bodySm,
    fontWeight: FontWeight.medium,
    flex: 1,
  },

  // Summary
  summaryCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  summaryText: {
    ...TypeScale.bodySm,
    flex: 1,
    lineHeight: 20,
  },

  // Loading
  loadingCard: {
    borderRadius: Radius.xl,
    padding: Spacing["2xl"],
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  loadingTitle: {
    marginTop: Spacing.md,
    ...TypeScale.titleMd,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
    textAlign: "center",
  },
  loadingText: {
    ...TypeScale.bodySm,
    textAlign: "center",
  },

  // Trip card
  tripCard: {
    borderRadius: Radius.xl,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    overflow: "hidden",
    ...shadow("sm"),
  },

  // Image section
  imageContainer: {
    position: "relative",
  },
  tripImage: {
    width: "100%",
    height: 260,
  },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  imageGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  imageOverlayContent: {
    position: "absolute",
    bottom: Spacing.lg,
    left: Spacing.lg,
    right: 60,
  },
  overlayTitle: {
    fontSize: 22,
    fontWeight: FontWeight.bold,
    lineHeight: 28,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
    gap: 4,
  },
  ratingText: {
    ...TypeScale.labelLg,
  },

  // Heart button
  heartButton: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },

  // Trip info
  tripInfo: {
    padding: Spacing.lg,
  },
  whyText: {
    ...TypeScale.bodyMd,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },

  // Highlights chips
  highlightsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  highlightChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  highlightText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.medium,
  },

  // See more
  seeMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  seeMoreText: {
    ...TypeScale.bodyMd,
    fontWeight: FontWeight.semibold,
  },

  // Map preview
  mapContainer: {
    marginTop: Spacing.lg,
    borderRadius: Radius.lg,
    overflow: "hidden",
    height: 180,
    position: "relative",
  },
  mapPreview: {
    flex: 1,
  },
  mapExpandHint: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },

  // Details sections
  detailsSection: {
    marginTop: Spacing.lg,
  },
  sectionLabel: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.bold,
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  detailText: {
    ...TypeScale.bodyMd,
    flex: 1,
    lineHeight: 22,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 900,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...shadow("lg"),
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  modalTitle: {
    ...TypeScale.headingMd,
    fontWeight: FontWeight.bold,
    flex: 1,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  modalHeroImage: {
    width: "100%",
    height: 420,
    borderRadius: Radius.lg,
  },
  modalThumbnailScroll: {
    marginTop: Spacing.md,
  },
  modalThumbnailRow: {
    gap: Spacing.sm,
  },
  modalThumbnailImage: {
    width: 80,
    height: 60,
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  modalMapWebView: {
    flex: 1,
  },

  // Zoomable map
  zoomableMapRoot: {
    width: "100%",
  },
  zoomableMapViewport: {
    width: "100%",
    height: 420,
    borderRadius: Radius.lg,
    overflow: "hidden",
  },
  mapFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    borderRadius: Radius.lg,
  },
  mapFallbackText: {
    ...TypeScale.bodySm,
    textAlign: "center",
  },
});
