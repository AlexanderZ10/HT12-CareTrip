import { FirebaseError } from "firebase/app";

export type AuthField =
  | "identifier"
  | "email"
  | "password"
  | "confirmPassword"
  | "username"
  | "captcha";
export type AuthErrors = Partial<Record<AuthField, string>>;

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidUsername(value: string) {
  return /^(?=.{3,20}$)[a-zA-Z0-9_]+$/.test(value.trim());
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function looksLikeEmail(value: string) {
  return value.includes("@");
}

export function mapLoginAuthError(error: unknown): AuthErrors {
  if (!(error instanceof FirebaseError)) {
    return {
      password: "Login failed. Please try again.",
    };
  }

  switch (error.code) {
    case "auth/invalid-email":
    case "auth/missing-email":
      return { identifier: "Enter a valid email address." };
    case "auth/user-disabled":
      return { identifier: "This account has been disabled." };
    case "auth/user-not-found":
      return { identifier: "No account found with this email." };
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return { password: "Incorrect email or password." };
    case "auth/missing-password":
      return { password: "Password is required." };
    case "auth/too-many-requests":
      return { password: "Too many attempts. Try again later." };
    case "auth/network-request-failed":
      return { identifier: "Network error. Check your connection and try again." };
    default:
      return { password: "Login failed. Please try again." };
  }
}

export function mapRegisterAuthError(error: unknown): AuthErrors {
  if (!(error instanceof FirebaseError)) {
    return {
      email: "Registration failed. Please try again.",
    };
  }

  switch (error.code) {
    case "auth/invalid-email":
    case "auth/missing-email":
      return { email: "Enter a valid email address." };
    case "auth/email-already-in-use":
      return { email: "An account with this email already exists." };
    case "auth/missing-password":
      return { password: "Password is required." };
    case "auth/weak-password":
      return { password: "Password is too weak." };
    case "auth/network-request-failed":
      return { email: "Network error. Check your connection and try again." };
    default:
      return { email: "Registration failed. Please try again." };
  }
}
