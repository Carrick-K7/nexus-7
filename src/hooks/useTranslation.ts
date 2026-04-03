"use client";

import { useNexusStore } from "@/stores/nexus-store";
import { translations, TranslationKey } from "@/i18n/translations";

export function useTranslation() {
  const { language } = useNexusStore();
  
  const t = (key: TranslationKey): string => {
    return translations[language][key] || translations.en[key] || key;
  };
  
  return { t, language };
}
