import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type DiscoverTripMapProps = {
  attractions: string[];
  country: string;
  destination: string;
  height?: number;
  latitude: number | null;
  longitude: number | null;
  title: string;
};

type MapMarker = {
  kind: "attraction" | "settlement";
  label: string;
  latitude: number;
  longitude: number;
};

type GeocodingResult = {
  latitude?: number;
  longitude?: number;
};

const geocodeCache = new Map<string, Promise<MapMarker | null>>();

function sanitizeString(value: string) {
  return value.trim();
}

function dedupeStrings(values: string[]) {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

function hasCoordinates(
  entry: GeocodingResult | undefined
): entry is { latitude: number; longitude: number } {
  return typeof entry?.latitude === "number" && typeof entry.longitude === "number";
}

async function geocodeMarker(candidates: string[]): Promise<MapMarker | null> {
  const cacheKey = candidates.join("|").toLowerCase();

  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) ?? Promise.resolve(null);
  }

  const request = (async () => {
    for (const candidate of dedupeStrings(candidates.map(sanitizeString))) {
      if (!candidate) {
        continue;
      }

      try {
        const response = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
            candidate
          )}&count=1&language=en&format=json`
        );

        if (!response.ok) {
          continue;
        }

        const payload = (await response.json()) as {
          results?: GeocodingResult[];
        };

        const firstResult = payload.results?.find(hasCoordinates);

        if (firstResult) {
          return {
            kind: "attraction",
            label: candidate,
            latitude: firstResult.latitude,
            longitude: firstResult.longitude,
          } satisfies MapMarker;
        }
      } catch {}
    }

    return null;
  })();

  geocodeCache.set(cacheKey, request);
  return request;
}

function serializeForScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildMapDoc(markers: MapMarker[], center: { latitude: number; longitude: number }) {
  const serializedMarkers = serializeForScript(markers);
  const serializedCenter = serializeForScript(center);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    />
    <style>
      html, body, #map {
        height: 100%;
        margin: 0;
      }
      body {
        background: #eef4e5;
      }
      .leaflet-container {
        font-family: system-ui, sans-serif;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const center = ${serializedCenter};
      const markers = ${serializedMarkers};
      const map = L.map("map", {
        zoomControl: true,
        scrollWheelZoom: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const bounds = [];

      markers.forEach((marker) => {
        const color = marker.kind === "settlement" ? "#5c8c1f" : "#ba7517";
        const circle = L.circleMarker([marker.latitude, marker.longitude], {
          color,
          fillColor: color,
          fillOpacity: 0.92,
          radius: marker.kind === "settlement" ? 8 : 6,
          weight: 2,
        }).addTo(map);

        circle.bindPopup(marker.label);
        bounds.push([marker.latitude, marker.longitude]);
      });

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [26, 26] });
      } else {
        map.setView([center.latitude, center.longitude], 12);
      }
    </script>
  </body>
</html>`;
}

export default function DiscoverTripMap({
  attractions,
  country,
  destination,
  height = 196,
  latitude,
  longitude,
  title,
}: DiscoverTripMapProps) {
  const [markers, setMarkers] = useState<MapMarker[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (latitude === null || longitude === null) {
      setMarkers([]);
      return () => {
        cancelled = true;
      };
    }

    const settlementMarker: MapMarker = {
      kind: "settlement",
      label: title,
      latitude,
      longitude,
    };

    setMarkers([settlementMarker]);

    void (async () => {
      const nextAttractionMarkers = await Promise.all(
        attractions.slice(0, 4).map((attraction) =>
          geocodeMarker([
            `${attraction}, ${destination}`,
            `${attraction}, ${title}`,
            `${attraction}, ${country}`,
            attraction,
          ])
        )
      );

      if (cancelled) {
        return;
      }

      setMarkers([
        settlementMarker,
        ...nextAttractionMarkers.filter(
          (marker): marker is MapMarker => marker !== null
        ),
      ]);
    })();

    return () => {
      cancelled = true;
    };
  }, [attractions, country, destination, latitude, longitude, title]);

  const srcDoc = useMemo(() => {
    if (latitude === null || longitude === null) {
      return "";
    }

    return buildMapDoc(markers, { latitude, longitude });
  }, [latitude, longitude, markers]);

  if (latitude === null || longitude === null) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>Map coordinates not available</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frameWrap, { height }]}>
      <iframe
        srcDoc={srcDoc}
        style={styles.iframe as unknown as React.CSSProperties}
        title={`Map of ${title}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frameWrap: {
    borderRadius: 20,
    overflow: "hidden",
    width: "100%",
  },
  iframe: {
    borderWidth: 0,
    height: "100%",
    width: "100%",
  },
  fallback: {
    alignItems: "center",
    backgroundColor: "#EEF4E5",
    borderRadius: 20,
    justifyContent: "center",
    padding: 16,
    width: "100%",
  },
  fallbackText: {
    color: "#627254",
    fontSize: 13,
    textAlign: "center",
  },
});
