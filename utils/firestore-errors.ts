import { FirebaseError } from "firebase/app";

export function getFirestoreUserMessage(error: unknown, action: "read" | "write") {
  if (!(error instanceof FirebaseError)) {
    return action === "write"
      ? "Не успяхме да запазим профила. Опитай отново."
      : "Не успяхме да заредим профила. Опитай отново.";
  }

  switch (error.code) {
    case "permission-denied":
      return action === "write"
        ? "Firestore rules блокират записа. Трябва да разрешиш запис в profiles за логнат потребител."
        : "Firestore rules блокират достъпа до профила. Трябва да разрешиш четене на profiles за логнат потребител.";
    case "failed-precondition":
      return "Firestore Database още не е създадена. Създай Firestore Database в Firebase Console.";
    case "unavailable":
      return "Firestore в момента не е достъпен. Опитай пак след малко.";
    default:
      return action === "write"
        ? "Не успяхме да запазим профила. Опитай отново."
        : "Не успяхме да заредим профила. Опитай отново.";
  }
}

export function isFirestorePermissionError(error: unknown) {
  return error instanceof FirebaseError && error.code === "permission-denied";
}
