import { useRouter } from "expo-router";
import React, { useState } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

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

const CARETRIP_ICON = require("../assets/images/CareTrip.png");
const CARETRIP_BACKGROUND = require("../assets/images/CareTrip-background.png");

export default function Login() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});
  const [resetMessage, setResetMessage] = useState("");
  const [showResetHint, setShowResetHint] = useState(false);

  const clearFieldError = (field: AuthField) => {
    setErrors((currentErrors) => {
      if (!currentErrors[field]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[field];
      return nextErrors;
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
        return {
          email: null,
          error: "This username is not linked to a valid account.",
        };
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
      nextErrors.identifier =
        "Username must be 3-20 characters and use only letters, numbers, and _.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    try {
      setErrors({});
      const { email: resolvedEmail, error } =
        await resolveIdentifierToEmail(normalizedIdentifier);

      if (error || !resolvedEmail) {
        setErrors({ identifier: error ?? "Could not verify this account." });
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
      setShowResetHint(
        error instanceof FirebaseError &&
          (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password")
      );
    }
  };

  const handleResetPassword = async () => {
    const normalizedIdentifier = identifier.trim();
    setResetMessage("");
    setShowResetHint(false);

    if (!normalizedIdentifier) {
      setErrors({
        identifier: "Enter your email or username to reset your password.",
      });
      return;
    }

    if (looksLikeEmail(normalizedIdentifier)) {
      if (!isValidEmail(normalizedIdentifier)) {
        setErrors({ identifier: "Enter a valid email address." });
        return;
      }
    } else if (!isValidUsername(normalizedIdentifier)) {
      setErrors({
        identifier: "Username must be 3-20 characters and use only letters, numbers, and _.",
      });
      return;
    }

    const { email: resolvedEmail, error } =
      await resolveIdentifierToEmail(normalizedIdentifier);

    if (error || !resolvedEmail) {
      setErrors({ identifier: error ?? "Could not verify this account." });
      return;
    }

    try {
      setErrors({});
      await sendPasswordResetEmail(auth, resolvedEmail);
      setResetMessage(`Password reset email sent to ${resolvedEmail}.`);
    } catch (error) {
      if (error instanceof FirebaseError) {
        switch (error.code) {
          case "auth/user-not-found":
            setErrors({ identifier: "No account found with this email." });
            return;
          case "auth/too-many-requests":
            setErrors({ identifier: "Too many attempts. Try again later." });
            return;
          case "auth/network-request-failed":
            setErrors({ identifier: "Network error. Check your connection and try again." });
            return;
        }
      }

      setErrors({ identifier: "Could not send reset email. Please try again." });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <Image source={CARETRIP_BACKGROUND} style={styles.backgroundImage} contentFit="cover" />
      <View style={styles.backgroundOverlay} />
      <Image source={CARETRIP_ICON} style={styles.logoImage} contentFit="contain" />

      <View style={styles.formCard}>
        <Text style={styles.title}>Login</Text>
        <Text style={styles.subtitle}>Welcome</Text>

        <TextInput
          placeholder="Email or username"
          placeholderTextColor="#888"
          style={[styles.input, errors.identifier && styles.inputError]}
          value={identifier}
          onChangeText={(text) => {
            setIdentifier(text);
            clearFieldError("identifier");
            setResetMessage("");
            setShowResetHint(false);
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {errors.identifier ? (
          <Text style={styles.errorText}>{errors.identifier}</Text>
        ) : null}

        <View style={[styles.passwordField, errors.password && styles.inputError]}>
          <TextInput
            placeholder="Password"
            placeholderTextColor="#888"
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
          />
          <TouchableOpacity onPress={() => setShowPassword((current) => !current)}>
            <MaterialIcons
              name={showPassword ? "visibility-off" : "visibility"}
              size={22}
              color="#5F6E53"
            />
          </TouchableOpacity>
        </View>
        {errors.password ? (
          <Text style={styles.errorText}>{errors.password}</Text>
        ) : null}
        {showResetHint ? (
          <TouchableOpacity style={styles.inlineResetWrap} onPress={handleResetPassword}>
            <Text style={styles.inlineResetText}>Wrong password? Reset password</Text>
          </TouchableOpacity>
        ) : null}

        {resetMessage ? <Text style={styles.successText}>{resetMessage}</Text> : null}

        <TouchableOpacity style={styles.secondaryLinkWrap} onPress={handleResetPassword}>
          <Text style={styles.secondaryLink}>Forgot password?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>

        <Text style={styles.bottomText}>
          {"Don't have an account? "}
          <Text style={styles.link} onPress={() => router.push("/register")}>
            Register
          </Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EAF3DE",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(245, 250, 238, 0.54)",
  },
  formCard: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: "rgba(246, 248, 238, 0.92)",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#1E2A12",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    marginBottom: 65,
  },
  logoImage: {
    width: 300,
    height: 300,
    marginBottom: -15,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#3B6D11",
    textAlign: "center",
  },
  subtitle: {
    color: "#444441",
    fontSize: 16,
    marginTop: 6,
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#EAF3DE",
  },
  inputError: {
    borderColor: "#C62828",
    marginBottom: 6,
  },
  passwordField: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#EAF3DE",
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    color: "#111",
  },
  errorText: {
    color: "#C62828",
    marginBottom: 12,
    fontSize: 13,
  },
  successText: {
    color: "#3B6D11",
    marginBottom: 12,
    fontSize: 13,
    fontWeight: "600",
  },
  inlineResetWrap: {
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  inlineResetText: {
    color: "#5C8C1F",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryLinkWrap: {
    alignSelf: "flex-end",
    marginBottom: 4,
  },
  secondaryLink: {
    color: "#BA7517",
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#639922",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
    width: "100%",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  bottomText: {
    textAlign: "center",
    marginTop: 20,
    color: "#444441",
  },
  link: {
    color: "#BA7517",
    fontWeight: "600",
  },
});
