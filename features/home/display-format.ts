import type { AppLanguage } from "../../utils/translations";

function getCountUnits(
  language: AppLanguage,
  type: "days" | "travelers"
) {
  if (type === "days") {
    if (language === "en") {
      return { singular: "day", plural: "days" };
    }

    if (language === "de") {
      return { singular: "Tag", plural: "Tage" };
    }

    if (language === "es") {
      return { singular: "día", plural: "días" };
    }

    if (language === "fr") {
      return { singular: "jour", plural: "jours" };
    }

    return { singular: "ден", plural: "дни" };
  }

  if (language === "en") {
    return { singular: "person", plural: "people" };
  }

  if (language === "de") {
    return { singular: "Person", plural: "Personen" };
  }

  if (language === "es") {
    return { singular: "persona", plural: "personas" };
  }

  if (language === "fr") {
    return { singular: "personne", plural: "personnes" };
  }

  return { singular: "човек", plural: "човека" };
}

function formatCountLabel(
  value: string,
  language: AppLanguage,
  type: "days" | "travelers"
) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return trimmedValue;
  }

  if (/[A-Za-zА-Яа-яÀ-ÿ]/.test(trimmedValue)) {
    return trimmedValue;
  }

  const matches = trimmedValue.match(/\d+/g);

  if (!matches || matches.length === 0) {
    return trimmedValue;
  }

  const referenceCount = Number(matches[matches.length - 1]);

  if (!Number.isFinite(referenceCount) || referenceCount <= 0) {
    return trimmedValue;
  }

  const units = getCountUnits(language, type);
  const suffix = referenceCount === 1 ? units.singular : units.plural;

  return `${trimmedValue} ${suffix}`;
}

export function formatPlannerDaysLabel(
  value: string,
  language: AppLanguage = "bg"
) {
  return formatCountLabel(value, language, "days");
}

export function formatPlannerTravelersLabel(
  value: string,
  language: AppLanguage = "bg"
) {
  return formatCountLabel(value, language, "travelers");
}
