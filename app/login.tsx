import { useRouter } from "expo-router";
import { useState } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword } from "firebase/auth";
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
import React from "react";

export default function Login() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<AuthErrors>({});

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

  const handleLogin = async () => {
    const nextErrors: AuthErrors = {};
    const normalizedIdentifier = identifier.trim();

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
      let resolvedEmail = normalizedIdentifier;

      if (!looksLikeEmail(normalizedIdentifier)) {
        try {
          const usernameDoc = await getDoc(
            doc(db, "usernames", normalizeUsername(normalizedIdentifier))
          );

          if (!usernameDoc.exists()) {
            setErrors({ identifier: "No account found with this username." });
            return;
          }

          const usernameData = usernameDoc.data();

          if (!usernameData.email || typeof usernameData.email !== "string") {
            setErrors({
              identifier: "This username is not linked to a valid account.",
            });
            return;
          }

          resolvedEmail = usernameData.email;
        } catch (error) {
          if (
            error instanceof FirebaseError &&
            (error.code === "permission-denied" ||
              error.code === "failed-precondition")
          ) {
            setErrors({
              identifier: "Username login is not available right now. Use your email.",
            });
            return;
          }

          setErrors({
            identifier: "Could not verify this username. Try again or use your email.",
          });
          return;
        }
      }

      await signInWithEmailAndPassword(auth, resolvedEmail, password);
      router.replace("/");
    } catch (error) {
      setErrors(mapLoginAuthError(error));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
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
  formCard: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: "#F6F8EE",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#1E2A12",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#3B6D11",
    textAlign: "center",
  },
  subtitle: {
    color: "#444441",
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
