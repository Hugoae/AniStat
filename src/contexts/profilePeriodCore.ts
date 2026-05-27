import { createContext, useContext } from "react";

/**
 * Cœur (non-JSX) du contexte de période. Vit dans un fichier `.ts`
 * séparé du provider pour respecter la règle Vite Fast Refresh
 * (`react-refresh/only-export-components`) qui interdit de mélanger
 * dans un même module des exports de composants et de non-composants
 * (types, contextes, hooks).
 *
 * Le provider (`ProfilePeriodProvider`) vit dans `ProfilePeriodContext.tsx`
 * et n'exporte que le composant.
 */
export type ProfilePeriodValue = {
  /** Onglet actif du dashboard (`overview` | `anime` | `manga`). */
  tab: string;
  /** Année sélectionnée. `0` = All Time. */
  year: number;
  /** Mois sélectionné dans l'année. `0` = toute l'année, 1..12 = mois précis. */
  month: number;
  /** Années pour lesquelles le profil a au moins une donnée. Bornes le sélecteur. */
  years: number[];
  /** `true` quand `year === 0` (raccourci dérivé, partagé pour éviter la duplication). */
  isAllTime: boolean;
  setTab: (tab: string) => void;
  /**
   * Setter d'année « intelligent » : si on bascule vers All Time
   * (`year === 0`), on réinitialise `month` à 0 — pas de mois en All
   * Time. Tous les consommateurs doivent passer par `changeYear` plutôt
   * que d'écrire directement `setYear` pour préserver cette invariant.
   */
  changeYear: (year: number) => void;
  setMonth: (month: number) => void;
};

export const ProfilePeriodContext = createContext<ProfilePeriodValue | null>(null);

/**
 * Accède au contexte de période. Lance une erreur si appelé hors d'un
 * `ProfilePeriodProvider` : on préfère une erreur claire à un fallback
 * silencieux qui masquerait un bug de mise en place de l'arbre.
 */
export function useProfilePeriod(): ProfilePeriodValue {
  const ctx = useContext(ProfilePeriodContext);
  if (ctx == null) {
    throw new Error("useProfilePeriod doit être utilisé à l'intérieur de <ProfilePeriodProvider>.");
  }
  return ctx;
}
