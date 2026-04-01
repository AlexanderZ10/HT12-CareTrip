import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { auth, db } from "../firebase";
import {
  type AppLanguage,
  type TranslationKey,
  parseAppLanguage,
  t as translate,
  getLanguageForPrompt,
} from "../utils/translations";

type AppLanguageContextValue = {
  language: AppLanguage;
  languageForPrompt: string;
  setLanguage: (value: AppLanguage) => void;
  t: (key: TranslationKey) => string;
};

const AppLanguageContext = createContext<AppLanguageContextValue | null>(null);

export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>("bg");

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (nextUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = null;

      if (!nextUser) {
        setLanguage("bg");
        return;
      }

      unsubscribeProfile = onSnapshot(
        doc(db, "profiles", nextUser.uid),
        (profileSnapshot) => {
          if (!profileSnapshot.exists()) {
            setLanguage("bg");
            return;
          }

          const profileData = profileSnapshot.data() as Record<string, unknown>;
          setLanguage(parseAppLanguage(profileData.language));
        },
        () => {
          setLanguage("bg");
        }
      );
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribeAuth();
    };
  }, []);

  const tBound = useCallback(
    (key: TranslationKey) => translate(key, language),
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      languageForPrompt: getLanguageForPrompt(language),
      setLanguage,
      t: tBound,
    }),
    [language, tBound]
  );

  return (
    <AppLanguageContext.Provider value={value}>
      {children}
    </AppLanguageContext.Provider>
  );
}

export function useAppLanguage() {
  const context = useContext(AppLanguageContext);

  if (!context) {
    throw new Error("useAppLanguage must be used within AppLanguageProvider.");
  }

  return context;
}
