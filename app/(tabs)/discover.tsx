import { MaterialIcons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { cityMatchesSearch, getCitiesForCountry } from "../../utils/cities";
import { getCountriesSorted, getCountryName, type Country } from "../../utils/countries";
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
  filterDiscoverTripsByFilters,
  GEMINI_MODEL,
  extractDiscoverProfile,
  generateTripsWithGemini,
  getDiscoverProfileSignature,
  getDiscoverSearchFiltersSignature,
  getLocalDateKey,
  isTripGenerationError,
  getTripGenerationErrorMessage,
  parseStoredDiscoverData,
  resolveDiscoverOriginCoordinates,
  type DiscoverSearchFilters,
  type DiscoverProfile,
  type DiscoverSettlementType,
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

function getTripImageUrls(trip: TripRecommendation) {
  if (trip.imageUrls?.length) {
    return trip.imageUrls;
  }

  return trip.imageUrl ? [trip.imageUrl] : [];
}

function parseDistanceInput(value: string) {
  const normalizedValue = value.trim().replace(",", ".");

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return null;
  }

  return parsedValue;
}

function parseCountriesInput(value: string) {
  return value
    .split(/[,;\n]/)
    .map((country) => country.trim())
    .filter((country, index, array) => country && array.indexOf(country) === index);
}

function formatCountriesInput(countries: string[]) {
  return countries.join(", ");
}

function getDefaultDiscoverFilters(profile: DiscoverProfile | null): DiscoverSearchFilters {
  return {
    countries: [],
    destinationQuery: "",
    maxDistanceKm: null,
    minDistanceKm: 0,
    originLabel: profile?.personalProfile.homeBase || "",
    originLatitude: null,
    originLongitude: null,
    settlementTypes: ["city", "village"],
  };
}

function getDiscoverUiCopy(language: string) {
  if (language === "bg") {
    return {
      activeFiltersLabel: "Активно търсене",
      countriesHint: "Пример: България, Гърция, Румъния",
      countriesLabel: "Държави",
      currentOriginButton: "Настояща от профила",
      emptyState:
        "Няма намерени места по тези условия. Пробвай с по-широк диапазон или повече държави.",
      maxDistanceLabel: "До км",
      minDistanceLabel: "От км",
      originHint: "Например: Пловдив, България",
      originLabel: "Начална точка",
      settlementTypesLabel: "Тип на дестинацията",
      settlementTypeCity: "Градове",
      settlementTypeVillage: "Села",
      originPickerEmpty: "Избери държава",
      originPickerSelectCountry: "Избери държава",
      originPickerSelectCity: "Избери град",
      originPickerSearchCountry: "Търси държава...",
      originPickerSearchCity: "Търси град...",
      profileOriginLabel: "Текуща точка от профила",
      refreshButton: "Обнови",
      searchButton: "Търси",
      searchCardTitle: "Търсене по разстояние и държави",
      searchErrorInvalidRange: "Минималното разстояние трябва да е по-малко или равно на максималното.",
      searchErrorMissingOrigin: "Добави начална точка, за да търсим правилно по разстояние.",
      searchErrorOriginNotFound: "Не успях да намеря координати за тази начална точка. Опитай с по-точен град или село.",
    } as const;
  }

  return {
    activeFiltersLabel: "Active search",
    countriesHint: "Example: Bulgaria, Greece, Romania",
    countriesLabel: "Countries",
    currentOriginButton: "Current from profile",
    emptyState:
      "No places matched these filters. Try a wider distance range or more countries.",
    maxDistanceLabel: "Max km",
    minDistanceLabel: "Min km",
    originHint: "Example: Plovdiv, Bulgaria",
    originLabel: "Starting point",
    settlementTypesLabel: "Destination type",
    settlementTypeCity: "Cities",
    settlementTypeVillage: "Villages",
    originPickerEmpty: "Select country",
    originPickerSelectCountry: "Select country",
    originPickerSelectCity: "Select city",
    originPickerSearchCountry: "Search country...",
    originPickerSearchCity: "Search city...",
    profileOriginLabel: "Current location from profile",
    refreshButton: "Refresh",
    searchButton: "Search",
    searchCardTitle: "Search by distance and countries",
    searchErrorInvalidRange: "Minimum distance must be less than or equal to maximum distance.",
    searchErrorMissingOrigin: "Add a starting point so distance-based search can work.",
    searchErrorOriginNotFound:
      "We couldn't find coordinates for this starting point. Try a more specific city or village.",
  } as const;
}

