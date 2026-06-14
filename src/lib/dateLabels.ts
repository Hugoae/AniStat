/** Libellé « Données du JJ/MM/AA HH:MM » à partir d'un ISO de synchronisation. */
export function formatSyncAbsoluteDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const f = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Données du ${f.format(d)}`;
}
