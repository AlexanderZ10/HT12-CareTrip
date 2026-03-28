import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { FirebaseError } from "firebase/app";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../firebase";
import {
  isValidEmail,
  isValidUsername,
  looksLikeEmail,
  mapLoginAuthError,
  normalizeUsername,
  type AuthErrors,
  type AuthField,
} from "../utils/auth-errors";
import { useAppTheme } from "../components/app-theme-provider";
import { Radius, Spacing, TypeScale, FontWeight, shadow } from "../constants/design-system";

const CARETRIP_ICON = require("../assets/images/CareTrip.png");
const CARETRIP_BACKGROUND = require("../assets/images/CareTrip-background.png");

const SPRING_CONFIG = { damping: 18, stiffness: 220 };
const TIMING_FAST = { duration: 220, easing: Easing.out(Easing.quad) };

export default function Login() {
  const router = useRouter();
  const { colors } = useAppTheme();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [resetMessage, setResetMessage] = useState("");
  const [showResetHint, setShowResetHint] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Entrance animations ──────────────────────────────────────────────────
  const logoScale = useSharedValue(0.6);
  const logoOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(40);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    logoScale.value = withSpring(1, { damping: 14, stiffness: 180 });
    logoOpacity.value = withTiming(1, { duration: 380 });
    cardTranslateY.value = withDelay(160, withTiming(0, TIMING_FAST));
    cardOpacity.value = withDelay(160, withTiming(1, { duration: 320 }));
  }, []);

  const logoAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardTranslateY.value }],
    opacity: cardOpacity.value,
  }));

  // ── Shake on error ───────────────────────────────────────────────────────
  const shakeX = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const triggerShake = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 55 }),
      withTiming(10, { duration: 55 }),
      withTiming(-7, { duration: 55 }),
      withTiming(7, { duration: 55 }),
      withTiming(-3, { duration: 45 }),
      withTiming(0, { duration: 45 }),
    );
  };

  // ── Button press scale ───────────────────────────────────────────────────
  const btnScale = useSharedValue(1);

  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const onBtnPressIn = () => {
    btnScale.value = withSpring(0.96, SPRING_CONFIG);
  };

  const onBtnPressOut = () => {
    btnScale.value = withSpring(1, SPRING_CONFIG);
  };

  // ── Auth helpers ─────────────────────────────────────────────────────────
  const clearFieldError = (field: AuthField) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const resolveIdentifierToEmail = async (normalizedIdentifier: string) => {
    if (looksLikeEmail(normalizedIdentifier)) {
      return { email: normalizedIdentifier, error: null as string | null };
    }

    try {
      const usernameDoc = await getDoc(
        doc(db, "usernames", normalizeUsername(normalizedIdentifier))
      );

      if (!usernameDoc.exists()) {
        return { email: null, error: "No account found with this username." };
      }

      const usernameData = usernameDoc.data();

      if (!usernameData.email || typeof usernameData.email !== "string") {
        return { email: null, error: "This username is not linked to a valid account." };
      }

      return { email: usernameData.email, error: null as string | null };
    } catch (error) {
      if (
        error instanceof FirebaseError &&
        (error.code === "permission-denied" || error.code === "failed-precondition")
      ) {
        return {
          email: null,
          error: "Username login is not available right now. Use your email.",
        };
      }

      return {
        email: null,
        error: "Could not verify this username. Try again or use your email.",
      };
    }
  };

  const handleLogin = async () => {
    const nextErrors: AuthErrors = {};
    const normalizedIdentifier = identifier.trim();
    setResetMessage("");
    setShowResetHint(false);

    if (!normalizedIdentifier) {
      nextErrors.identifier = "Enter your email or username.";
    } else if (looksLikeEmail(normalizedIdentifier)) {
      if (!isValidEmail(normalizedIdentifier)) {
        nextErrors.identifier = "Enter a valid email address.";
      }
    } else if (!isValidUsername(normalizedIdentifier)) {
      nextErrors.identifier = "Username must be 3–20 characters (letters, numbers, _).";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      triggerShake();
      return;
    }

    try {
      setErrors({});
      setLoading(true);
      const { email: resolvedEmail, error } = await resolveIdentifierToEmail(normalizedIdentifier);

      if (error || !resolvedEmail) {
        setErrors({ identifier: error ?? "Could not verify this account." });
        triggerShake();
        return;
      }

      const credential = await signInWithEmailAndPassword(auth, resolvedEmail, password);
      const profileSnapshot = await getDoc(doc(db, "profiles", credential.user.uid));

      if (!profileSnapshot.exists() || profileSnapshot.data().onboardingCompleted !== true) {
        router.replace("/onboarding");
        return;
      }

      router.replace("/home");
    } catch (error) {
      const mappedErrors = mapLoginAuthError(error);
      setErrors(mappedErrors);
      triggerShake();
      setShowResetHint(
        error instanceof FirebaseError &&
          (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const normalizedIdentifier = identifier.trim();
    setResetMessage("");
    setShowResetHint(false);

    if (!normalizedIdentifier) {
      setErrors({ identifier: "Enter your email or username to reset your password." });
      triggerShake();
      return;
    }

    if (looksLikeEmail(normalizedIdentifier)) {
      if (!isValidEmail(normalizedIdentifier)) {
        setErrors({ identifier: "Enter a valid email address." });
        triggerShake();
        return;
      }
    } else if (!isValidUsername(normalizedIdentifier)) {
      setErrors({ identifier: "Username must be 3–20 characters (letters, numbers, _)." });
      triggerShake();
      return;
    }

    const { email: resolvedEmail, error } = await resolveIdentifierToEmail(normalizedIdentifier);

    if (error || !resolvedEmail) {
      setErrors({ identifier: error ?? "Could not verify this account." });
      triggerShake();
      return;
    }

    try {
      setErrors({});
      setResetLoading(true);
      await sendPasswordResetEmail(auth, resolvedEmail);
      setResetMessage(`Reset link sent to ${resolvedEmail}. Check your inbox.`);
    } catch (error) {
      if (error instanceof FirebaseError) {
        switch (error.code) {
          case "auth/user-not-found":
            setErrors({ identifier: "No account found with this email." });
            triggerShake();
            return;
          case "auth/too-many-requests":
            setErrors({ identifier: "Too many attempts. Try again later." });
            triggerShake();
            return;
          case "auth/network-request-failed":
            setErrors({ identifier: "Network error. Check your connection and try again." });
            triggerShake();
            return;
        }
      }
      setErrors({ identifier: "Could not send reset email. Please try again." });
      triggerShake();
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom", "left", "right"]}>
      <Image source={CARETRIP_BACKGROUND} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      <View style={styles.overlay} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <Animated.View style={[styles.logoWrap, logoAnimStyle]}>
            <Image source={CARETRIP_ICON} style={styles.logo} contentFit="contain" />
          </Animated.View>

          {/* Card */}
          <Animated.View style={[styles.cardWrap, cardAnimStyle]}>
            <Animated.View style={[styles.card, shakeStyle]}>
              {/* Header */}
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>Sign in to continue planning your journey</Text>

              {/* Identifier field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email or Username</Text>
                <TextInput
                  placeholder="you@example.com"
                  placeholderTextColor={colors.inputPlaceholder}
                  style={[styles.input, errors.identifier ? styles.inputError : null]}
                  value={identifier}
                  onChangeText={(text) => {
                    setIdentifier(text);
                    clearFieldError("identifier");
                    setResetMessage("");
                    setShowResetHint(false);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                  editable={!loading}
                />
                {errors.identifier ? (
                  <View style={styles.errorRow}>
                    <MaterialIcons name="error-outline" size={14} color={colors.error} />
                    <Text style={styles.errorText}>{errors.identifier}</Text>
                  </View>
                ) : null}
              </View>

              {/* Password field */}
              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Password</Text>
                  <Pressable
                    onPress={handleResetPassword}
                    disabled={resetLoading}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {resetLoading ? (
                      <ActivityIndicator size={12} color={colors.highlight} />
                    ) : (
                      <Text style={styles.forgotLink}>Forgot password?</Text>
                    )}
                  </Pressable>
                </View>
                <View style={[styles.passwordRow, errors.password ? styles.inputError : null]}>
                  <TextInput
                    placeholder="••••••••"
                    placeholderTextColor={colors.inputPlaceholder}
                    style={styles.passwordInput}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      clearFieldError("password");
                      setResetMessage("");
                      setShowResetHint(false);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                    editable={!loading}
                  />
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons
                      name={showPassword ? "visibility-off" : "visibility"}
                      size={20}
                      color={colors.textSecondary}
                    />
                  </Pressable>
                </View>
                {errors.password ? (
                  <View style={styles.errorRow}>
                    <MaterialIcons name="error-outline" size={14} color={colors.error} />
                    <Text style={styles.errorText}>{errors.password}</Text>
                  </View>
                ) : null}
              </View>

              {/* Wrong-password inline reset hint */}
              {showResetHint ? (
                <Pressable style={styles.resetHintRow} onPress={handleResetPassword}>
                  <MaterialIcons name="lock-reset" size={14} color={colors.primaryAction} />
                  <Text style={styles.resetHintText}>Wrong password? Tap here to reset it.</Text>
                </Pressable>
              ) : null}

              {/* Reset success */}
              {resetMessage ? (
                <View style={styles.successRow}>
                  <MaterialIcons name="check-circle-outline" size={14} color={colors.success} />
                  <Text style={styles.successText}>{resetMessage}</Text>
                </View>
              ) : null}

              {/* Sign In button */}
              <Animated.View style={btnAnimStyle}>
                <Pressable
                  style={[styles.primaryButton, loading ? styles.primaryButtonDisabled : null]}
                  onPress={handleLogin}
                  onPressIn={onBtnPressIn}
                  onPressOut={onBtnPressOut}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.buttonTextOnAction} size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Sign In</Text>
                  )}
                </Pressable>
              </Animated.View>

              {/* Register link */}
              <Text style={styles.footerText}>
                {"Don't have an account? "}
                <Text style={styles.footerLink} onPress={() => router.push("/register")}>
                  Create one
                </Text>
              </Text>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ReturnType<typeof useAppTheme>["colors"]) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.screen,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
    },
    keyboardView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing["3xl"],
    },
    logoWrap: {
      alignItems: "center",
    },
    logo: {
      width: 220,
      height: 220,
      marginBottom: -Spacing.lg,
    },
    cardWrap: {
      width: "100%",
      alignItems: "center",
    },
    card: {
      width: "100%",
      maxWidth: 460,
      backgroundColor: colors.card,
      borderRadius: Radius["3xl"],
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing["2xl"],
      ...shadow("lg"),
    },

    // Header
    title: {
      ...TypeScale.headingMd,
      color: colors.textPrimary,
      textAlign: "center",
      marginBottom: Spacing.xs,
    },
    subtitle: {
      ...TypeScale.bodyMd,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: Spacing["2xl"],
    },

    // Field groups
    fieldGroup: {
      marginBottom: Spacing.lg,
    },
    labelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: Spacing.xs,
    },
    label: {
      ...TypeScale.labelLg,
      color: colors.accentText,
      marginBottom: Spacing.xs,
    },
    forgotLink: {
      ...TypeScale.labelMd,
      color: colors.highlight,
      fontWeight: FontWeight.semibold,
    },

    // Inputs
    input: {
      backgroundColor: colors.inputBackground,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      ...TypeScale.bodyMd,
      color: colors.inputText,
      minHeight: 48,
    },
    inputError: {
      borderColor: colors.error,
    },
    passwordRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.inputBackground,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      paddingHorizontal: Spacing.lg,
      minHeight: 48,
    },
    passwordInput: {
      flex: 1,
      paddingVertical: Spacing.md,
      ...TypeScale.bodyMd,
      color: colors.inputText,
    },
    eyeButton: {
      paddingLeft: Spacing.sm,
    },

    // Feedback
    errorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      marginTop: Spacing.xs,
    },
    errorText: {
      ...TypeScale.labelMd,
      color: colors.error,
      flex: 1,
    },
    successRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      backgroundColor: colors.skeleton,
      borderRadius: Radius.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.lg,
    },
    successText: {
      ...TypeScale.labelMd,
      color: colors.success,
      flex: 1,
    },
    resetHintRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      marginBottom: Spacing.md,
    },
    resetHintText: {
      ...TypeScale.labelMd,
      color: colors.primaryAction,
      fontWeight: FontWeight.semibold,
    },

    // Button
    primaryButton: {
      backgroundColor: colors.primaryAction,
      borderRadius: Radius.md,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      marginTop: Spacing.xs,
    },
    primaryButtonDisabled: {
      opacity: 0.65,
    },
    primaryButtonText: {
      ...TypeScale.titleMd,
      color: colors.buttonTextOnAction,
      fontWeight: FontWeight.bold,
    },

    // Footer
    footerText: {
      ...TypeScale.bodyMd,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: Spacing.xl,
    },
    footerLink: {
      color: colors.highlight,
      fontWeight: FontWeight.semibold,
    },
  });
}
