import { FirebaseError } from "firebase/app";

function getErrorCode(error: unknown) {
  if (error instanceof FirebaseError) {
    return error.code;
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("permission-denied")) {
      return "permission-denied";
    }

    if (message.includes("failed-precondition")) {
      return "failed-precondition";
    }

    if (
      message.includes("invalid-argument") ||
      message.includes("unsupported field value") ||
      message.includes("invalid data")
    ) {
      return "invalid-argument";
    }

    if (
      message.includes("unavailable") ||
      message.includes("offline") ||
      message.includes("network")
    ) {
      return "unavailable";
    }
  }

  return "";
}

export function getFirestoreUserMessage(error: unknown, action: "read" | "write") {
  const code = getErrorCode(error);

  switch (code) {
    case "permission-denied":
      return action === "write"
        ? "Firestore rules блокират записа. Трябва да разрешиш запис в profiles за логнат потребител."
        : "Firestore rules блокират достъпа до профила. Трябва да разрешиш четене на profiles за логнат потребител.";
    case "failed-precondition":
      return "Firestore Database още не е създадена. Създай Firestore Database в Firebase Console.";
    case "invalid-argument":
      return action === "write"
        ? "Има невалидни данни за запис. Провери попълнените полета и опитай пак."
        : "Има невалидни данни в заявката към Firestore.";
    case "unavailable":
      return "Firestore в момента не е достъпен. Опитай пак след малко.";
    default:
      return action === "write"
        ? "Не успяхме да запазим профила. Опитай отново."
        : "Не успяхме да заредим профила. Опитай отново.";
  }
}

export function isFirestorePermissionError(error: unknown) {
  return getErrorCode(error) === "permission-denied";
}
