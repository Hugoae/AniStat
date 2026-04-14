import { C, MONTHS } from "../config/constants";

export function PeriodEmptyBanner({
  year,
  month,
  animeEntriesLength,
  mangaEntriesLength,
}: {
  year: number;
  month: number;
  animeEntriesLength: number;
  mangaEntriesLength: number;
}) {
  if (animeEntriesLength !== 0 || mangaEntriesLength !== 0) return null;
  const periodLabel = month === 0 ? `${year}` : `${MONTHS[month - 1]} ${year}`;
  return (
    <div style={{ textAlign: "center", padding: 60, color: C.textMuted }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <div style={{ fontSize: 16 }}>Aucune activité trouvée pour {periodLabel}</div>
      <div style={{ fontSize: 13, marginTop: 8, color: C.textDim }}>
        Vérifie que le profil est public et que des entrées ont été mises à jour cette année.
      </div>
    </div>
  );
}
