/**
 * Free hotel search — no API keys, no signup required.
 * Uses MakCorps free endpoint + Geoapify places as fallback.
 */

export type FreeHotelOffer = {
  area: string;
  bookingUrl: string;
  imageUrl: string;
  name: string;
  note: string;
  priceAmount: number | null;
  priceCurrency: string;
  ratingLabel: string;
  sourceLabel: string;
  type: string;
};

type SearchFreeHotelsInput =
  | string
  | {
      adults?: number;
      checkInDate?: string;
      checkOutDate?: string;
      currency?: string;
      destination: string;
    };

function normalizeSearchFreeHotelsInput(input: SearchFreeHotelsInput) {
  if (typeof input === "string") {
    return {
      adults: 2,
      checkInDate: "",
      checkOutDate: "",
      currency: "EUR",
      destination: input,
    };
  }

  return {
    adults: Math.max(input.adults ?? 2, 1),
    checkInDate: input.checkInDate?.trim() || "",
    checkOutDate: input.checkOutDate?.trim() || "",
    currency: input.currency?.trim() || "EUR",
    destination: input.destination,
  };
}

function buildBookingHotelLookupUrl(params: {
  adults?: number;
  area?: string;
  checkInDate?: string;
  checkOutDate?: string;
  currency?: string;
  destination: string;
  hotelName: string;
}) {
  const query = [params.hotelName, params.area, params.destination]
    .map((item) => item?.trim() || "")
    .filter(Boolean)
    .join(", ");
  const adults = Math.max(params.adults ?? 2, 1);
  const rooms = Math.max(1, Math.ceil(adults / 2));
  const url = new URL("https://www.booking.com/searchresults.html");
  url.searchParams.set("ss", query || params.destination);

  if (params.checkInDate) {
    url.searchParams.set("checkin", params.checkInDate);
  }

  if (params.checkOutDate) {
    url.searchParams.set("checkout", params.checkOutDate);
  }

  url.searchParams.set("group_adults", String(adults));
  url.searchParams.set("no_rooms", String(rooms));
  url.searchParams.set("selected_currency", params.currency?.trim() || "EUR");
  return url.toString();
}

function buildExactHotelLookupUrl(params: {
  adults?: number;
  area?: string;
  checkInDate?: string;
  checkOutDate?: string;
  currency?: string;
  destination: string;
  hotelName: string;
}) {
  if (params.checkInDate && params.checkOutDate) {
    return buildBookingHotelLookupUrl(params);
  }

  const query = [params.hotelName, params.area, params.destination]
    .map((item) => item?.trim() || "")
    .filter(Boolean)
    .join(", ");

  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query || params.destination);
  return url.toString();
}

