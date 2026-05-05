import { MONTHS_FULL } from "../config/constants";
import { getComparisonPeriodMeta } from "./stats";

export type OverviewCompareOption =
  | { id: string; kind: "year"; compareYear: number; label: string }
  | { id: string; kind: "month"; compareYear: number; compareMonth: number; label: string };

const DEFAULT_ACCOUNT_CREATION_YEAR = 2015;

function buildAvailableYears(displayYear: number, accountCreationYear: number): number[] {
  const currentYear = new Date().getFullYear();
  const floorY = Math.max(1970, Math.min(accountCreationYear || DEFAULT_ACCOUNT_CREATION_YEAR, currentYear));
  const years: number[] = [];
  for (let y = currentYear; y >= floorY; y--) {
    if (y !== displayYear) years.push(y);
  }
  return years;
}

function buildYearCompareOptions(year: number, accountCreationYear: number): OverviewCompareOption[] {
  const opts: OverviewCompareOption[] = [];
  for (const y of buildAvailableYears(year, accountCreationYear)) {
    opts.push({ id: `y:${y}`, kind: "year", compareYear: y, label: String(y) });
  }
  return opts;
}

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildMonthCompareOptions(year: number, month: number, accountCreationYear: number): OverviewCompareOption[] {
  const opts: OverviewCompareOption[] = [];
  const currentYear = new Date().getFullYear();
  const floorY = Math.max(1970, Math.min(accountCreationYear || DEFAULT_ACCOUNT_CREATION_YEAR, currentYear));

  for (let y = year; y >= floorY; y--) {
    const startMonth = y === year ? month - 1 : 12;
    for (let m = startMonth; m >= 1; m--) {
      const id = `m:${y}:${m}`;
      opts.push({
        id,
        kind: "month",
        compareYear: y,
        compareMonth: m,
        label: `${capitalizeFirst(MONTHS_FULL[m - 1])} ${y}`,
      });
    }
  }

  opts.sort((a, b) => {
    const monthOf = (o: OverviewCompareOption) => (o.kind === "month" ? o.compareMonth : 0);
    const ta = a.compareYear * 100 + monthOf(a);
    const tb = b.compareYear * 100 + monthOf(b);
    return tb - ta;
  });

  return opts;
}

/**
 * Options du sélecteur de période de comparaison (Overview).
 * Vue année : années disponibles jusqu'à l'année courante, sans l'année affichée.
 * Vue mois : mêmes années disponibles, en comparant le même mois sur l'année choisie.
 */
export function buildOverviewCompareOptions(
  year: number,
  month: number,
  accountCreationYear = DEFAULT_ACCOUNT_CREATION_YEAR
): OverviewCompareOption[] {
  if (year === 0) return [];
  if (month === 0) {
    return buildYearCompareOptions(year, accountCreationYear);
  }
  return buildMonthCompareOptions(year, month, accountCreationYear);
}

export function getOverviewEffectiveCompareOptionId(
  year: number,
  month: number,
  selectedId: string | null,
  options: OverviewCompareOption[]
): string {
  const meta = getComparisonPeriodMeta(year, month);
  if (year === 0 || meta.compareY == null) return "";
  const defaultId =
    month === 0
      ? `y:${Math.max(1970, year - 1)}`
      : `m:${meta.compareY}:${meta.compareM}`;
  if (selectedId && options.some((o) => o.id === selectedId)) return selectedId;
  if (options.some((o) => o.id === defaultId)) return defaultId;
  return options[0]?.id ?? defaultId;
}

export function resolveOverviewCompareSelection(
  year: number,
  month: number,
  selectedId: string | null,
  options: OverviewCompareOption[]
): { compareY: number; compareM: number | null; legendCompare: string } {
  const meta = getComparisonPeriodMeta(year, month);
  if (year === 0 || meta.compareY == null) {
    return { compareY: -1, compareM: null, legendCompare: "" };
  }
  const id = getOverviewEffectiveCompareOptionId(year, month, selectedId, options);
  const opt = options.find((o) => o.id === id);
  if (!opt) {
    return {
      compareY: meta.compareY,
      compareM: meta.compareM,
      legendCompare: meta.legendCompare,
    };
  }
  if (opt.kind === "year") {
    return { compareY: opt.compareYear, compareM: null, legendCompare: opt.label };
  }
  return {
    compareY: opt.compareYear,
    compareM: opt.compareMonth,
    legendCompare: opt.label,
  };
}
