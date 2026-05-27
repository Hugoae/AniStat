import type { ReactNode } from "react";
import {
  ProfilePeriodContext,
  type ProfilePeriodValue,
} from "./profilePeriodCore";

/**
 * Provider qui expose un `ProfilePeriodValue` à toute la sous-arbre via
 * le contexte. Volontairement passif : le state vit toujours dans
 * `App.tsx`, ce provider sert uniquement à éliminer le prop drilling
 * vers `ProfileViewMain`, `PeriodFloatingChip` et les onglets.
 *
 * Le type, le contexte et le hook `useProfilePeriod` vivent dans
 * `./profilePeriodCore.ts` (pas de JSX) pour respecter la règle Vite
 * Fast Refresh `react-refresh/only-export-components`.
 */
export type ProfilePeriodProviderProps = {
  value: ProfilePeriodValue;
  children: ReactNode;
};

export function ProfilePeriodProvider({ value, children }: ProfilePeriodProviderProps) {
  return <ProfilePeriodContext.Provider value={value}>{children}</ProfilePeriodContext.Provider>;
}
