import { useRouter } from "expo-router";
import { useState } from "react";
import { MaterialIcons } from "@expo/vector-icons";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FirebaseError } from "firebase/app";

import {
  createUserWithEmailAndPassword,
  deleteUser,
} from "firebase/auth";
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
import React from "react";

export default function Register() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [strength, setStrength] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captcha, setCaptcha] = useState(createMathCaptcha);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
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

  const checkPasswordStrength = (pass: string) => {
    let score = 0;

    if (pass.length >= 6) score++;
    if (pass.length >= 10) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 2) return "Weak";
    if (score <= 4) return "Medium";
    return "Strong";
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    setStrength(checkPasswordStrength(text));
    clearFieldError("password");
    clearFieldError("confirmPassword");
  };

  const handleRefreshCaptcha = () => {
    setCaptcha(createMathCaptcha());
    setCaptchaAnswer("");
    clearFieldError("captcha");
  };

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
      nextErrors.username =
        "Username must be 3-20 characters and use only letters, numbers, and _.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (checkPasswordStrength(password) !== "Strong") {
      nextErrors.password =
        "Use 10+ characters, an uppercase letter, a number, and a symbol.";
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your password.";
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    if (!captchaAnswer.trim()) {
      nextErrors.captcha = "Реши уравнението.";
    } else if (Number(captchaAnswer.trim()) !== captcha.answer) {
      nextErrors.captcha = "Грешен резултат. Опитай пак или натисни Ново.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    try {
      setErrors({});
      const usernameRef = doc(db, "usernames", normalizedUsername);

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );

      try {
        await runTransaction(db, async (transaction) => {
          const usernameSnapshot = await transaction.get(usernameRef);

          if (usernameSnapshot.exists()) {
            throw new Error("username-taken");
          }

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
          return;
        }

        if (
          error instanceof FirebaseError &&
          (error.code === "permission-denied" ||
            error.code === "unavailable" ||
            error.code === "failed-precondition")
        ) {
          // Do not block account creation when the username lookup store is unavailable.
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
    }
  };

  const getStrengthColor = () => {
    if (strength === "Weak") return "red";
    if (strength === "Medium") return "#BA7517";
    if (strength === "Strong") return "#1D9E75";
    return "#444";
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formCard}>
          <Text style={styles.title}>Register</Text>
          <Text style={styles.subtitle}>Create an account</Text>

        <TextInput
          placeholder="Email"
          placeholderTextColor="#888"
          style={[styles.input, errors.email && styles.inputError]}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            clearFieldError("email");
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

        <TextInput
          placeholder="Username"
          placeholderTextColor="#888"
          style={[styles.input, errors.username && styles.inputError]}
          value={username}
          onChangeText={(text) => {
            setUsername(text);
            clearFieldError("username");
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {errors.username ? (
          <Text style={styles.errorText}>{errors.username}</Text>
        ) : null}

        <View style={[styles.passwordField, errors.password && styles.inputError]}>
          <TextInput
            placeholder="Password"
            placeholderTextColor="#888"
            style={styles.passwordInput}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={handlePasswordChange}
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

        {password.length > 0 ? (
          <Text style={[styles.strengthText, { color: getStrengthColor() }]}>
            Strength: {strength}
          </Text>
        ) : null}

        <View
          style={[styles.passwordField, errors.confirmPassword && styles.inputError]}
        >
          <TextInput
            placeholder="Confirm Password"
            placeholderTextColor="#888"
            style={styles.passwordInput}
            secureTextEntry={!showConfirmPassword}
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              clearFieldError("confirmPassword");
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            onPress={() => setShowConfirmPassword((current) => !current)}
          >
            <MaterialIcons
              name={showConfirmPassword ? "visibility-off" : "visibility"}
              size={22}
              color="#5F6E53"
            />
          </TouchableOpacity>
        </View>
        {errors.confirmPassword ? (
          <Text style={styles.errorText}>{errors.confirmPassword}</Text>
        ) : null}

        <View style={styles.captchaCard}>
          <View style={styles.captchaHeader}>
            <Text style={styles.captchaLabel}>Captcha</Text>
            <TouchableOpacity
              style={styles.captchaRefresh}
              onPress={handleRefreshCaptcha}
            >
              <Text style={styles.captchaRefreshText}>Ново</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.captchaEquation}>{captcha.prompt}</Text>

          <TextInput
            placeholder="Резултат"
            placeholderTextColor="#888"
            style={[
              styles.input,
              styles.captchaInput,
              errors.captcha && styles.inputError,
            ]}
            value={captchaAnswer}
            onChangeText={(text) => {
              setCaptchaAnswer(text.replace(/[^0-9-]/g, ""));
              clearFieldError("captcha");
            }}
            keyboardType="number-pad"
          />

          {errors.captcha ? (
            <Text style={styles.errorText}>{errors.captcha}</Text>
          ) : null}
        </View>

        <TouchableOpacity style={styles.button} onPress={handleRegister}>
          <Text style={styles.buttonText}>Sign Up</Text>
        </TouchableOpacity>

        <Text style={styles.bottomText}>
          Already have an account?{" "}
          <Text style={styles.link} onPress={() => router.push("/login")}>
            Sign In
          </Text>
        </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#EAF3DE",
  },
  container: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    minHeight: "100%",
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
  strengthText: {
    marginBottom: 10,
    fontSize: 13,
  },
  captchaCard: {
    backgroundColor: "#F6F8EE",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#D8E3C2",
    marginBottom: 12,
  },
  captchaHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  captchaLabel: {
    color: "#3B6D11",
    fontSize: 16,
    fontWeight: "700",
  },
  captchaRefresh: {
    backgroundColor: "#FFF2DA",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  captchaRefreshText: {
    color: "#8B5611",
    fontWeight: "700",
  },
  captchaEquation: {
    color: "#29440F",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 12,
  },
  captchaInput: {
    marginBottom: 0,
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
