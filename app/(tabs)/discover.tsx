import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
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
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { useAppTheme } from "../../components/app-theme-provider";
import { auth, db } from "../../firebase";
import { getFirestoreUserMessage } from "../../utils/firestore-errors";
import { getProfileDisplayName } from "../../utils/profile-info";
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
  getTripGenerationErrorMessage,
  parseStoredDiscoverData,
  type DiscoverProfile,
  type StoredDiscoverData,
  type TripRecommendation,
} from "../../utils/trip-recommendations";

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

function formatGeneratedDate(value: number | null) {
  if (!value) {
    return "Още не е генерирано";
  }

  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
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
}: {
  latitude: number | null;
  longitude: number | null;
}) {
  if (latitude === null || longitude === null) {
    return (
      <View style={styles.zoomableMapViewport}>
        <View style={styles.mapFallback}>
          <Text style={styles.mapFallbackText}>Map coordinates not available</Text>
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
      <View style={styles.zoomableMapViewport}>
        <WebView
          key={`map-${latitude}-${longitude}`}
          source={{ uri: mapUrl }}
          style={styles.modalMapWebView}
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

export default function DiscoverTabScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const isWideLayout = width >= 980;
  const isPhoneLayout = width < 768;

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState("Traveler");
  const [profile, setProfile] = useState<DiscoverProfile | null>(null);
  const [discoverData, setDiscoverData] = useState<StoredDiscoverData | null>(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [savedSourceKeys, setSavedSourceKeys] = useState<string[]>([]);
  const [savingTripKey, setSavingTripKey] = useState<string | null>(null);
  const [expandedPreview, setExpandedPreview] = useState<ExpandedPreviewState>(null);
  const previewImageUrls =
    expandedPreview?.kind === "image" ? getTripImageUrls(expandedPreview.trip) : [];
  const hasRequestedInitialTripsRef = useRef(false);
  const metadataRepairKeyRef = useRef<string | null>(null);

  const todayKey = getLocalDateKey();
  const refreshUsedToday = discoverData?.lastRefreshDateKey === todayKey;
  const heroTitle = isPhoneLayout ? `Discover за ${profileName}` : `Settlements for ${profileName}`;
  const heroSubtitle = isPhoneLayout
    ? "Реални селища със снимка, карта и идеи какво да видиш."
    : "Вместо generic trip идеи, тук получаваш реални селища с tourism activity, активности, забележителности, снимка и map preview.";

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

        const generatedTrips = await generateTripsWithGemini(profileData, previousTrips);
        const enrichedTrips = await enrichDiscoverTrips(generatedTrips.trips);
        const generatedAtMs = Date.now();

        const nextDiscoverData: StoredDiscoverData = {
          generatedAtMs,
          lastRefreshDateKey: isManualRefresh
            ? todayKey
            : currentDiscoverData?.lastRefreshDateKey ?? null,
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
        const aiErrorMessage = getTripGenerationErrorMessage(nextError);

        if (
          aiErrorMessage !== "Не успяхме да генерираме нови предложения. Опитай отново."
        ) {
          setError(aiErrorMessage);
          return;
        }

        setError(getFirestoreUserMessage(nextError, "write"));
      } finally {
        setGenerating(false);
      }
    },
    [todayKey]
  );

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
          setProfileName(
            getProfileDisplayName({
              email: nextUser.email,
              profileInfo:
                profileData.profileInfo && typeof profileData.profileInfo === "object"
                  ? (profileData.profileInfo as Record<string, unknown>)
                  : undefined,
              username: typeof profileData.username === "string" ? profileData.username : null,
            })
          );
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
            void generateAndStoreTrips(
              discoverProfile,
              nextUser,
              false,
              [],
              storedDiscoverData
            );
          }

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
  }, [generateAndStoreTrips, router]);

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
      setSaveSuccess(`"${trip.title}" is already in Trips.`);
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
      setSaveSuccess(`"${trip.title}" was added to Trips.`);
    } catch (nextError) {
      setSaveSuccess("");
      setSaveError(getFirestoreUserMessage(nextError, "write"));
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
        <ActivityIndicator size="large" color="#639922" />
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
          <View
            style={[
              styles.hero,
              isPhoneLayout && styles.heroPhone,
              { backgroundColor: colors.hero },
            ]}
          >
            <Text style={[styles.kicker, { color: colors.accent }]}>CareTrip</Text>
            <Text
              style={[
                styles.heroTitle,
                isPhoneLayout && styles.heroTitlePhone,
                { color: colors.textPrimary },
              ]}
            >
              {heroTitle}
            </Text>
            <Text
              style={[
                styles.heroSubtitle,
                isPhoneLayout && styles.heroSubtitlePhone,
                { color: colors.textSecondary },
              ]}
            >
              {heroSubtitle}
            </Text>

          <View style={[styles.heroMetaRow, isPhoneLayout && styles.heroMetaRowPhone]}>
            <View style={[styles.metaChip, isPhoneLayout && styles.metaChipPhone]}>
              <Text style={styles.metaLabel}>Generated</Text>
              <Text style={styles.metaValue}>
                {formatGeneratedDate(discoverData?.generatedAtMs ?? null)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              isPhoneLayout && styles.primaryButtonPhone,
              (generating || refreshUsedToday) && styles.primaryButtonDisabled,
            ]}
            onPress={handleRefresh}
            disabled={generating || refreshUsedToday}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryButtonText}>
              {generating
                ? "Refreshing settlements..."
                : refreshUsedToday
                  ? "Refresh used today"
                  : "Refresh settlements"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.refreshNote}>
            {refreshUsedToday
              ? "Днес вече беше използван refresh. Утре можеш да заредиш нови селища."
              : "Можеш да поискаш нов set settlements веднъж на ден."}
          </Text>
        </View>

        {error ? (
          <View
            style={[
              styles.errorCard,
              { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
            ]}
          >
            <Text style={styles.errorTitle}>Discover is blocked</Text>
            <Text style={[styles.errorText, { color: colors.errorText }]}>{error}</Text>
          </View>
        ) : null}

        {saveSuccess ? (
          <View
            style={[
              styles.saveSuccessCard,
              { backgroundColor: colors.successBackground, borderColor: colors.successBorder },
            ]}
          >
            <Text style={[styles.saveSuccessText, { color: colors.successText }]}>{saveSuccess}</Text>
          </View>
        ) : null}

        {saveError ? (
          <View
            style={[
              styles.saveErrorCard,
              { backgroundColor: colors.errorBackground, borderColor: colors.errorBorder },
            ]}
          >
            <Text style={[styles.saveErrorText, { color: colors.errorText }]}>{saveError}</Text>
          </View>
        ) : null}

        {discoverData?.summary ? (
          <View
            style={[
              styles.summaryCard,
              isPhoneLayout && styles.summaryCardPhone,
              {
                backgroundColor: colors.warningBackground,
                borderColor: colors.warningBorder,
              },
            ]}
          >
            <Text style={[styles.summaryTitle, { color: colors.warningText }]}>Защо тези места са точни за теб</Text>
            <Text style={[styles.summaryText, { color: isDark ? "#DCC59A" : "#6A5731" }]}>
              {discoverData.summary}
            </Text>
          </View>
        ) : null}

        {generating && !discoverData?.trips.length ? (
          <View
            style={[
              styles.loadingCard,
              isPhoneLayout && styles.loadingCardPhone,
              { backgroundColor: colors.cardAlt },
            ]}
          >
            <ActivityIndicator size="large" color="#639922" />
            <Text style={[styles.loadingTitle, { color: colors.textPrimary }]}>
              Preparing your settlements feed
            </Text>
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Комбинираме профила ти с internet research, за да върнем реални селища с
              какво да се прави в тях.
            </Text>
          </View>
        ) : null}

          {discoverData?.trips.map((trip) => {
          const sourceKey = getDiscoverSavedSourceKey(trip);
          const isSaved = savedSourceKeys.includes(sourceKey);
          const isSaving = savingTripKey === sourceKey;
          const mapUrl =
            trip.latitude !== null && trip.longitude !== null
              ? buildOpenStreetMapSource({
                  latitude: trip.latitude,
                  longitude: trip.longitude,
                  viewportHeight: isPhoneLayout ? 360 : 420,
                  viewportWidth: isPhoneLayout ? 360 : 560,
                  zoom: PREVIEW_MAP_ZOOM,
                })
              : "";
          return (
            <View
              key={trip.id}
              style={[
                styles.tripCard,
                isPhoneLayout && styles.tripCardPhone,
                { backgroundColor: colors.cardAlt },
              ]}
            >
              <View style={styles.tripHeader}>
                <View style={styles.tripHeaderText}>
                  <Text style={[styles.tripTitle, isPhoneLayout && styles.tripTitlePhone]}>
                    {trip.title}
                  </Text>
                </View>
              </View>

              <View style={[styles.topRow, !isWideLayout && styles.topRowStacked]}>
                <View style={[styles.imagePanel, !isWideLayout && styles.imagePanelStacked]}>
                  {trip.imageUrl ? (
                    <TouchableOpacity
                      onPress={() =>
                        setExpandedPreview({ kind: "image", trip, imageIndex: 0 })
                      }
                      activeOpacity={0.92}
                    >
                      <Image
                        source={{ uri: trip.imageUrl }}
                        style={[styles.heroImage, isPhoneLayout && styles.heroImagePhone]}
                        contentFit="cover"
                      />
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.imageFallback, isPhoneLayout && styles.imageFallbackPhone]}>
                      <Text
                        style={[
                          styles.imageFallbackTitle,
                          isPhoneLayout && styles.imageFallbackTitlePhone,
                        ]}
                      >
                        {trip.title}
                      </Text>
                      <Text style={styles.imageFallbackText}>No photo found yet</Text>
                    </View>
                  )}
                </View>

                <View style={styles.mapPanel}>
                  {mapUrl ? (
                    <TouchableOpacity
                      style={styles.previewTapContainer}
                      onPress={() => setExpandedPreview({ kind: "map", trip })}
                      activeOpacity={0.92}
                    >
                      <View style={[styles.mapImage, isPhoneLayout && styles.mapImagePhone]}>
                        <WebView
                          key={`${trip.id}-map-preview`}
                          source={{ uri: mapUrl }}
                          style={styles.previewMapWebView}
                          pointerEvents="none"
                          originWhitelist={["*"]}
                          scrollEnabled={false}
                          setSupportMultipleWindows={false}
                          javaScriptEnabled
                          domStorageEnabled
                          bounces={false}
                        />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.mapFallback, isPhoneLayout && styles.mapImagePhone]}>
                      <Text style={styles.mapFallbackText}>Map coordinates not available</Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={styles.tripWhy}>{trip.whyItFits}</Text>
              <Text style={styles.popularityText}>{trip.popularityNote}</Text>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>What to do</Text>
                {trip.highlights.map((highlight) => (
                  <Text key={`${trip.id}-activity-${highlight}`} style={styles.sectionText}>
                    • {highlight}
                  </Text>
                ))}
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>Must-see spots</Text>
                {trip.attractions.map((attraction) => (
                  <Text key={`${trip.id}-attraction-${attraction}`} style={styles.sectionText}>
                    • {attraction}
                  </Text>
                ))}
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>Accessibility</Text>
                <Text style={styles.sectionText}>{trip.accessibilityNotes}</Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  isPhoneLayout && styles.saveButtonPhone,
                  (isSaved || isSaving) && styles.saveButtonDisabled,
                  isSaved && styles.saveButtonSaved,
                ]}
                onPress={() => {
                  void handleSaveTrip(trip);
                }}
                disabled={isSaved || isSaving}
                activeOpacity={0.9}
              >
                <Text
                  style={[
                    styles.saveButtonText,
                    isSaved && styles.saveButtonTextSaved,
                  ]}
                >
                  {isSaving
                    ? "Saving..."
                    : isSaved
                      ? "Saved in Trips"
                      : "Save to Trips"}
                </Text>
              </TouchableOpacity>
            </View>
          );
          })}
        </ScrollView>
      </SafeAreaView>

      <Modal
        visible={!!expandedPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedPreview(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderText}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  {expandedPreview?.trip.title}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setExpandedPreview(null)}
                activeOpacity={0.9}
              >
                <MaterialIcons name="close" size={20} color="#29440F" />
              </TouchableOpacity>
            </View>
            {expandedPreview ? (
              expandedPreview.kind === "image" ? (
                <View>
                  {previewImageUrls[expandedPreview.imageIndex] ? (
                    <View style={styles.modalHeroImageWrap}>
                      <Image
                        source={{ uri: previewImageUrls[expandedPreview.imageIndex] }}
                        style={styles.modalHeroImage}
                        contentFit="cover"
                      />
                    </View>
                  ) : null}
                  {previewImageUrls.length > 1 ? (
                    <ScrollView
                      horizontal
                      style={styles.modalThumbnailScroll}
                      contentContainerStyle={styles.modalThumbnailRow}
                      showsHorizontalScrollIndicator={false}
                    >
                      {previewImageUrls.map((imageUrl, index) => (
                        <TouchableOpacity
                          key={`${expandedPreview.trip.id}-image-${index}`}
                          onPress={() =>
                            setExpandedPreview({
                              ...expandedPreview,
                              imageIndex: index,
                            })
                          }
                          activeOpacity={0.92}
                        >
                          <Image
                            source={{ uri: imageUrl }}
                            style={[
                              styles.modalThumbnailImage,
                              index === expandedPreview.imageIndex &&
                                styles.modalThumbnailImageActive,
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
    backgroundColor: "#EEF4E5",
  },
  content: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 32,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF4E5",
  },
  hero: {
    backgroundColor: "#223814",
    borderRadius: 28,
    padding: 24,
    marginBottom: 18,
  },
  heroPhone: {
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
  },
  kicker: {
    color: "#C8E08E",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "800",
    marginBottom: 10,
  },
  heroTitlePhone: {
    fontSize: 20,
    lineHeight: 26,
    marginBottom: 8,
  },
  heroSubtitle: {
    color: "#EAF3DE",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  heroSubtitlePhone: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  heroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  heroMetaRowPhone: {
    marginBottom: 12,
  },
  metaChip: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    marginBottom: 10,
  },
  metaChipPhone: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  metaLabel: {
    color: "#D6E8AE",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  metaValue: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#BA7517",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonPhone: {
    borderRadius: 14,
    paddingVertical: 13,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  refreshNote: {
    marginTop: 10,
    color: "#DCEAC0",
    fontSize: 13,
    lineHeight: 18,
  },
  errorCard: {
    backgroundColor: "#FFF1EF",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#F0B6AE",
    marginBottom: 16,
  },
  errorTitle: {
    color: "#A63228",
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 6,
  },
  errorText: {
    color: "#8A3D35",
    fontSize: 14,
    lineHeight: 20,
  },
  saveSuccessCard: {
    backgroundColor: "#F3F9E6",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#C9DF98",
    marginBottom: 16,
  },
  saveSuccessText: {
    color: "#3B6D11",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  saveErrorCard: {
    backgroundColor: "#FFF1EF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F0B6AE",
    marginBottom: 16,
  },
  saveErrorText: {
    color: "#8A3D35",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  summaryCard: {
    backgroundColor: "#FFF8E7",
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F1D7A5",
  },
  summaryCardPhone: {
    borderRadius: 18,
    padding: 16,
  },
  summaryTitle: {
    color: "#8B5611",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
  },
  summaryText: {
    color: "#6A5731",
    fontSize: 15,
    lineHeight: 22,
  },
  loadingCard: {
    backgroundColor: "#F6F8EE",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
  },
  loadingCardPhone: {
    borderRadius: 20,
    padding: 18,
  },
  loadingTitle: {
    marginTop: 14,
    color: "#29440F",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  loadingText: {
    color: "#5F6E53",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  tripCard: {
    backgroundColor: "#F6F8EE",
    borderRadius: 26,
    padding: 20,
    marginBottom: 18,
    shadowColor: "#1E2A12",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  tripCardPhone: {
    borderRadius: 22,
    padding: 14,
  },
  topRow: {
    flexDirection: "row",
    marginBottom: 18,
  },
  topRowStacked: {
    flexDirection: "column",
  },
  imagePanel: {
    flex: 1,
    marginRight: 14,
  },
  imagePanelStacked: {
    marginRight: 0,
    marginBottom: 12,
  },
  mapPanel: {
    flex: 1,
  },
  heroImage: {
    width: "100%",
    height: 240,
    borderRadius: 22,
    backgroundColor: "#E0E8D0",
  },
  heroImagePhone: {
    height: 180,
    borderRadius: 18,
  },
  imageFallback: {
    height: 240,
    borderRadius: 22,
    backgroundColor: "#EAF3DE",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  imageFallbackPhone: {
    height: 180,
    borderRadius: 18,
    padding: 16,
  },
  imageFallbackTitle: {
    color: "#29440F",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  imageFallbackTitlePhone: {
    fontSize: 18,
    lineHeight: 24,
  },
  imageFallbackText: {
    color: "#5F6E53",
    fontSize: 14,
    textAlign: "center",
  },
  mapImage: {
    width: "100%",
    height: 240,
    borderRadius: 20,
    backgroundColor: "#DDE8C7",
    overflow: "hidden",
  },
  mapImagePhone: {
    height: 180,
    borderRadius: 18,
  },
  mapFrameContainer: {
    width: "100%",
    height: 196,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#DDE8C7",
  },
  previewTapContainer: {
    position: "relative",
    width: "100%",
  },
  expandButton: {
    marginTop: 10,
    backgroundColor: "#FFF2DA",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  expandButtonPhone: {
    marginTop: 8,
    paddingVertical: 10,
  },
  expandButtonText: {
    color: "#8B5611",
    fontWeight: "800",
  },
  mapFallback: {
    height: 196,
    borderRadius: 20,
    backgroundColor: "#EEF4E5",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  mapFallbackText: {
    color: "#627254",
    fontSize: 13,
    textAlign: "center",
  },
  tripHeader: {
    marginBottom: 14,
  },
  tripHeaderText: {
    flex: 1,
  },
  tripTitle: {
    color: "#29440F",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  tripTitlePhone: {
    fontSize: 19,
    lineHeight: 24,
  },
  tripDestination: {
    color: "#5A6E41",
    fontSize: 15,
    fontWeight: "700",
  },
  popularityBadge: {
    backgroundColor: "#FFF2DA",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  popularityBadgeText: {
    color: "#8B5611",
    fontSize: 12,
    fontWeight: "800",
  },
  tripWhy: {
    color: "#3C4B30",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10,
  },
  popularityText: {
    color: "#6A5731",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  sectionBlock: {
    marginTop: 6,
  },
  sectionTitle: {
    color: "#3B6D11",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  sectionText: {
    color: "#46563A",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  saveButton: {
    marginTop: 18,
    backgroundColor: "#639922",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveButtonPhone: {
    marginTop: 14,
    borderRadius: 14,
    paddingVertical: 12,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonSaved: {
    backgroundColor: "#E4EFD0",
    borderWidth: 1,
    borderColor: "#C8DAA5",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  saveButtonTextSaved: {
    color: "#3B6D11",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(18, 27, 10, 0.54)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 900,
    backgroundColor: "#FAFCF5",
    borderRadius: 28,
    padding: 20,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  modalHeaderText: {
    flex: 1,
    paddingRight: 12,
  },
  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF4E5",
    borderWidth: 1,
    borderColor: "#DDE8C7",
  },
  modalTitle: {
    color: "#29440F",
    fontSize: 24,
    fontWeight: "800",
  },
  modalHeroImage: {
    width: "100%",
    height: 520,
    borderRadius: 22,
    backgroundColor: "#DDE8C7",
  },
  modalHeroImageWrap: {
    position: "relative",
  },
  modalThumbnailScroll: {
    marginTop: 14,
  },
  modalThumbnailRow: {
    paddingBottom: 4,
  },
  modalThumbnailImage: {
    width: 110,
    height: 82,
    borderRadius: 16,
    backgroundColor: "#DDE8C7",
    marginRight: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  modalThumbnailImageActive: {
    borderColor: "#5C8C1F",
  },
  modalMapImage: {
    width: "100%",
    height: 420,
    backgroundColor: "#DDE8C7",
  },
  previewMapWebView: {
    flex: 1,
    backgroundColor: "#DDE8C7",
  },
  modalMapWebView: {
    flex: 1,
    backgroundColor: "#DDE8C7",
  },
  zoomableMapRoot: {
    width: "100%",
  },
  zoomableMapViewport: {
    width: "100%",
    height: 420,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#DDE8C7",
  },
  zoomableMapContent: {
    width: "100%",
    height: "100%",
  },
  mapZoomControls: {
    position: "absolute",
    left: 14,
    top: 14,
  },
  mapZoomButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(250, 252, 245, 0.92)",
    borderWidth: 1,
    borderColor: "#DDE8C7",
    marginBottom: 10,
  },
});
