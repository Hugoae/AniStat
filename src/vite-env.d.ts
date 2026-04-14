/// <reference types="vite/client" />

interface AniListStatDebugApi {
  getMetrics?: () => Record<string, number | undefined>;
  resetMetrics?: () => void;
  getProxyCacheStats?: () => unknown;
}

interface Window {
  AniListStatDebug?: AniListStatDebugApi;
}
