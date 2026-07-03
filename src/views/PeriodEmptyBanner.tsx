import { C, MONTHS, localizeMonthAbbr } from "../config/constants";
import { useT, useLang } from "../i18n/I18n";

export function PeriodEmptyBanner({
  year,
  month,
  animeEntriesLength,
  mangaEntriesLength,
  loadingActivities,
  comparisonYearMissing,
  hasProfileData,
}: {
  year: number;
  month: number;
  animeEntriesLength: number;
  mangaEntriesLength: number;
  loadingActivities?: boolean;
  comparisonYearMissing?: boolean;
  hasProfileData?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  if (animeEntriesLength !== 0 || mangaEntriesLength !== 0) return null;
  const periodLabel =
    year === 0
      ? "All Time"
      : month === 0
        ? `${year}`
        : `${localizeMonthAbbr(MONTHS[month - 1], lang)} ${year}`;
  let subtitle = t(
    "Vérifie que le profil est public et que des entrées ont été mises à jour cette année.",
    "Check that the profile is public and that entries were updated this year."
  );
  if (loadingActivities) {
    subtitle = t(
      "Les activités de cette période sont encore en cours de lecture depuis Supabase.",
      "Activity for this period is still being read from Supabase."
    );
  } else if (!hasProfileData) {
    subtitle = t(
      "Profil sans données persistées pour le moment. Lance une synchronisation manuelle.",
      "No persisted data for this profile yet. Start a manual sync."
    );
  } else if (comparisonYearMissing) {
    subtitle = t(
      "Les données de comparaison N-1 ne sont pas encore disponibles pour cette période.",
      "Year-over-year comparison data isn't available yet for this period."
    );
  }
  return (
    <div style={{ textAlign: "center", padding: 60, color: C.textMuted }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <div style={{ fontSize: 16 }}>
        {t("Aucune activité trouvée pour", "No activity found for")} {periodLabel}
      </div>
      <div style={{ fontSize: 13, marginTop: 8, color: C.textDim }}>
        {subtitle}
      </div>
    </div>
  );
}
