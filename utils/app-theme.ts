import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { auth, db } from "../firebase";

export type AppThemeMode = "dark" | "light";

// ---------------------------------------------------------------------------
// Palette definitions
// Full semantic token set for the CareTrip design system.
// NEVER reference these raw objects in components — always use useAppTheme().
// ---------------------------------------------------------------------------

export const LIGHT_THEME = {
  // --- Backgrounds ---
  /** Main screen background */
  appBackground: "#EEF4E5",
  /** Card and surface background */
  cardBackground: "#FAFCF5",
  /** Elevated surfaces (e.g. floating cards) */
  elevated: "#EEF4E5",
  /** Hero / header sections */
  heroBackground: "#223814",
  /** Tab bar background */
  tabBarBackground: "#FAFCF5",
  /** Overlay scrim (modals, drawers) */
  overlay: "rgba(16, 26, 8, 0.48)",
  /** Skeleton / shimmer base */
  skeleton: "#E2EDD0",
  /** Skeleton / shimmer highlight */
  skeletonHighlight: "#F0F7E4",

  // --- Borders ---
  /** Standard card border */
  cardBorder: "#DDE8C7",
  /** Input field border */
  inputBorder: "#DDE8C7",
  /** Divider lines */
  divider: "#DDE8C7",
  /** Focus ring for inputs */
  focusBorder: "#5C8C1F",

  // --- Text ---
  /** Primary body / heading text */
  textPrimary: "#29440F",
  /** Secondary / supporting text */
  bodyText: "#5F6E53",
  /** Muted / disabled text */
  textMuted: "#8A9E77",
  /** Inverse text (on dark backgrounds) */
  textInverse: "#FFFFFF",
  /** Accent label text */
  accentText: "#47642A",
  /** Text on hero sections */
  heroText: "#FFFFFF",
  /** Highlighted text colour */
  highlightText: "#0D1F02",

  // --- Inputs ---
  /** Input field background */
  inputBackground: "#FFFFFF",
  /** Input field text */
  inputText: "#29440F",
  /** Input placeholder text */
  inputPlaceholder: "#8A9E77",

  // --- Actions ---
  /** Primary CTA colour (buttons, links) */
  primaryAction: "#5C8C1F",
  /** Text / icon on primary action backgrounds */
  buttonTextOnAction: "#FFFFFF",
  /** Destructive action (delete, error) */
  destructive: "#C0392B",
  /** Text on destructive backgrounds */
  destructiveText: "#FFFFFF",
  /** Disabled element background */
  disabledBackground: "#D6E4BE",
  /** Disabled element text */
  disabledText: "#8A9E77",

  // --- Accent / highlight ---
  /** Orange warm highlight accent */
  highlight: "#EF9F27",
  /** Success state */
  success: "#4A9C3F",
  /** Warning state */
  warning: "#E8A020",
  /** Error state */
  error: "#C0392B",
  /** Info state */
  info: "#355D96",

  // --- Tab bar ---
  /** Active tab icon/label */
  tabBarActive: "#5C8C1F",
  /** Inactive tab icon/label */
  tabBarInactive: "#748066",

  // --- Chips / pills / mode selectors ---
  summaryChipBackground: "#EEF4E5",
  summaryChipText: "#3E5B21",
  modeCardBackground: "#FAFCF5",
  modeCardBorder: "#DDE8C7",
  modeInactiveBackground: "#EEF4E5",
  modeInactiveText: "#47642A",
  modeSelectedLightBackground: "#EAF3FF",
  modeSelectedLightBorder: "#A7C8F9",
  modeSelectedLightText: "#355D96",
  modeSelectedDarkBackground: "#223814",
  modeSelectedDarkBorder: "#223814",
  modeSelectedDarkText: "#E8F1D4",

  // --- Screen icon overlay ---
  screenIconBackground: "rgba(255,255,255,0.08)",
  screenIconBorder: "rgba(232,241,212,0.14)",
} as const;

