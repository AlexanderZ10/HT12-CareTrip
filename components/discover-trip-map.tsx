import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { buildSettlementMapUrl } from "../utils/trip-recommendations";

type DiscoverTripMapProps = {
  attractions: string[];
  country: string;
  destination: string;
  height?: number;
  latitude: number | null;
  longitude: number | null;
  title: string;
};

export default function DiscoverTripMap({
  height = 196,
  latitude,
  longitude,
}: DiscoverTripMapProps) {
  const mapUrl = buildSettlementMapUrl(latitude, longitude);

  if (!mapUrl) {
    return (
      <View style={[styles.fallback, { height }]}>
        <Text style={styles.fallbackText}>Map coordinates not available</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: mapUrl }}
      style={[styles.mapImage, { height }]}
      contentFit="cover"
    />
  );
}

const styles = StyleSheet.create({
  mapImage: {
    backgroundColor: "#DDE8C7",
    borderRadius: 20,
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
