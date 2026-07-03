import { useMemo, useState, type ReactNode } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { C } from "../../config/constants";
import { ANIME_GENRE_RADAR_TOP_N, LIST_TAB_PAIR_CHART_HEIGHT } from "../../config/listConstants";
import { ChartCard } from "./ChartCard";
import { GenreRadarTooltip } from "./ChartTooltips";
import { RechartsWhenVisible } from "./RechartsWhenVisible";
import { EmptyState } from "../ui";
import { useT } from "../../i18n/I18n";

export type GenreRadarRow = {
  name: string;
  count: number;
  percent: number;
  previousCount: number;
  previousPercent: number;
  deltaCount: number;
  deltaPercent: number;
};

type GenreRadarChartProps = {
  kind: "anime" | "manga";
  rows: GenreRadarRow[];
  comparisonLabel: string;
  emptyCta?: ReactNode;
};

function GenreAngleTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  return (
    <text
      x={x}
      y={y}
      fill={C.text}
      fontSize={11}
      fontWeight={500}
      textAnchor="middle"
      dominantBaseline="central"
    >
      {String(payload?.value || "")}
    </text>
  );
}

export function GenreRadarChart({ kind, rows, comparisonLabel, emptyCta }: GenreRadarChartProps) {
  const t = useT();
  const [showComparison, setShowComparison] = useState(true);
  const canCompare = Boolean(comparisonLabel);
  const radarData = useMemo(() => rows.slice(0, ANIME_GENRE_RADAR_TOP_N), [rows]);
  const radarKey = useMemo(
    () =>
      radarData
        .map((row) => `${row.name}:${row.count}:${showComparison ? row.previousCount : 0}`)
        .join("|"),
    [radarData, showComparison]
  );
  const emptyTitle =
    kind === "manga"
      ? t(
          "Aucun genre renseigné pour les manga de cette période.",
          "No genre listed for the manga in this period."
        )
      : t(
          "Aucun genre renseigné pour les anime de cette période.",
          "No genre listed for the anime in this period."
        );
  const countLabel = kind === "manga" ? "Manga" : "Anime";

  return (
    <ChartCard
      noTitle
      screenReaderSummary={`${t("Radar des dix genres les plus fréquents sur les", "Radar of the ten most frequent genres among the")} ${kind} ${t("de la période, avec pourcentage de titres", "in the period, with percentage of titles")}${canCompare ? t(" et comparaison optionnelle", " and optional comparison") : ""}.`}
      dataTable={{
        caption: `${t("Genres", "Genres")} ${kind} ${t("les plus fréquents", "most frequent")}`,
        columns: canCompare && showComparison
          ? [t("Genre", "Genre"), t("Titres", "Titles"), t("% titres", "% titles"), `${t("Titres", "Titles")} ${comparisonLabel}`, `% ${comparisonLabel}`]
          : [t("Genre", "Genre"), t("Titres", "Titles"), t("% titres", "% titles")],
        rows: radarData.map((row) =>
          canCompare && showComparison
            ? [
                row.name,
                row.count,
                `${row.percent.toFixed(1)}%`,
                row.previousCount,
                `${row.previousPercent.toFixed(1)}%`,
              ]
            : [row.name, row.count, `${row.percent.toFixed(1)}%`]
        ),
      }}
    >
      {rows.length > 0 ? (
        <div className="genre-radar-chart-wrap">
          {canCompare ? (
            <div className="genre-radar-toolbar">
              <button
                type="button"
                className={`genre-radar-toolbar__toggle${showComparison ? " is-active" : ""}`}
                aria-pressed={showComparison}
                onClick={() => setShowComparison((value) => !value)}
              >
                {showComparison
                  ? `${t("Masquer", "Hide")} ${comparisonLabel}`
                  : `${t("Comparer à", "Compare to")} ${comparisonLabel}`}
              </button>
            </div>
          ) : null}
          <RechartsWhenVisible
            height={LIST_TAB_PAIR_CHART_HEIGHT}
            className="list-tab-anime-recharts-mount list-tab-pair-chart-mount"
          >
            <ResponsiveContainer width="100%" height={LIST_TAB_PAIR_CHART_HEIGHT}>
              <RadarChart key={radarKey} data={radarData} outerRadius="88%">
                <PolarGrid stroke={C.border} strokeOpacity={0.65} />
                <PolarAngleAxis dataKey="name" tick={(props) => <GenreAngleTick {...props} />} />
                <PolarRadiusAxis tick={false} axisLine={false} />
                {canCompare && showComparison ? (
                  <Radar
                    name={comparisonLabel}
                    dataKey="previousCount"
                    stroke={C.purple}
                    fill={C.purple}
                    fillOpacity={0.08}
                    strokeWidth={2}
                  />
                ) : null}
                <Radar
                  name={t("Cette période", "This period")}
                  dataKey="count"
                  stroke={C.accent}
                  fill={C.accent}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
                <Tooltip
                  content={
                    <GenreRadarTooltip
                      compareLabel={canCompare && showComparison ? comparisonLabel : ""}
                      countLabel={countLabel}
                    />
                  }
                />
              </RadarChart>
            </ResponsiveContainer>
          </RechartsWhenVisible>
        </div>
      ) : (
        <EmptyState icon="stack" title={emptyTitle} cta={emptyCta} />
      )}
    </ChartCard>
  );
}