export const DARK_THEME = {
  // --- Backgrounds ---
  appBackground: "#0D1F02",
  cardBackground: "#1A2E08",
  elevated: "#27500A",
  heroBackground: "#1A2E08",
  tabBarBackground: "#1A2E08",
  overlay: "rgba(0, 0, 0, 0.64)",
  skeleton: "#1F3A09",
  skeletonHighlight: "#27500A",

  // --- Borders ---
  cardBorder: "#27500A",
  inputBorder: "#639922",
  divider: "#27500A",
  focusBorder: "#639922",

  // --- Text ---
  textPrimary: "#F5F7F0",
  bodyText: "#B4B2A9",
  textMuted: "#748066",
  textInverse: "#0D1F02",
  accentText: "#C0DD97",
  heroText: "#F5F7F0",
  highlightText: "#0D1F02",

  // --- Inputs ---
  inputBackground: "#27500A",
  inputText: "#F5F7F0",
  inputPlaceholder: "#748066",

  // --- Actions ---
  primaryAction: "#639922",
  buttonTextOnAction: "#0D1F02",
  destructive: "#E05555",
  destructiveText: "#FFFFFF",
  disabledBackground: "#1F3A09",
  disabledText: "#748066",

  // --- Accent / highlight ---
  highlight: "#EF9F27",
  success: "#6BBF5F",
  warning: "#EF9F27",
  error: "#E05555",
  info: "#7AABF5",

  // --- Tab bar ---
  tabBarActive: "#639922",
  tabBarInactive: "#B4B2A9",

  // --- Chips / pills / mode selectors ---
  summaryChipBackground: "#27500A",
  summaryChipText: "#C0DD97",
  modeCardBackground: "#1A2E08",
  modeCardBorder: "#27500A",
  modeInactiveBackground: "#27500A",
  modeInactiveText: "#C0DD97",
  modeSelectedLightBackground: "#DDE7F5",
  modeSelectedLightBorder: "#C4D1E6",
  modeSelectedLightText: "#304865",
  modeSelectedDarkBackground: "#639922",
  modeSelectedDarkBorder: "#639922",
  modeSelectedDarkText: "#0D1F02",

  // --- Screen icon overlay ---
  screenIconBackground: "#27500A",
  screenIconBorder: "#639922",
} as const;

export type AppPalette = { readonly [K in keyof typeof LIGHT_THEME]: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getProfileThemeMode(value: unknown): AppThemeMode {
  return value === "dark" ? "dark" : "light";
}

export function getThemePalette(mode: AppThemeMode): AppPalette {
  return mode === "dark" ? DARK_THEME : LIGHT_THEME;
}

// ---------------------------------------------------------------------------
// useAppTheme — syncs theme from Firestore user profile in real-time
// ---------------------------------------------------------------------------

export function useAppTheme() {
  const [mode, setMode] = useState<AppThemeMode>("light");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!nextUser) {
        setMode("light");
        return;
      }

      unsubscribeProfile = onSnapshot(doc(db, "profiles", nextUser.uid), (snapshot) => {
        if (!snapshot.exists()) {
          setMode("light");
          return;
        }

        const profileData = snapshot.data() as Record<string, unknown>;
        setMode(getProfileThemeMode(profileData.profileTheme));
      });
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  const palette = useMemo(() => getThemePalette(mode), [mode]);

  return { mode, palette };
}

// ---------------------------------------------------------------------------
// useThemedStyles — memoised StyleSheet factory
//
// Usage:
//   const styles = useThemedStyles((palette) =>
//     StyleSheet.create({
//       container: { backgroundColor: palette.appBackground },
//     })
//   );
// ---------------------------------------------------------------------------

import { StyleSheet } from "react-native";

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (palette: AppPalette) => T,
): T {
  const { palette } = useAppTheme();
  return useMemo(() => factory(palette), [palette]);
}
