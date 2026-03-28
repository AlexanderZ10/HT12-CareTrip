import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";

import { auth } from "../firebase";

/**
 * Create a new user account with email and password.
 * Returns the UserCredential on success.
 */
export function registerUser(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Sign in an existing user with email and password.
 * Returns the UserCredential on success.
 */
export function loginUser(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Send a password-reset email to the given address.
 */
export function sendReset(email: string) {
  return sendPasswordResetEmail(auth, email);
}

/**
 * Sign out the currently authenticated user.
 */
export function logoutUser() {
  return signOut(auth);
}

/**
 * Permanently delete the given Firebase user account.
 * Typically called when registration cleanup is needed (e.g. username conflict).
 */
export function deleteCurrentUser(user: User) {
  return deleteUser(user);
}

/**
 * Subscribe to authentication state changes.
 * Returns an unsubscribe function.
 */
export function subscribeToAuth(
  callback: (user: User | null) => void
): () => void {
  return onAuthStateChanged(auth, callback);
}
