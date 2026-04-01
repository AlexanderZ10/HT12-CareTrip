import { FirebaseError } from "firebase/app";

import type { AppLanguage } from "./translations";

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

function getFirestoreEntityLabel(
  entity: "profile" | "reservation" | "trip",
  language: AppLanguage
) {
  if (entity === "reservation") {
    if (language === "en") return "booking";
    if (language === "de") return "Buchung";
    if (language === "es") return "reserva";
    if (language === "fr") return "réservation";
    return "резервацията";
  }

  if (entity === "trip") {
    if (language === "en") return "trip";
    if (language === "de") return "Reiseplan";
    if (language === "es") return "viaje";
    if (language === "fr") return "voyage";
    return "пътуването";
  }

  if (language === "en") return "profile";
  if (language === "de") return "Profil";
  if (language === "es") return "perfil";
  if (language === "fr") return "profil";
  return "профила";
}

export function getFirestoreUserMessage(
  error: unknown,
  action: "read" | "write",
  language: AppLanguage = "bg",
  entity: "profile" | "reservation" | "trip" = "profile"
) {
  const code = getErrorCode(error);
  const entityLabel = getFirestoreEntityLabel(entity, language);

  switch (code) {
    case "permission-denied":
      if (language === "en") {
        return action === "write"
          ? `Firestore rules are blocking writes for the ${entityLabel}.`
          : `Firestore rules are blocking access to the ${entityLabel}.`;
      }
      if (language === "de") {
        return action === "write"
          ? `Firestore-Regeln blockieren das Schreiben für ${entityLabel}.`
          : `Firestore-Regeln blockieren den Zugriff auf ${entityLabel}.`;
      }
      if (language === "es") {
        return action === "write"
          ? `Las reglas de Firestore bloquean la escritura para ${entityLabel}.`
          : `Las reglas de Firestore bloquean el acceso al ${entityLabel}.`;
      }
      if (language === "fr") {
        return action === "write"
          ? `Les règles Firestore bloquent l'écriture pour le ${entityLabel}.`
          : `Les règles Firestore bloquent l'accès au ${entityLabel}.`;
      }
      return action === "write"
        ? `Firestore rules блокират записа за ${entityLabel}.`
        : `Firestore rules блокират достъпа до ${entityLabel}.`;
    case "failed-precondition":
      if (language === "en") {
        return "Firestore Database has not been created yet. Create it in Firebase Console.";
      }
      if (language === "de") {
        return "Die Firestore-Datenbank wurde noch nicht erstellt. Erstelle sie in der Firebase Console.";
      }
      if (language === "es") {
        return "La base de datos de Firestore aún no está creada. Créala en Firebase Console.";
      }
      if (language === "fr") {
        return "La base Firestore n'a pas encore été créée. Crée-la dans Firebase Console.";
      }
      return "Firestore Database още не е създадена. Създай Firestore Database в Firebase Console.";
    case "invalid-argument":
      if (language === "en") {
        return action === "write"
          ? "Some data is invalid. Check the fields and try again."
          : "The Firestore request contains invalid data.";
      }
      if (language === "de") {
        return action === "write"
          ? "Einige Daten sind ungültig. Prüfe die Felder und versuche es erneut."
          : "Die Firestore-Anfrage enthält ungültige Daten.";
      }
      if (language === "es") {
        return action === "write"
          ? "Hay datos no válidos. Revisa los campos e inténtalo de nuevo."
          : "La solicitud a Firestore contiene datos no válidos.";
      }
      if (language === "fr") {
        return action === "write"
          ? "Certaines données sont invalides. Vérifie les champs puis réessaie."
          : "La requête Firestore contient des données invalides.";
      }
      return action === "write"
        ? "Има невалидни данни за запис. Провери попълнените полета и опитай пак."
        : "Има невалидни данни в заявката към Firestore.";
    case "unavailable":
      if (language === "en") return "Firestore is currently unavailable. Try again in a moment.";
      if (language === "de") return "Firestore ist momentan nicht verfügbar. Versuche es gleich noch einmal.";
      if (language === "es") return "Firestore no está disponible en este momento. Inténtalo de nuevo en un momento.";
      if (language === "fr") return "Firestore est indisponible pour le moment. Réessaie dans un instant.";
      return "Firestore в момента не е достъпен. Опитай пак след малко.";
    default:
      if (language === "en") {
        return action === "write"
          ? `We could not save the ${entityLabel}. Please try again.`
          : `We could not load the ${entityLabel}. Please try again.`;
      }
      if (language === "de") {
        return action === "write"
          ? `${entityLabel} konnte nicht gespeichert werden. Bitte versuche es erneut.`
          : `${entityLabel} konnte nicht geladen werden. Bitte versuche es erneut.`;
      }
      if (language === "es") {
        return action === "write"
          ? `No pudimos guardar ${entityLabel}. Inténtalo de nuevo.`
          : `No pudimos cargar ${entityLabel}. Inténtalo de nuevo.`;
      }
      if (language === "fr") {
        return action === "write"
          ? `Nous n'avons pas pu enregistrer ${entityLabel}. Réessaie.`
          : `Nous n'avons pas pu charger ${entityLabel}. Réessaie.`;
      }
      return action === "write"
        ? `Не успяхме да запазим ${entityLabel}. Опитай отново.`
        : `Не успяхме да заредим ${entityLabel}. Опитай отново.`;
  }
}

export function isFirestorePermissionError(error: unknown) {
  return getErrorCode(error) === "permission-denied";
}