const MIN_MAP_LEVEL = 1;
const MAX_MAP_LEVEL = 17;
const MAX_DAILY_REFRESHES = 100;   
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
  const isFocused = useIsFocused();
  const discoverCopy = getDiscoverUiCopy(language);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DiscoverProfile | null>(null);
  const [discoverData, setDiscoverData] = useState<StoredDiscoverData | null>(null);
  const [originInput, setOriginInput] = useState("");
  const [minDistanceInput, setMinDistanceInput] = useState("0");
  const [maxDistanceInput, setMaxDistanceInput] = useState("");
  const [countriesInput, setCountriesInput] = useState("");
  const [destinationTypeInput, setDestinationTypeInput] = useState("");
  const [settlementTypesInput, setSettlementTypesInput] = useState<DiscoverSettlementType[]>([
    "city",
    "village",
  ]);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [savedSourceKeys, setSavedSourceKeys] = useState<string[]>([]);
  const [savingTripKey, setSavingTripKey] = useState<string | null>(null);
  const [expandedPreview, setExpandedPreview] = useState<ExpandedPreviewState>(null);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const [originPickerVisible, setOriginPickerVisible] = useState(false);
  const [originPickerStep, setOriginPickerStep] = useState<"country" | "city">("country");
  const [originCountrySearch, setOriginCountrySearch] = useState("");
  const [originCitySearch, setOriginCitySearch] = useState("");
  const [selectedOriginCountryCode, setSelectedOriginCountryCode] = useState("");
  const [selectedOriginCountryName, setSelectedOriginCountryName] = useState("");
  const previewImageUrls =
    expandedPreview?.kind === "image" ? getTripImageUrls(expandedPreview.trip) : [];
  const hasRequestedInitialTripsRef = useRef(false);
  const metadataRepairKeyRef = useRef<string | null>(null);
  const hydratedFiltersSignatureRef = useRef<string | null>(null);
  const incomingOriginAppliedRef = useRef<string | null>(null);

  const incomingOriginParam = useLocalSearchParams<{ origin?: string | string[] }>().origin;
  const incomingOrigin = Array.isArray(incomingOriginParam)
    ? incomingOriginParam[0] ?? ""
    : incomingOriginParam ?? "";

  const sortedCountries = useMemo(() => getCountriesSorted(language), [language]);
  const filteredOriginCountries = useMemo(() => {
    const q = originCountrySearch.trim().toLowerCase();
    if (!q) return sortedCountries;
    return sortedCountries.filter((c) => getCountryName(c, language).toLowerCase().includes(q));
  }, [originCountrySearch, language, sortedCountries]);
  const originCitiesForSelected = useMemo(
    () => getCitiesForCountry(selectedOriginCountryCode),
    [selectedOriginCountryCode]
  );
  const filteredOriginCities = useMemo(() => {
    const q = originCitySearch.trim();
    if (!q) return originCitiesForSelected;
    return originCitiesForSelected.filter((c) => cityMatchesSearch(c.name, q));
  }, [originCitySearch, originCitiesForSelected]);

  const originParts = originInput.split(", ");
  const originCity = originParts.length >= 2 ? originParts[0] : "";
  const originCountry = originParts.length >= 2 ? originParts.slice(1).join(", ") : originInput;

  const handleSelectOriginCountry = (country: Country) => {
    const countryName = getCountryName(country, language);
    setSelectedOriginCountryCode(country.code);
    setSelectedOriginCountryName(countryName);
    setOriginCountrySearch("");
    setOriginCitySearch("");
    setOriginPickerStep("city");
  };

  const handleSelectOriginCity = (cityName: string) => {
    const countryName = selectedOriginCountryName || originCountry;
    if (countryName) {
      setOriginInput(`${cityName}, ${countryName}`);
    }
    setOriginPickerVisible(false);
    setOriginPickerStep("country");
    setSelectedOriginCountryCode("");
    setSelectedOriginCountryName("");
    setOriginCountrySearch("");
    setOriginCitySearch("");
  };

  const closeOriginPicker = () => {
    setOriginPickerVisible(false);
    setOriginPickerStep("country");
    setSelectedOriginCountryCode("");
    setSelectedOriginCountryName("");
    setOriginCountrySearch("");
    setOriginCitySearch("");
  };

  const openOriginPicker = () => {
    setOriginPickerStep("country");
    setOriginCountrySearch("");
    setOriginCitySearch("");
    setSelectedOriginCountryCode("");
    setSelectedOriginCountryName("");
    setOriginPickerVisible(true);
  };

  const todayKey = getLocalDateKey();
  const currentProfileOrigin = profile?.personalProfile.homeBase.trim() ?? "";
  const refreshCountToday =
    discoverData?.lastRefreshDateKey === todayKey
      ? discoverData.refreshCountForDate
      : 0;
  const refreshLimitReached = refreshCountToday >= MAX_DAILY_REFRESHES;

  useEffect(() => {
    const trimmed = incomingOrigin.trim();
    if (!trimmed) {
      return;
    }
    if (incomingOriginAppliedRef.current === trimmed) {
      return;
    }
    if (!profile && !discoverData) {
      return;
    }
    incomingOriginAppliedRef.current = trimmed;
    setOriginInput(trimmed);
  }, [discoverData, incomingOrigin, profile]);

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
      currentDiscoverData: StoredDiscoverData | null,
      filters: DiscoverSearchFilters
    ) => {
      try {
        setGenerating(true);
        setError("");

        const generatedTrips = await generateTripsWithGemini(
          profileData,
          previousTrips,
          filters,
          languageForPrompt
        );
        const enrichedTrips = await enrichDiscoverTrips(generatedTrips.trips);
        const matchingTrips = filterDiscoverTripsByFilters(enrichedTrips.trips, filters);
        const generatedAtMs = Date.now();
        const currentRefreshCountForDate =
          currentDiscoverData?.lastRefreshDateKey === todayKey
            ? currentDiscoverData.refreshCountForDate
            : 0;
        const nextLastRefreshDateKey = isManualRefresh
          ? todayKey
          : currentDiscoverData?.lastRefreshDateKey ?? null;
        const nextRefreshCountForDate = isManualRefresh
          ? currentRefreshCountForDate + 1
          : currentDiscoverData?.refreshCountForDate ?? 0;

        const nextDiscoverData: StoredDiscoverData = {
          filters,
          generatedAtMs,
          lastRefreshDateKey: nextLastRefreshDateKey,
          language: languageForPrompt,
          profileSignature: getDiscoverProfileSignature(profileData, filters),
          refreshCountForDate: nextRefreshCountForDate,
          sourceModel: GEMINI_MODEL,
          summary: matchingTrips.length > 0 ? generatedTrips.summary : "",
          trips: matchingTrips,
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
          const storedFilters = storedDiscoverData?.filters ?? getDefaultDiscoverFilters(discoverProfile);
          const storedFiltersSignature = getDiscoverSearchFiltersSignature(storedFilters);
          if (hydratedFiltersSignatureRef.current !== storedFiltersSignature) {
            hydratedFiltersSignatureRef.current = storedFiltersSignature;
            setOriginInput(storedFilters.originLabel);
            setMinDistanceInput(
              storedFilters.minDistanceKm !== null ? String(storedFilters.minDistanceKm) : "0"
            );
            setMaxDistanceInput(
              storedFilters.maxDistanceKm !== null ? String(storedFilters.maxDistanceKm) : ""
            );
            setCountriesInput(formatCountriesInput(storedFilters.countries));
            setDestinationTypeInput(storedFilters.destinationQuery ?? "");
            setSettlementTypesInput(
              storedFilters.settlementTypes.length === 0
                ? ["city", "village"]
                : storedFilters.settlementTypes
            );
          }
          const currentProfileSignature = getDiscoverProfileSignature(
            discoverProfile,
            storedFilters
          );

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
            isFocused &&
            (!storedDiscoverData || storedDiscoverData.trips.length === 0) &&
            !hasRequestedInitialTripsRef.current
          ) {
            hasRequestedInitialTripsRef.current = true;
            void generateAndStoreTripsRef.current(
              discoverProfile,
              nextUser,
              false,
              [],
              storedDiscoverData,
              storedFilters
            );
          } else if (
            isFocused &&
            storedDiscoverData?.trips.length &&
            (storedDiscoverData.language !== languageForPromptRef.current ||
              storedDiscoverData.profileSignature !== currentProfileSignature) &&
            !hasRequestedInitialTripsRef.current
          ) {
            hasRequestedInitialTripsRef.current = true;
            void generateAndStoreTripsRef.current(
              discoverProfile,
              nextUser,
              false,
              storedDiscoverData.trips,
              storedDiscoverData,
              storedFilters
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
  }, [isFocused, router]);

  // Regenerate discover trips when the UI language changes
  useEffect(() => {
    if (!isFocused) return;
    if (!user || !profile || generating) return;
    if (!discoverData?.trips.length) return;
    if (discoverData.language === languageForPrompt) return;

    void generateAndStoreTripsRef.current(
      profile,
      user,
      false,
      discoverData.trips,
      discoverData,
      discoverData.filters ?? getDefaultDiscoverFilters(profile)
    );
  }, [discoverData, generating, isFocused, languageForPrompt, profile, user]);

  const handleSearch = async () => {
    if (!user || !profile || generating || refreshLimitReached) {
      return;
    }

    const nextMinDistanceKm = parseDistanceInput(minDistanceInput) ?? 0;
    const nextMaxDistanceKm = parseDistanceInput(maxDistanceInput);
    const nextOriginLabel = originInput.trim() || profile.personalProfile.homeBase || "";
    const nextCountries = parseCountriesInput(countriesInput);
    const nextDestinationQuery = destinationTypeInput.trim();

    if (
      nextMinDistanceKm !== null &&
      nextMaxDistanceKm !== null &&
      nextMinDistanceKm > nextMaxDistanceKm
    ) {
      setError(discoverCopy.searchErrorInvalidRange);
      return;
    }

    if (
      (nextMinDistanceKm !== null || nextMaxDistanceKm !== null || nextCountries.length > 0) &&
      !nextOriginLabel
    ) {
      setError(discoverCopy.searchErrorMissingOrigin);
      return;
    }

    const resolvedOriginCoordinates =
      nextOriginLabel &&
      (nextMinDistanceKm !== null || nextMaxDistanceKm !== null || nextCountries.length > 0)
        ? await resolveDiscoverOriginCoordinates(nextOriginLabel)
        : { latitude: null, longitude: null };

    if (
      nextOriginLabel &&
      (nextMinDistanceKm !== null || nextMaxDistanceKm !== null) &&
      (resolvedOriginCoordinates.latitude === null || resolvedOriginCoordinates.longitude === null)
    ) {
      setError(discoverCopy.searchErrorOriginNotFound);
      return;
    }

    const nextSettlementTypes: DiscoverSettlementType[] =
      settlementTypesInput.length === 0 ? ["city", "village"] : settlementTypesInput;

    const nextFilters: DiscoverSearchFilters = {
      countries: nextCountries,
      destinationQuery: nextDestinationQuery,
      maxDistanceKm: nextMaxDistanceKm,
      minDistanceKm: nextMinDistanceKm,
      originLabel: nextOriginLabel,
      originLatitude: resolvedOriginCoordinates.latitude,
      originLongitude: resolvedOriginCoordinates.longitude,
      settlementTypes: nextSettlementTypes,
    };

    hydratedFiltersSignatureRef.current = getDiscoverSearchFiltersSignature(nextFilters);
    await generateAndStoreTrips(profile, user, true, [], discoverData, nextFilters);
  };

  const handleUseProfileOrigin = () => {
    if (!currentProfileOrigin) {
      return;
    }

    setOriginInput(currentProfileOrigin);
  };

  const handleRefresh = async () => {
    if (!profile || generating) {
      return;
    }

    const defaultFilters = getDefaultDiscoverFilters(profile);
    const nextDiscoverData: StoredDiscoverData = {
      filters: defaultFilters,
      generatedAtMs: discoverData?.generatedAtMs ?? null,
      language: discoverData?.language ?? languageForPrompt,
      lastRefreshDateKey: discoverData?.lastRefreshDateKey ?? null,
      profileSignature: getDiscoverProfileSignature(profile, defaultFilters),
      refreshCountForDate: discoverData?.refreshCountForDate ?? 0,
      sourceModel: discoverData?.sourceModel ?? GEMINI_MODEL,
      summary: discoverData?.summary ?? "",
      trips: discoverData?.trips ?? [],
    };

    hydratedFiltersSignatureRef.current = getDiscoverSearchFiltersSignature(defaultFilters);
    setError("");
    setOriginInput(defaultFilters.originLabel);
    setMinDistanceInput(String(defaultFilters.minDistanceKm ?? 0));
    setMaxDistanceInput(
      defaultFilters.maxDistanceKm !== null ? String(defaultFilters.maxDistanceKm) : ""
    );
    setCountriesInput(formatCountriesInput(defaultFilters.countries));
    setDestinationTypeInput(defaultFilters.destinationQuery);
    setSettlementTypesInput(
      defaultFilters.settlementTypes.length === 0 ? ["city", "village"] : defaultFilters.settlementTypes
    );
    setDiscoverData(nextDiscoverData);

    if (!user) {
      return;
    }

    await setDoc(
      doc(db, "profiles", user.uid),
      {
        discover: nextDiscoverData,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
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
          {/* ── Instagram-style minimal top bar ── */}
          <Animated.View
            entering={FadeInDown.duration(400).springify()}
            style={styles.topBar}
          >
            <Text style={[styles.brandTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {t("tab.discover")}
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

          <Animated.View
            entering={FadeInDown.delay(80).duration(350).springify()}
            style={[
              styles.searchCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.searchCardHeader}>
              <Text style={[styles.searchCardTitle, { color: colors.textPrimary }]}>
                {discoverCopy.searchCardTitle}
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={generating || refreshLimitReached}
                onPress={() => {
                  void handleRefresh();
                }}
                style={[
                  styles.searchHeaderRefreshButton,
                  { backgroundColor: colors.accent },
                  (generating || refreshLimitReached) && styles.refreshButtonDisabled,
                ]}
              >
                <MaterialIcons name="refresh" size={16} color={colors.buttonTextOnAction} />
                <Text
                  style={[
                    styles.searchHeaderRefreshButtonText,
                    { color: colors.buttonTextOnAction },
                  ]}
                >
                  {discoverCopy.refreshButton}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.searchFieldLabel, { color: colors.textSecondary }]}>
              {discoverCopy.originLabel}
            </Text>
            <Pressable
              onPress={openOriginPicker}
              style={[
                styles.searchInput,
                styles.originSelector,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.originSelectorText,
                  { color: originInput ? colors.textPrimary : colors.textMuted },
                ]}
                numberOfLines={1}
              >
                {originInput || discoverCopy.originPickerEmpty}
              </Text>
              <MaterialIcons name="expand-more" size={20} color={colors.textMuted} />
            </Pressable>
            {currentProfileOrigin ? (
              <View style={styles.profileOriginRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleUseProfileOrigin}
                  style={[
                    styles.profileOriginButton,
                    { backgroundColor: colors.cardAlt, borderColor: colors.border },
                  ]}
                >
                  <MaterialIcons name="my-location" size={14} color={colors.accent} />
                  <Text style={[styles.profileOriginButtonText, { color: colors.textPrimary }]}>
                    {language === "bg"
                      ? `Ползвай локацията от профила: ${currentProfileOrigin}`
                      : `${discoverCopy.currentOriginButton}: ${currentProfileOrigin}`}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={[styles.searchFieldLabel, { color: colors.textSecondary }]}>
              {discoverCopy.settlementTypesLabel}
            </Text>
            <TextInput
              value={destinationTypeInput}
              onChangeText={setDestinationTypeInput}
              placeholder={
                language === "bg"
                  ? "Например: море, планина, спа, природа"
                  : "Example: beach, mountains, spa, nature"
              }
              placeholderTextColor={colors.textMuted}
              style={[
                styles.searchInput,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
            />

            <View style={styles.distanceRow}>
              <View style={styles.distanceField}>
                <Text style={[styles.searchFieldLabel, { color: colors.textSecondary }]}>
                  {discoverCopy.minDistanceLabel}
                </Text>
                <TextInput
                  value={minDistanceInput}
                  onChangeText={setMinDistanceInput}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={[
                    styles.searchInput,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                    },
                  ]}
                />
              </View>

              <View style={styles.distanceField}>
                <Text style={[styles.searchFieldLabel, { color: colors.textSecondary }]}>
                  {discoverCopy.maxDistanceLabel}
                </Text>
                <TextInput
                  value={maxDistanceInput}
                  onChangeText={setMaxDistanceInput}
                  placeholder="500"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={[
                    styles.searchInput,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                    },
                  ]}
                />
              </View>
            </View>

              <Text style={[styles.searchFieldLabel, { color: colors.textSecondary }]}>
                {language === "bg"
                  ? "Държави през, които може да минеш докато пътуваш до желаната дестинация"
                  : discoverCopy.countriesLabel}
              </Text>
            <TextInput
              value={countriesInput}
              onChangeText={setCountriesInput}
              placeholder={discoverCopy.countriesHint}
              placeholderTextColor={colors.textMuted}
              multiline
              style={[
                styles.searchInput,
                styles.countriesInput,
                {
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
            />

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleSearch}
              disabled={generating || refreshLimitReached}
              style={[
                styles.searchActionButton,
                { backgroundColor: colors.accent },
                (generating || refreshLimitReached) && styles.topBarIconButtonDisabled,
              ]}
            >
              {generating ? (
                <ActivityIndicator size="small" color={colors.buttonTextOnAction} />
              ) : (
                <>
                  <MaterialIcons
                    name="travel-explore"
                    size={18}
                    color={colors.buttonTextOnAction}
                  />
                  <Text style={[styles.searchActionText, { color: colors.buttonTextOnAction }]}>
                    {discoverCopy.searchButton}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

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
          {!generating && discoverData && discoverData.trips.length === 0 ? (
            <View
              style={[
                styles.loadingCard,
                {
                  backgroundColor: colors.cardAlt,
                  borderColor: colors.border,
                  borderWidth: 1,
                },
              ]}
            >
              <MaterialIcons name="search-off" size={28} color={colors.accent} />
              <Text style={[styles.loadingTitle, { color: colors.textPrimary }]}>
                {discoverCopy.emptyState}
              </Text>
            </View>
          ) : null}

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

      {/* Origin picker (country -> city) */}
      <Modal
        animationType="none"
        transparent
        visible={originPickerVisible}
        onRequestClose={closeOriginPicker}
      >
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          onPress={closeOriginPicker}
        >
          <Pressable
            style={[
              styles.originPickerSheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.originPickerHeader}>
              {originPickerStep === "city" ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setOriginPickerStep("country");
                    setOriginCitySearch("");
                  }}
                  style={[
                    styles.originPickerIconButton,
                    { backgroundColor: colors.inputBackground, borderColor: colors.border },
                  ]}
                >
                  <MaterialIcons name="arrow-back" size={18} color={colors.textPrimary} />
                </TouchableOpacity>
              ) : (
                <View style={styles.originPickerHeaderSpacer} />
              )}
              <Text style={[styles.originPickerTitle, { color: colors.textPrimary }]}>
                {originPickerStep === "country"
                  ? discoverCopy.originPickerSelectCountry
                  : discoverCopy.originPickerSelectCity}
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={closeOriginPicker}
                style={[
                  styles.originPickerIconButton,
                  { backgroundColor: colors.inputBackground, borderColor: colors.border },
                ]}
              >
                <MaterialIcons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {originPickerStep === "country" ? (
              <>
                <TextInput
                  style={[
                    styles.originPickerSearchInput,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                    },
                  ]}
                  placeholder={discoverCopy.originPickerSearchCountry}
                  placeholderTextColor={colors.textMuted}
                  value={originCountrySearch}
                  onChangeText={setOriginCountrySearch}
                  autoFocus
                />
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {filteredOriginCountries.map((country) => {
                    const name = getCountryName(country, language);
                    const isSelected = (selectedOriginCountryName || originCountry) === name;
                    return (
                      <Pressable
                        key={country.code}
                        style={[
                          styles.originPickerItem,
                          isSelected && { backgroundColor: colors.cardAlt },
                        ]}
                        onPress={() => handleSelectOriginCountry(country)}
                      >
                        <Text
                          style={[
                            styles.originPickerItemText,
                            { color: isSelected ? colors.accent : colors.textPrimary },
                            isSelected && { fontWeight: FontWeight.semibold },
                          ]}
                        >
                          {name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <>
                <View
                  style={[styles.originPickerCountryPill, { backgroundColor: colors.cardAlt }]}
                >
                  <MaterialIcons name="place" size={16} color={colors.accent} />
                  <Text
                    style={[styles.originPickerCountryPillText, { color: colors.accent }]}
                    numberOfLines={1}
                  >
                    {selectedOriginCountryName || originCountry}
                  </Text>
                </View>
                <TextInput
                  style={[
                    styles.originPickerSearchInput,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                    },
                  ]}
                  placeholder={discoverCopy.originPickerSearchCity}
                  placeholderTextColor={colors.textMuted}
                  value={originCitySearch}
                  onChangeText={setOriginCitySearch}
                  autoFocus
                />
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {filteredOriginCities.map((city, index) => {
                    const name = city.name;
                    const isSelected = originCity === name;
                    return (
                      <Pressable
                        key={`${name}-${city.stateCode}-${index}`}
                        style={[
                          styles.originPickerItem,
                          isSelected && { backgroundColor: colors.cardAlt },
                        ]}
                        onPress={() => handleSelectOriginCity(name)}
                      >
                        <Text
                          style={[
                            styles.originPickerItemText,
                            { color: isSelected ? colors.accent : colors.textPrimary },
                            isSelected && { fontWeight: FontWeight.semibold },
                          ]}
                        >
                          {name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
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

  // ── Instagram-style top bar ──
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    paddingTop: Spacing.sm,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: FontWeight.black,
    letterSpacing: 0.3,
  },
  topBarIconButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    flexDirection: "row",
    gap: Spacing.xs,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    justifyContent: "center",
  },
  topBarActionText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
  },
  topBarIconButtonDisabled: {
    opacity: 0.35,
  },
  topBarSubtitle: {
    ...TypeScale.labelSm,
    marginBottom: Spacing.md,
    marginTop: 4,
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

  // Search filters
  searchCard: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  searchCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: Spacing.md,
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  searchCardTitle: {
    ...TypeScale.titleSm,
    fontWeight: FontWeight.bold,
    flex: 1,
  },
  searchHeaderRefreshButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    flexDirection: "row",
    gap: Spacing.xs,
    minHeight: 38,
    paddingHorizontal: Spacing.md,
  },
  searchHeaderRefreshButtonText: {
    ...TypeScale.labelMd,
    fontWeight: FontWeight.bold,
  },
  searchFieldLabel: {
    ...TypeScale.labelMd,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  searchInput: {
    ...TypeScale.bodyMd,
    borderRadius: Radius.lg,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  originSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  originSelectorText: {
    flex: 1,
    ...TypeScale.bodyMd,
  },
  originPickerSheet: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    maxHeight: "80%",
    width: "92%",
    alignSelf: "center",
    borderWidth: 1,
    ...shadow("lg"),
  },
  originPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  originPickerTitle: {
    ...TypeScale.titleMd,
    flex: 1,
    fontWeight: FontWeight.bold,
    textAlign: "center",
  },
  originPickerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  originPickerHeaderSpacer: {
    width: 36,
    height: 36,
  },
  originPickerSearchInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    ...TypeScale.bodyMd,
  },
  originPickerCountryPill: {
    alignItems: "center",
    borderRadius: Radius.full,
    flexDirection: "row",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  originPickerCountryPillText: {
    ...TypeScale.labelLg,
    flex: 1,
    fontWeight: FontWeight.semibold,
  },
  originPickerItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    marginBottom: 2,
  },
  originPickerItemText: {
    ...TypeScale.bodyMd,
  },
  countriesInput: {
    minHeight: 78,
    textAlignVertical: "top",
  },
  profileOriginRow: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  profileOriginText: {
    ...TypeScale.labelSm,
  },
  profileOriginButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.xs,
    minHeight: 36,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  profileOriginButtonText: {
    ...TypeScale.labelSm,
    fontWeight: FontWeight.semibold,
  },
  distanceRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  distanceField: {
    flex: 1,
  },
  searchActionButton: {
    alignItems: "center",
    borderRadius: Radius.full,
    flexDirection: "row",
    gap: Spacing.xs,
    justifyContent: "center",
    marginTop: Spacing.lg,
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
  },
  searchActionText: {
    ...TypeScale.labelLg,
    fontWeight: FontWeight.bold,
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
  filterSummaryCard: {
    alignItems: "flex-start",
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
  },
  filterSummaryText: {
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
