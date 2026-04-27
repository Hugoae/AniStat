import { useCallback, useEffect, useState } from "react";

/**
 * Hook minimaliste pour gérer l'état « graphique masqué / affiché » d'un bloc identifié par `id`.
 * État partagé en mémoire (singleton) pour que plusieurs hooks pour le même id restent synchronisés
 * pendant que l'onglet est ouvert.
 */
let memCache: Record<string, boolean> | null = null;
const subscribers = new Set<() => void>();

function safeRead(): Record<string, boolean> {
  if (memCache) return memCache;
  memCache = {};
  return memCache;
}

function notify() {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function setCollapsedExternal(id: string, value: boolean) {
  const cache = safeRead();
  if (!!cache[id] === !!value) return;
  cache[id] = !!value;
  notify();
}

export type UseCollapsedChartReturn = {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (value: boolean) => void;
};

export function useCollapsedChart(id: string): UseCollapsedChartReturn {
  const [collapsed, setLocal] = useState<boolean>(() => !!safeRead()[id]);

  useEffect(() => {
    const handler = () => setLocal(!!safeRead()[id]);
    subscribers.add(handler);
    handler();
    return () => {
      subscribers.delete(handler);
    };
  }, [id]);

  const toggle = useCallback(() => {
    setCollapsedExternal(id, !safeRead()[id]);
  }, [id]);

  const setCollapsed = useCallback(
    (value: boolean) => {
      setCollapsedExternal(id, value);
    },
    [id]
  );

  return { collapsed, toggle, setCollapsed };
}
