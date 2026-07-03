import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyInitialLangPreference, migrateLegacyHashUrl } from "./lib/routing";
import { I18nProvider } from "./i18n/I18n";
import "./styles/index.css";

if (typeof window !== "undefined" && window.location.hostname === "localhost") {
  const target = new URL(window.location.href);
  target.hostname = "127.0.0.1";
  window.location.replace(target.toString());
}

// Réécrit les anciens liens à hash (`#/user/...`) en vraies URLs avant le rendu.
migrateLegacyHashUrl();
// Applique la préférence de langue (stockée ou détectée) si l'URL n'est pas préfixée.
applyInitialLangPreference();

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>
  );
}
