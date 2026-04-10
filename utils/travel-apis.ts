/**
 * Travel API integrations — Amadeus, Kiwi.com, OpenTripMap, OpenWeatherMap.
 * Each function checks if the API key is configured; returns empty results if not.
 * All prices normalized to EUR.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type FlightOffer = {
  airline: string;
  departure: string;
  arrival: string;
  duration: string;
  price: string;
  currency: string;
  bookingUrl: string;
  stops: number;
};

export type TransportOffer = {
  mode: "flight" | "bus" | "train" | "mixed";
  carrier: string;
  route: string;
  departure: string;
  duration: string;
  price: string;
  bookingUrl: string;
};

export type PointOfInterest = {
  name: string;
  kind: string;
  description: string;
  rating: number;
  lat: number;
  lon: number;
};

export type WeatherForecast = {
  date: string;
  tempMin: number;
  tempMax: number;
  description: string;
  icon: string;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function getEnv(key: string): string {
  return (process.env[key] ?? "").trim();
}

// ── Amadeus (flights + hotels) ──────────────────────────────────────────────

let amadeusToken: { token: string; expiresAt: number } | null = null;

async function getAmadeusToken(): Promise<string | null> {
  const key = getEnv("EXPO_PUBLIC_AMADEUS_API_KEY");
  const secret = getEnv("EXPO_PUBLIC_AMADEUS_API_SECRET");

  if (!key || !secret) return null;

  if (amadeusToken && Date.now() < amadeusToken.expiresAt) {
    return amadeusToken.token;
  }

  try {
    const response = await fetch("https://api.amadeus.com/v1/security/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(key)}&client_secret=${encodeURIComponent(secret)}`,
    });

    if (!response.ok) return null;

    const data = await response.json();
    amadeusToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return amadeusToken.token;
  } catch {
    return null;
  }
}

export async function searchAmadeusFlights(params: {
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
}): Promise<FlightOffer[]> {
  const token = await getAmadeusToken();
  if (!token) return [];

  try {
    const url = new URL("https://api.amadeus.com/v2/shopping/flight-offers");
    url.searchParams.set("originLocationCode", params.origin);
    url.searchParams.set("destinationLocationCode", params.destination);
    url.searchParams.set("departureDate", params.departureDate);
    url.searchParams.set("adults", String(params.adults));
    url.searchParams.set("currencyCode", "EUR");
    url.searchParams.set("max", "5");

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const offers: FlightOffer[] = (data.data ?? []).slice(0, 5).map((offer: any) => {
      const segment = offer.itineraries?.[0]?.segments?.[0];
      return {
        airline: segment?.carrierCode ?? "Unknown",
        departure: segment?.departure?.at ?? "",
        arrival: segment?.arrival?.at ?? "",
        duration: offer.itineraries?.[0]?.duration ?? "",
        price: `€${offer.price?.total ?? "?"}`,
        currency: "EUR",
        bookingUrl: `https://www.amadeus.com`,
        stops: (offer.itineraries?.[0]?.segments?.length ?? 1) - 1,
      };
    });

    return offers;
  } catch {
    return [];
  }
}

// ── Kiwi.com Tequila (flights, buses, trains — multi-modal) ─────────────────

export async function searchKiwiTransport(params: {
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
}): Promise<TransportOffer[]> {
  const apiKey = getEnv("EXPO_PUBLIC_KIWI_API_KEY");
  if (!apiKey) return [];

  try {
    const url = new URL("https://api.tequila.kiwi.com/v2/search");
    url.searchParams.set("fly_from", params.origin);
    url.searchParams.set("fly_to", params.destination);
    url.searchParams.set("date_from", params.departureDate.replace(/-/g, "/"));
    url.searchParams.set("date_to", params.departureDate.replace(/-/g, "/"));
    url.searchParams.set("adults", String(params.adults));
    url.searchParams.set("curr", "EUR");
    url.searchParams.set("limit", "6");
    url.searchParams.set("sort", "price");
    url.searchParams.set("vehicle_type", "aircraft,bus,train");

    const response = await fetch(url.toString(), {
      headers: { apikey: apiKey },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const offers: TransportOffer[] = (data.data ?? []).slice(0, 6).map((item: any) => {
      const routes = (item.route ?? []) as any[];
      const vehicleTypes = new Set(routes.map((r: any) => r.vehicle_type));
      let mode: TransportOffer["mode"] = "mixed";
      if (vehicleTypes.size === 1) {
        const vt = [...vehicleTypes][0];
        if (vt === "aircraft") mode = "flight";
        else if (vt === "bus") mode = "bus";
        else if (vt === "train") mode = "train";
      }

      return {
        mode,
        carrier: item.airlines?.join(", ") ?? routes[0]?.airline ?? "Unknown",
        route: `${item.cityFrom ?? ""} → ${item.cityTo ?? ""}`,
        departure: item.local_departure ?? "",
        duration: item.fly_duration ?? "",
        price: `€${item.price ?? "?"}`,
        bookingUrl: item.deep_link ?? `https://www.kiwi.com/deep?from=${params.origin}&to=${params.destination}`,
      };
    });

    return offers;
  } catch {
    return [];
  }
}

// ── OpenTripMap (points of interest / attractions) ──────────────────────────

export async function searchAttractions(params: {
  destination: string;
  limit?: number;
}): Promise<PointOfInterest[]> {
  const apiKey = getEnv("EXPO_PUBLIC_OPENTRIPMAP_API_KEY");
  if (!apiKey) return [];

  try {
    // Step 1: geocode destination
    const geoUrl = `https://api.opentripmap.com/0.1/en/places/geoname?name=${encodeURIComponent(params.destination)}&apikey=${apiKey}`;
    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) return [];

    const geo = await geoResponse.json();
    const { lat, lon } = geo;
    if (!lat || !lon) return [];

    // Step 2: find nearby attractions
    const limit = params.limit ?? 10;
    const placesUrl = `https://api.opentripmap.com/0.1/en/places/radius?radius=5000&lon=${lon}&lat=${lat}&kinds=interesting_places,museums,historic,architecture&rate=3&format=json&limit=${limit}&apikey=${apiKey}`;
    const placesResponse = await fetch(placesUrl);
    if (!placesResponse.ok) return [];

    const places = await placesResponse.json();
    return (places ?? []).map((place: any) => ({
      name: place.name || "Unknown attraction",
      kind: (place.kinds ?? "").split(",")[0] || "attraction",
      description: place.name || "",
      rating: place.rate ?? 0,
      lat: place.point?.lat ?? lat,
      lon: place.point?.lon ?? lon,
    }));
  } catch {
    return [];
  }
}

// ── OpenWeatherMap (5-day forecast) ─────────────────────────────────────────

export async function getWeatherForecast(params: {
  destination: string;
}): Promise<WeatherForecast[]> {
  const apiKey = getEnv("EXPO_PUBLIC_OPENWEATHER_API_KEY");
  if (!apiKey) return [];

  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(params.destination)}&appid=${apiKey}&units=metric&cnt=40`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    const dailyMap = new Map<string, { temps: number[]; desc: string; icon: string }>();

    for (const item of data.list ?? []) {
      const date = (item.dt_txt ?? "").split(" ")[0];
      if (!date) continue;

      const existing = dailyMap.get(date) ?? { temps: [], desc: "", icon: "" };
      existing.temps.push(item.main?.temp ?? 0);
      if (!existing.desc && item.weather?.[0]) {
        existing.desc = item.weather[0].description ?? "";
        existing.icon = item.weather[0].icon ?? "";
      }
      dailyMap.set(date, existing);
    }

    const forecasts: WeatherForecast[] = [];
    for (const [date, info] of dailyMap) {
      forecasts.push({
        date,
        tempMin: Math.round(Math.min(...info.temps)),
        tempMax: Math.round(Math.max(...info.temps)),
        description: info.desc,
        icon: info.icon,
      });
    }

    return forecasts.slice(0, 5);
  } catch {
    return [];
  }
}

// ── Unified search (calls all available APIs in parallel) ───────────────────

export type TravelSearchResults = {
  flights: FlightOffer[];
  transport: TransportOffer[];
  attractions: PointOfInterest[];
  weather: WeatherForecast[];
};

export async function searchAllTravelApis(params: {
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
}): Promise<TravelSearchResults> {
  const [flights, transport, attractions, weather] = await Promise.allSettled([
    searchAmadeusFlights(params),
    searchKiwiTransport(params),
    searchAttractions({ destination: params.destination }),
    getWeatherForecast({ destination: params.destination }),
  ]);

  return {
    flights: flights.status === "fulfilled" ? flights.value : [],
    transport: transport.status === "fulfilled" ? transport.value : [],
    attractions: attractions.status === "fulfilled" ? attractions.value : [],
    weather: weather.status === "fulfilled" ? weather.value : [],
  };
}

/**
 * Format search results into text that can be injected into the AI planner prompt.
 */
export function formatTravelSearchForPrompt(results: TravelSearchResults): string {
  const lines: string[] = [];

  if (results.transport.length > 0) {
    lines.push("LIVE TRANSPORT OPTIONS (from Kiwi.com):");
    for (const t of results.transport) {
      lines.push(`- ${t.mode.toUpperCase()}: ${t.carrier} | ${t.route} | ${t.price} | ${t.duration}`);
    }
    lines.push("");
  }

  if (results.flights.length > 0 && results.transport.length === 0) {
    lines.push("LIVE FLIGHT OPTIONS (from Amadeus):");
    for (const f of results.flights) {
      lines.push(`- ${f.airline} | ${f.price} | ${f.duration} | ${f.stops} stops`);
    }
    lines.push("");
  }

  if (results.attractions.length > 0) {
    lines.push("TOP ATTRACTIONS (from OpenTripMap):");
    for (const a of results.attractions.slice(0, 8)) {
      lines.push(`- ${a.name} (${a.kind})`);
    }
    lines.push("");
  }

  if (results.weather.length > 0) {
    lines.push("WEATHER FORECAST:");
    for (const w of results.weather) {
      lines.push(`- ${w.date}: ${w.tempMin}°C–${w.tempMax}°C, ${w.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
