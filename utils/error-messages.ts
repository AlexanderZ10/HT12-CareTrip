import { FirebaseError } from "firebase/app";

type GroupsAction = "read" | "write" | "delete";

export function getGroupsErrorMessage(error: unknown, action: GroupsAction) {
  const fallbackMessages: Record<GroupsAction, string> = {
    read: "Не успяхме да заредим групите. Опитай отново.",
    write: "Не успяхме да запазим групата. Опитай отново.",
    delete: "Не успяхме да изтрием групата. Опитай отново.",
  };

  const fallback = fallbackMessages[action];

  if (!(error instanceof FirebaseError)) {
    return fallback;
  }

  switch (error.code) {
    case "permission-denied":
      if (action === "write") {
        return "Firestore rules блокират промяната на групите. Обнови правилата и опитай пак.";
      }
      if (action === "delete") {
        return "Firestore rules блокират изтриването на групата. Обнови правилата и опитай пак.";
      }
      return "Firestore rules блокират зареждането на групите. Обнови правилата и опитай пак.";
    case "failed-precondition":
      return "Firestore Database още не е създадена. Създай Firestore Database в Firebase Console.";
    case "unavailable":
      return "Firestore в момента не е достъпен. Опитай пак след малко.";
    default:
      return fallback;
  }
}

export function getGroupDetailErrorMessage(error: unknown, action: "read" | "write") {
  const fallback =
    action === "write"
      ? "Не успяхме да изпратим съобщението. Опитай отново."
      : "Не успяхме да заредим групата. Опитай отново.";

  const errorCode =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? ((error as { code: string }).code ?? "")
      : "";
  const errorMessage = error instanceof Error ? error.message.trim() : "";

  if (
    errorCode === "permission-denied" ||
    errorCode === "functions/permission-denied" ||
    errorMessage.includes("permission-denied") ||
    /missing or insufficient permissions/i.test(errorMessage)
  ) {
    return action === "write"
      ? "Firestore rules блокират този запис. Обнови правилата и опитай пак."
      : "Нямаш достъп до тази група.";
  }

  if (!errorCode) {
    return fallback;
  }

  switch (errorCode) {
    case "permission-denied":
      return action === "write"
        ? "Нямаш достъп да пишеш в тази група."
        : "Нямаш достъп до тази група.";
    case "failed-precondition":
      return "Firestore Database още не е създадена. Създай Firestore Database в Firebase Console.";
    case "unavailable":
      return "Firestore в момента не е достъпен. Опитай пак след малко.";
    default:
      return fallback;
  }
}
