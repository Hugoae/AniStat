import { useSyncExternalStore } from "react";

/**
 * Petit store global de l'état de persistance Supabase.
 *
 * Les écritures sont déclenchées en « fire-and-forget » depuis plusieurs hooks
 * (`useProfileLoader`, `useActivityYearsLoader`). Avant, leurs erreurs étaient
 * avalées par `devLog` (muet en production), ce qui rendait invisible un
 * rafraîchissement non persisté. Ce store centralise le dernier échec/succès
 * pour qu'un bandeau header puisse prévenir l'utilisateur que ses données ne
 * sont PAS sauvegardées (donc qu'un F5 reviendra à l'état antérieur).
 */
export type PersistenceStatus = {
  lastError: string | null;
  lastErrorAt: number | null;
  lastSuccessAt: number | null;
};

let state: PersistenceStatus = {
  lastError: null,
  lastErrorAt: null,
  lastSuccessAt: null,
};

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Extrait un message lisible. Les erreurs Supabase (PostgREST) ne sont PAS des
 * instances `Error` mais des objets `{ message, code, details, hint }` — ex.
 * une violation RLS renvoie `code: "42501"`. On reconstruit donc un message
 * explicite pour le bandeau et les logs.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const e = error as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [
      e.message,
      e.code ? `(code ${e.code})` : null,
      e.details || null,
      e.hint || null,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
  }
  return String(error ?? "unknown error");
}

/** Marque un échec d'écriture. Toujours loggé en console (prod incluse). */
export function reportPersistenceFailure(context: string, error: unknown): void {
  const message = describeError(error);
  // Log explicite et visible partout (remplace l'ancien devLog muet en prod).
  console.error(`[AniListStat] Persistance Supabase échouée — ${context}:`, error);
  state = { ...state, lastError: `${context}: ${message}`, lastErrorAt: Date.now() };
  emit();
}

/** Marque un succès d'écriture et efface l'erreur courante. */
export function reportPersistenceSuccess(context: string): void {
  state = { lastError: null, lastErrorAt: null, lastSuccessAt: Date.now() };
  void context;
  emit();
}

/** Efface manuellement l'erreur (ex: l'utilisateur ferme le bandeau). */
export function clearPersistenceError(): void {
  if (state.lastError == null) return;
  state = { ...state, lastError: null, lastErrorAt: null };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PersistenceStatus {
  return state;
}

export function usePersistenceStatus(): PersistenceStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
