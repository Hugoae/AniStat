import type { AppLang } from "../config/constants";

/** Libellé « Données du JJ/MM/AA HH:MM » à partir d'un ISO de synchronisation. */
export function formatSyncAbsoluteDate(iso: string | null, lang: AppLang = "fr"): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const locale = lang === "en" ? "en-US" : "fr-FR";
  const f = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return lang === "en" ? `Data from ${f.format(d)}` : `Données du ${f.format(d)}`;
}
