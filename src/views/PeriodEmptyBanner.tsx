import { C, MONTHS } from "../config/constants";

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
  if (animeEntriesLength !== 0 || mangaEntriesLength !== 0) return null;
  const periodLabel = year === 0 ? "All Time" : month === 0 ? `${year}` : `${MONTHS[month - 1]} ${year}`;
  let subtitle =
    "Vérifie que le profil est public et que des entrées ont été mises à jour cette année.";
  if (loadingActivities) {
    subtitle = "Les activités de cette période sont encore en cours de lecture depuis Supabase.";
  } else if (!hasProfileData) {
    subtitle = "Profil sans données persistées pour le moment. Lance une synchronisation manuelle.";
  } else if (comparisonYearMissing) {
    subtitle = "Les données de comparaison N-1 ne sont pas encore disponibles pour cette période.";
  }
  return (
    <div style={{ textAlign: "center", padding: 60, color: C.textMuted }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <div style={{ fontSize: 16 }}>Aucune activité trouvée pour {periodLabel}</div>
      <div style={{ fontSize: 13, marginTop: 8, color: C.textDim }}>
        {subtitle}
      </div>
    </div>
  );
}
