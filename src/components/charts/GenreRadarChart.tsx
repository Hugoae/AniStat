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
      ? "Aucun genre renseigné pour les manga de cette période."
      : "Aucun genre renseigné pour les anime de cette période.";
  const countLabel = kind === "manga" ? "Manga" : "Anime";

  return (
    <ChartCard
      noTitle
      screenReaderSummary={`Radar des dix genres les plus fréquents sur les ${kind} de la période, avec pourcentage de titres${canCompare ? " et comparaison optionnelle" : ""}.`}
      dataTable={{
        caption: `Genres ${kind} les plus fréquents`,
        columns: canCompare && showComparison
          ? ["Genre", "Titres", "% titres", `Titres ${comparisonLabel}`, `% ${comparisonLabel}`]
          : ["Genre", "Titres", "% titres"],
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
                {showComparison ? `Masquer ${comparisonLabel}` : `Comparer à ${comparisonLabel}`}
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
                  name="Cette période"
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
