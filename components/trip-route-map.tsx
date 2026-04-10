import React, { useRef, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import MapView, { Marker, Polyline, Callout } from "react-native-maps";

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

export function TripRouteMap({ stops, style }: TripRouteMapProps) {
  const { colors } = useAppTheme();
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (stops.length > 0 && mapRef.current) {
      const coordinates = stops.map((s) => ({
        latitude: s.latitude,
        longitude: s.longitude,
      }));
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  }, [stops]);

  if (stops.length === 0) return null;

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: stops[0].latitude,
          longitude: stops[0].longitude,
          latitudeDelta: 5,
          longitudeDelta: 5,
        }}
      >
        {stops.map((stop, index) => (
          <Marker
            key={`${stop.title}-${index}`}
            coordinate={{
              latitude: stop.latitude,
              longitude: stop.longitude,
            }}
          >
            <View
              style={[styles.markerBubble, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.markerText}>{index + 1}</Text>
            </View>
            <Callout>
              <View style={styles.callout}>
                <Text style={[styles.calloutDay, { color: colors.accent }]}>
                  {stop.dayLabel}
                </Text>
                <Text
                  style={[styles.calloutTitle, { color: colors.textPrimary }]}
                >
                  {stop.title}
                </Text>
              </View>
            </Callout>
          </Marker>
        ))}
        <Polyline
          coordinates={stops.map((s) => ({
            latitude: s.latitude,
            longitude: s.longitude,
          }))}
          strokeColor={colors.accent}
          strokeWidth={3}
          lineDashPattern={[6, 3]}
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.xl,
    overflow: "hidden",
    width: "100%",
    height: 260,
  },
  map: {
    width: "100%",
    height: "100%",
  },
  markerBubble: {
    alignItems: "center",
    borderRadius: Radius.full,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  markerText: {
    color: "#FFFFFF",
    fontSize: TypeScale.labelLg.fontSize,
    fontWeight: FontWeight.bold,
    lineHeight: TypeScale.labelLg.lineHeight,
  },
  callout: {
    minWidth: 120,
    padding: Spacing.sm,
  },
  calloutDay: {
    fontSize: TypeScale.labelMd.fontSize,
    fontWeight: FontWeight.semibold,
    lineHeight: TypeScale.labelMd.lineHeight,
    marginBottom: Spacing.xs,
  },
  calloutTitle: {
    fontSize: TypeScale.bodyMd.fontSize,
    fontWeight: FontWeight.medium,
    lineHeight: TypeScale.bodyMd.lineHeight,
  },
});
