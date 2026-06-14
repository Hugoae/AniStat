import { STATUS_LABELS, STATUS_COLORS } from "../config/constants";
import { getColorForLabel } from "./chartColors";

export type PieSlice = {
  key: string;
  label: string;
  value: number;
  fill: string;
  extraInfo?: string;
  flagCode?: string;
};

/**
 * Construit les parts du camembert « répartition par statut », identique côté
 * anime et manga. Les répartitions format/pays restent en ligne dans chaque
 * onglet car elles dépendent d'aides d'affichage de la couche `components/ui`
 * (extraInfo : épisodes/minutes vs chapitres/titres).
 */
export function buildStatusPieSlices(statusEntriesOrdered: [string, number][]): PieSlice[] {
  return statusEntriesOrdered.map(([status, value]) => ({
    key: status,
    label: STATUS_LABELS[status] || status,
    value,
    fill: STATUS_COLORS[status] || getColorForLabel(status),
    extraInfo: `${value} titre${value > 1 ? "s" : ""}`,
  }));
}