function normalizeExactHotelUrl(params: {
  adults?: number;
  area?: string;
  checkInDate?: string;
  checkOutDate?: string;
  currency?: string;
  destination: string;
  hotelName: string;
  rawUrl?: string;
}) {
  const rawUrl = params.rawUrl?.trim() || "";

  if (!rawUrl) {
    return buildExactHotelLookupUrl(params);
  }

  try {
    const parsedUrl = new URL(rawUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    const isGenericBookingSearch =
      hostname.includes("booking.com") && pathname.includes("/searchresults");
    const isGenericAirbnbSearch =
      hostname.includes("airbnb.") && pathname.includes("/s/");

    if (isGenericBookingSearch || isGenericAirbnbSearch) {
      return buildExactHotelLookupUrl(params);
    }

    return rawUrl;
  } catch {
    return buildExactHotelLookupUrl(params);
  }
}

// ── MakCorps Free Hotel API (no key needed) ─────────────────────────────────

async function searchMakCorps(input: ReturnType<typeof normalizeSearchFreeHotelsInput>): Promise<FreeHotelOffer[]> {
  try {
    const url = `https://api.makcorps.com/free/${encodeURIComponent(input.destination)}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const results = Array.isArray(data) ? data : data?.results ?? data?.data ?? [];

    return results
      .filter((item: any) => item && (item.name || item.hotel_name))
      .slice(0, 6)
      .map((item: any) => {
        const name = item.name || item.hotel_name || "Hotel";
        const rating = item.rating || item.review_score || item.stars || null;
        const area = item.location || item.address || item.city || input.destination;

        return {
          area,
          bookingUrl: normalizeExactHotelUrl({
            adults: input.adults,
            area,
            checkInDate: input.checkInDate,
            checkOutDate: input.checkOutDate,
            currency: input.currency,
            destination: input.destination,
            hotelName: name,
            rawUrl: item.url || item.booking_url || item.link,
          }),
          imageUrl: item.image || item.photo || item.thumbnail || "",
          name,
          note:
            item.description ||
            item.room_type ||
            `Exact Booking.com lookup prepared for your selected dates.`,
          priceAmount: null,
          priceCurrency: item.currency || "EUR",
          ratingLabel: rating ? `${rating}/10` : "",
          sourceLabel: "MakCorps",
          type: item.type || item.property_type || "Hotel",
        } satisfies FreeHotelOffer;
      });
  } catch {
    return [];
  }
}

// ── Geoapify Places API (no key needed for limited use) ─────────────────────

async function geocodeCity(city: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
    );
    if (!response.ok) return null;
    const data = await response.json();
    const result = data.results?.[0];
    if (!result?.latitude || !result?.longitude) return null;
    return { lat: result.latitude, lon: result.longitude };
  } catch {
    return null;
  }
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceInKm(
  left: { lat: number; lon: number },
  right: { lat: number; lon: number }
) {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLon = toRadians(right.lon - left.lon);
  const leftLatRad = toRadians(left.lat);
  const rightLatRad = toRadians(right.lat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(leftLatRad) *
      Math.cos(rightLatRad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildViewbox(params: { lat: number; lon: number; radiusKm: number }) {
  const latDelta = params.radiusKm / 111;
  const lonDelta =
    params.radiusKm / Math.max(1, 111 * Math.cos(toRadians(params.lat)));

  return [
    params.lon - lonDelta,
    params.lat + latDelta,
    params.lon + lonDelta,
    params.lat - latDelta,
  ].join(",");
}

async function searchGeoapifyHotels(
  input: ReturnType<typeof normalizeSearchFreeHotelsInput>
): Promise<FreeHotelOffer[]> {
  try {
    const coords = await geocodeCity(input.destination);
    if (!coords) return [];

    const url = `https://nominatim.openstreetmap.org/search?q=hotel&format=jsonv2&limit=12&addressdetails=1&bounded=1&viewbox=${encodeURIComponent(
      buildViewbox({
        lat: coords.lat,
        lon: coords.lon,
        radiusKm: 25,
      })
    )}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "CareTrip/1.0 (travel planning app)",
      },
    });

    if (!response.ok) return [];

    const places = await response.json();
    if (!Array.isArray(places)) return [];

    return places
      .filter((place: any) => place.display_name)
      .filter((place: any) => {
        const lat = toNumber(place.lat);
        const lon = toNumber(place.lon);

        if (lat === null || lon === null) {
          return false;
        }

        return distanceInKm(coords, { lat, lon }) <= 35;
      })
      .slice(0, 6)
      .map((place: any) => {
        const nameParts = (place.display_name || "").split(",");
        const name = nameParts[0]?.trim() || "Accommodation";
        const area = nameParts.slice(1, 3).join(",").trim() || input.destination;

        return {
          area,
          bookingUrl: buildExactHotelLookupUrl({
            adults: input.adults,
            area,
            checkInDate: input.checkInDate,
            checkOutDate: input.checkOutDate,
            currency: input.currency,
            destination: input.destination,
            hotelName: name,
          }),
          imageUrl: "",
          name,
          note: `Exact Booking.com lookup prepared from OpenStreetMap hotel data for your selected dates.`,
          priceAmount: null,
          priceCurrency: "EUR",
          ratingLabel: "",
          sourceLabel: "OpenStreetMap",
          type: place.type === "hostel" ? "Hostel" : place.type === "guest_house" ? "Guesthouse" : "Hotel",
        } satisfies FreeHotelOffer;
      });
  } catch {
    return [];
  }
}

// ── Combined search ─────────────────────────────────────────────────────────

export async function searchFreeHotels(input: SearchFreeHotelsInput): Promise<FreeHotelOffer[]> {
  const normalizedInput = normalizeSearchFreeHotelsInput(input);
  // Try MakCorps first (has prices), fall back to Geoapify/OSM (has names/locations)
  const [makcorps, osm] = await Promise.allSettled([
    searchMakCorps(normalizedInput),
    searchGeoapifyHotels(normalizedInput),
  ]);

  const makcorpsResults = makcorps.status === "fulfilled" ? makcorps.value : [];
  const osmResults = osm.status === "fulfilled" ? osm.value : [];

  // Dedupe by name
  const seen = new Set<string>();
  const combined: FreeHotelOffer[] = [];

  for (const offer of [...makcorpsResults, ...osmResults]) {
    const key = offer.name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(offer);
    }
  }

  return combined.slice(0, 6);
}
