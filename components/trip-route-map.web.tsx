import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";

import { useAppTheme } from "./app-theme-provider";
import {
  Spacing,
  Radius,
  TypeScale,
  FontWeight,
} from "../constants/design-system";

type TripStop = {
  latitude: number;
  longitude: number;
  dayLabel: string;
  title: string;
};

type TripRouteMapProps = {
  stops: TripStop[];
  style?: any;
};

function serializeForScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildRouteMapDoc(
  stops: TripStop[],
  accentColor: string
) {
  const serializedStops = serializeForScript(stops);

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
        background: #f5f5f5;
      }
      .leaflet-container {
        font-family: system-ui, sans-serif;
      }
      .stop-marker {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        color: #fff;
        font-weight: 700;
        font-size: 13px;
        line-height: 1;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const stops = ${serializedStops};
      const accent = ${serializeForScript(accentColor)};
      const map = L.map("map", {
        zoomControl: true,
        scrollWheelZoom: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const bounds = [];
      const polyCoords = [];

      stops.forEach(function (stop, index) {
        const icon = L.divIcon({
          className: "",
          html: '<div class="stop-marker" style="background:' + accent + '">' + (index + 1) + '</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const marker = L.marker([stop.latitude, stop.longitude], { icon: icon }).addTo(map);
        marker.bindPopup("<strong>" + stop.dayLabel + "</strong><br/>" + stop.title);

        bounds.push([stop.latitude, stop.longitude]);
        polyCoords.push([stop.latitude, stop.longitude]);
      });

      if (polyCoords.length > 1) {
        L.polyline(polyCoords, {
          color: accent,
          weight: 3,
          dashArray: "6 3",
          opacity: 0.85,
        }).addTo(map);
      }

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [40, 40] });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 12);
      }
    </script>
  </body>
</html>`;
}

export function TripRouteMap({ stops, style }: TripRouteMapProps) {
  const { colors } = useAppTheme();

  const srcDoc = useMemo(() => {
    if (stops.length === 0) return "";
    return buildRouteMapDoc(stops, colors.accent);
  }, [stops, colors.accent]);

  if (stops.length === 0) return null;

  return (
    <View style={[styles.container, style]}>
      <iframe
        srcDoc={srcDoc}
        style={iframeStyle}
        title="Trip route map"
      />
      <View
        style={[
          styles.stopsList,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {stops.map((stop, index) => (
          <View key={`${stop.title}-${index}`} style={styles.stopRow}>
            <View
              style={[styles.badge, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.badgeText}>{index + 1}</Text>
            </View>
            <View style={styles.stopInfo}>
              <Text
                style={[styles.stopDay, { color: colors.accentText }]}
                numberOfLines={1}
              >
                {stop.dayLabel}
              </Text>
              <Text
                style={[styles.stopTitle, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {stop.title}
              </Text>
            </View>
            {index < stops.length - 1 && (
              <View
                style={[styles.connector, { borderLeftColor: colors.border }]}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const iframeStyle: React.CSSProperties = {
  border: "none",
  height: 260,
  width: "100%",
  borderRadius: 20,
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  stopsList: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.md,
    overflow: "hidden",
  },
  stopRow: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  badge: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: TypeScale.labelLg.fontSize,
    fontWeight: FontWeight.bold,
    lineHeight: TypeScale.labelLg.lineHeight,
  },
  stopInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  stopDay: {
    fontSize: TypeScale.labelMd.fontSize,
    fontWeight: FontWeight.semibold,
    lineHeight: TypeScale.labelMd.lineHeight,
  },
  stopTitle: {
    fontSize: TypeScale.bodyMd.fontSize,
    fontWeight: FontWeight.medium,
    lineHeight: TypeScale.bodyMd.lineHeight,
    marginTop: 2,
  },
  connector: {
    borderLeftWidth: 2,
    borderStyle: "dashed",
    height: Spacing.lg,
    left: Spacing.lg + 14,
    position: "absolute",
    bottom: -Spacing.sm,
  },
});
