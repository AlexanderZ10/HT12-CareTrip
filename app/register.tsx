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
import { createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import { doc, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "../firebase";
import {
  isValidEmail,
  isValidUsername,
  mapRegisterAuthError,
  normalizeUsername,
  type AuthErrors,
  type AuthField,
} from "../utils/auth-errors";
import { createMathCaptcha } from "../utils/math-captcha";
import { useAppTheme } from "../components/app-theme-provider";
import { Radius, Spacing, TypeScale, FontWeight, shadow } from "../constants/design-system";
import PasswordStrengthBar, {
  checkPasswordStrength,
  type PasswordStrength,
} from "../features/auth/components/PasswordStrengthBar";
import MathCaptcha from "../features/auth/components/MathCaptcha";

const CARETRIP_ICON = require("../assets/images/CareTrip.png");
const CARETRIP_BACKGROUND = require("../assets/images/CareTrip-background.png");

const SPRING_CONFIG = { damping: 18, stiffness: 220 };
const TIMING_FAST = { duration: 220, easing: Easing.out(Easing.quad) };

export default function Register() {
  const router = useRouter();
  const { colors } = useAppTheme();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [strength, setStrength] = useState<PasswordStrength>("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captcha, setCaptcha] = useState(createMathCaptcha);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [errors, setErrors] = useState<AuthErrors>({});
  const [loading, setLoading] = useState(false);

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

  // ── Match indicator fade ─────────────────────────────────────────────────
  const matchOpacity = useSharedValue(0);

  const matchAnimStyle = useAnimatedStyle(() => ({
    opacity: matchOpacity.value,
  }));

  useEffect(() => {
    matchOpacity.value = withTiming(confirmPassword.length > 0 ? 1 : 0, { duration: 200 });
  }, [confirmPassword.length > 0]);

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    setStrength(checkPasswordStrength(text));
    clearFieldError("password");
    clearFieldError("confirmPassword");
  };

  // ── Captcha ──────────────────────────────────────────────────────────────
  const handleRefreshCaptcha = () => {
    setCaptcha(createMathCaptcha());
    setCaptchaAnswer("");
    clearFieldError("captcha");
  };

  // ── Field error clearing ─────────────────────────────────────────────────
  const clearFieldError = (field: AuthField) => {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // ── Register ─────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    const nextErrors: AuthErrors = {};
    const normalizedEmail = email.trim();
    const trimmedUsername = username.trim();
    const normalizedUsername = normalizeUsername(trimmedUsername);

    if (!normalizedEmail) {
      nextErrors.email = "Email is required.";
    } else if (!isValidEmail(normalizedEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!trimmedUsername) {
      nextErrors.username = "Username is required.";
    } else if (!isValidUsername(trimmedUsername)) {
      nextErrors.username = "3–20 characters: letters, numbers, and _ only.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (strength !== "strong") {
      nextErrors.password = "Use 10+ characters with uppercase, a number, and a symbol.";
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your password.";
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    if (!captchaAnswer.trim()) {
      nextErrors.captcha = "Solve the equation to continue.";
    } else if (Number(captchaAnswer.trim()) !== captcha.answer) {
      nextErrors.captcha = "Wrong answer — try again or refresh.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      triggerShake();
      return;
    }

    try {
      setErrors({});
      setLoading(true);

      const usernameRef = doc(db, "usernames", normalizedUsername);
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);

      try {
        await runTransaction(db, async (transaction) => {
          const usernameSnapshot = await transaction.get(usernameRef);
          if (usernameSnapshot.exists()) throw new Error("username-taken");
          transaction.set(usernameRef, {
            uid: userCredential.user.uid,
            email: normalizedEmail,
            username: trimmedUsername,
            usernameLower: normalizedUsername,
            createdAt: Date.now(),
          });
        });
      } catch (error) {
        if (error instanceof Error && error.message === "username-taken") {
          await deleteUser(userCredential.user).catch(() => undefined);
          setErrors({ username: "This username is already taken." });
          triggerShake();
          return;
        }

        if (
          error instanceof FirebaseError &&
          (error.code === "permission-denied" ||
            error.code === "unavailable" ||
            error.code === "failed-precondition")
        ) {
          // Don't block account creation when username store is unavailable.
        }
      }

      try {
        await setDoc(
          doc(db, "profiles", userCredential.user.uid),
          {
            uid: userCredential.user.uid,
            email: normalizedEmail,
            profileVisibility: "private",
            username: trimmedUsername,
            onboardingCompleted: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {}

      router.replace("/onboarding");
    } catch (error) {
      setErrors(mapRegisterAuthError(error));
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

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
              <Text style={styles.title}>Create account</Text>
              <Text style={styles.subtitle}>Join CareTrip and start planning your trips</Text>

              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  placeholder="you@example.com"
                  placeholderTextColor={colors.inputPlaceholder}
                  style={[styles.input, errors.email ? styles.inputError : null]}
                  value={email}
                  onChangeText={(text) => { setEmail(text); clearFieldError("email"); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                  editable={!loading}
                />
                {errors.email ? (
                  <View style={styles.errorRow}>
                    <MaterialIcons name="error-outline" size={14} color={colors.error} />
                    <Text style={styles.errorText}>{errors.email}</Text>
                  </View>
                ) : null}
              </View>

              {/* Username */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  placeholder="your_username"
                  placeholderTextColor={colors.inputPlaceholder}
                  style={[styles.input, errors.username ? styles.inputError : null]}
                  value={username}
                  onChangeText={(text) => { setUsername(text); clearFieldError("username"); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  editable={!loading}
                />
                {errors.username ? (
                  <View style={styles.errorRow}>
                    <MaterialIcons name="error-outline" size={14} color={colors.error} />
                    <Text style={styles.errorText}>{errors.username}</Text>
                  </View>
                ) : null}
              </View>

              {/* Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={[styles.passwordRow, errors.password ? styles.inputError : null]}>
                  <TextInput
                    placeholder="••••••••"
                    placeholderTextColor={colors.inputPlaceholder}
                    style={styles.passwordInput}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={handlePasswordChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
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

                {password.length > 0 ? <PasswordStrengthBar strength={strength} /> : null}

                {errors.password ? (
                  <View style={styles.errorRow}>
                    <MaterialIcons name="error-outline" size={14} color={colors.error} />
                    <Text style={styles.errorText}>{errors.password}</Text>
                  </View>
                ) : null}
              </View>

              {/* Confirm Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirm Password</Text>
                <View style={[styles.passwordRow, errors.confirmPassword ? styles.inputError : null]}>
                  <TextInput
                    placeholder="••••••••"
                    placeholderTextColor={colors.inputPlaceholder}
                    style={styles.passwordInput}
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      clearFieldError("confirmPassword");
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    editable={!loading}
                  />
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPassword((v) => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons
                      name={showConfirmPassword ? "visibility-off" : "visibility"}
                      size={20}
                      color={colors.textSecondary}
                    />
                  </Pressable>
                </View>

                {/* Animated match indicator */}
                <Animated.View style={[styles.matchRow, matchAnimStyle]}>
                  <MaterialIcons
                    name={passwordsMatch ? "check-circle" : "cancel"}
                    size={14}
                    color={passwordsMatch ? colors.success : colors.error}
                  />
                  <Text
                    style={[
                      styles.matchText,
                      { color: passwordsMatch ? colors.success : colors.error },
                    ]}
                  >
                    {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                  </Text>
                </Animated.View>

                {errors.confirmPassword ? (
                  <View style={styles.errorRow}>
                    <MaterialIcons name="error-outline" size={14} color={colors.error} />
                    <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                  </View>
                ) : null}
              </View>

              {/* Captcha */}
              <MathCaptcha
                prompt={captcha.prompt}
                answer={captchaAnswer}
                onChangeAnswer={(text) => {
                  setCaptchaAnswer(text);
                  clearFieldError("captcha");
                }}
                onRefresh={handleRefreshCaptcha}
                error={errors.captcha}
                disabled={loading}
              />

              {/* Submit */}
              <Animated.View style={btnAnimStyle}>
                <Pressable
                  style={[styles.primaryButton, loading ? styles.primaryButtonDisabled : null]}
                  onPress={handleRegister}
                  onPressIn={onBtnPressIn}
                  onPressOut={onBtnPressOut}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.buttonTextOnAction} size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Create Account</Text>
                  )}
                </Pressable>
              </Animated.View>

              {/* Login link */}
              <Text style={styles.footerText}>
                Already have an account?{" "}
                <Text style={styles.footerLink} onPress={() => router.push("/login")}>
                  Sign In
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
      width: 200,
      height: 200,
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

    // Fields
    fieldGroup: {
      marginBottom: Spacing.lg,
    },
    label: {
      ...TypeScale.labelLg,
      color: colors.accentText,
      marginBottom: Spacing.xs,
    },
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

    // Match indicator
    matchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xs,
      marginTop: Spacing.xs,
    },
    matchText: {
      ...TypeScale.labelMd,
    },

    // Error
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
