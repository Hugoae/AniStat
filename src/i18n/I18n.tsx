import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LANG,
  type Lang,
  parseRoute,
  subscribeRoute,
  navigateToPath,
  buildLangSwitchPath,
  storeLang,
} from "../lib/routing";

/**
 * i18n minimaliste, sans dépendance : le texte français sert de valeur par
 * défaut et l'anglais est passé en second argument. Avantage : impossible
 * d'avoir une clé manquante, et toute chaîne non traduite reste un littéral
 * visible dans le code (facile à repérer).
 *
 *   const t = useT();
 *   t("Jours actifs", "Active days")
 */
export type TFunction = (fr: string, en: string) => string;

export function translate(lang: Lang, fr: string, en: string): string {
  return lang === "en" ? en : fr;
}

/** Fabrique une fonction `t` figée sur une langue (utilisable hors React). */
export function makeT(lang: Lang): TFunction {
  return (fr, en) => translate(lang, fr, en);
}

type I18nContextValue = {
  lang: Lang;
  t: TFunction;
  setLang: (lang: Lang) => void;
};

const I18nContext = createContext<I18nContextValue>({
  lang: DEFAULT_LANG,
  t: (fr) => fr,
  setLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => parseRoute().lang);

  // La langue suit l'URL (source de vérité) : on la resynchronise à chaque
  // changement de route (navigation, popstate).
  useEffect(() => subscribeRoute(() => setLangState(parseRoute().lang)), []);

  const setLang = useCallback((next: Lang) => {
    storeLang(next);
    navigateToPath(buildLangSwitchPath(next));
  }, []);

  const t = useMemo(() => makeT(lang), [lang]);
  const value = useMemo<I18nContextValue>(() => ({ lang, t, setLang }), [lang, t, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function useT(): TFunction {
  return useContext(I18nContext).t;
}

export function useLang(): Lang {
  return useContext(I18nContext).lang;
}
